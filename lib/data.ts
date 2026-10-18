import tft from './tft.json';
import type { Lang } from './i18n';

export type { Tier } from './tiers';
export { tierRank } from './tiers';

import type { Tier } from './tiers';

export type Cost = 1 | 2 | 3 | 4 | 5;

export type Unit = { name: string; cost: Cost; traits: string[]; icon: string | null };

export const setInfo = { number: tft.set.number, patch: tft.patch };

export const units: Unit[] = tft.champions
  .map((champion) => ({
    name: champion.name,
    cost: champion.cost as Cost,
    traits: champion.traits,
    icon: champion.icon,
  }))
  .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

export const unitByName: Record<string, Unit> = Object.fromEntries(units.map((unit) => [unit.name, unit]));

export const iconByName: Record<string, string> = Object.fromEntries(
  [
    ...tft.champions.map((entry) => [entry.name, entry.icon] as const),
    ...tft.items.map((entry) => [entry.name, entry.icon] as const),
    ...tft.augments.map((entry) => [entry.name, entry.icon] as const),
  ].filter(([, icon]) => icon) as [string, string][]
);

export type TierItem = { name: string; tier: Tier; note: { en: string; vi: string } };

export const itemTiers: TierItem[] = [
  { name: 'Infinity Edge', tier: 'S', note: { en: 'Crit multiplies every auto attack', vi: 'Chí mạng nhân lên mọi đòn đánh' } },
  { name: 'Guinsoo\'s Rageblade', tier: 'S', note: { en: 'Ramps on any sustained carry', vi: 'Tăng dần sức mạnh cho mọi chủ lực đánh liên tục' } },
  { name: 'Blue Buff', tier: 'A', note: { en: 'Caster opener that never stops', vi: 'Trang bị mở đầu cho pháp sư, dùng chiêu không ngừng' } },
  { name: 'Bloodthirster', tier: 'A', note: { en: 'Shield plus lifesteal for AD carries', vi: 'Khiên kèm hút máu cho chủ lực sát thương vật lý' } },
  { name: 'Bramble Vest', tier: 'A', note: { en: 'Anti-crit frontline staple', vi: 'Trang bị tuyến trước chống chí mạng' } },
  { name: 'Spear of Shojin', tier: 'B', note: { en: 'Mana on hit for ult carries', vi: 'Hồi năng lượng khi đánh cho chủ lực dùng chiêu' } },
  { name: 'Morellonomicon', tier: 'B', note: { en: 'Burn and wound in one slot', vi: 'Thiêu đốt và vết thương trong một ô' } },
  { name: 'Sunfire Cape', tier: 'B', note: { en: 'Early slam that stays useful', vi: 'Đồ ghép sớm mà vẫn hữu ích về sau' } },
  { name: 'Dragon\'s Claw', tier: 'C', note: { en: 'Counterpick into heavy AP lobbies', vi: 'Khắc chế sảnh nhiều sát thương phép' } },
  { name: 'Adaptive Helm', tier: 'C', note: { en: 'Sits on any flex frontline', vi: 'Dùng được cho mọi tuyến trước linh hoạt' } },
  { name: 'Thief\'s Gloves', tier: 'X', note: { en: 'Random, but two free completed items', vi: 'Ngẫu nhiên, nhưng được hai trang bị hoàn chỉnh miễn phí' } },
  { name: 'Kraken\'s Fury', tier: 'X', note: { en: 'Only for attack-speed scalers', vi: 'Chỉ dành cho tướng tăng sức mạnh theo tốc độ đánh' } },
];

export const itemTierByName: Record<string, Tier> = Object.fromEntries(itemTiers.map((item) => [item.name, item.tier]));

export const itemOptions = tft.items.map((item) => ({ name: item.name, icon: item.icon as string | null, tier: itemTierByName[item.name] ?? null }));

export const augmentTiers: TierItem[] = [
  { name: 'Hedge Fund', tier: 'S', note: { en: 'The economy augment every fast 8 wants', vi: 'Nâng cấp kinh tế mọi đội fast 8 đều muốn' } },
  { name: 'Final Ascension', tier: 'S', note: { en: 'Wins the last round of every fight', vi: 'Thắng vòng cuối của mọi giao tranh' } },
  { name: 'Cybernetic Uplink', tier: 'A', note: { en: 'Permanent AP ramp on casting', vi: 'Tăng Sức Mạnh Phép Thuật vĩnh viễn mỗi lần dùng chiêu' } },
  { name: 'Golden Gamble', tier: 'A', note: { en: 'All-in economy payer', vi: 'Đánh cược tất tay vào kinh tế' } },
  { name: 'Big Grab Bag', tier: 'A', note: { en: 'Components, gold and a Reforger', vi: 'Trang bị thành phần, vàng và một Reforger' } },
  { name: 'Component Buffet', tier: 'B', note: { en: 'Flexible component printer', vi: 'Nguồn trang bị thành phần linh hoạt' } },
  { name: 'AFK', tier: 'B', note: { en: 'Free value for passive economy rounds', vi: 'Lợi ích miễn phí cho các vòng giữ kinh tế' } },
  { name: 'Crafted Crafting', tier: 'B', note: { en: 'Stabiliser for stage 3 boards', vi: 'Ổn định đội hình giai đoạn 3' } },
  { name: 'Branching Out', tier: 'C', note: { en: 'Needs an early emblem to matter', vi: 'Cần ấn sớm mới phát huy' } },
  { name: 'Dummify', tier: 'C', note: { en: 'Tempo only, falls off late', vi: 'Chỉ mạnh giai đoạn đầu, yếu dần về cuối' } },
  { name: 'Call to Chaos', tier: 'X', note: { en: 'High-roll lines only', vi: 'Chỉ dành cho đội high-roll' } },
  { name: 'Cursed Crown', tier: 'X', note: { en: 'Power now, HP later', vi: 'Sức mạnh bây giờ, Máu về sau' } },
];

// Guide tags stay English keys (they are authored on the guides themselves);
// only the chip label is localized.
const guideTags: Record<string, string> = {
  Fundamentals: 'Kiến thức nền tảng',
  Economy: 'Kinh tế',
  Items: 'Trang bị',
  Positioning: 'Xếp đội hình',
  Augments: 'Nâng cấp',
  Meta: 'Meta',
  'Patch notes': 'Cập nhật patch',
  'Meta read': 'Đọc meta',
  'Decision making': 'Ra quyết định',
  'Mid game': 'Giữa trận',
};

export const guideTag = (name: string, lang: Lang) => (lang === 'vi' ? guideTags[name] ?? name : name);

export const patch = { version: setInfo.patch, updated: 'via CommunityDragon' };

export const socials = [
  { label: 'YouTube', href: '#' },
  { label: 'X', href: '#' },
  { label: 'Discord', href: '#' },
  { label: 'Reddit', href: '#' },
];
