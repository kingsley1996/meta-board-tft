import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminToken, tokensMatch } from '@/lib/admin-auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
