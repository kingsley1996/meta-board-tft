'use client';

import { useEffect, useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { messages } from '@/lib/messages';

// One vote per browser (localStorage) — the server also dedupes per IP.
export function VoteButton({ slug, votes, lang }: { slug: string; votes: number; lang: Lang }) {
  const t = messages[lang].compPanel;
  const [count, setCount] = useState(votes);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    setVoted(window.localStorage.getItem(`mb-voted:${slug}`) === '1');
  }, [slug]);

  const vote = async () => {
    if (voted) return;
    setVoted(true);
    window.localStorage.setItem(`mb-voted:${slug}`, '1');
    try {
      const res = await fetch(`/api/comps/${slug}/vote`, { method: 'POST' });
      const body = await res.json();
      if (body.counted && typeof body.votes === 'number') setCount(body.votes);
    } catch {
      // Leave the optimistic state; the vote is a nice-to-have.
    }
  };

  return (
    <button
      type="button"
      onClick={vote}
      aria-label={t.vote}
      disabled={voted}
      className={`smooth inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${voted ? 'border-brand-hot/60 bg-brand-hot/15 text-brand-soft' : 'border-line bg-util text-mist hover:border-brand-soft hover:text-fog'}`}
    >
      {'\u2665'} {count}
    </button>
  );
}
