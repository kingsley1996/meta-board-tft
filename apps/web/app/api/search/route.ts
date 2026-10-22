import { NextResponse, type NextRequest } from 'next/server';
import { isLang } from '@/lib/i18n';
import { search } from '@/lib/search';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  const lang = request.nextUrl.searchParams.get('lang') ?? 'en';
  if (!isLang(lang)) return NextResponse.json({ results: [] }, { status: 400 });
  return NextResponse.json({ results: search(lang, query) });
}
