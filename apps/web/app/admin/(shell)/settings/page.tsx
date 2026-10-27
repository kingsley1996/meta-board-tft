import { AssistantSettingsForm } from '@/components/admin/assistant-settings';
import { AdminPageHeader } from '@/components/admin/ui';
import { backendJson } from '@/lib/backend';
import type { AssistantSettingsView } from '@/lib/api';
import { sessionCookieHeader } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Every value below ends up copied onto the API process's environment, because
// that is what the assistant reads per request. Secrets never appear here; the
// API reports only whether a key is present.
export default async function AdminSettingsPage() {
  const cookie = await sessionCookieHeader();
  const view = await backendJson<AssistantSettingsView>('/api/admin/settings/assistant', { headers: { cookie } });
  if (!view) throw new Error('backend is unreachable');

  return (
    <>
      <AdminPageHeader
        title="Assistant settings"
        sub="Provider, model and per-request budgets. Saving takes effect on the next answer — no redeploy."
      />
      <AssistantSettingsForm initial={view} />
    </>
  );
}
