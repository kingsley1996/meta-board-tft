import Link from 'next/link';
import {
  cardGroups,
  countByCard,
  HIGHLIGHT_FACE_LIMIT,
  type PatchEntityKind,
  type PatchRow,
} from '@tftiq/shared/patch-notes';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import { DIRECTION_TONE, entityHref, textOf } from '@/lib/patches';
import { traitStyleForName } from '@/lib/tips';
import { AugmentTile, Chip, ItemHex, ItemTile, Panel, UnitHex } from './ui';

// The three views a set of patch rows is drawn into: Riot's highlight card on top of an
// article, the change table under it, and the one-line strip on the patch list. All three are
// derived from the same rows, so an admin editing a row moves every one of them with it.

// A change table row is a line of prose, not a board slot, so its tile is smaller than the
// card's; the hexagon still carries the cost rim or the trait colour.
const CARD_TILE = 42;
const ROW_TILE = 30;

// The hex tile for one entity. The champion keeps UnitHex so the rim is its cost and the
// hover card resolves; a trait borrows the tier colour its own page uses, and a wisp or an
// emblem has neither a detail page nor a tooltip yet, so it shows plain.
function PatchTile({ row, lang, size }: { row: PatchRow; lang: Lang; size: number }) {
  const name = textOf(row.name, lang);
  if (row.kind === 'champion') {
    return <UnitHex name={row.name.en} cost={row.cost ?? 1} icon={row.icon} size={size} />;
  }
  if (row.kind === 'augment') {
    return <AugmentTile name={row.name.en} icon={row.icon} size={size} />;
  }
  // Item art is a square icon, so it gets the square slot the item rankings and the comp board
  // use. A hexagon clips its corners and at table size that is most of the picture — for a
  // radiant item, the glow that tells it apart from the plain one.
  if (row.kind === 'item') {
    return <ItemTile name={row.name.en} icon={row.icon} size={size} />;
  }
  return (
    <ItemHex
      name={name}
      icon={row.icon}
      size={size}
      frame={row.kind === 'trait' ? traitStyleForName(row.name.en)?.fill : undefined}
      tip={row.kind === 'trait' ? `trait:${row.name.en}` : undefined}
    />
  );
}

// One cell of the highlight card: the face, its name under it, and a link on both when the
// entity has a page of its own. Two lines, never an ellipsis mid-word — a highlight that reads
// "Cooking…" tells the reader nothing, and the card is the only place a name appears before
// they tap through.
function HighlightFace({ row, lang }: { row: PatchRow; lang: Lang }) {
  const name = textOf(row.name, lang);
  const href = entityHref(row, lang);
  const label = href ? (
    <Link
      href={href}
      className="smooth line-clamp-2 block w-full text-center text-[10px] leading-tight font-semibold text-mist hover:text-brand"
    >
      {name}
    </Link>
  ) : (
    <span className="line-clamp-2 block w-full text-center text-[10px] leading-tight font-semibold text-mist">
      {name}
    </span>
  );
  const tile = <PatchTile row={row} lang={lang} size={CARD_TILE} />;
  return (
    <span className="flex w-[72px] flex-col items-center gap-1">
      {href ? (
        <Link href={href} className="smooth hover:brightness-110">
          {tile}
        </Link>
      ) : (
        tile
      )}
      {label}
    </span>
  );
}

// Riot's card, drawn our way: one row per kind inside a direction, so a reader who only cares
// about augments never has to pick them out of a wall of hexes. No kind is folded into a bare
// count — "14 augments" answers nothing, and eight faces plus a `+6` says both how many and
// which ones start the list.
export function PatchHighlights({ lang, rows }: { lang: Lang; rows: PatchRow[] }) {
  const t = messages[lang].patches;
  const groups = cardGroups(rows);
  if (!groups.length) return null;
  const counts = countByCard(rows);
  const directions = [...new Set(groups.map((group) => group.direction))];

  return (
    <Panel section="patch-highlights" className="flex flex-col gap-4 p-4 md:p-5">
      <h2 className="font-display text-base font-bold uppercase tracking-wide text-brand">{t.highlights}</h2>
      {directions.map((direction) => (
        <div key={direction} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Chip tone={DIRECTION_TONE[direction]}>{t.directions[direction]}</Chip>
            <span className="font-display text-sm font-bold tabular-nums text-mist">{counts[direction]}</span>
          </div>
          {groups
            .filter((group) => group.direction === direction)
            .map((group) => {
              const shown = group.entities.slice(0, HIGHLIGHT_FACE_LIMIT);
              const rest = group.entities.length - shown.length;
              return (
                <div key={group.kind} className="flex items-start gap-2.5">
                  <span className="w-[86px] shrink-0 pt-2 text-[10px] font-bold uppercase tracking-wide text-mist">
                    {t.kinds[group.kind]} <span className="tabular-nums text-fog">{group.entities.length}</span>
                  </span>
                  <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-3">
                    {shown.map((row) => (
                      <HighlightFace key={row.ref} row={row} lang={lang} />
                    ))}
                    {rest ? (
                      <Chip tone="plain" className="self-start">
                        +{rest}
                      </Chip>
                    ) : null}
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </Panel>
  );
}

// The list row reads a patch at a glance: one line per direction, the count in front and the
// faces behind it. A tile is never a link here because the whole row is one, and a name under
// each tile would turn a five-row list into a wall of text — the hover card carries the name.
const LIST_TILE = 28;
const LIST_LINE_LIMIT = 12;

// A line is either a face or, past four of a kind, the chip that states how many moved.
type ListCell = { kind: PatchEntityKind; merged: number } | { entity: PatchRow };

export function PatchStrip({ lang, rows }: { lang: Lang; rows: PatchRow[] }) {
  const t = messages[lang].patches;
  const groups = cardGroups(rows);
  const counts = countByCard(rows);
  const directions = [...new Set(groups.map((group) => group.direction))];

  return (
    <>
      {directions.map((direction) => {
        // A kind that overruns the card stays one chip: which twelve of the fourteen buffed
        // augments is not the question a list asks, but that fourteen moved is.
        const cells = groups
          .filter((group) => group.direction === direction)
          .flatMap((group): ListCell[] =>
            group.merged
              ? [{ kind: group.kind, merged: group.entities.length }]
              : group.entities.map((entity) => ({ entity })),
          );
        const shown = cells.slice(0, LIST_LINE_LIMIT);
        const rest = cells.length - shown.length;
        return (
          <span key={direction} className="flex min-w-0 items-center gap-2">
            <Chip tone={DIRECTION_TONE[direction]} className="shrink-0 lowercase">
              {counts[direction]} {counts[direction] === 1 ? t.directionsOne[direction] : t.directions[direction]}
            </Chip>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {shown.map((cell, index) =>
                'merged' in cell ? (
                  <Chip key={`merged-${cell.kind}`} tone="plain">
                    {cell.merged} {t.kinds[cell.kind]}
                  </Chip>
                ) : (
                  <PatchTile key={`${cell.entity.ref}-${index}`} row={cell.entity} lang={lang} size={LIST_TILE} />
                ),
              )}
              {rest ? <span className="px-1 text-[11px] font-semibold tabular-nums text-mist">+{rest}</span> : null}
            </span>
          </span>
        );
      })}
    </>
  );
}

// One entity of an article block: a header line for who changed, then one line per stat Riot
// wrote under that name. `data-kind` sits on the entry because a tab filter answers for the
// entity as a whole — every line of a champion is a champion line — and the change lines are
// divs, because the filter's rule hides every `li` that is not the kind it is showing.
const LABEL_INDENT = ROW_TILE + 10;

function ChangeEntry({ lang, rows }: { lang: Lang; rows: PatchRow[] }) {
  const t = messages[lang].patches;
  const first = rows[0];
  const href = entityHref(first, lang);
  const name = textOf(first.name, lang);
  const note = textOf(first.note, lang);
  const tile = <PatchTile row={first} lang={lang} size={ROW_TILE} />;
  return (
    <li data-kind={first.kind} className="border-b border-line/60 px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-2.5">
        {href ? (
          <Link href={href} className="smooth shrink-0 hover:brightness-110" aria-label={name}>
            {tile}
          </Link>
        ) : (
          tile
        )}
        {href ? (
          <Link href={href} className="smooth min-w-0 truncate text-sm font-semibold text-fog hover:text-brand">
            {name}
          </Link>
        ) : (
          <span className="min-w-0 truncate text-sm font-semibold text-fog">{name}</span>
        )}
      </div>
      {note ? (
        <p className="mt-0.5 text-[11px] leading-snug text-mist" style={{ paddingLeft: LABEL_INDENT }}>
          {note}
        </p>
      ) : null}
      <div className="mt-1 flex flex-col gap-1" style={{ paddingLeft: LABEL_INDENT }}>
        {rows.map((row, index) => {
          const field = textOf(row.field, lang);
          // An entity that appeared or vanished has no number to print, so the line states which
          // of the two happened instead of an arrow into a blank.
          const measured = !!row.from || !!row.to;
          return (
            <div
              key={`${row.field.en}-${index}`}
              data-change-line
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
            >
              {/* A field that cannot share its line with the pair of numbers takes the line for
                  itself instead of losing its name to an ellipsis. */}
              <span className="min-w-0 text-[11px] text-mist">{field}</span>
              {measured ? (
                <span className="flex shrink-0 items-baseline gap-2 font-display text-sm">
                  {row.from ? <span className="diff-old">{row.from}</span> : null}
                  {row.from ? (
                    <span aria-hidden className="text-mist">
                      {'\u2192'}
                    </span>
                  ) : null}
                  <span className="diff-new" data-tone={DIRECTION_TONE[row.direction]} title={t.directions[row.direction]}>
                    {row.to}
                  </span>
                </span>
              ) : (
                <Chip tone={DIRECTION_TONE[row.direction]} className="lowercase shrink-0">
                  {t.directionsOne[row.direction]}
                </Chip>
              )}
            </div>
          );
        })}
      </div>
    </li>
  );
}

// The table repeats the shape of Riot's own article: one heading per day, one name per entity,
// every stat of that name on its own line. A block Riot wrote for one day can hold two kinds, so
// the tab filter works per entity, not per box. The divider sits under each entity rather than
// above it because a filtered view can leave the DOM-last one visible — and a hairline drawn on
// top of the table's own border is invisible, while one floating under the heading is not.
export function PatchChangeTable({ lang, rows }: { lang: Lang; rows: PatchRow[] }) {
  // Riot puts every stat line of an entity under its name, and so does the table: one entry
  // holds them all. A combined line ("Azir / Kha'Zix") interleaves two entities, so the cut is
  // by identity across the block rather than by adjacency inside it.
  const byRef = new Map<string, PatchRow[]>();
  for (const row of rows) {
    const lines = byRef.get(row.ref);
    if (lines) lines.push(row);
    else byRef.set(row.ref, [row]);
  }
  return (
    <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
      {[...byRef.values()].map((lines) => (
        <ChangeEntry key={lines[0].ref} lang={lang} rows={lines} />
      ))}
    </ul>
  );
}
