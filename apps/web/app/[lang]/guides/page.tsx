import type { Metadata } from 'next';
import { GuideBrowser, type GuideCard } from '@/components/guide-browser';
import type { GuidesResponse } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// Nothing here reads the query string any more — the tag filter is client state —
// so the route prerenders and both the document and the guides fetch sit behind
// the edge cache.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.guides.title, description: messages[lang].meta.guides.description };
}

// Tag order for the filter chips; unknown tags from the CMS are appended.
const tagOrder = ['Fundamentals', 'Economy', 'Leveling', 'Items', 'Positioning', 'Augments', 'Meta', 'Patch notes'];

export default async function GuidesPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const data = await backendJson<GuidesResponse>(`/api/guides?lang=${lang}`, { revalidate: 300 });
  if (!data) throw new Error('backend is unreachable');
  const guides: GuideCard[] = data.guides.map(({ slug, title, excerpt, author, date, tags, featured }) => ({ slug, title, excerpt, author, date, tags, featured }));
  if (!guides.length) throw new Error('no guides in the store');
  const tags = [...new Set([...tagOrder.filter((name) => guides.some((guide) => guide.tags.includes(name))), ...guides.flatMap((guide) => guide.tags)])];
  return <GuideBrowser lang={lang} tags={tags} guides={guides} />;
}
