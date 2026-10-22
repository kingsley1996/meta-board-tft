export function assistantLog(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ scope: 'assistant', event, at: new Date().toISOString(), ...fields }));
}
