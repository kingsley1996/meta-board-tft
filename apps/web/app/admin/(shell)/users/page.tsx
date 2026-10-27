import { AdminPageHeader, AdminTable } from '@/components/admin/ui';
import { UserRoleSelect } from '@/components/admin/user-role-select';
import { backendJson } from '@/lib/backend';
import type { AdminUserEntry } from '@/lib/api';
import { currentAdminUser, sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const signedIn = await currentAdminUser();
  const cookie = await sessionCookieHeader();
  const data = await backendJson<{ users: AdminUserEntry[] }>('/api/admin/users', { headers: { cookie } });
  if (!data) throw new Error('backend is unreachable');
  const users = data.users;
  const admins = users.filter((user) => user.role === 'admin').length;

  return (
    <>
      <AdminPageHeader
        title="Users"
        sub={`${users.length} accounts, ${admins} with admin access. Admin here is what unlocks /admin — there is no separate admin password.`}
      />
      <AdminTable head={['Email', 'Name', 'Joined', 'Role']}>
        {users.map((user) => (
          <tr key={user.id}>
            <td className="font-semibold text-fog">{user.email}</td>
            <td className="text-mist">{user.name ?? '—'}</td>
            <td className="text-mist">{new Date(user.createdAt).toISOString().slice(0, 10)}</td>
            <td className="text-right">
              <UserRoleSelect id={user.id} email={user.email} role={user.role} isSelf={user.email === signedIn?.email} />
            </td>
          </tr>
        ))}
      </AdminTable>
      {!users.length ? <p className="text-xs text-mist">No accounts yet.</p> : null}
    </>
  );
}
