'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputCls =
  'smooth w-full rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none';

type SectionDraft = {
  heading: string;
  headingVi: string;
  body: string;
  bodyVi: string;
  list: string;
  listVi: string;
};

const emptySection = (): SectionDraft => ({ heading: '', headingVi: '', body: '', bodyVi: '', list: '', listVi: '' });

const paragraphs = (value: string) => value.split('\n').map((part) => part.trim()).filter(Boolean);
const bulletLines = (value: string) => value.split('\n').map((part) => part.trim()).filter(Boolean);
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Local calendar date (toISOString would hand back yesterday for UTC+ timezones).
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export type GuideFormGuide = {
  slug: string;
  author: string;
  authorSlug: string;
  publishedOn: string;
  title: string;
  excerpt: string;
  tags: string[];
  featured: boolean;
  sections: { heading: string; body: string[]; list?: string[] }[];
  titleVi: string;
  excerptVi: string;
  sectionsVi: { heading: string; body: string[]; list?: string[] }[];
};

const toDrafts = (sections: GuideFormGuide['sections'], sectionsVi: GuideFormGuide['sectionsVi']) =>
  sections.map((section, index) => ({
    heading: section.heading,
    headingVi: sectionsVi[index]?.heading ?? '',
    body: section.body.join('\n'),
    bodyVi: (sectionsVi[index]?.body ?? []).join('\n'),
    list: (section.list ?? []).join('\n'),
    listVi: (sectionsVi[index]?.list ?? []).join('\n'),
  }));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-mist">
      {label}
      {children}
    </label>
  );
}

export function GuideForm({ guide }: { guide?: GuideFormGuide }) {
  const router = useRouter();
  const [slugTouched, setSlugTouched] = useState(Boolean(guide));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: guide?.title ?? '',
    slug: guide?.slug ?? '',
    author: guide?.author ?? '',
    authorSlug: guide?.authorSlug ?? '',
    publishedOn: guide?.publishedOn ?? today(),
    excerpt: guide?.excerpt ?? '',
    tags: (guide?.tags ?? []).join(', '),
    featured: guide?.featured ?? false,
    titleVi: guide?.titleVi ?? '',
    excerptVi: guide?.excerptVi ?? '',
  });
  const [sections, setSections] = useState<SectionDraft[]>(
    guide ? toDrafts(guide.sections, guide.sectionsVi) : [emptySection()]
  );

  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((current) => ({
        ...current,
        [key]: value,
        ...(key === 'title' && !slugTouched ? { slug: slugify(value) } : null),
      }));
    };

  const setSection = (index: number, key: keyof SectionDraft) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setSections((current) => current.map((section, i) => (i === index ? { ...section, [key]: value } : section)));
    };

  const moveSection = (index: number, delta: -1 | 1) => {
    setSections((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const sectionsPayload = sections.map((section) => ({
      heading: section.heading,
      body: paragraphs(section.body),
      ...(bulletLines(section.list).length ? { list: bulletLines(section.list) } : null),
    }));
    const sectionsViPayload = sections
      .filter((section) => section.headingVi || section.bodyVi || section.listVi)
      .map((section) => ({
        heading: section.headingVi || section.heading,
        body: paragraphs(section.bodyVi),
        ...(bulletLines(section.listVi).length ? { list: bulletLines(section.listVi) } : null),
      }));
    const payload = {
      slug: form.slug,
      author: form.author,
      authorSlug: form.authorSlug,
      publishedOn: form.publishedOn,
      title: form.title,
      excerpt: form.excerpt,
      tags: form.tags.split(',').map((part) => part.trim()).filter(Boolean),
      featured: form.featured,
      sections: sectionsPayload,
      titleVi: form.titleVi || null,
      excerptVi: form.excerptVi || null,
      sectionsVi: sectionsViPayload.length ? sectionsViPayload : null,
    };

    const res = await fetch(guide ? `/api/admin/guides/${guide.slug}` : '/api/admin/guides', {
      method: guide ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? `Save failed (${res.status})`);
      return;
    }
    router.push('/admin/guides');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-2">
        <Field label="Title">
          <input className={inputCls} value={form.title} onChange={set('title')} required />
        </Field>
        <Field label="Slug (URL)">
          <input
            className={inputCls}
            value={form.slug}
            onChange={(event) => {
              setSlugTouched(true);
              set('slug')(event);
            }}
            required
          />
        </Field>
        <Field label="Author">
          <input className={inputCls} value={form.author} onChange={set('author')} required />
        </Field>
        <Field label="Published on">
          <input type="date" className={inputCls} value={form.publishedOn} onChange={set('publishedOn')} required />
        </Field>
        <Field label="Excerpt (one or two lines, shown on cards)">
          <textarea className={`${inputCls} min-h-20`} value={form.excerpt} onChange={set('excerpt')} required />
        </Field>
        <div className="flex flex-col gap-4">
          <Field label="Tags (comma separated, English keys)">
            <input className={inputCls} value={form.tags} onChange={set('tags')} placeholder="Fundamentals, Economy" />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-mist">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) => setForm((current) => ({ ...current, featured: event.target.checked }))}
              className="h-4 w-4 accent-[#7c5cff]"
            />
            Featured on the guides index
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-mist">Sections</p>
          <button
            type="button"
            onClick={() => setSections((current) => [...current, emptySection()])}
            className="smooth rounded-full border border-line bg-page px-3 py-1 text-xs font-semibold text-fog hover:border-brand-soft"
          >
            + Add section
          </button>
        </div>
        {sections.map((section, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-lg border border-line bg-page/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-mist">Section {index + 1}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} className="smooth rounded-full border border-line bg-page px-2 py-0.5 text-xs text-mist hover:text-fog disabled:opacity-40">
                  ↑
                </button>
                <button type="button" onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} className="smooth rounded-full border border-line bg-page px-2 py-0.5 text-xs text-mist hover:text-fog disabled:opacity-40">
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setSections((current) => current.filter((_, i) => i !== index))}
                  disabled={sections.length === 1}
                  className="smooth rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-tier-s hover:border-tier-s disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Heading (en)">
                <input className={inputCls} value={section.heading} onChange={setSection(index, 'heading')} required />
              </Field>
              <Field label="Heading (vi)">
                <input className={inputCls} value={section.headingVi} onChange={setSection(index, 'headingVi')} />
              </Field>
              <Field label="Body — one paragraph per line (en)">
                <textarea className={`${inputCls} min-h-28`} value={section.body} onChange={setSection(index, 'body')} required />
              </Field>
              <Field label="Body — one paragraph per line (vi)">
                <textarea className={`${inputCls} min-h-28`} value={section.bodyVi} onChange={setSection(index, 'bodyVi')} />
              </Field>
              <Field label="Bullets — one per line (en, optional)">
                <textarea className={`${inputCls} min-h-20`} value={section.list} onChange={setSection(index, 'list')} />
              </Field>
              <Field label="Bullets — one per line (vi, optional)">
                <textarea className={`${inputCls} min-h-20`} value={section.listVi} onChange={setSection(index, 'listVi')} />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 rounded-xl border border-line bg-panel p-5 md:grid-cols-2">
        <Field label="Title (vi)">
          <input className={inputCls} value={form.titleVi} onChange={set('titleVi')} />
        </Field>
        <Field label="Excerpt (vi)">
          <textarea className={`${inputCls} min-h-20`} value={form.excerptVi} onChange={set('excerptVi')} />
        </Field>
        <p className="text-xs text-mist md:col-span-2">
          Vietnamese fields are optional; empty ones fall back to English on /vi pages. Body and bullets are always
          optional per section — fill Heading (vi) and Body (vi) to translate a section.
        </p>
      </div>

      {error ? <p className="rounded-xl border border-tier-s/50 bg-panel px-4 py-3 text-sm text-tier-s">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="smooth rounded-full border border-brand-hot bg-brand-hot px-6 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? 'Saving…' : guide ? 'Save changes' : 'Create guide'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/guides')}
          className="smooth rounded-full border border-line bg-panel px-5 py-2 text-sm font-semibold text-mist hover:border-brand-soft hover:text-fog"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
