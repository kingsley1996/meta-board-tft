import type { Metadata } from 'next';
import { Prose, ProseSection } from '@/components/prose';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <Prose title="About MetaBoard">
      <ProseSection heading="What this is">
        <p>
          MetaBoard tracks the Teamfight Tactics meta with one rule: rankings have to be useful at the moment you
          are rolling, not interesting in a spreadsheet. Every comp page answers three questions — what to build,
          what to slam, and when to roll.
        </p>
      </ProseSection>
      <ProseSection heading="How the tiers are made">
        <p>
          Tier placements come from a mix of match data and coaching review. Data finds the strong lines; the
          review pass removes lines that only win in lobbies nobody plays in. A comp moves tiers when both agree.
        </p>
      </ProseSection>
      <ProseSection heading="Contact">
        <p>Corrections and comp submissions: hello@metaboard.example (placeholder — the owner replaces this on launch).</p>
      </ProseSection>
    </Prose>
  );
}
