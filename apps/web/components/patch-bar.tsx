import Link from 'next/link';
import patchNotes from '@tftiq/shared/data/patch-notes.json';
import { patch } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// The bar is the entry point to the patch notes. It links straight to the article for the
// version the game reports when the notes cover it — Riot's hotfixes do get their own entry
// once the released data proves which version shipped them. Without that proof there is no
// article to land on, so the bar falls back to the list instead of a 404.
export function PatchBar({ lang, section }: { lang: Lang; section?: string }) {
  const t = messages[lang].patchBar;
  const href = patchNotes.patches.some((note) => note.patch === patch.version)
    ? `/${lang}/patches/${patch.version}`
    : `/${lang}/patches`;
  return (
    <Link
      href={href}
      data-section={section}
      className="smooth flex w-fit items-center overflow-hidden rounded-lg border border-line bg-panel text-sm hover:border-brand"
    >
      <span className="border-r border-line px-4 py-2">{t.patch} <span className="font-semibold text-fog">{patch.version}</span></span>
      <span className="px-4 py-2 text-mist">{t.lastUpdated} <span className="text-fog">{patch.updated}</span></span>
    </Link>
  );
}
