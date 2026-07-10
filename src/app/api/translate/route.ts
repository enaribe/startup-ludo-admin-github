import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/translate
 * Traduit le contenu d'un pack (quiz, duels, financements, opportunités, défis) vers une langue cible.
 *
 * Body : {
 *   targetLang: 'en',
 *   items: {
 *     quizzes:        { id, question, options[], explanation? }[],
 *     duels:          { id, question, options: string[] }[],   // textes des options
 *     fundings:       { id, title, description }[],
 *     opportunities:  { id, title, description }[],
 *     challengeEvents:{ id, title, description }[],
 *   }
 * }
 * Returns : { translations: { quizzes: {id, question, options, explanation}[], duels: {...}[], ... } }
 *
 * Seuls les champs TEXTUELS sont traduits. Les ids, bonnes réponses, points et jetons restent inchangés.
 */

const LANG_NAME: Record<string, string> = { en: 'anglais', fr: 'français', wo: 'wolof' };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetLang: string = body.targetLang || 'en';
    const items = body.items ?? {};
    const langLabel = LANG_NAME[targetLang] ?? targetLang;

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!openaiKey && !anthropicKey) {
      return NextResponse.json({ error: 'Aucune clé API configurée (OPENAI_API_KEY ou ANTHROPIC_API_KEY).' }, { status: 500 });
    }

    const system = `Tu es un traducteur professionnel spécialisé dans le contenu pédagogique entrepreneurial. Tu traduis du français vers ${langLabel} en gardant un ton naturel et adapté à un public de jeunes entrepreneurs africains. Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`;

    const userPrompt = `Traduis en ${langLabel} les champs textuels du contenu suivant.
Règles STRICTES :
- Garde EXACTEMENT les mêmes "id" pour chaque élément.
- Traduis "question", "options" (chaque option), "explanation", "title", "description", "name", "target", "mission".
- Pour "options" : garde le même ordre et le même nombre d'éléments.
- Ne traduis PAS les ids ni les "sector", ne change AUCUN nombre.
- Réponds avec ce format JSON exact (n'inclus QUE les clés présentes dans le contenu fourni) :
{
  "edition": {"name": "...", "description": "..."},
  "quizzes": [{"id": "...", "question": "...", "options": ["...","..."], "explanation": "..."}],
  "duels": [{"id": "...", "question": "...", "options": ["...","...","..."]}],
  "fundings": [{"id": "...", "title": "...", "description": "..."}],
  "opportunities": [{"id": "...", "title": "...", "description": "..."}],
  "challengeEvents": [{"id": "...", "title": "...", "description": "..."}],
  "defaultProjects": [{"id": "...", "name": "...", "description": "...", "target": "...", "mission": "..."}]
}

Contenu à traduire (JSON) :
${JSON.stringify(items)}`;

    const raw = openaiKey
      ? await callOpenAI(openaiKey, system, userPrompt)
      : await callAnthropic(anthropicKey as string, system, userPrompt);

    const parsed = parseJson(raw);
    if (!parsed) {
      return NextResponse.json({ error: 'Traduction invalide (JSON non parsable).', raw }, { status: 422 });
    }

    return NextResponse.json({ translations: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de traduction';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callOpenAI(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.3,
      max_tokens: 16384,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}
