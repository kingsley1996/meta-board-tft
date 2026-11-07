import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TempleApp } from '@/components/temple/temple-app';
import { isLang } from '@/lib/i18n';

const titles: Record<string, string> = {
  vi: 'Đền Cầu May · TFTIQ',
  en: 'Lucky Temple · TFTIQ',
};

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: titles[isLang(lang) ? lang : 'vi'] ?? titles.vi,
    description: 'Sảnh 3D Đền Cầu May trước trận TFT: ngồi thiền, rút quẻ đội hình, dâng bùa lấy vía.',
    robots: { index: false, follow: false },
  };
}

export default async function TemplePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return <TempleApp lang={lang} />;
}
