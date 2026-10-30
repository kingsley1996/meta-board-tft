import { notFound } from 'next/navigation';

// Unmatched URLs under a locale land here instead of Next's default English 404,
// so the missing page still gets the nav and app/[lang]/not-found.tsx copy.
export default function CatchAllPage() {
  notFound();
}
