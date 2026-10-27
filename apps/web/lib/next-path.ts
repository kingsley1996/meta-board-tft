import type { Lang } from './i18n';

// ?next arrives from the URL and is pushed after a successful sign-in, so it is
// honoured only for an in-app path. A protocol-relative or absolute value would
// turn login into an open redirect to someone else's site.
export function safeNextPath(raw: string | undefined, lang: Lang): string {
  const fallback = `/${lang}/assistant`;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  return raw;
}
