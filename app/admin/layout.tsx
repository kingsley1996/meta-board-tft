import { Inter, Space_Grotesk } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });
const display = Space_Grotesk({ subsets: ['latin', 'vietnamese'], weight: ['500', '600', '700'], variable: '--font-space-grotesk' });

// Admin is single-editor and English-only; it gets its own root layout so the
// public [lang] tree can own <html lang>.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} flex min-h-screen flex-col antialiased`}>
        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-6 pt-6 pb-10">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
