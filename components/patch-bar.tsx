import { patch } from '@/lib/data';

export function PatchBar({ section }: { section?: string }) {
  return (
    <div data-section={section} className="flex w-fit items-center overflow-hidden rounded-lg border border-line bg-panel text-sm">
      <span className="border-r border-line px-4 py-2">Patch <span className="font-semibold text-fog">{patch.version}</span></span>
      <span className="px-4 py-2 text-mist">Last updated <span className="text-fog">{patch.updated}</span></span>
    </div>
  );
}
