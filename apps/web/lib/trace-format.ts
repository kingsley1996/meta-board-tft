// Model output is often a JSON string; render it as readable JSON so the trace
// does not show escaped quotes and \n sequences. Prose is returned untouched.
export function prettyString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}
