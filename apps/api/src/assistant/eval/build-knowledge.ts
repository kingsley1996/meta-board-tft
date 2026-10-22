import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mechanicsKnowledgeSnapshot } from '../mechanics-knowledge.ts';
import { guideSeeds, type GuideSeed } from '../../../seed/guides.ts';
import { tipsSeeds } from '../../../seed/tips.ts';

type Lang = 'en' | 'vi';
type SourceType = 'mechanics' | 'guide' | 'tip';

type KnowledgeChunk = {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  documentTitle: string;
  sectionTitle: string;
  url: string;
  version: string;
  updated: string;
  lang: Lang;
  text: string;
  tags: string[];
  priority: number;
  checksum: string;
};

type KnowledgeSource = {
  sourceId: string;
  sourceType: SourceType;
  title: string;
  url: string;
  version: string;
  updated: string;
  langs: Lang[];
  chunks: number;
};

const MAX_CHARS = 1100;
const OVERLAP = 150;
const knowledgeDir = join(import.meta.dirname, '../../../data/knowledge');

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function splitText(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= MAX_CHARS) return [clean];
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + 1 + sentence.length > MAX_CHARS) {
      parts.push(current);
      current = `${current.slice(-OVERLAP)} ${sentence}`.trim();
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
    while (current.length > MAX_CHARS) {
      parts.push(current.slice(0, MAX_CHARS).trim());
      current = current.slice(MAX_CHARS - OVERLAP).trim();
    }
  }
  if (current) parts.push(current);
  return parts;
}

function checksum(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function sectionText(section: GuideSeed['sections'][number]): string {
  return [section.heading, ...section.body, ...(section.list ?? []).map((item) => `- ${item}`)]
    .filter(Boolean)
    .join('\n\n');
}

const chunks: KnowledgeChunk[] = [];
const sources = new Map<string, KnowledgeSource>();
const seen = new Set<string>();

function addSource(source: KnowledgeSource) {
  const existing = sources.get(source.sourceId);
  if (!existing) {
    sources.set(source.sourceId, source);
    return;
  }
  existing.chunks += source.chunks;
  existing.langs = [...new Set([...existing.langs, ...source.langs])];
}

function addChunk(
  chunk: Omit<KnowledgeChunk, 'id' | 'lang' | 'text' | 'checksum' | 'tags' | 'priority'> & {
    lang: Lang;
    text: string;
    tags: string[];
    priority: number;
    sectionKey: string;
  }
): void {
  const key = `${chunk.sourceId}:${chunk.lang}:${chunk.sectionKey}`;
  const parts = splitText(chunk.text);
  parts.forEach((text, index) => {
    const dedupe = `${key}:${index}:${text}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    chunks.push({
      id: `${key}:${index}`,
      sourceId: chunk.sourceId,
      sourceType: chunk.sourceType,
      documentTitle: chunk.documentTitle,
      sectionTitle: chunk.sectionTitle,
      url: chunk.url,
      version: chunk.version,
      updated: chunk.updated,
      lang: chunk.lang,
      text,
      tags: [...new Set(chunk.tags)],
      priority: chunk.priority,
      checksum: checksum(text),
    });
    const source = sources.get(chunk.sourceId);
    if (source) source.chunks += 1;
  });
}

const mechanics = mechanicsKnowledgeSnapshot();
for (const [id, set] of Object.entries(mechanics.sets)) {
  const sourceId = `mechanics:${id}`;
  const documentTitle = `Set ${id} — ${set.name}`;
  const langs: Lang[] = ['en', 'vi'];
  addSource({
    sourceId,
    sourceType: 'mechanics',
    title: documentTitle,
    url: set.source.url,
    version: set.patch,
    updated: set.updated,
    langs,
    chunks: 0,
  });
  for (const topic of set.topics) {
    for (const lang of langs) {
      const rules = topic.rules[lang];
      if (!rules.length) continue;
      addChunk({
        sourceId,
        sourceType: 'mechanics',
        documentTitle,
        sectionTitle: topic.title,
        url: set.source.url,
        version: set.patch,
        updated: set.updated,
        lang,
        text: rules.join('\n\n'),
        tags: ['mechanics', `set-${id}`, topic.id],
        priority: 1,
        sectionKey: slug(topic.id),
      });
    }
  }
}

addSource({
  sourceId: 'mechanics:general',
  sourceType: 'mechanics',
  title: 'General TFT mechanics',
  url: mechanics.general.source.url,
  version: mechanics.general.version,
  updated: mechanics.general.updated,
  langs: ['en', 'vi'],
  chunks: 0,
});
for (const topic of mechanics.general.topics) {
  for (const lang of ['en', 'vi'] as const) {
    const rules = topic.rules[lang];
    if (!rules.length) continue;
    addChunk({
      sourceId: 'mechanics:general',
      sourceType: 'mechanics',
      documentTitle: 'General TFT mechanics',
      sectionTitle: topic.title,
      url: mechanics.general.source.url,
      version: mechanics.general.version,
      updated: mechanics.general.updated,
      lang,
      text: rules.join('\n\n'),
      tags: ['mechanics', 'general', topic.id],
      priority: 1,
      sectionKey: slug(topic.id),
    });
  }
}

const guideSources: { seed: GuideSeed; sourceType: SourceType }[] = [
  ...guideSeeds.map((seed) => ({ seed, sourceType: 'guide' as const })),
  ...tipsSeeds.map((seed) => ({ seed, sourceType: 'tip' as const })),
];

for (const { seed, sourceType } of guideSources) {
  const sourceId = `${sourceType}:${seed.slug}`;
  const url = `/guides/${seed.slug}`;
  addSource({
    sourceId,
    sourceType,
    title: seed.title,
    url,
    version: seed.publishedOn,
    updated: seed.publishedOn,
    langs: seed.sectionsVi?.length ? ['en', 'vi'] : ['en'],
    chunks: 0,
  });

  for (const lang of ['en', 'vi'] as const) {
    const localized = lang === 'vi' && seed.sectionsVi?.length;
    const title = localized ? (seed.titleVi ?? seed.title) : seed.title;
    const excerpt = localized ? (seed.excerptVi ?? seed.excerpt) : seed.excerpt;
    const sections = localized ? seed.sectionsVi! : seed.sections;
    if (!localized && lang === 'vi') continue;

    addChunk({
      sourceId,
      sourceType,
      documentTitle: title,
      sectionTitle: 'Summary',
      url: `${lang === 'vi' ? '/vi' : '/en'}${url}`,
      version: seed.publishedOn,
      updated: seed.publishedOn,
      lang,
      text: `${title}\n\n${excerpt}`,
      tags: [...seed.tags, sourceType],
      priority: 2,
      sectionKey: 'summary',
    });

    sections.forEach((section, index) => {
      addChunk({
        sourceId,
        sourceType,
        documentTitle: title,
        sectionTitle: section.heading,
        url: `${lang === 'vi' ? '/vi' : '/en'}${url}`,
        version: seed.publishedOn,
        updated: seed.publishedOn,
        lang,
        text: sectionText(section),
        tags: [...seed.tags, sourceType],
        priority: 2,
        sectionKey: `s${index}`,
      });
    });
  }
}

chunks.sort((a, b) => a.id.localeCompare(b.id));
if (new Set(chunks.map((chunk) => chunk.id)).size !== chunks.length) throw new Error('duplicate chunk IDs');
for (const chunk of chunks) {
  if (!chunk.text.trim()) throw new Error(`${chunk.id}: empty text`);
  if (chunk.text.length > MAX_CHARS + OVERLAP) throw new Error(`${chunk.id}: chunk too long`);
  const expected = chunks.filter((entry) => entry.sourceId === chunk.sourceId).length;
  const source = sources.get(chunk.sourceId)!;
  if (source.chunks !== expected) throw new Error(`${chunk.sourceId}: manifest count ${source.chunks} != ${expected}`);
}
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  counts: {
    sources: sources.size,
    chunks: chunks.length,
    byType: Object.fromEntries(
      (['mechanics', 'guide', 'tip'] as const).map((type) => [type, chunks.filter((chunk) => chunk.sourceType === type).length])
    ),
    byLang: Object.fromEntries(
      (['en', 'vi'] as const).map((lang) => [lang, chunks.filter((chunk) => chunk.lang === lang).length])
    ),
  },
  sources: [...sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
};

mkdirSync(knowledgeDir, { recursive: true });
writeFileSync(join(knowledgeDir, 'chunks.jsonl'), `${chunks.map((chunk) => JSON.stringify(chunk)).join('\n')}\n`);
writeFileSync(join(knowledgeDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${chunks.length} chunks from ${sources.size} sources to ${knowledgeDir}`);
