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
    description: 'Chánh điện 3D: lễ Phật, thắp hương, gieo quẻ cầu may trước khi vào trận TFT.',
    robots: { index: false, follow: false },
  };
}

export default async function TemplePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return <TempleApp lang={lang} />;
}
