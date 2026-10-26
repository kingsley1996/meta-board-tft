import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/sidebar';
import { currentAdminUser } from '@/lib/admin-session';

// Admin access is an account role, so the gate asks the API instead of reading a
// password-derived cookie. Redirect target is the English sign-in page: /admin
// itself is English-only, and LoginPanel honours ?next.
export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdminUser();
  if (!admin) redirect('/en/login?next=/admin');

  return (
    <div className="flex min-h-screen">
      <AdminSidebar signedInAs={admin.email} />
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
