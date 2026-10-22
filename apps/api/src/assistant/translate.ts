import { readFileSync } from 'node:fs';
import type { Lang } from './contracts.ts';
import { translationId } from '@metaboard/shared/translation-id';
import { sharedDataPath } from '../shared-data.ts';

const catalogPath = sharedDataPath('translation-catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { translations: Record<string, string> };

export { translationId };

export function translateText(
  lang: Lang,
  surface: string,
  kind: string,
  english: string,
  existingVi?: string | null,
): string {
  if (lang !== 'vi') return english;
  if (existingVi?.trim()) return existingVi;
  return catalog.translations[translationId(surface, kind, english)] ?? english;
}
