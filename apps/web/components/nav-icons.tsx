// Only the season menu carries line glyphs, one per row: six kinds of thing you can look up,
// three ways to read the patch. The ranking and tool groups stay plain text because their rows
// already say what they are. Drawn here rather than pulled from game art: these label sections
// of the site, not entities, and they have to stay legible at 18px on a dark ground.
const PATHS = {
  champion: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M3 17c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
      <path d="M14.2 5.4a2.6 2.6 0 0 1 0 5.2" />
      <path d="M16 12.8c1.8.6 3 2.1 3 4.2" />
    </>
  ),
  item: (
    <>
      <path d="M16.5 3.5 8 12l-1 4 4-1 8.5-8.5Z" />
      <path d="M13.5 6.5 16.5 3.5 17.5 4.5 14.5 7.5" />
      <path d="M6.5 13.5 3.5 16.5" />
      <path d="M4 14.5 7 17.5" />
    </>
  ),
  trait: (
    <>
      <path d="M10 2.6 16.4 6.3v7.4L10 17.4 3.6 13.7V6.3Z" />
      <path d="M10 6.6v6.8" />
      <path d="M7.1 8.3l5.8 3.4" />
      <path d="M12.9 8.3 7.1 11.7" />
    </>
  ),
  augment: (
    <>
      <path d="M6.5 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" />
      <path d="M13.5 3.5h2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2" />
      <path d="M10 6v8" />
      <path d="M8 8.5h4" />
    </>
  ),
  wisp: (
    <>
      <path d="M10 2.8c3 3 4.6 5.2 4.6 7.6A4.6 4.6 0 0 1 10 15a4.6 4.6 0 0 1-4.6-4.6C5.4 8 7 5.8 10 2.8Z" />
      <path d="M10 15v2.6" />
      <path d="M7.6 10.6c.4 1.4 1.3 2.2 2.4 2.2" />
    </>
  ),
  encounter: (
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M8.2 7.8a1.9 1.9 0 0 1 3.7.6c0 1.3-1.9 1.5-1.9 3" />
      <path d="M10 14.2v.1" />
    </>
  ),
  patch: (
    <>
      <path d="M5 3.2h6.4L15.6 7.4V17a.8.8 0 0 1-.8.8H5a.8.8 0 0 1-.8-.8V4a.8.8 0 0 1 .8-.8Z" />
      <path d="M11.2 3.4v4.2h4.2" />
      <path d="M10 10.4v4.4" />
      <path d="M7.8 12.6h4.4" />
    </>
  ),
  tables: (
    <>
      <path d="M3.4 5.2h13.2v10.6H3.4Z" />
      <path d="M3.4 8.6h13.2" />
      <path d="M8 5.2v10.6" />
      <path d="M12.4 8.8v7" />
    </>
  ),
  economy: (
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M11.8 7.6H9.4a1.6 1.6 0 0 0 0 3.2h1.4a1.6 1.6 0 0 1 0 3.2H7.6" />
      <path d="M10 5.6v2" />
      <path d="M10 13v2" />
    </>
  ),
} as const;

export type NavIconName = keyof typeof PATHS;

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.6]"
    >
      {PATHS[name]}
    </svg>
  );
}
