'use client';

import { useState } from 'react';
import { UnitHex, tierColor } from '@/components/ui';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { tierRank, type Tier } from '@/lib/tiers';
import { unitName } from '@/lib/tips';
import type { BuilderChampion } from './builder';

// Ranking travels in ?t= as base64url JSON: { championName: tier }.
function encode(ranks: Record<string, string>): string {
  return btoa(JSON.stringify(ranks)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decode(value: string | undefined): Record<string, Tier> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const ranks: Record<string, Tier> = {};
    for (const [name, tier] of Object.entries(parsed)) {
      if (typeof tier === 'string' && (tierRank as string[]).includes(tier)) ranks[name] = tier as Tier;
    }
    return ranks;
  } catch {
    return null;
  }
}

export function TierMaker({ lang, champions, initial }: { lang: Lang; champions: BuilderChampion[]; initial?: string }) {
  const t = messages[lang].tierMaker;
  const [ranks, setRanks] = useState<Record<string, Tier>>(() => decode(initial) ?? {});
  const [selected, setSelected] = useState('');
  const [copied, setCopied] = useState(false);

  const known = new Set(champions.map((champion) => champion.name));
  const pool = champions.filter((champion) => known.has(champion.name) && !ranks[champion.name]);
  const byTier = (tier: Tier) => champions.filter((champion) => ranks[champion.name] === tier);

  const assign = (name: string, tier: Tier) => {
    if (!known.has(name)) return;
    setRanks((current) => ({ ...current, [name]: tier }));
    setSelected('');
  };

  const unassign = (name: string) => {
    setRanks((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/${lang}/tier-maker?t=${encode(ranks)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-5">
      <div data-section="maker-head" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{t.tiers}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-mist">{t.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={copyLink} className="smooth rounded-full border border-brand-hot bg-brand-hot px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep">
            {copied ? t.copied : t.copyLink}
          </button>
          <button
            type="button"
            onClick={() => setRanks({})}
            className="smooth rounded-full border border-line bg-panel px-4 py-1.5 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
          >
            {t.clear}
          </button>
        </div>
      </div>

      <div data-section="maker-tiers" className="flex flex-col gap-3">
        {tierRank.map((tier) => (
          <div key={tier} className="flex items-stretch gap-3">
            <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-panel" style={{ borderColor: tierColor[tier] }}>
              <span className="font-display text-3xl font-bold" style={{ color: tierColor[tier] }}>{tier}</span>
            </div>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const payload = event.dataTransfer.getData('text/plain');
                if (payload.startsWith('unit:')) assign(payload.slice(5), tier);
                else if (selected) assign(selected, tier);
              }}
              onClick={() => (selected ? assign(selected, tier) : undefined)}
              className={`flex min-h-[72px] flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-panel p-2 ${selected ? 'cursor-pointer hover:border-brand-soft' : ''}`}
            >
              {byTier(tier).map((champion) => (
                <button
                  key={champion.name}
                  type="button"
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', `unit:${champion.name}`)}
                  onClick={(event) => {
                    event.stopPropagation();
                    unassign(champion.name);
                  }}
                  title={`${unitName(champion.name, lang)} — click to unrank`}
                  className="rounded-lg p-0.5 hover:bg-util"
                >
                  <UnitHex name={champion.name} cost={champion.cost} icon={champion.icon} size={44} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div data-section="maker-pool" className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.pool}</p>
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-panel p-3">
          {pool.map((champion) => (
            <button
              key={champion.name}
              type="button"
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', `unit:${champion.name}`)}
              onClick={() => setSelected((current) => (current === champion.name ? '' : champion.name))}
              title={unitName(champion.name, lang)}
              className={`rounded-lg p-0.5 transition ${selected === champion.name ? 'bg-brand-hot/40 ring-2 ring-brand-soft' : 'hover:bg-util'}`}
            >
              <UnitHex name={champion.name} cost={champion.cost} icon={champion.icon} size={40} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
