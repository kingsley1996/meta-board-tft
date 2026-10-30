import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TFTIQ — TFT comps & tier lists',
    short_name: 'TFTIQ',
    description: 'Teamfight Tactics comps, tier lists, items, augments and tools. TFTIQ is an independent companion and is not affiliated with Riot Games.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d1317',
    theme_color: '#0d1317',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      // The maskable file is the same mark pulled inside the 80% safe zone; the
      // hexagon's vertices would otherwise be cut by a circular launcher mask.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
