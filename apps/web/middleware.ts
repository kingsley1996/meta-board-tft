import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminToken, tokensMatch } from '@/lib/admin-auth';
import { defaultLang, isLang, LANG_COOKIE, locales } from '@/lib/i18n';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin auth (English-only, outside the locale tree).
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (pathname === '/admin/login' || pathname === '/api/admin/login') {
      return NextResponse.next();
    }

    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'ADMIN_PASSWORD is not configured' }, { status: 503 })
        : new NextResponse('Admin is not configured', { status: 503 });
    }

    const expected = await adminToken(password);
    const provided = request.cookies.get(ADMIN_COOKIE)?.value ?? '';
    if (tokensMatch(provided, expected)) return NextResponse.next();

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

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
  matcher: ['/admin/:path*', '/api/admin/:path*', '/((?!api/|_next/|tft/|favicon.ico|.*\\..*).*)'],
};
