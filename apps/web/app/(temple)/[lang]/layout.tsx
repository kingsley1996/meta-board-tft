import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import '@/vendor/temple/css/app.css';
import { isLang, locales } from '@/lib/i18n';

// Route group (temple) giữ được URL theo convention /<lang>/temple mà vẫn tự cấp <html>,
// nên chánh điện không bị Nav/Footer/Breadcrumbs của cây [lang] bọc quanh: app gốc
// đặt body position:fixed và sở hữu toàn viewport, nên nó phải là root layout của cả trang.
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1e241e',
};

export default async function TempleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return (
    <html lang={lang}>
      <body id="temple-root">{children}</body>
    </html>
  );
}
