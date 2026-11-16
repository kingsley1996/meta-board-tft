import season from '@tftiq/shared/data/set.json';
import tft from '@tftiq/shared/data/tft.json';

// A test that names the season, or writes a unit URL, is naming data: it reads the label and the id
// off the same files the pages render. On rotation day these assertions move with the
// catalog instead of holding last season open, and a unit that leaves the roster fails here with
// its name rather than as a 404.
type Slugged = { name: string; slug: string };

const slugOf = (list: Slugged[], name: string, kind: string) => {
  const hit = list.find((entry) => entry.name === name);
  if (!hit) throw new Error(`${kind} "${name}" is not in the catalog — the roster moved and this test still names it`);
  return hit.slug;
};

export const setLabel = (lang: 'en' | 'vi') => (lang === 'vi' ? `Mùa ${season.number}` : `Set ${season.number}`);
export const banner = season.banner;
export const bannerFile = season.banner.split('/').pop() ?? season.banner;

export const championPath = (name: string, lang: 'en' | 'vi' = 'en') => `/${lang}/champions/${slugOf(tft.champions, name, 'Champion')}`;
export const traitPath = (name: string, lang: 'en' | 'vi' = 'en') => `/${lang}/traits/${slugOf(tft.traits, name, 'Trait')}`;
