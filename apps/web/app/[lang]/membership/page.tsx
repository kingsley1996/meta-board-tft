import type { Metadata } from 'next';
import Link from 'next/link';
import { formatVnd, freePlan, plusPlan, type PilotPlan } from '@tftiq/shared/membership-plans';
import { PlanCta } from '@/components/membership/plan-cta';
import type { CatalogOffer } from '@/lib/api';
import { backendJson } from '@/lib/backend';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: messages[lang].meta.membership.title, description: messages[lang].meta.membership.description };
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

function Lock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// What a card shows comes from the published catalog when it is reachable and from
// the shared pilot constants when it is not. Checkout prices from the same catalog,
// so activating a new plan version (#98) must move both screens at once.
type ShownPlan = {
  label: string;
  priceVnd: number;
  termDays: number | null;
  chatPerPeriod: number;
  chatPerDay: number;
  sttSecondsPerPeriod: number;
  ttsCharactersPerPeriod: number;
};

function shown(offer: CatalogOffer | undefined, fallback: PilotPlan): ShownPlan {
  if (!offer) return fallback;
  return { label: offer.label, priceVnd: offer.price.vnd, termDays: offer.termDays, ...offer.allowances };
}

// One shape for both plans so the two cards line up: art, name, price, perks and
// a CTA pinned to the bottom. Free's CTA sits in the same slot as Plus's buy
// button, which is what keeps the cards the same height without a min-height.
function PlanCard({
  plan,
  tier,
  price,
  cadence,
  perks,
  lockedPerk,
  art,
  ribbon,
  plus,
  children,
}: {
  plan: { label: string };
  tier: string;
  price: string;
  cadence: string;
  perks: string[];
  lockedPerk?: string;
  art: { src: string; width: number; height: number };
  ribbon?: string;
  plus?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={`relative flex flex-col overflow-hidden rounded-2xl border bg-panel ${plus ? 'border-brand/55' : 'border-line'}`}>
      {ribbon ? (
        <p className="bg-brand px-2.5 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-on-brand">{ribbon}</p>
      ) : null}
      <div
        className={`flex items-end justify-center overflow-hidden ${plus ? 'h-[224px] sm:h-[236px]' : 'h-[200px]'}`}
        style={{
          background: plus
            ? 'radial-gradient(120% 90% at 50% 100%, color-mix(in srgb, var(--color-brand) 26%, transparent), transparent 64%), linear-gradient(180deg, #182126, var(--color-page))'
            : 'radial-gradient(120% 90% at 50% 100%, color-mix(in srgb, var(--color-brand) 20%, transparent), transparent 64%), linear-gradient(180deg, #1a242a, #101619)',
        }}
      >
        {/* Decorative: the plan name sits directly below the art. */}
        <img
          src={art.src}
          alt=""
          width={art.width}
          height={art.height}
          className={plus ? 'max-h-full max-w-[92%] object-contain drop-shadow-[0_14px_26px_rgba(0,0,0,0.5)]' : 'max-h-[74%] max-w-[92%] object-contain brightness-[1.14] drop-shadow-[0_14px_26px_rgba(0,0,0,0.55)]'}
        />
      </div>
      <div className="flex flex-col gap-[3px] px-[18px] pt-3.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">{tier}</span>
        <h2 className="font-display text-3xl leading-none font-bold uppercase tracking-[-0.02em] text-fog">{plan.label}</h2>
      </div>
      <div className="mt-2 flex flex-col gap-0.5 px-[18px]">
        <span className="font-display text-3xl leading-none font-bold tracking-[-0.02em] tabular-nums text-fog">{price}</span>
        <span className="text-xs text-mist">{cadence}</span>
      </div>
      <ul className="mt-3.5 flex list-none flex-col gap-2 px-[18px]">
        {perks.map((perk) => (
          <li key={perk} className="flex gap-2 text-[12.5px] leading-[1.45] text-fog">
            <span className="mt-px shrink-0 text-brand">
              <Tick />
            </span>
            {perk}
          </li>
        ))}
        {lockedPerk ? (
          <li className="flex gap-2 text-[12.5px] leading-[1.45] text-mist">
            <span className="mt-px shrink-0 text-mist">
              <Lock />
            </span>
            {lockedPerk}
          </li>
        ) : null}
      </ul>
      {/* mt-auto pins the button to the card floor; pt keeps a gap on the tallest
          card, where a stretched grid leaves no spare room to push into. */}
      <div className="mt-auto flex flex-col pt-6">{children}</div>
    </article>
  );
}

export default async function MembershipPage({ params }: { params: Promise<{ lang: Lang }> }) {
  const { lang } = await params;
  const t = messages[lang].membership;
  // A pricing page that 500s because the API blinked is worse than one showing the
  // approved pilot constants, so an unreachable catalog falls back instead of throwing.
  const catalog = await backendJson<{ offers: CatalogOffer[] }>('/api/membership/catalog', { revalidate: 60 }).catch(() => null);
  const free = shown(catalog?.offers.find((offer) => offer.code === 'free'), freePlan);
  const plus = shown(catalog?.offers.find((offer) => offer.code === 'plus'), plusPlan);
  const num = (value: number) => new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US').format(value);
  const termDays = plus.termDays ?? 30;
  const freePrice = formatVnd(free.priceVnd, lang);
  const plusPrice = formatVnd(plus.priceVnd, lang);
  // Rounded to the nearest 100₫ because "about 3,300₫ a day" is an orientation
  // number, not a second price.
  const dailyPrice = formatVnd(Math.round(plus.priceVnd / termDays / 100) * 100, lang);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2.5">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{t.kicker}</p>
        <h1 className="font-display text-[40px] leading-[0.86] font-bold tracking-[-0.045em] whitespace-nowrap text-fog uppercase sm:text-[74px]">
          TFTIQ<span className="text-brand">+</span>
        </h1>
      </div>

      <div className="grid items-stretch gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <p className="max-w-[62ch] text-sm leading-[1.65] text-mist">{t.lede}</p>
          <div className="flex flex-col gap-[15px] border-t border-line pt-[15px]">
            {t.notes.map((note) => (
              <div key={note.label} className="flex flex-col gap-[3px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand">{note.label}</span>
                <p className="text-[12.5px] leading-[1.62] text-mist">{note.body}</p>
              </div>
            ))}
          </div>
          <Link href={`/${lang}/legal/terms`} className="smooth self-start text-[13px] font-semibold text-brand hover:text-brand-deep">
            {t.policy} →
          </Link>
        </div>

        <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
          <PlanCard
            plan={free}
            tier={t.starterTier}
            price={freePrice}
            cadence={t.free.cadence}
            perks={[t.free.perkChat(num(free.chatPerPeriod), num(free.chatPerDay)), ...t.free.perks]}
            lockedPerk={t.free.lockedPerk}
            art={{ src: '/images/tft/penguin-gem-hd.webp', width: 424, height: 400 }}
          >
            <PlanCta lang={lang} plan="free" />
          </PlanCard>

          <PlanCard
            plan={plus}
            tier={t.memberTier}
            price={plusPrice}
            cadence={t.plus.cadence(termDays, dailyPrice)}
            perks={[
              t.plus.perkChat(num(plus.chatPerPeriod), num(termDays), num(plus.chatPerDay)),
              t.plus.perkStt(num(Math.round(plus.sttSecondsPerPeriod / 60))),
              t.plus.perkTts(num(plus.ttsCharactersPerPeriod)),
              ...t.plus.perks,
            ]}
            art={{ src: '/images/tft/coach-penguin.webp', width: 771, height: 1209 }}
            ribbon={t.plus.ribbon}
            plus
          >
            <PlanCta lang={lang} plan="plus" price={plusPrice} />
          </PlanCard>
        </div>
      </div>
    </div>
  );
}
