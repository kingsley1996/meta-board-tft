export function cookieValue(header: string | undefined, name: string): string {
  for (const part of (header ?? '').split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return '';
}

// Every cookie the API sets is a session or an admin credential, so production
// sends it only over HTTPS by default. AUTH_SECURE_COOKIES=false exists for a
// local run that is not on HTTPS; it must never be set in a deployed env.
export function secureCookieSuffix(env: NodeJS.ProcessEnv = process.env): string {
  const flag = env.AUTH_SECURE_COOKIES?.trim().toLowerCase();
  const secure = flag ? flag === 'true' : env.NODE_ENV === 'production';
  return secure ? '; Secure' : '';
}
