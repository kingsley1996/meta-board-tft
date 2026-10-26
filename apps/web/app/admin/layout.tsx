import { Inter, Space_Grotesk } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });
const display = Space_Grotesk({ subsets: ['latin', 'vietnamese'], weight: ['500', '600', '700'], variable: '--font-space-grotesk' });

// Admin is English-only; it gets its own root layout so the public [lang] tree
// can own <html lang>. Chrome (sidebar shell) lives in the (shell) route group.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} antialiased`}>{children}</body>
    </html>
  );
}
