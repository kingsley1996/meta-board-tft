import Link from 'next/link';
import { socials } from '@/lib/data';

export function Footer() {
  return (
    <footer data-section="footer" className="mt-auto flex w-full flex-col items-center gap-3 px-6 pt-10 pb-6 text-center">
      <div className="flex items-center gap-4 text-sm font-semibold">
        {socials.map((social) => (
          <a key={social.label} href={social.href} className="smooth text-mist hover:text-brand-soft">{social.label}</a>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-mist">
        <Link href="/legal/privacy" className="smooth hover:text-fog">Privacy Policy</Link>
        <Link href="/legal/terms" className="smooth hover:text-fog">Terms of Use</Link>
        <Link href="/about" className="smooth hover:text-fog">About</Link>
      </div>
      <p className="max-w-[640px] text-xs leading-relaxed text-mist">
        &copy; 2026 MetaBoard. MetaBoard is an independent companion and is not affiliated with or endorsed by Riot Games.
        Teamfight Tactics is a trademark of Riot Games, Inc.
      </p>
    </footer>
  );
}
