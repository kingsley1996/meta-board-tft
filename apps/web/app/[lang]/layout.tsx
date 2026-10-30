import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Inter, Space_Grotesk } from 'next/font/google';
import '../globals.css';
import { Nav } from '@/components/nav';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Footer } from '@/components/footer';
import { patch } from '@/lib/data';
import { HoverCardLayer } from '@/components/hover-card';
import { PwaRegister } from '@/components/pwa-register';
import { isLang, locales } from '@/lib/i18n';
import { messages } from '@/lib/messages';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });
const display = Space_Grotesk({ subsets: ['latin', 'vietnamese'], weight: ['500', '600', '700'], variable: '--font-space-grotesk' });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

// The Slate ground, i.e. --color-page in app/globals.css. PWA chrome and the
// first painted frame have to agree or the browser bar flashes.
export const viewport: Viewport = { themeColor: '#0d1317' };

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const meta = messages[isLang(lang) ? lang : 'en'].meta;
  return {
    title: { default: meta.title, template: '%s | TFTIQ' },
    description: meta.description,
  };
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <html lang={lang}>
      <body className={`${inter.variable} ${display.variable} flex min-h-screen flex-col antialiased`}>
        <Nav lang={lang} patch={patch.version} />
        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col border-x border-line px-6 pt-6 max-[480px]:has-[[data-login]]:px-2 [&:has([data-assistant])_footer]:hidden">
          <Breadcrumbs lang={lang} />
          <main className="flex-1">{children}</main>
          <Footer lang={lang} />
        </div>
        <HoverCardLayer lang={lang} />
        <PwaRegister />
      </body>
    </html>
  );
}
