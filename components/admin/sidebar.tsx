'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminLogout } from '@/components/admin/admin-buttons';

const items = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/comps', label: 'Comps' },
  { href: '/admin/guides', label: 'Guides' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside data-section="admin-sidebar" className="sticky top-0 flex h-screen w-[210px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="px-5 py-6">
        <Link href="/admin" className="font-display text-lg font-bold uppercase tracking-tight text-fog">
          MetaBoard <span className="text-brand-soft">Admin</span>
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-mist">Manage</p>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`smooth rounded-lg px-3 py-2 text-sm font-semibold ${
                active ? 'border border-brand-hot/40 bg-brand-hot/15 text-fog' : 'border border-transparent text-mist hover:bg-page hover:text-fog'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-start gap-3 border-t border-line p-4">
        <Link href="/" className="text-xs font-semibold text-mist hover:text-fog">
          View site ↗
        </Link>
        <AdminLogout />
      </div>
    </aside>
  );
}
