import { SubscriberDeleteButton } from '@/components/admin/admin-buttons';
import { AdminPageHeader, AdminTable } from '@/components/admin/ui';
import { adminCookieHeader } from '@/lib/admin-session';
import { backendJson } from '@/lib/backend';

export const dynamic = 'force-dynamic';

type Subscriber = { email: string; lang: string; created_at: string };

export default async function AdminSubscribersPage() {
  // Server-side fetch bypasses the browser, so forward the session cookie by hand.
  const cookie = await adminCookieHeader();
  const data = await backendJson<{ subscribers: Subscriber[] }>('/api/admin/subscribers', { headers: { cookie } });
  if (!data) throw new Error('backend is unreachable');
  const subscribers = data.subscribers;

  return (
    <>
      <AdminPageHeader title="Subscribers" sub={`${subscribers.length} emails from the footer signup. Sending is manual for now — copy the list into your mail tool.`} />
      <AdminTable head={['Email', 'Lang', 'Signed up', '']}>
        {subscribers.map((subscriber) => (
          <tr key={subscriber.email}>
            <td className="font-semibold text-fog">{subscriber.email}</td>
            <td className="text-mist">{subscriber.lang}</td>
            <td className="text-mist">{new Date(subscriber.created_at).toISOString().slice(0, 10)}</td>
            <td>
              <div className="flex justify-end">
                <SubscriberDeleteButton email={subscriber.email} />
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>
      {!subscribers.length ? <p className="text-xs text-mist">No signups yet.</p> : null}
    </>
  );
}
