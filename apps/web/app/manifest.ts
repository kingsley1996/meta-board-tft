import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MetaBoard — TFT comps & tier lists',
    short_name: 'MetaBoard',
    description: 'Teamfight Tactics comps, tier lists, items, augments and tools. MetaBoard is an independent companion and is not affiliated with Riot Games.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d1317',
    theme_color: '#0d1317',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
