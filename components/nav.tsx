import Link from 'next/link';
import { patch } from '@/lib/data';

const dropdowns = [
  { label: 'Comps', items: [{ label: 'Comp Rankings', href: '/tierlist/comps' }, { label: 'Item Rankings', href: '/tierlist/items' }, { label: 'Augment Rankings', href: '/tierlist/augments' }] },
];

const links = [
  { label: 'Guides', href: '/guides' },
  { label: 'Media', href: '/media' },
  { label: 'Champions', href: '/learn/champions' },
];

export function Nav() {
  return (
    <header data-section="nav" className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1536px] items-center justify-between gap-2 px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2" aria-label="MetaBoard home">
            <span className="hex flex h-8 w-8 items-center justify-center bg-brand">
              <span className="hex flex h-full w-full items-center justify-center bg-panel font-display text-sm font-bold text-brand-soft">M</span>
            </span>
            <span className="font-display text-xl font-bold tracking-tight text-fog">MetaBoard</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {dropdowns.map((dropdown) => (
              <div key={dropdown.label} className="group relative">
                <button type="button" className="smooth flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-fog group-hover:text-brand-soft">
                  {dropdown.label}
                  <span className="text-[10px] text-mist">{'\u25BE'}</span>
                </button>
                <div className="invisible absolute top-full left-1/2 z-50 -translate-x-1/2 origin-top scale-95 opacity-0 transition-all duration-150 group-hover:visible group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:scale-100 group-focus-within:opacity-100">
                  <div className="mt-1 flex w-44 flex-col overflow-hidden rounded-lg border border-line bg-panel py-1">
                    {dropdown.items.map((item) => (
                      <Link key={item.href} href={item.href} className="smooth px-4 py-2 text-sm text-mist hover:bg-util hover:text-brand-soft">
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="smooth rounded-md px-3 py-2 text-sm font-semibold text-fog hover:text-brand-soft">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <span className="rounded-full border border-line bg-panel px-4 py-1.5 text-sm font-semibold text-mist">
          Patch <span className="text-fog">{patch.version}</span>
        </span>
      </div>
    </header>
  );
}
