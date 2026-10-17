import type { Metadata } from 'next';
import { Prose, ProseSection } from '@/components/prose';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="October 2026">
      <ProseSection heading="What we collect">
        <p>
          MetaBoard has no accounts and no sign-in. We collect aggregate, anonymous page statistics — which comp
          pages are opened and roughly from where — to decide what to rank next. No personal profile is built.
        </p>
      </ProseSection>
      <ProseSection heading="Cookies">
        <p>
          The site stores one local preference: your last visited tier list tab. It never leaves your browser and
          is not shared with anyone.
        </p>
      </ProseSection>
      <ProseSection heading="Third parties">
        <p>
          Embedded media on the Media page is loaded from third-party platforms only after you press play. Those
          platforms apply their own privacy policies from that point.
        </p>
      </ProseSection>
      <ProseSection heading="Contact">
        <p>Questions about this policy: privacy@metaboard.example (placeholder — the owner replaces this on launch).</p>
      </ProseSection>
    </Prose>
  );
}
