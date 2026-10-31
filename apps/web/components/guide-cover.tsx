import { xpTable } from '@tftiq/shared/mechanics';
import { guideTag, patch } from '@/lib/data';
import type { Lang } from '@/lib/i18n';

// Read from the same leveling table the tables page renders, so the cover can
// never drift from the numbers the guides are talking about.
const LEVEL_XP = xpTable.find((row) => row.level === 8)?.xp ?? 0;

// Covers are drawn from blocks, not photographed: a plate in the Slate palette
// with a small custom diagram for the guide's tag. Each tag gets its own
// silhouette, so a row of leveling tips never looks like three copies of the
// same tile, while the frame (label, rule, accent bar) stays the same.
function TagDiagram({ tag }: { tag: string }) {
  switch (tag) {
    // A unit upgraded to three stars.
    case 'Fundamentals':
      return (
        <>
          <polygon points="50,14 78,30 78,62 50,78 22,62 22,30" className="fill-util" />
          <text x="50" y="53" textAnchor="middle" className="fill-brand font-display text-[14px] font-bold">
            ★★★
          </text>
        </>
      );
    // A coin, with the rest of the stack behind it.
    case 'Economy':
      return (
        <>
          <circle cx="26" cy="62" r="17" className="fill-fog/15" />
          <circle cx="44" cy="50" r="18" className="fill-fog/20" />
          <circle cx="62" cy="38" r="19" className="fill-brand/70" />
          <text x="62" y="43" textAnchor="middle" className="fill-on-brand font-display text-[12px] font-bold">
            50g
          </text>
        </>
      );
    // The XP bar, as it sits under the portrait in game.
    case 'Leveling':
      return (
        <>
          <text x="4" y="30" className="fill-brand font-display text-[22px] font-bold">
            LV 8
          </text>
          <text x="4" y="44" className="fill-mist/60 font-display text-[9px] font-semibold">
            {LEVEL_XP} XP
          </text>
          <rect x="4" y="54" width="88" height="12" rx="2" className="fill-brand/70" />
        </>
      );
    // Three item slots, one filled, with loose components below.
    case 'Items':
      return (
        <>
          <rect x="4" y="18" width="26" height="26" rx="3" className="fill-fog/10" />
          <rect x="35" y="18" width="26" height="26" rx="3" className="fill-brand/70" />
          <rect x="66" y="18" width="26" height="26" rx="3" className="fill-fog/10" />
          <rect x="4" y="52" width="12" height="12" rx="2" className="fill-fog/20" />
          <rect x="20" y="52" width="12" height="12" rx="2" className="fill-fog/15" />
        </>
      );
    // Six hexes of a board, the carry marked.
    case 'Positioning':
      return (
        <>
          <polygon points="26,17 33.8,21.5 33.8,30.5 26,35 18.2,30.5 18.2,21.5" className="fill-fog/20" />
          <polygon points="48,17 55.8,21.5 55.8,30.5 48,35 40.2,30.5 40.2,21.5" className="fill-fog/15" />
          <polygon points="70,17 77.8,21.5 77.8,30.5 70,35 62.2,30.5 62.2,21.5" className="fill-fog/15" />
          <polygon points="37,39 44.8,43.5 44.8,52.5 37,57 29.2,52.5 29.2,43.5" className="fill-brand/70" />
          <polygon points="59,39 66.8,43.5 66.8,52.5 59,57 51.2,52.5 51.2,43.5" className="fill-fog/20" />
          <polygon points="48,61 55.8,65.5 55.8,74.5 48,79 40.2,74.5 40.2,65.5" className="fill-fog/15" />
        </>
      );
    // The three-card augment picker.
    case 'Augments':
      return (
        <>
          <rect x="6" y="46" width="30" height="40" rx="4" className="fill-fog/10" />
          <rect x="30" y="30" width="30" height="40" rx="4" className="fill-fog/20" />
          <rect x="54" y="14" width="30" height="40" rx="4" className="fill-brand/70" />
          <polygon points="69,24 76,28 76,36 69,40 62,36 62,28" className="fill-on-brand/60" />
        </>
      );
    // Tier rows, the way a comp list is ranked.
    case 'Meta':
    case 'Meta read':
      return (
        <>
          <rect x="4" y="12" width="20" height="20" rx="3" className="fill-brand" />
          <text x="14" y="27" textAnchor="middle" className="fill-on-brand font-display text-[12px] font-bold">S</text>
          <rect x="30" y="17" width="62" height="10" rx="2" className="fill-fog/20" />
          <rect x="4" y="40" width="20" height="20" rx="3" className="fill-fog/20" />
          <text x="14" y="55" textAnchor="middle" className="fill-fog/70 font-display text-[12px] font-bold">A</text>
          <rect x="30" y="45" width="50" height="10" rx="2" className="fill-fog/15" />
          <rect x="4" y="68" width="20" height="20" rx="3" className="fill-fog/10" />
          <text x="14" y="83" textAnchor="middle" className="fill-fog/50 font-display text-[12px] font-bold">B</text>
          <rect x="30" y="73" width="38" height="10" rx="2" className="fill-fog/10" />
        </>
      );
    // A roll decision, drawn as the flowcharts say to draw it.
    case 'Decision making':
      return (
        <>
          <path d="M20 84V64h28V42" className="stroke-fog/25" strokeWidth="2" />
          <path d="M20 64h54V42" className="stroke-fog/25" strokeWidth="2" />
          <rect x="10" y="72" width="20" height="14" rx="2" className="fill-fog/20" />
          <text x="20" y="83" textAnchor="middle" className="fill-fog/70 font-display text-[10px] font-bold">?</text>
          <rect x="35" y="26" width="26" height="16" rx="2" className="fill-brand/70" />
          <rect x="67" y="26" width="26" height="16" rx="2" className="fill-fog/10" />
        </>
      );
    // The stage clock: where the decision happens.
    case 'Mid game':
      return (
        <>
          <text x="14" y="32" textAnchor="middle" className="fill-mist/60 font-display text-[11px] font-semibold">2-1</text>
          <text x="48" y="32" textAnchor="middle" className="fill-brand font-display text-[13px] font-bold">3-2</text>
          <text x="82" y="32" textAnchor="middle" className="fill-mist/60 font-display text-[11px] font-semibold">4-2</text>
          <rect x="2" y="44" width="92" height="3" rx="1.5" className="fill-fog/15" />
          <circle cx="14" cy="45.5" r="6" className="fill-fog/20" />
          <circle cx="48" cy="45.5" r="8" className="fill-brand" />
          <circle cx="82" cy="45.5" r="6" className="fill-fog/20" />
        </>
      );
    // The patch stamp plus a changelog.
    case 'Patch notes':
      return (
        <>
          <text x="2" y="38" className="fill-fog/25 font-display text-[26px] font-bold">{patch.version}</text>
          <rect x="2" y="50" width="60" height="4" rx="2" className="fill-brand" />
          <rect x="2" y="62" width="82" height="4" rx="2" className="fill-fog/10" />
          <rect x="2" y="74" width="54" height="4" rx="2" className="fill-fog/10" />
        </>
      );
    default:
      return (
        <>
          <polygon points="56,14 84,32 84,68 56,86 28,68 28,32" className="fill-fog/10" />
          <polygon points="56,38 70,46 70,62 56,70 42,62 42,46" className="fill-brand/60" />
        </>
      );
  }
}

export function GuideCover({ tag, lang, index, hero = false }: { tag: string; lang: Lang; index: number; hero?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-util/40 via-panel to-panel ${hero ? 'min-h-[200px] rounded-lg border border-line' : 'h-[150px]'}`}>
      <span
        aria-hidden="true"
        className={`hex absolute bg-fog/[0.03] ${hero ? '-right-16 -bottom-24 h-72 w-64 rotate-6' : '-right-10 -bottom-16 h-44 w-40 rotate-6'}`}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 96 96"
        fill="none"
        className={`absolute transition-transform duration-500 ease-out group-hover:scale-105 ${hero ? 'right-8 bottom-6 h-52 w-52' : 'right-3 bottom-3 h-[104px] w-[104px]'}`}
      >
        <TagDiagram tag={tag} />
      </svg>
      <span className={`absolute text-mist uppercase ${hero ? 'top-5 left-5 text-[10px]' : 'top-[13px] left-[13px] text-[9px]'} font-semibold tracking-[0.2em]`}>
        <b className="text-brand">{guideTag(tag, lang)}</b> &middot; {String(index).padStart(2, '0')}
      </span>
      <span aria-hidden="true" className={`absolute rounded-full bg-brand ${hero ? 'bottom-5 left-5 h-1 w-14' : 'bottom-4 left-[13px] h-[3px] w-11'}`} />
    </div>
  );
}
