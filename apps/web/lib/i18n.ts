export const locales = ['en', 'vi'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'vi';

// Remembers the locale a visitor picked by browsing an /<locale>/… page, so
// unprefixed visits reuse that choice instead of the default.
export const LANG_COOKIE = 'mb_lang';

export function isLang(value: string): value is Lang {
  return (locales as readonly string[]).includes(value);
}


