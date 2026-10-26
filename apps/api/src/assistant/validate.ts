import type { AssistantSection } from './contracts.ts';

export type GeneratedAnswer = {
  answer: string;
  sections: AssistantSection[];
  followUpQuestions: string[];
  limitations: string[];
};

const FORBIDDEN_KEYS = ['winRate', 'winrate', 'avgPlacement', 'avg_placement', 'top4', 'topFour', 'stats'];
function strings(value: unknown, max: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const entry of value.slice(0, max)) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim().slice(0, 300);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    result.push(text);
  }
  return result;
}

function sections(value: unknown): AssistantSection[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: AssistantSection[] = [];
  for (const entry of value.slice(0, 3)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const heading = typeof record.heading === 'string' ? record.heading.trim().slice(0, 120) : '';
    // Rosters (10-champion traits) group into points; a tight cap silently
    // drops the tail champions.
    const points = strings(record.points, 12);
    if (!heading || !points?.length) continue;
    result.push({ heading, points });
  }
  return result;
}

export function parseGeneratedAnswer(text: string): GeneratedAnswer | null {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (FORBIDDEN_KEYS.some((key) => Object.hasOwn(record, key))) return null;

  const answer = typeof record.answer === 'string' ? record.answer.trim() : '';
  if (!answer || answer.length > 4000) return null;
  const followUpQuestions = strings(record.followUpQuestions, 3);
  const limitations = strings(record.limitations, 5);
  const parsedSections = sections(record.sections);
  if (!followUpQuestions || !limitations || !parsedSections) return null;

  return { answer, sections: parsedSections, followUpQuestions, limitations };
}
