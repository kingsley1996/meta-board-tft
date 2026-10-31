'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { tierColor } from '@/components/ui';
import type { CompMapRow } from '@/lib/comp-map';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import type { Tier } from '@/lib/tiers';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'X'];

type Layout = { w: number; h: number; l: number; r: number; t: number; b: number };
const PAGE: Layout = { w: 900, h: 500, l: 58, r: 872, t: 30, b: 432 };
const COMPACT: Layout = { w: 520, h: 410, l: 38, r: 506, t: 24, b: 348 };
const MINI: Layout = { w: 560, h: 330, l: 30, r: 546, t: 16, b: 300 };

type Label = { slug: string; text: string; x: number; y: number };
type Point = { row: CompMapRow; x: number; y: number; r: number };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Pick the smallest round step (1/2/2.5/5/10 × 10^n) that still leaves roughly
// the requested number of ticks; the 1.1 tolerance keeps a step from jumping up
// when it is only marginally too dense.
const niceStep = (range: number, target: number) => {
  const raw = range / Math.max(target, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  let best = 1;
  for (const candidate of [1, 2, 2.5, 5, 10]) {
    if (candidate <= normalized * 1.1) best = candidate;
  }
  return best * magnitude;
};

const ticksBetween = (lo: number, hi: number, target: number) => {
  const step = niceStep(hi - lo, target);
  const list: number[] = [];
  for (let value = Math.ceil(lo / step - 1e-9) * step; value <= hi + 1e-9; value += step) {
    list.push(Number(value.toFixed(6)));
  }
  return { list, step };
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// useLayoutEffect in the browser (labels must be measured before paint),
// useEffect during SSR where layout effects do not run.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function CompMap({
  rows,
  lang,
  variant = 'page',
  limit = 18,
}: {
  rows: CompMapRow[];
  lang: Lang;
  variant?: 'page' | 'mini';
  limit?: number;
}) {
  const t = messages[lang].compMap;
  const mini = variant === 'mini';
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [compact, setCompact] = useState(false);
  const [tier, setTier] = useState<'ALL' | Tier>('ALL');
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [tip, setTip] = useState<{ row: CompMapRow; x: number; y: number; pinned: boolean } | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);

  const number = useMemo(
    () => new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US'),
    [lang],
  );

  // The chart's own text scales with its viewBox, so a phone-width chart needs
  // a shorter frame and larger type rather than a shrunken desktop one.
  useIsoLayoutEffect(() => {
    if (mini) return;
    const element = wrapRef.current;
    if (!element) return;
    const update = () => setCompact(element.clientWidth < 640);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mini]);

  const visible = useMemo(() => {
    if (mini) return [...rows].sort((a, b) => b.games - a.games).slice(0, limit);
    return tier === 'ALL' ? rows : rows.filter((row) => row.tier === tier);
  }, [rows, mini, limit, tier]);

  const geom = useMemo(() => {
    const layout = mini ? MINI : compact ? COMPACT : PAGE;
    const games = rows.map((row) => row.games);
    const gMin = Math.min(...games);
    const gMax = Math.max(...games);
    const rMin = mini ? 4.5 : 5.5;
    const rMax = mini ? 14 : 24;
    // Square-root on games keeps area proportional to sample size; the 0.82
    // exponent lifts the smallest comps just enough to stay tappable.
    const radiusFor = (value: number) => {
      const t = (Math.sqrt(value) - Math.sqrt(gMin)) / Math.max(Math.sqrt(gMax) - Math.sqrt(gMin), 1e-6);
      const base = rMin + (rMax - rMin) * clamp01(t) ** 0.82;
      return base * (mini ? 1 : compact ? 0.72 : 1);
    };

    const sx = layout.l + (layout.r - layout.l) * 0.5;
    const sy = layout.t + (layout.b - layout.t) * 0.5;

    const picks = visible.map((row) => row.pick);
    const avgs = visible.map((row) => row.avg);
    const minP = Math.min(...picks);
    const maxP = Math.max(...picks);
    const minA = Math.min(...avgs);
    const maxA = Math.max(...avgs);
    const padP = Math.max((maxP - minP) * 0.08, 0.05);
    const xMin = Math.max(0, Math.floor((minP - padP) * 10) / 10);
    const xMax = Math.ceil((maxP + padP) * 10) / 10;
    const yMin = Math.floor((minA - 0.08) * 10) / 10;
    const yMax = Math.ceil((maxA + 0.08) * 10) / 10;

    let splitX = median(picks);
    let splitY = median(avgs);
    if (splitX >= xMax) splitX = xMax - 0.05;
    if (splitX <= xMin) splitX = xMin + 0.05;
    if (splitY >= yMax) splitY = yMax - 0.05;
    if (splitY <= yMin) splitY = yMin + 0.05;

    // Two linear scales per axis, split at the median: the dense middle of the
    // comp pack gets half the frame instead of a tenth of it.
    const px = (value: number) =>
      value <= splitX
        ? layout.l + ((value - xMin) / (splitX - xMin)) * (sx - layout.l)
        : sx + ((value - splitX) / (xMax - splitX)) * (layout.r - sx);
    const py = (value: number) =>
      value <= splitY
        ? layout.t + ((value - yMin) / (splitY - yMin)) * (sy - layout.t)
        : sy + ((value - splitY) / (yMax - splitY)) * (layout.b - sy);

    const points: Point[] = visible.map((row) => ({ row, x: px(row.pick), y: py(row.avg), r: radiusFor(row.games) }));

    const xPrecision = Math.min(
      ticksBetween(xMin, splitX, 2).step,
      ticksBetween(splitX, xMax, 2).step,
    ) < 0.5 ? 2 : 1;

    return { layout, radiusFor, px, py, sx, sy, xMin, xMax, yMin, yMax, splitX, splitY, points, xPrecision };
  }, [rows, visible, mini, compact]);

  const active = hover ?? pinned;

  const clearTip = () => {
    setPinned(null);
    setHover(null);
    setTip(null);
  };

  // A phone bubble is only a few pixels across, so a tap that lands beside one
  // still means that comp: resolve the background tap to the nearest bubble.
  const pickNearest = (event: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const scale = box.width / layout.w;
    const x = (event.clientX - box.left) / scale;
    const y = (event.clientY - box.top) / scale;
    let nearest: Point | null = null;
    let nearestGap = Infinity;
    for (const point of points) {
      const gap = Math.hypot(point.x - x, point.y - y) - point.r;
      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = point;
      }
    }
    if (!nearest || nearestGap > (compact ? 16 : 8)) {
      clearTip();
      return;
    }
    setPinned(nearest.row.slug);
    setHover(nearest.row.slug);
    placeTip(nearest.row, event.clientX, event.clientY, true);
  };

  const placeTip = (row: CompMapRow, clientX: number, clientY: number, isPinned: boolean) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const width = 210;
    const height = 136;
    let x = clientX - box.left + 14;
    let y = clientY - box.top + 14;
    if (x + width > box.width - 6) x = clientX - box.left - width - 14;
    if (y + height > box.height - 6) y = clientY - box.top - height - 10;
    setTip({ row, x: Math.max(6, x), y: Math.max(6, y), pinned: isPinned });
  };

  // Re-anchor a pinned tooltip on its own bubble after the pointer leaves.
  const placePinned = (slug: string) => {
    const svg = svgRef.current;
    const point = geom.points.find((entry) => entry.row.slug === slug);
    if (!svg || !point) return;
    const box = svg.getBoundingClientRect();
    const scale = box.width / geom.layout.w;
    placeTip(point.row, box.left + point.x * scale, box.top + point.y * scale, true);
  };

  useEffect(() => {
    if (mini) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(null);
        setHover(null);
        setTip(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mini]);

  // Labels have to be measured against the real font, so they are placed after
  // mount; the axes and bubbles are deterministic and ship with the document.
  useIsoLayoutEffect(() => {
    if (mini || compact || !svgRef.current) {
      setLabels([]);
      return;
    }
    const svg = svgRef.current;
    const { layout, points } = geom;
    const probe = document.createElementNS(SVG_NS, 'text');
    probe.setAttribute('font-size', '11');
    svg.appendChild(probe);
    const widthOf = (text: string) => {
      probe.textContent = text;
      try {
        return probe.getComputedTextLength();
      } catch {
        return text.length * 6.05;
      }
    };

    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const labelled: { x: number; y: number }[] = [];
    const next: Label[] = [];
    for (const point of [...points].sort((a, b) => b.row.games - a.row.games)) {
      if (next.length >= 12) break;
      if (labelled.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 9)) continue;
      const short = point.row.name.length > 24 ? `${point.row.name.slice(0, 23)}…` : point.row.name;
      const w = widthOf(short) + 4;
      const h = 13;
      const candidates = [
        { x: point.x + point.r + 7, y: point.y + 4 },
        { x: point.x - point.r - 7 - w, y: point.y + 4 },
        { x: point.x - w / 2, y: point.y - point.r - 7 },
        { x: point.x - w / 2, y: point.y + point.r + 16 },
      ];
      for (const candidate of candidates) {
        if (candidate.x < layout.l + 3 || candidate.x + w > layout.r - 3) continue;
        if (candidate.y < layout.t + 24 || candidate.y > layout.b - 6) continue;
        const hitsLabel = placed.some(
          (other) => !(candidate.x + w + 2 < other.x || candidate.x > other.x + other.w + 2 || candidate.y + h + 1 < other.y || candidate.y - 1 > other.y + other.h),
        );
        if (hitsLabel) continue;
        const hitsBubble = points.some((other) => {
          if (other.row.slug === point.row.slug) return false;
          return !(
            candidate.x + w + 2 < other.x - other.r ||
            candidate.x > other.x + other.r + 2 ||
            candidate.y + h + 1 < other.y - other.r ||
            candidate.y - 1 > other.y + other.r
          );
        });
        if (hitsBubble) continue;
        next.push({ slug: point.row.slug, text: short, x: candidate.x, y: candidate.y });
        placed.push({ x: candidate.x, y: candidate.y - 10, w, h });
        labelled.push({ x: point.x, y: point.y });
        break;
      }
    }
    svg.removeChild(probe);
    setLabels(next);
  }, [geom, compact, mini]);

  const legend = useMemo(() => {
    if (mini) return [];
    const games = rows.map((row) => row.games);
    const min = Math.min(...games);
    const max = Math.max(...games);
    const mid = Math.round(Math.sqrt(min * max) / 1000) * 1000;
    let x = 18;
    return [min, mid, max].map((value) => {
      const r = geom.radiusFor(value) * 0.9;
      const entry = { value, r, x, labelX: x + r + 6 };
      x += 2 * r + 40 + String(number.format(value)).length * 6;
      return entry;
    });
  }, [rows, mini, geom, number]);

  const counts = useMemo(() => {
    const map = new Map<Tier, number>();
    for (const row of rows) map.set(row.tier, (map.get(row.tier) ?? 0) + 1);
    return map;
  }, [rows]);

  const { layout, px, py, sx, sy, splitX, splitY, xMin, xMax, yMin, yMax, xPrecision, points } = geom;
  const tickFont = mini ? 9.5 : compact ? 16 : 10.5;
  const tickFill = '#7c8b95';
  const splitStroke = '#3a4a54';

  const xTicks = useMemo(() => {
    const left = ticksBetween(xMin, splitX, mini ? 2 : compact ? 2 : 4);
    const right = ticksBetween(splitX, xMax, mini ? 2 : compact ? 2 : 4);
    const list = (mini ? [...left.list, ...right.list] : [...left.list, ...right.list, splitX])
      .filter((value) => value >= xMin - 1e-9 && value <= xMax + 1e-9)
      .filter((value) => value === splitX || Math.abs(px(value) - sx) >= (mini ? 20 : 46))
      .map((value) => ({ value, text: `${value.toFixed(xPrecision)}%` }));
    return list.filter((entry, index) => list.findIndex((other) => other.text === entry.text) === index);
  }, [xMin, xMax, splitX, sx, mini, compact, px, xPrecision]);

  const yTicks = useMemo(() => {
    const below = ticksBetween(yMin, splitY, mini ? 2 : compact ? 3 : 4);
    const above = ticksBetween(splitY, yMax, mini ? 2 : compact ? 3 : 4);
    const list = (mini ? [...below.list, ...above.list] : [...below.list, ...above.list, splitY])
      .filter((value) => value >= yMin - 1e-9 && value <= yMax + 1e-9)
      .filter((value) => value === splitY || Math.abs(py(value) - sy) >= (mini ? 12 : 24))
      .map((value) => ({ value, text: value.toFixed(1) }));
    return list.filter((entry, index) => list.findIndex((other) => other.text === entry.text) === index);
  }, [yMin, yMax, splitY, sy, mini, compact, py]);

  const labelOpacity = active ? 0 : 1;

  return (
    <div className={mini ? 'relative w-full md:ml-auto md:max-w-[560px]' : 'relative w-full'}>
      {!mini ? (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={t.filtersAria}>
          <button
            type="button"
            aria-pressed={tier === 'ALL'}
            onClick={() => {
              setTier('ALL');
              clearTip();
            }}
            className={`smooth inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold ${
              tier === 'ALL' ? 'border-brand bg-brand/10 text-fog' : 'border-line bg-panel text-mist hover:border-brand hover:text-fog'
            }`}
          >
            {t.all}
            <span className="text-[11px] font-medium text-mist">{rows.length}</span>
          </button>
          {TIERS.filter((entry) => counts.get(entry)).map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={tier === entry}
              onClick={() => {
                setTier(entry);
                clearTip();
              }}
              className={`smooth inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold ${
                tier === entry ? 'border-brand bg-brand/10 text-fog' : 'border-line bg-panel text-mist hover:border-brand hover:text-fog'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: tierColor[entry] }} />
              {entry}
              <span className="text-[11px] font-medium text-mist">{counts.get(entry)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div ref={wrapRef} className="relative">
        <svg
          ref={svgRef}
          data-section={mini ? 'comp-map-mini' : 'comp-map-chart'}
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          className="block h-auto w-full"
          role="img"
          aria-label={mini ? t.snapshot.aria : t.chartAria}
          onClick={mini ? undefined : pickNearest}
        >
          <defs>
            {points.map((point) => (
              <clipPath key={point.row.slug} id={`${uid}-${point.row.slug}`}>
                <circle cx={point.x} cy={point.y} r={point.r} />
              </clipPath>
            ))}
          </defs>

          <rect x={layout.l} y={layout.t} width={layout.r - layout.l} height={layout.b - layout.t} fill="rgba(255,255,255,0.012)" />
          <line x1={px(splitX)} y1={layout.t} x2={px(splitX)} y2={layout.b} stroke={splitStroke} strokeWidth={1} strokeDasharray="5 5" />
          <line x1={layout.l} y1={py(splitY)} x2={layout.r} y2={py(splitY)} stroke={splitStroke} strokeWidth={1} strokeDasharray="5 5" />

          {xTicks.map((tick) => {
            const x = px(tick.value);
            return (
              <g key={`x-${tick.text}`}>
                <line x1={x} y1={layout.b} x2={x} y2={layout.b + 4} stroke={splitStroke} />
                <text
                  x={x}
                  y={layout.b + (mini ? 14 : 17)}
                  fill={tickFill}
                  fontSize={tickFont}
                  textAnchor={x < layout.l + 18 ? 'start' : x > layout.r - 18 ? 'end' : 'middle'}
                >
                  {tick.text}
                </text>
              </g>
            );
          })}

          {yTicks.map((tick) => {
            const y = py(tick.value);
            return (
              <g key={`y-${tick.text}`}>
                <line x1={layout.l - 4} y1={y} x2={layout.l} y2={y} stroke={splitStroke} />
                <text x={layout.l - 8} y={y + 3.5} fill={tickFill} fontSize={tickFont} textAnchor="end">
                  {tick.text}
                </text>
              </g>
            );
          })}

          {!mini ? (
            <>
              <text x={layout.r} y={layout.h - 12} fill="#9aaab5" fontSize={compact ? 16 : 11} textAnchor="end">
                {t.axisX}
              </text>
              <text x={layout.l} y={layout.t - 11} fill="#9aaab5" fontSize={compact ? 16 : 11}>
                {t.axisY}
              </text>
              {[
                { text: t.lowStrong, x: layout.l + 12, y: layout.t + 24, anchor: 'start' as const },
                { text: t.popularStrong, x: layout.r - 12, y: layout.t + 24, anchor: 'end' as const },
                { text: t.lowWeak, x: layout.l + 12, y: layout.b - 12, anchor: 'start' as const },
                { text: t.popularWeak, x: layout.r - 12, y: layout.b - 12, anchor: 'end' as const },
              ].map((quadrant) => {
                const approx = quadrant.text.length * (compact ? 8.2 : 6.4);
                const left = quadrant.anchor === 'end' ? quadrant.x - approx : quadrant.x;
                let y = quadrant.y;
                // Nudge a quadrant label upward until it stops crossing a bubble.
                for (let step = 0; step < 6; step += 1) {
                  const candidate = quadrant.y - step * (compact ? 18 : 15);
                  if (candidate - 13 < layout.t + 4) break;
                  const clash = points.some(
                    (point) =>
                      !(
                        left + approx + 4 < point.x - point.r ||
                        left - 4 > point.x + point.r ||
                        candidate + 4 < point.y - point.r ||
                        candidate - 13 > point.y + point.r
                      ),
                  );
                  if (!clash) {
                    y = candidate;
                    break;
                  }
                }
                return (
                  <text
                    key={quadrant.text}
                    x={quadrant.x}
                    y={y}
                    textAnchor={quadrant.anchor}
                    fill="#6f818d"
                    fontSize={compact ? 15 : 11.5}
                    fontWeight={600}
                    stroke="#151d22"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {quadrant.text}
                  </text>
                );
              })}
            </>
          ) : null}

          {points.map((point) => {
            const row = point.row;
            const on = active === row.slug;
            const dim = !!active && !on;
            const clip = `url(#${uid}-${row.slug})`;
            return (
              <g key={row.slug} style={{ opacity: dim ? 0.3 : 1, transition: 'opacity .15s' }}>
                <circle cx={point.x} cy={point.y} r={point.r + 1.6} fill="#0d1317" />
                {row.icon ? (
                  <image
                    href={row.icon}
                    x={point.x - point.r}
                    y={point.y - point.r}
                    width={point.r * 2}
                    height={point.r * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={clip}
                    style={{ pointerEvents: 'none' }}
                  />
                ) : (
                  <circle cx={point.x} cy={point.y} r={point.r} fill="#243037" />
                )}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.r}
                  fill="none"
                  stroke={on ? 'var(--color-brand)' : tierColor[row.tier]}
                  strokeWidth={on ? 2.6 : 1.7}
                  style={{ pointerEvents: 'none', transition: 'stroke .15s, stroke-width .15s' }}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.r + 2}
                  fill="rgba(0,0,0,0)"
                  role="button"
                  tabIndex={0}
                  aria-label={t.bubbleAria(row.name, row.pick.toFixed(2), row.avg.toFixed(2), number.format(row.games))}
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={(event) => {
                    setHover(row.slug);
                    placeTip(row, event.clientX, event.clientY, pinned === row.slug);
                  }}
                  onPointerMove={(event) => {
                    if (hover === row.slug) placeTip(row, event.clientX, event.clientY, pinned === row.slug);
                  }}
                  onPointerLeave={() => {
                    setHover(null);
                    if (pinned) placePinned(pinned);
                    else setTip(null);
                  }}
                  onFocus={() => {
                    const box = (svgRef.current as SVGSVGElement).getBoundingClientRect();
                    const scale = box.width / layout.w;
                    setHover(row.slug);
                    placeTip(row, box.left + point.x * scale, box.top + point.y * scale, pinned === row.slug);
                  }}
                  onBlur={() => {
                    setHover(null);
                    if (pinned) placePinned(pinned);
                    else setTip(null);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    const next = pinned === row.slug ? null : row.slug;
                    setPinned(next);
                    setHover(row.slug);
                    placeTip(row, event.clientX, event.clientY, next === row.slug);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    const next = pinned === row.slug ? null : row.slug;
                    setPinned(next);
                    setHover(row.slug);
                    placePinned(row.slug);
                  }}
                />
              </g>
            );
          })}

          {labels.map((label) => (
            <text
              key={label.slug}
              x={label.x}
              y={label.y}
              fill="#c3d0d8"
              fontSize={11}
              style={{ pointerEvents: 'none', opacity: labelOpacity, transition: 'opacity .15s' }}
            >
              {label.text}
            </text>
          ))}
        </svg>

        {tip ? (
          <div
            role="status"
            className="pointer-events-none absolute z-10 min-w-[196px] max-w-[220px] rounded-[10px] border border-[#33424b] bg-[#0f171c] p-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.5)]"
            style={{ left: tip.x, top: tip.y }}
          >
            <div className="flex items-center gap-2.5">
              {tip.row.icon ? (
                <img src={tip.row.icon} alt="" className="h-8 w-8 shrink-0 rounded-full border-2 border-[#3a4a54] object-cover" />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-fog">{tip.row.name}</div>
                <div className="mt-0.5 text-[11px] text-mist">
                  {tip.row.carry} · {t.tier} {tip.row.tier}
                </div>
              </div>
              {tip.pinned ? (
                <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand">{t.pin}</span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-col gap-0.5">
              <div className="flex justify-between gap-4 text-[11px] text-mist">
                <span>{t.pick}</span>
                <b className="font-semibold tabular-nums text-fog">{tip.row.pick.toFixed(2)}%</b>
              </div>
              <div className="flex justify-between gap-4 text-[11px] text-mist">
                <span>{t.avg}</span>
                <b className="font-semibold tabular-nums text-fog">{tip.row.avg.toFixed(2)}</b>
              </div>
              <div className="flex justify-between gap-4 text-[11px] text-mist">
                <span>{t.gamesLabel}</span>
                <b className="font-semibold tabular-nums text-fog">{number.format(tip.row.games)}</b>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {!mini ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4 border-t border-line px-1.5 pt-2.5">
          <div className="flex min-w-0 items-center gap-2.5 text-[11px] text-mist">
            <svg viewBox="0 0 300 44" aria-hidden="true" className="h-auto w-[250px] shrink sm:w-[300px]">
              {legend.map((entry) => (
                <g key={entry.value}>
                  <circle cx={entry.x} cy={22} r={entry.r} fill="rgba(255,107,61,0.12)" stroke="rgba(255,107,61,0.6)" />
                  <text x={entry.labelX} y={26} fill="#9aaab5" fontSize={11}>
                    {number.format(entry.value)}
                  </text>
                </g>
              ))}
            </svg>
            <span className="whitespace-nowrap">{t.size}</span>
          </div>
          {!points.length ? <span className="text-xs text-mist">{t.empty}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
