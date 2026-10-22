import catalog from '@metaboard/shared/data/translation-catalog.json';
import type { Lang } from './i18n';
import { translationId } from '@metaboard/shared/translation-id';

const translations: Record<string, string> = catalog.translations;

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
  return translations[translationId(surface, kind, english)] ?? english;
}
