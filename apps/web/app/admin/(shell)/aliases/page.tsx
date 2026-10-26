import { adminCookieHeader } from '@/lib/admin-session';
import { backendJson } from '@/lib/backend';
import { AliasManager, type AliasEntry, type AliasEntity, type UnresolvedAlias } from '@/components/admin/alias-manager';

export const dynamic = 'force-dynamic';

export default async function AdminAliasesPage() {
  const cookie = await adminCookieHeader();
  const data = await backendJson<{ aliases: AliasEntry[]; unresolved: UnresolvedAlias[]; entities: AliasEntity[] }>('/api/admin/aliases', {
    headers: { cookie },
  });
  if (!data) throw new Error('backend is unreachable');

  return <AliasManager initialAliases={data.aliases} initialUnresolved={data.unresolved} entities={data.entities} />;
}
