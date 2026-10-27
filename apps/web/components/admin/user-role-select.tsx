'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUserRole, type UserRole } from '@/lib/api';
import { inputCls } from '@/components/admin/ui';

export function UserRoleSelect({ id, email, role, isSelf }: { id: string; email: string; role: UserRole; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: UserRole) {
    if (next === role) return;
    setBusy(true);
    setError(null);
    const result = await setUserRole(id, next);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (isSelf) {
    return (
      <span className="text-xs text-mist" title="You cannot change your own role">
        you
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <select
        value={role}
        disabled={busy}
        aria-label={`Role for ${email}`}
        onChange={(event) => void change(event.target.value as UserRole)}
        className={`${inputCls} py-1 text-xs`}
      >
        <option value="user">user</option>
        <option value="admin">admin</option>
      </select>
      {error ? <span className="text-[11px] font-semibold text-tier-s">{error}</span> : null}
    </span>
  );
}
