import type { Metadata } from 'next';
import Link from 'next/link';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import wispsJson from '@/lib/wisps.json';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.wisps.title, description: messages[lang].meta.wisps.description };
}

type Variant = 'base' | 'upgrade' | 'prismatic';
type WispRecord = {
  name: string;
  nameVi: string | null;
  tier: WispTier;
  category: string | null;
  cost: number | null;
  variant: Variant;
  description: string | null;
  descriptionVi: string | null;
  icon: string | null;
  round: string | null;
};
type WispVariant = { description: string | null; descriptionVi: string | null; round: string | null };
type Wisp = {
  name: string;
  nameVi: string | null;
  tier: WispTier;
  category: string | null;
  cost: number | null;
  icon: string | null;
  variants: Partial<Record<Variant, WispVariant>>;
};

const WISP_TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
type WispTier = (typeof WISP_TIERS)[number];
const WISP_TIER_COLOR: Record<WispTier, string> = {
  S: 'var(--color-tier-s)',
  A: 'var(--color-tier-a)',
  B: 'var(--color-tier-b)',
  C: 'var(--color-tier-c)',
  D: 'var(--color-tier-d)',
};
const VARIANT_ORDER: Variant[] = ['base', 'upgrade', 'prismatic'];

// MetaTFT stores one record per variant, so group them back into one card per
// Wisp name. The base record supplies the tier and card metadata.
const allWisps = (() => {
  const byName = new Map<string, Wisp>();
  for (const entry of wispsJson.wisps as WispRecord[]) {
    const wisp = byName.get(entry.name) ?? {
      name: entry.name,
      nameVi: entry.nameVi,
      tier: entry.tier,
      category: entry.category,
      cost: entry.cost,
      icon: entry.icon,
      variants: {},
    };
    wisp.variants[entry.variant] = {
      description: entry.description,
      descriptionVi: entry.descriptionVi,
      round: entry.round,
    };
    if (entry.variant === 'base') {
      wisp.nameVi = entry.nameVi;
      wisp.tier = entry.tier;
      wisp.category = entry.category;
      wisp.cost = entry.cost;
      wisp.icon = entry.icon;
    }
    byName.set(entry.name, wisp);
  }
  return [...byName.values()].sort(
    (a, b) => WISP_TIERS.indexOf(a.tier) - WISP_TIERS.indexOf(b.tier) || a.name.localeCompare(b.name)
  );
})();

type Search = { q?: string; tier?: string };

export default async function WispsPage({ params, searchParams }: { params: Promise<{ lang: Lang }>; searchParams: Promise<Search> }) {
  const { lang } = await params;
  const { q = '', tier = 'all' } = await searchParams;
  const t = messages[lang].wispsDb;
  const query = q.trim().toLowerCase();
  const activeTier = WISP_TIERS.includes(tier as WispTier) ? (tier as WispTier) : 'all';
  const categoryLabel = (category: string | null) =>
    category ? ((t.categories as Record<string, string>)[category] ?? category) : null;
  const displayName = (wisp: Wisp) => (lang === 'vi' ? wisp.nameVi ?? wisp.name : wisp.name);
  const matches = (value: string | null | undefined) => (value ?? '').toLowerCase().includes(query);

  const wisps = allWisps
    .filter((wisp) => activeTier === 'all' || wisp.tier === activeTier)
    .filter(
      (wisp) =>
        !query ||
        matches(wisp.name) ||
        matches(wisp.nameVi) ||
        VARIANT_ORDER.some(
          (variant) => matches(wisp.variants[variant]?.description) || matches(wisp.variants[variant]?.descriptionVi)
        )
    )
    .sort(
      (a, b) => WISP_TIERS.indexOf(a.tier) - WISP_TIERS.indexOf(b.tier) || displayName(a).localeCompare(displayName(b), lang)
    );

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <div data-section="page-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{messages[lang].meta.wisps.title}</h1>
          <span className="text-sm text-mist">{t.count(wisps.length, allWisps.length)}</span>
        </div>
        <form method="get" className="flex items-center gap-2">
          {activeTier !== 'all' ? <input type="hidden" name="tier" value={activeTier} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t.search}
            aria-label={t.search}
            className="smooth h-9 w-56 rounded-lg border border-line bg-panel px-4 text-sm text-fog placeholder:text-mist focus:border-brand-soft focus:outline-none"
          />
          <button type="submit" className="smooth h-9 rounded-lg border border-brand-hot bg-brand-hot px-4 text-sm font-semibold text-white hover:bg-brand-deep">
            {'\u2315'}
          </button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {['all', ...WISP_TIERS].map((key) => {
          const color = key === 'all' ? undefined : WISP_TIER_COLOR[key as WispTier];
          const selected = activeTier === key;
          return (
            <Link
              key={key}
              href={`/${lang}/wisps?${new URLSearchParams({ ...(q ? { q } : {}), ...(key !== 'all' ? { tier: key } : {}) })}`}
              className={`smooth rounded-full border px-4 py-1.5 text-xs font-semibold ${selected ? 'border-brand-hot bg-brand-hot text-white' : 'border-line bg-panel text-mist hover:border-brand-soft'}`}
              style={selected ? undefined : color ? { color } : undefined}
            >
              {key === 'all' ? t.all : key}
            </Link>
          );
        })}
      </div>
      {wisps.length ? (
        <div data-section="wisp-grid" className="grid w-full gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {wisps.map((wisp) => {
            const meta = [categoryLabel(wisp.category), wisp.cost === null ? null : t.cost(wisp.cost)].filter(Boolean).join(' · ');
            return (
              <div key={wisp.name} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {wisp.icon ? (
                      <img src={wisp.icon} alt="" width={28} height={28} loading="lazy" className="mt-0.5 h-7 w-7 shrink-0 rounded" />
                    ) : null}
                    <div>
                      <p className="font-display text-lg font-semibold text-fog">{displayName(wisp)}</p>
                      {meta ? <p className="text-xs text-mist">{meta}</p> : null}
                    </div>
                  </div>
                  <span className="shrink-0 rounded border px-1.5 py-0.5 font-display text-xs font-bold" style={{ borderColor: WISP_TIER_COLOR[wisp.tier], color: WISP_TIER_COLOR[wisp.tier] }}>
                    {wisp.tier}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {VARIANT_ORDER.map((variant) => {
                    const data = wisp.variants[variant];
                    if (!data) return null;
                    const description = lang === 'vi' ? data.descriptionVi ?? data.description : data.description;
                    return (
                      <div key={variant} className="rounded-lg bg-util/40 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-brand-soft">{t.variants[variant]}</span>
                          {data.round ? <span className="shrink-0 text-[11px] text-mist">{t.round(data.round)}</span> : null}
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-fog/80">{description ?? t.missing}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mist">{t.empty}</p>
      )}
      <p className="text-xs text-mist">{t.source}</p>
    </div>
  );
}
