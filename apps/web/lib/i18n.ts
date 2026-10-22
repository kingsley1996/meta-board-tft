export const locales = ['en', 'vi'] as const;
export type Lang = (typeof locales)[number];
export const defaultLang: Lang = 'en';

export function isLang(value: string): value is Lang {
  return (locales as readonly string[]).includes(value);
}

// Root visits pick a locale from Accept-Language; own links always carry a prefix.
export function detectLang(acceptLanguage: string | null): Lang {
  return acceptLanguage?.toLowerCase().includes('vi') ? 'vi' : defaultLang;
}
