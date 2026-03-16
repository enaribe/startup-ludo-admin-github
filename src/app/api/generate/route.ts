import { NextRequest, NextResponse } from 'next/server';
import { PROMPTS, type GenerationType } from '@/lib/ai-prompts';

/**
 * POST /api/generate
 * Body: { type: GenerationType, prompt: string, context?: Record<string, unknown> }
 * Returns: { data: any } — the parsed JSON from the AI
 *
 * Supports OpenAI (gpt-4o-mini) or Anthropic (Claude) depending on which key is set.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, prompt, context } = body as {
      type: GenerationType;
      prompt: string;
      context?: Record<string, unknown>;
    };

    if (!type || !prompt) {
      return NextResponse.json({ error: 'type et prompt requis' }, { status: 400 });
    }

    const promptConfig = PROMPTS[type];
    if (!promptConfig) {
      return NextResponse.json({ error: `Type "${type}" invalide` }, { status: 400 });
    }

    const systemPrompt = promptConfig.systemPrompt;
    const userPrompt = promptConfig.buildUserPrompt(prompt, context);

    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    let generatedText: string;

    if (openaiKey) {
      generatedText = await callOpenAI(openaiKey, systemPrompt, userPrompt);
    } else if (anthropicKey) {
      generatedText = await callAnthropic(anthropicKey, systemPrompt, userPrompt);
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

// ===== OpenAI =====

async function callOpenAI(apiKey: string, system: string, user: string): Promise<string> {
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
      temperature: 0.8,
      max_tokens: 16384,
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

async function callAnthropic(apiKey: string, system: string, user: string): Promise<string> {
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
      max_tokens: 16384,
      temperature: 0.8,
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
