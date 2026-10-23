import { cookies } from 'next/headers';
import { backendJson } from '@/lib/backend';
import { AliasManager, type AliasEntry, type AliasEntity, type UnresolvedAlias } from '@/components/admin/alias-manager';

export const dynamic = 'force-dynamic';

export default async function AdminAliasesPage() {
  const token = (await cookies()).get('mb_admin')?.value ?? '';
  const data = await backendJson<{ aliases: AliasEntry[]; unresolved: UnresolvedAlias[]; entities: AliasEntity[] }>('/api/admin/aliases', {
    headers: { cookie: `mb_admin=${token}` },
  });
  if (!data) throw new Error('backend is unreachable');

  return <AliasManager initialAliases={data.aliases} initialUnresolved={data.unresolved} entities={data.entities} />;
}
