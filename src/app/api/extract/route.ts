/**
 * Extraction de texte d'un document source.
 *
 *  POST /api/extract  (multipart/form-data, champ "file")
 *    Header requis : `Authorization: Bearer <idToken>`
 *    → { text: string, charCount: number, pages: number }
 *
 * Formats supportés : PDF, DOCX, MD / TXT.
 * Runtime Node.js obligatoire (pdf-parse / mammoth ne fonctionnent pas en edge).
 *
 * ⚠️ SÉCURITÉ — cette route était ouverte à tout le monde. Elle accepte des
 * fichiers de 25 Mo et les parse côté serveur (pdf-parse) : sans authentification,
 * c'est un déni de service à coût nul pour l'attaquant. Le contrôle vit dans
 * `api-auth.ts` et il est fait AVANT `req.formData()`, pour ne même pas lire le
 * corps d'une requête non authentifiée.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exigerAuteurDeContenu } from '@/lib/api-auth';

export const runtime = 'nodejs';
// L'extraction d'un gros PDF peut prendre plusieurs secondes.
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await exigerAuteurDeContenu(req);
  if ('reponse' in auth) return auth.reponse;

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
      // Import du sous-module lib pour éviter l'auto-test au chargement (pdf-parse v1),
      // et pour ne pas dépendre de pdfjs/DOMMatrix indisponibles côté serveur.
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const result = await pdfParse(buffer);
      text = result.text ?? '';
      pages = result.numpages ?? 0;
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
