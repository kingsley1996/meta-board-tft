import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { HoverCardLayer } from '@/components/hover-card';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  title: { default: 'MetaBoard | TFT comps, tier lists & guides', template: '%s | MetaBoard' },
  description: 'MetaBoard tracks the Teamfight Tactics meta: comp rankings, item and augment tiers, and guides written by high-elo coaches.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} flex min-h-screen flex-col antialiased`}>
        <Nav />
        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col border-x border-line px-6 pt-6">
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
        <HoverCardLayer />
      </body>
    </html>
  );
}
