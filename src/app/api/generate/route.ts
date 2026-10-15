import { NextRequest, NextResponse } from 'next/server';
import { PROMPTS, type GenerationType } from '@/lib/ai-prompts';
import { exigerAuteurDeContenu } from '@/lib/api-auth';

/**
 * POST /api/generate
 * Header requis : `Authorization: Bearer <idToken>`
 * Body: { type: GenerationType, prompt?: string, context?: Record<string, unknown> }
 * Returns: { data: any } — the parsed JSON from the AI
 *
 * Supports OpenAI (gpt-4o-mini) or Anthropic (Claude) depending on which key is set.
 *
 * ⚠️ SÉCURITÉ — cette route était ouverte à tout le monde alors qu'elle dépense
 * directement le quota OpenAI/Anthropic (jusqu'à 16 384 tokens de sortie par
 * appel). Le contrôle vit dans `api-auth.ts` et il est fait AVANT de lire le
 * corps, donc avant tout appel au fournisseur.
 */
export async function POST(request: NextRequest) {
  const auth = await exigerAuteurDeContenu(request);
  if ('reponse' in auth) return auth.reponse;

  try {
    const body = await request.json();
    const { type, prompt, context } = body as {
      type: GenerationType;
      prompt?: string;
      context?: Record<string, unknown>;
    };

    /*
      SEUL `type` EST REQUIS — pas `prompt`.

      Le prompt est la consigne LIBRE de l'utilisateur, et plusieurs générations
      n'en ont légitimement aucune. Cas vécu : dans « Lancer une session »,
      l'enseignant dépose son cours et génère sans rien écrire — le champ est
      d'ailleurs marqué « Consignes complémentaires (optionnel) ». La matière
      première est alors `context.sourceText`, pas `prompt`, et chaque
      `buildUserPrompt` teste déjà `if (input.trim())` avant d'ajouter la
      section « consignes ». Exiger `prompt` renvoyait donc un 400 sur un
      parcours nominal.

      `type` reste exigé : il choisit le prompt système, et son absence ferait
      échouer la recherche dans PROMPTS juste en dessous.
    */
    if (!type) {
      return NextResponse.json({ error: 'type requis' }, { status: 400 });
    }

    const promptConfig = PROMPTS[type];
    if (!promptConfig) {
      return NextResponse.json({ error: `Type "${type}" invalide` }, { status: 400 });
    }

    const systemPrompt = promptConfig.systemPrompt;
    const userPrompt = promptConfig.buildUserPrompt(prompt ?? '', context);

    /*
      La garde porte sur le prompt CONSTRUIT, pas sur l'entrée brute : c'est lui
      qui part au fournisseur. Plusieurs types (`buildUserPrompt: (input) => input`)
      n'ont que la consigne pour matière et produiraient une requête vide, payée
      pour rien ; d'autres, comme le contenu de séance, tiennent debout sans
      consigne parce que le contexte porte le cours.
    */
    if (!userPrompt.trim()) {
      return NextResponse.json(
        { error: 'Rien a generer : precisez une consigne ou fournissez un document source.' },
        { status: 400 }
      );
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    let generatedText: string;

    // Le prompt porte ses propres réglages quand le défaut ne lui convient pas
    // (cf. `PromptConfig.temperature` / `.maxTokens`).
    const reglages: ReglagesModele = {
      temperature: promptConfig.temperature ?? REGLAGES_PAR_DEFAUT.temperature,
      maxTokens: promptConfig.maxTokens ?? REGLAGES_PAR_DEFAUT.maxTokens,
    };

    if (openaiKey) {
      generatedText = await callOpenAI(openaiKey, systemPrompt, userPrompt, reglages);
    } else if (anthropicKey) {
      generatedText = await callAnthropic(anthropicKey, systemPrompt, userPrompt, reglages);
    } else {
      return NextResponse.json(
        { error: 'Aucune cle API configuree. Ajoutez OPENAI_API_KEY ou ANTHROPIC_API_KEY dans .env.local' },
        { status: 500 }
      );
    }

    // Parse the JSON response
    const data = parseAIResponse(generatedText);

    if (data === null) {
      return NextResponse.json(
        { error: 'L\'IA n\'a pas retourne de JSON valide', raw: generatedText },
        { status: 422 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[AI Generate] Error:', error);
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Réglages d'échantillonnage transmis au fournisseur.
 *
 * Les deux valeurs viennent du prompt (`PROMPTS[type]`), avec les défauts
 * ci-dessous quand il n'en déclare pas. Les 15 types qui ÉCRIVENT du contenu
 * de jeu gardent ainsi leur comportement exact ; seul le contrôle thématique,
 * qui CLASSE, les redéclare.
 *
 * ⚠️ `temperature` ne survivrait pas à un modèle de RAISONNEMENT OpenAI
 * (série o, gpt-5-nano…) : ces modèles refusent toute valeur autre que leur
 * défaut et exigent `max_completion_tokens` au lieu de `max_tokens`. Changer
 * de modèle ici demande donc de revoir ces deux champs — et le contrôle
 * thématique traitant toute panne en « incertain », l'erreur 400 passerait
 * inaperçue en désarmant le filtre.
 */
interface ReglagesModele {
  temperature: number;
  maxTokens: number;
}

/** Calibrés pour ÉCRIRE : contenu de jeu varié, réponses longues. */
const REGLAGES_PAR_DEFAUT: ReglagesModele = {
  temperature: 0.8,
  maxTokens: 16384,
};

// ===== OpenAI =====

async function callOpenAI(
  apiKey: string,
  system: string,
  user: string,
  reglages: ReglagesModele
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: reglages.temperature,
      max_tokens: reglages.maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ===== Anthropic =====

async function callAnthropic(
  apiKey: string,
  system: string,
  user: string,
  reglages: ReglagesModele
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      system,
      messages: [{ role: 'user', content: user }],
      max_tokens: reglages.maxTokens,
      temperature: reglages.temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data.content?.[0];
  return content?.type === 'text' ? content.text : '';
}

// ===== JSON Parser =====

function parseAIResponse(text: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch { /* fall through */ }
    }

    // Try to find the first [ or { and parse from there
    const arrayStart = text.indexOf('[');
    const objectStart = text.indexOf('{');
    const start = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)
      ? arrayStart
      : objectStart;

    if (start >= 0) {
      const sub = text.slice(start);
      try {
        return JSON.parse(sub);
      } catch {
        // Try to find matching bracket
        const isArray = sub[0] === '[';
        const close = isArray ? sub.lastIndexOf(']') : sub.lastIndexOf('}');
        if (close > 0) {
          try {
            return JSON.parse(sub.slice(0, close + 1));
          } catch { /* give up */ }
        }
      }
    }

    return null;
  }
}
