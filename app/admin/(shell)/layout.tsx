import { AdminSidebar } from '@/components/admin/sidebar';

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
