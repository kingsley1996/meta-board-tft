export function translationId(surface: string, kind: string, english: string): string {
  return `${surface}::${kind}::${english.trim().toLowerCase()}`;
}
