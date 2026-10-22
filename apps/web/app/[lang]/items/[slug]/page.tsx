import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Chip, ItemTile, Panel } from '@/components/ui';
import { PatchBar } from '@/components/patch-bar';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';
import tft from '@metaboard/shared/data/tft.json';
import { getTip, itemName } from '@/lib/tips';

export async function generateMetadata({ params }: { params: Promise<{ lang: Lang; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  const item = tft.items.find((entry) => entry.slug === slug);
  if (!item) return {};
  const name = itemName(item.name, lang);
  const tip = getTip('item', item.name, lang);
  return { title: name, description: tip?.kind === 'item' ? tip.desc : name };
}

export default async function ItemPage({ params }: { params: Promise<{ lang: Lang; slug: string }> }) {
  const { lang, slug } = await params;
  const item = tft.items.find((entry) => entry.slug === slug);
  if (!item) notFound();
  const t = messages[lang].itemsDb;
  const tip = getTip('item', item.name, lang);
  const category =
    item.category === 'radiant' ? t.radiant : item.category === 'artifact' ? t.ornn : item.category === 'completed' ? t.completed : t.components;
  const buildsInto = tft.items.filter((entry) => (entry.composition as string[]).includes(item.name));

  return (
    <div className="flex flex-col gap-6">
      <PatchBar lang={lang} />
      <Link href={`/${lang}/items`} className="w-fit text-sm font-semibold text-mist hover:text-brand-soft">
        {'\u2190'} {t.back}
      </Link>
      <Panel className="flex flex-wrap items-center gap-5 p-5">
        <ItemTile name={item.name} icon={item.icon} size={88} />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fog">{itemName(item.name, lang)}</h1>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{t.category}: {category}</Chip>
          </div>
          {tip?.kind === 'item' && tip.desc ? <p className="max-w-3xl text-sm leading-relaxed text-mist">{tip.desc}</p> : null}
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        {tip?.kind === 'item' && tip.composition.length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.buildsFrom}</p>
            <div className="flex flex-wrap gap-2">
              {tip.composition.map((component, index) => {
                const target = tft.items.find((entry) => entry.name === item.composition[index]);
                const content = (
                  <span className="flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-sm font-semibold text-fog">
                    {component.icon ? <img src={component.icon} alt="" loading="lazy" className="h-6 w-6 rounded" /> : null}
                    {component.name}
                  </span>
                );
                return target ? <Link key={`${component.name}-${index}`} href={`/${lang}/items/${target.slug}`} className="smooth hover:opacity-80">{content}</Link> : <span key={`${component.name}-${index}`}>{content}</span>;
              })}
            </div>
          </Panel>
        ) : null}
        {buildsInto.length ? (
          <Panel className="flex flex-col gap-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mist">{t.buildsInto}</p>
            <div className="flex flex-wrap gap-2">
              {buildsInto.map((entry) => (
                <Link key={entry.slug} href={`/${lang}/items/${entry.slug}`} className="smooth flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2 text-sm font-semibold text-fog hover:border-brand-soft">
                  <ItemTile name={entry.name} icon={entry.icon} size={24} />
                  {itemName(entry.name, lang)}
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
