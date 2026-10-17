import type { Metadata } from 'next';
import { Prose, ProseSection } from '@/components/prose';

export const metadata: Metadata = { title: 'Terms of Use' };

export default function TermsPage() {
  return (
    <Prose title="Terms of Use" updated="October 2026">
      <ProseSection heading="Using MetaBoard">
        <p>
          MetaBoard is a free reference for Teamfight Tactics players. Rankings are opinions derived from match
          data; they are not guarantees of results.
        </p>
      </ProseSection>
      <ProseSection heading="Content">
        <p>
          Guides, rankings and site copy are MetaBoard&apos;s own and may not be republished wholesale without
          permission. Game names and mechanics belong to their respective owners; MetaBoard is not affiliated
          with or endorsed by Riot Games.
        </p>
      </ProseSection>
      <ProseSection heading="No warranty">
        <p>
          The site is provided as-is. We update rankings daily, but patches change fast and pages can be stale or
          wrong. Verify anything tournament-critical yourself.
        </p>
      </ProseSection>
    </Prose>
  );
}
