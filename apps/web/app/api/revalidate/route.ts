import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { isRevalidateKind, revalidationsFor, tokenMatches } from '@/lib/revalidate';

// Called by the API after it changes comp or guide rows. Only POST, and the token
// is a header rather than a query string so it never lands in an access log.
export async function POST(request: NextRequest) {
  if (!process.env.WEB_REVALIDATE_TOKEN) {
    return NextResponse.json({ error: 'revalidation not configured' }, { status: 503 });
  }
  if (!tokenMatches(request.headers.get('x-revalidate-token'), process.env.WEB_REVALIDATE_TOKEN)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown };
  if (!isRevalidateKind(body.kind)) {
    return NextResponse.json({ error: `unknown kind "${String(body.kind)}"` }, { status: 400 });
  }
  const targets = revalidationsFor(body.kind);
  for (const { path, type } of targets) revalidatePath(path, type);
  return NextResponse.json({ ok: true, kind: body.kind, invalidated: targets.length });
}
