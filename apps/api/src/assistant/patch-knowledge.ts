import { readFile } from 'node:fs/promises';
import {
  pbeCardRows,
  type Localized,
  type PatchDirection,
  type PatchEntityKind,
  type PatchNotesDoc,
  type PatchRow,
  type PbeFile,
} from '@tftiq/shared/patch-notes';
import { readPatchNotes } from '../patch-notes-article.ts';
import type { Lang } from './contracts.ts';

export type PatchNotesQuery = {
  patch?: string;
  query?: string;
  kind?: PatchEntityKind;
  channel?: 'released' | 'pbe';
};

export type PatchNotesEvidence = {
  status: 'found' | 'no_match' | 'unavailable';
  channel: 'released' | 'pbe';
  requestedPatch: string | null;
  livePatch: string | null;
  availablePatches: string[];
  patch: string | null;
  setId: string | null;
  baseline: string | null;
  source: { provider: string; url: string; set: string; patch: string; updatedAt: string } | null;
  rows: {
    ref: string;
    kind: PatchEntityKind;
    name: string;
    field: string;
    from: string;
    to: string;
    direction: PatchDirection;
    note: string | null;
  }[];
  totalRows: number;
  matchedRows: number;
  truncated: boolean;
  unmatched: number;
  summary: string;
  limitations: string[];
};

export type PatchNotesPbeFile = PbeFile & {
  generatedAt?: string;
  set?: number;
  source?: { provider?: string; fetchedAt?: string };
  stats?: { unmatched?: number };
  unmatched?: unknown[];
};

const ROW_LIMIT = 24;
const SUMMARY_LIMIT = 6;
const DIRECTION_LABELS: Record<PatchDirection, Localized> = {
  buff: { en: 'buff', vi: 'tăng sức mạnh' },
  nerf: { en: 'nerf', vi: 'giảm sức mạnh' },
  adjust: { en: 'adjustment', vi: 'điều chỉnh' },
  added: { en: 'added', vi: 'thêm mới' },
  removed: { en: 'removed', vi: 'loại bỏ' },
};

const localize = (value: Localized, lang: Lang): string =>
  lang === 'vi' && value.vi?.trim() ? value.vi : value.en;

const normalize = (value: string): string => value.normalize('NFD')
  .replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const containsPhrase = (text: string, phrase: string): boolean =>
  !!phrase && ` ${text} `.includes(` ${phrase} `);

function filterRows(rows: PatchRow[], query: PatchNotesQuery): PatchRow[] {
  const candidates = rows.filter((row) => !query.kind || row.kind === query.kind);
  if (!query.query?.trim()) return candidates;
  const text = normalize(query.query);
  if (!text) return [];
  const entities = candidates.filter((row) =>
    [row.name.en, row.name.vi, row.ref, row.slug].some((name) =>
      !!name && containsPhrase(text, normalize(name))));
  if (entities.length) {
    const fields = entities.filter((row) => [row.field.en, row.field.vi].some((field) =>
      !!field && containsPhrase(text, normalize(field))));
    return fields.length ? fields : entities;
  }
  return candidates.filter((row) => [row.field.en, row.field.vi].some((field) =>
    !!field && containsPhrase(normalize(field), text)));
}

export function selectPatchNotes(
  doc: PatchNotesDoc,
  pbe: PatchNotesPbeFile | null,
  query: PatchNotesQuery,
  lang: Lang,
): PatchNotesEvidence {
  const vi = lang === 'vi';
  const channel = query.channel ?? 'released';
  const requestedPatch = query.patch ?? null;
  const result: PatchNotesEvidence = {
    status: 'unavailable', channel, requestedPatch, livePatch: doc.livePatch,
    availablePatches: doc.patches.map((entry) => entry.patch),
    patch: null, setId: null, baseline: null, source: null, rows: [],
    totalRows: 0, matchedRows: 0, truncated: false, unmatched: 0,
    summary: '', limitations: [],
  };
  let rows: PatchRow[];
  if (channel === 'pbe') {
    result.limitations.push(vi
      ? 'Bản xem trước PBE thử nghiệm, không phải bản Riot đã phát hành; thay đổi có thể không được phát hành.'
      : 'Experimental PBE preview, not a Riot-released patch; changes may not ship.');
    const alreadyReleased = pbe?.patch === doc.livePatch || doc.patches.some((entry) => entry.patch === pbe?.patch);
    if (!pbe?.patch || alreadyReleased || (requestedPatch !== null && requestedPatch !== pbe.patch)) {
      const reason = !pbe?.patch
        ? (vi ? 'Không có bản xem trước PBE hợp lệ.' : 'No valid PBE preview is available.')
        : alreadyReleased
          ? (vi ? 'Phiên bản PBE này đã phát hành, không phải bản xem trước mới.' : 'This PBE version has already been released, so it is not a fresh preview.')
          : (vi ? `Không có bản PBE ${requestedPatch}; bản xem trước hiện có: ${pbe.patch}.` : `PBE patch ${requestedPatch} is unavailable; available preview: ${pbe.patch}.`);
      result.limitations.push(reason);
      result.summary = `${vi ? 'PBE: chưa thể xác nhận thay đổi.' : 'PBE: cannot confirm changes.'} ${result.limitations.join(' ')}`;
      return result;
    }
    result.patch = pbe.patch;
    result.baseline = pbe.baseline.patch;
    result.setId = pbe.set == null ? null : String(pbe.set);
    result.source = {
      provider: pbe.source?.provider || (vi ? 'Nguồn PBE không xác định' : 'Unknown PBE provider'),
      url: `/${vi ? 'vi' : 'en'}/patches`,
      set: result.setId ?? '',
      patch: pbe.patch,
      updatedAt: pbe.source?.fetchedAt || pbe.generatedAt || '',
    };
    if (!pbe.source?.provider || !result.source.updatedAt || result.setId === null) {
      result.limitations.push(vi
        ? 'Dữ liệu PBE thiếu thông tin nguồn, thời gian hoặc mùa giải; không suy đoán thông tin còn thiếu.'
        : 'PBE provider, timestamp, or set metadata is incomplete; missing values are not inferred.');
    }
    rows = pbeCardRows(pbe);
    result.unmatched = Math.max(pbe.unmatched?.length ?? 0, pbe.stats?.unmatched ?? 0);
    if (pbe.editorial.length) {
      result.limitations.push(vi
        ? `${pbe.editorial.length} thay đổi chỉ về văn bản không được đưa vào các dòng dữ liệu này.`
        : `${pbe.editorial.length} text-only editorial changes are not included in these structured rows.`);
    }
  } else {
    const patchId = requestedPatch ?? doc.livePatch;
    const selected = doc.patches.find((patch) => patch.patch === patchId);
    if (!selected) {
      const reason = vi
        ? `Không có ghi chú đã phát hành cho bản ${patchId ?? '(chưa xác định bản hiện tại)'}.`
        : `Released notes are unavailable for patch ${patchId ?? '(unknown live patch)'}.`;
      result.limitations.push(reason);
      const available = doc.patches.map((patch) => patch.patch).join(', ');
      result.summary = `${reason} ${vi ? 'Chưa thể xác nhận thay đổi.' : 'Cannot confirm changes.'} ${vi ? 'Các bản đã phát hành có dữ liệu' : 'Available released patches'}: ${available || (vi ? 'không có' : 'none')}.`;
      return result;
    }
    result.patch = selected.patch;
    result.setId = String(selected.set);
    result.source = {
      provider: 'Riot Games',
      url: (vi && selected.url.vi) || selected.url.en,
      set: result.setId,
      patch: selected.patch,
      updatedAt: selected.updatedAt || selected.publishedAt || doc.generatedAt,
    };
    rows = selected.rows;
    result.unmatched = Math.max(selected.unmatched.length, selected.stats.unmatched);
  }

  const matched = filterRows(rows, query);
  result.totalRows = rows.length;
  result.matchedRows = matched.length;
  result.truncated = matched.length > ROW_LIMIT;
  result.status = matched.length ? 'found' : 'no_match';
  result.rows = matched.slice(0, ROW_LIMIT).map((row) => ({
    ref: row.ref,
    kind: row.kind,
    name: localize(row.name, lang),
    field: localize(row.field, lang),
    from: row.from,
    to: row.to,
    direction: row.direction,
    note: row.note ? localize(row.note, lang) : null,
  }));
  if (result.unmatched > 0) {
    result.limitations.push(vi
      ? `Phạm vi dữ liệu chưa đầy đủ: ${result.unmatched} mục nguồn chưa khớp; thiếu dòng không chứng minh thực thể không thay đổi.`
      : `Coverage is incomplete: ${result.unmatched} source entries are unmatched; missing rows do not prove an entity was unchanged.`);
  }
  if (result.truncated) {
    result.limitations.push(vi
      ? `Chỉ trả về ${ROW_LIMIT} trong ${matched.length} thay đổi phù hợp đầu tiên.`
      : `Only the first ${ROW_LIMIT} of ${matched.length} matching changes are returned.`);
  }

  const label = channel === 'pbe'
    ? `${vi ? 'Bản xem trước PBE' : 'PBE preview'} ${result.patch} — ${result.source.provider} (${vi ? 'so với bản nền' : 'baseline'} ${result.baseline})`
    : `${vi ? 'Bản đã phát hành' : 'Released patch'} ${result.patch} — ${result.source.provider}`;
  const changes = result.rows.slice(0, SUMMARY_LIMIT).map((row) => {
    const values = row.from || row.to ? `${row.from} → ${row.to} ` : '';
    return `- ${row.name}${row.field ? ` — ${row.field}` : ''}: ${values}(${localize(DIRECTION_LABELS[row.direction], lang)})`;
  });
  const scope = matched.length > SUMMARY_LIMIT
    ? (vi ? `Tóm tắt ${SUMMARY_LIMIT} trong ${matched.length} thay đổi phù hợp đầu tiên.` : `Summary shows the first ${SUMMARY_LIMIT} of ${matched.length} matching changes.`)
    : (vi ? `${matched.length} thay đổi phù hợp.` : `${matched.length} matching changes.`);
  // Line-per-change layout: the chat renders answers with whitespace-pre-wrap,
  // so a semicolon wall of text is the only unreadable option.
  result.summary = [
    `${label}. ${matched.length ? scope : (vi ? 'Không có dòng phù hợp; chưa thể xác nhận thay đổi từ dữ liệu này.' : 'No matching rows; cannot confirm changes from this snapshot.')}`,
    ...changes,
    ...result.limitations,
  ].filter(Boolean).join('\n');
  return result;
}

export async function getPatchNotes(query: PatchNotesQuery, lang: Lang): Promise<PatchNotesEvidence> {
  const doc = await readPatchNotes();
  const pbe = query.channel === 'pbe'
    ? JSON.parse(await readFile(new URL(import.meta.resolve('@tftiq/shared/data/pbe.json')), 'utf8')) as PatchNotesPbeFile
    : null;
  return selectPatchNotes(doc, pbe, query, lang);
}
