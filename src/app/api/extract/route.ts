/**
 * Extraction de texte d'un document source.
 *
 *  POST /api/extract  (multipart/form-data, champ "file")
 *    → { text: string, charCount: number, pages: number }
 *
 * Formats supportés : PDF, DOCX, MD / TXT.
 * Runtime Node.js obligatoire (pdf-parse / mammoth ne fonctionnent pas en edge).
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// L'extraction d'un gros PDF peut prendre plusieurs secondes.
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier fourni.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Fichier trop lourd (max 25 Mo).' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = '';
    let pages = 0;

    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      text = result.text ?? '';
      pages = result.pages?.length ?? 0;
    } else if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value ?? '';
    } else if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
      text = buffer.toString('utf-8');
    } else if (name.endsWith('.doc')) {
      return NextResponse.json(
        { error: 'Les anciens fichiers .doc ne sont pas supportés. Convertissez-les en .docx ou .pdf.' },
        { status: 415 }
      );
    } else {
      return NextResponse.json(
        { error: 'Format non supporté. Utilisez PDF, DOCX, MD ou TXT.' },
        { status: 415 }
      );
    }

    // Normalise les espaces / sauts de ligne excessifs.
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!text) {
      return NextResponse.json(
        { error: 'Aucun texte extrait (document vide, scanné ou protégé ?).' },
        { status: 422 }
      );
    }

    return NextResponse.json({ text, charCount: text.length, pages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
