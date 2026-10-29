export type TurnstileConfig = { siteKey: string; secretKey: string };

export function readTurnstileConfig(): TurnstileConfig | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || '';
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() || '';
  if (Boolean(siteKey) !== Boolean(secretKey)) {
    throw new Error('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set or both be unset');
  }
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

export async function verifyTurnstile(token: string | undefined, remoteIp: string | undefined): Promise<boolean> {
  const config = readTurnstileConfig();
  if (!config) return true;
  if (!token || token.length > 2048) return false;

  try {
    const body = new URLSearchParams({ secret: config.secretKey, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Turnstile HTTP failure');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('success' in result) || typeof result.success !== 'boolean') {
      throw new Error('Turnstile malformed response');
    }
    return result.success;
  } catch {
    // Match the reference outage policy; never log credentials or provider errors.
    console.warn('Turnstile verification unavailable; allowing request');
    return true;
  }
}
