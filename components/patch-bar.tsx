import { patch } from '@/lib/data';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

export function PatchBar({ lang, section }: { lang: Lang; section?: string }) {
  const t = messages[lang].patchBar;
  return (
    <div data-section={section} className="flex w-fit items-center overflow-hidden rounded-lg border border-line bg-panel text-sm">
      <span className="border-r border-line px-4 py-2">{t.patch} <span className="font-semibold text-fog">{patch.version}</span></span>
      <span className="px-4 py-2 text-mist">{t.lastUpdated} <span className="text-fog">{patch.updated}</span></span>
    </div>
  );
}
