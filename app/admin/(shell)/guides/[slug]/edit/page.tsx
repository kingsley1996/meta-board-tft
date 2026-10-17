import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GuideForm, type GuideFormGuide } from '@/components/admin/guide-form';
import type { ApiGuide } from '@/lib/api';
import { backendJson } from '@/lib/backend';

export const dynamic = 'force-dynamic';

type AdminGuide = ApiGuide & { titleEn: string; excerptEn: string; sectionsEn: ApiGuide['sections'] };

export default async function EditGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // ?lang=vi returns vi text (falling back to en) plus the raw English values.
  const guide = await backendJson<AdminGuide>(`/api/guides/${slug}?lang=vi`);
  if (!guide) notFound();
  const keep = (value: string, fallback: string) => (value && value !== fallback ? value : '');
  const formGuide: GuideFormGuide = {
    slug: guide.slug,
    author: guide.author,
    authorSlug: guide.authorSlug,
    publishedOn: guide.publishedOn,
    title: guide.titleEn,
    excerpt: guide.excerptEn,
    tags: guide.tags,
    featured: guide.featured,
    sections: guide.sectionsEn,
    titleVi: keep(guide.title, guide.titleEn),
    excerptVi: keep(guide.excerpt, guide.excerptEn),
    sectionsVi: JSON.stringify(guide.sections) === JSON.stringify(guide.sectionsEn) ? [] : guide.sections,
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/guides" className="text-xs font-semibold text-brand-soft hover:text-brand">
          ← Back to guides
        </Link>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">Edit · {formGuide.title}</h1>
      </div>
      <GuideForm guide={formGuide} />
    </>
  );
}
