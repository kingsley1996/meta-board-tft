import Link from 'next/link';

export default function NotFound() {
  return (
    <div data-section="not-found" className="mx-auto flex w-full max-w-[600px] flex-col items-start gap-3 pt-16 pb-16">
      <p className="font-display text-6xl font-bold text-brand-soft">404</p>
      <h1 className="font-display text-2xl font-bold text-fog">That board is not on the map.</h1>
      <p className="text-sm text-mist">The page moved with the meta. Try the comp rankings instead.</p>
      <Link href="/tierlist/comps" className="smooth rounded-full border border-brand bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hot">
        Back to comps
      </Link>
    </div>
  );
}
