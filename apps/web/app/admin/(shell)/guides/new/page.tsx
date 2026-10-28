import Link from 'next/link';
import { GuideForm } from '@/components/admin/guide-form';

export const dynamic = 'force-dynamic';

export default function NewGuidePage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/guides" className="text-xs font-semibold text-brand hover:text-brand-deep">
          ← Back to guides
        </Link>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-fog">New guide</h1>
      </div>
      <GuideForm />
    </>
  );
}
