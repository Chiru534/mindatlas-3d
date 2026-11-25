import { AiProviderConfig, Curse, ResurrectionResult } from '../types/necromancer';
import { analyzeCodeAutopsy } from './curseAnalyzer';
import { buildUnifiedPatch, computeLineDiff } from './resurrectionEngine';

function stripMarkdownFences(raw: string): string {
  const fenced = raw.match(/```(?:ts|tsx|typescript|js|javascript)?\s*\n([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim() + '\n';
  }
  return raw.trim() + '\n';
}

/**
 * Optional BYOK (Bring Your Own Key) AI-assisted resurrection.
 * Sends source code + AST curses to Gemini or OpenAI and runs local AST verification on the output.
 */
export async function resurrectWithAi(
  sourceCode: string,
  curses: Curse[],
  config: AiProviderConfig
): Promise<ResurrectionResult> {
  const beforeReport = analyzeCodeAutopsy(sourceCode);
  const curseList =
    curses.length > 0
      ? curses.map((c) => `- Line ${c.line} [${c.severity}] ${c.ruleId}: ${c.title}`).join('\n')
      : '- General TypeScript modernization and strict safety.';

  const prompt = `You are DeadCode Necromancer, an elite TypeScript & Security Refactoring compiler.
Refactor the following legacy code into clean, modern, strict TypeScript:
- Eliminate every detected curse below (no eval, no SQL string concatenation, no hardcoded secrets, no innerHTML/dangerouslySetInnerHTML, no var, no ==, no console.log, no UNSAFE_ React lifecycles, no callback hell).
- Convert nested callbacks into clean async/await with try/catch and explicit TypeScript types.
- Preserve original business logic and return ONLY the refactored code inside a single code block with zero extra prose.

Detected AST Curses:
${curseList}

Source Code:
\`\`\`ts
${sourceCode}
\`\`\``;

  let rawResponseText = '';

  if (config.provider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      config.apiKey.trim()
    )}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errBody.slice(0, 180)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    rawResponseText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 180)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawResponseText = json.choices?.[0]?.message?.content || '';
  }

  if (!rawResponseText.trim()) {
    throw new Error('Empty response returned from AI provider.');
  }

  const resurrectedCode = stripMarkdownFences(rawResponseText);
  const afterReport = analyzeCodeAutopsy(resurrectedCode);
  const diffLines = computeLineDiff(sourceCode, resurrectedCode);
  const unifiedPatch = buildUnifiedPatch(diffLines, 'specimen.ts');

  return {
    resurrectedCode,
    appliedFixes: [
      `AI-assisted full structural refactor via ${config.provider.toUpperCase()}`,
      `Verified with local TypeScript AST & compiler (${afterReport.diagnostics.length} diagnostics)`,
    ],
    diffLines,
    unifiedPatch,
    mode: 'ai-assisted',
    beforeReport,
    afterReport,
  };
}
