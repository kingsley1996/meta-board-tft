import { VerifyPanel } from '@/components/auth/verify-panel';
import type { Lang } from '@/lib/i18n';

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Lang }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { lang } = await params;
  const { token } = await searchParams;
  return <VerifyPanel lang={lang} token={typeof token === 'string' ? token : ''} />;
}
