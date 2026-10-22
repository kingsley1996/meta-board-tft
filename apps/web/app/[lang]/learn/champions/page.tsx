import { redirect } from 'next/navigation';
import type { Lang } from '@/lib/i18n';

// The champion grid moved to /[lang]/champions when detail pages landed.
export default async function LearnChampionsPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  redirect(`/${lang}/champions`);
}
