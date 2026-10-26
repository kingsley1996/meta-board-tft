import { NextResponse, type NextRequest } from 'next/server';
import { defaultLang, isLang, LANG_COOKIE, locales } from '@/lib/i18n';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /admin has no middleware gate any more: access is an account role, and only
  // the API can read it. The (shell) layout asks /api/auth/me and redirects.

  if (pathname.startsWith('/api/')) return NextResponse.next();

  // Every public page lives under /<locale>. Visiting a locale page records
  // the choice in a cookie; unprefixed visits reuse it and otherwise fall
  // back to Vietnamese. English stays reachable only through /en/… URLs.
  const locale = locales.find((entry) => pathname === `/${entry}` || pathname.startsWith(`/${entry}/`));
  if (locale) {
    const response = NextResponse.next();
    // Write only when it differs, so Set-Cookie doesn't ship on every response.
    if (request.cookies.get(LANG_COOKIE)?.value !== locale) {
      response.cookies.set(LANG_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    }
    return response;
  }

  const url = request.nextUrl.clone();
  const cookieLang = request.cookies.get(LANG_COOKIE)?.value;
  const lang = cookieLang && isLang(cookieLang) ? cookieLang : defaultLang;
  url.pathname = pathname === '/' ? `/${lang}` : `/${lang}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api/|_next/|tft/|favicon.ico|.*\\..*).*)'],
};
