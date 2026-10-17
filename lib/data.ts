import tft from './tft.json';

export type { Tier } from './tiers';
export { tierRank, tierLabels } from './tiers';

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

export type TierItem = { name: string; tier: Tier; note: string };

export const itemTiers: TierItem[] = [
  { name: 'Infinity Edge', tier: 'S', note: 'Crit multiplies every auto attack' },
  { name: 'Guinsoo\'s Rageblade', tier: 'S', note: 'Ramps on any sustained carry' },
  { name: 'Blue Buff', tier: 'A', note: 'Caster opener that never stops' },
  { name: 'Bloodthirster', tier: 'A', note: 'Shield plus lifesteal for AD carries' },
  { name: 'Bramble Vest', tier: 'A', note: 'Anti-crit frontline staple' },
  { name: 'Spear of Shojin', tier: 'B', note: 'Mana on hit for ult carries' },
  { name: 'Morellonomicon', tier: 'B', note: 'Burn and wound in one slot' },
  { name: 'Sunfire Cape', tier: 'B', note: 'Early slam that stays useful' },
  { name: 'Dragon\'s Claw', tier: 'C', note: 'Counterpick into heavy AP lobbies' },
  { name: 'Adaptive Helm', tier: 'C', note: 'Sits on any flex frontline' },
  { name: 'Thief\'s Gloves', tier: 'X', note: 'Random, but two free completed items' },
  { name: 'Kraken\'s Fury', tier: 'X', note: 'Only for attack-speed scalers' },
];

export const itemTierByName: Record<string, Tier> = Object.fromEntries(itemTiers.map((item) => [item.name, item.tier]));

export const itemOptions = tft.items.map((item) => ({ name: item.name, icon: item.icon as string | null, tier: itemTierByName[item.name] ?? null }));

export const augmentTiers: TierItem[] = [
  { name: 'Hedge Fund', tier: 'S', note: 'The economy augment every fast 8 wants' },
  { name: 'Final Ascension', tier: 'S', note: 'Wins the last round of every fight' },
  { name: 'Cybernetic Uplink', tier: 'A', note: 'Permanent AP ramp on casting' },
  { name: 'Golden Gamble', tier: 'A', note: 'All-in economy payer' },
  { name: 'Big Grab Bag', tier: 'A', note: 'Components, gold and a Reforger' },
  { name: 'Component Buffet', tier: 'B', note: 'Flexible component printer' },
  { name: 'AFK', tier: 'B', note: 'Free value for passive economy rounds' },
  { name: 'Crafted Crafting', tier: 'B', note: 'Stabiliser for stage 3 boards' },
  { name: 'Branching Out', tier: 'C', note: 'Needs an early emblem to matter' },
  { name: 'Dummify', tier: 'C', note: 'Tempo only, falls off late' },
  { name: 'Call to Chaos', tier: 'X', note: 'High-roll lines only' },
  { name: 'Cursed Crown', tier: 'X', note: 'Power now, HP later' },
];

export type Guide = {
  slug: string;
  author: string;
  authorSlug: string;
  date: string;
  title: string;
  excerpt: string;
  tags: string[];
  featured?: boolean;
  sections: { heading: string; body: string[]; list?: string[] }[];
};

export const guides: Guide[] = [
  {
    slug: 'economy-first-stage-2',
    author: 'Vale',
    authorSlug: 'vale',
    date: 'Oct 12, 2026',
    title: 'Economy first: why your stage 2 decides your stage 5',
    excerpt: 'Interest is not a number you watch, it is a decision you make. A practical framework for the first ten rounds.',
    tags: ['Fundamentals', 'Economy'],
    featured: true,
    sections: [
      {
        heading: 'The two curves',
        body: [
          'Every stage 2 you play one of two curves: the streak curve or the interest curve. The streak curve trades gold for HP and tempo. The interest curve trades HP for gold and flexibility.',
          'Both are correct. What loses games is drifting between them — winning one round, losing the next, and arriving at 3-1 with neither streak gold nor interest.',
        ],
        list: [
          'Pick your curve by 2-1, not at carousel.',
          'A streak is only worth holding if you can hold all 5 rounds.',
          'Interest caps at 50 gold; after that, gold is for the curve that plans to spend it.',
        ],
      },
      {
        heading: 'What stage 2 gold actually buys',
        body: [
          'Gold stacked in stage 2 converts into level 8 on 4-2 with 30+ gold to roll. That is the entire goal: a full board two rounds before players who fought all stage 2.',
          'If your board cannot reach 4-2 at level 8 with 30 gold, your stage 2 was too expensive. Count the rounds you leveled early — each one is roughly a roll-down delayed.',
        ],
      },
    ],
  },
  {
    slug: 'item-slam-decision',
    author: 'Rook',
    authorSlug: 'rook',
    date: 'Oct 8, 2026',
    title: 'Item slams: the 8-second decision',
    excerpt: 'You have eight seconds on the carousel and three slams in your pocket. Here is the order of operations.',
    tags: ['Items', 'Fundamentals'],
    sections: [
      {
        heading: 'Slam order',
        body: ['Slams are about real options, not perfect items. A completed flexible item on your carry beats a perfect component on your bench every time.'],
        list: ['Carry item that combines now', 'Tank item that combines now', 'Flexible component (blade, vest)', 'Component for a contested line'],
      },
      {
        heading: 'The pivot tax',
        body: [
          'Slamming locks in a damage type. If your lobby is 5 AP players and you slam AP on 2-2, you paid the pivot tax for somebody else.',
          'Watch the first two PvP rounds. If three boards open with Arcanists, your AP slam is a donation. Blade or vest first, AP second.',
        ],
      },
    ],
  },
  {
    slug: 'rolling-on-8-flowchart',
    author: 'Nyx',
    authorSlug: 'nyx',
    date: 'Sep 30, 2026',
    title: 'Rolling on 8: a flowchart that actually works',
    excerpt: 'Every "when do I roll" answer, reduced to three questions about your HP, gold and lobby.',
    tags: ['Decision making', 'Mid game'],
    sections: [
      {
        heading: 'The three questions',
        body: ['Before any roll-down, answer: Am I stable if I wait? Do I know my final board? Is anyone else buying my units?'],
        list: [
          'Stable + known board + contested: roll now.',
          'Stable + known board + free: wait one stage.',
          'Unstable: roll to 20 and stabilise, then rebuild.',
        ],
      },
      {
        heading: 'Why waiting is usually wrong below 40 HP',
        body: ['Players protect gold the way they protect HP — as a score. Gold is only a score while you are alive. Below 40 HP, the roll-down is the correct play even at level 7 in a bad spot.'],
      },
    ],
  },
  {
    slug: 'frontline-positioning-5-minutes',
    author: 'Juno',
    authorSlug: 'juno',
    date: 'Sep 22, 2026',
    title: 'Frontline positioning in 5 minutes',
    excerpt: 'Your frontline is a decision about which side the fight happens on. Stop centering it.',
    tags: ['Positioning'],
    sections: [
      {
        heading: 'Pick a side',
        body: [
          'Your carry sits in a corner. Your frontline mirrors it, shifted one hex inward, so the fight starts on your terms. Center fronts lose to corner carries; corner fronts trade better than both.',
        ],
        list: ['Carry corner first, always', 'Frontline one hex toward mid', 'Assassins opposite their carry', 'From 4-3 onward, re-scout every round'],
      },
      {
        heading: 'The last-round veto',
        body: ['In the final two rounds, the fight is one hybrid battle. Position for the board that counters you, not the board with the most HP — that is the one that ends your game.'],
      },
    ],
  },
  {
    slug: 'read-a-tier-list',
    author: 'Vale',
    authorSlug: 'vale',
    date: 'Sep 15, 2026',
    title: 'How to read a tier list without copying it',
    excerpt: 'A tier list is a map of contested lines, not a shopping list. Three ways to use ours correctly.',
    tags: ['Fundamentals', 'Meta'],
    sections: [
      {
        heading: 'Tiers are about placement pressure',
        body: ['S-tier means the line is strong and will be contested. If two players in your lobby open the same S-tier line, the third best player in the lobby is playing the A-tier line — with a free roll-down.'],
        list: ['Count contests before committing', 'A-tier with no contest > S-tier with two', 'X-tier means "strong when free", not "bad"'],
      },
      {
        heading: 'Checks, not plans',
        body: ['Treat each tier as a checkpoint: does my board look like the comp at this stage? If not, fix the board, do not chase the tier.'],
      },
    ],
  },
  {
    slug: 'augment-tiers-when-s-tier-loses',
    author: 'Rook',
    authorSlug: 'rook',
    date: 'Sep 2, 2026',
    title: 'Augment tiers: when the S-tier pick loses',
    excerpt: 'The best augment on paper is the one your board can actually use. A guide to the gap.',
    tags: ['Augments'],
    sections: [
      {
        heading: 'Board fit beats tier',
        body: ['An S-tier economy augment on a board that must win stage 3 is a C-tier pick. The tier assumes a neutral board; you never have one.'],
        list: ['Economy augments need stable boards', 'Combat augments need a carry to boost', 'Trait augments need the trait online by 3-2', 'Pivot augments need a flexible bench'],
      },
      {
        heading: 'The 2-for-1 rule',
        body: ['If two augments both fit, take the one that keeps your next three rounds simple. You are buying time, not power.'],
      },
    ],
  },
];

export const patch = { version: setInfo.patch, updated: 'via CommunityDragon' };

export const socials = [
  { label: 'YouTube', href: '#' },
  { label: 'X', href: '#' },
  { label: 'Discord', href: '#' },
  { label: 'Reddit', href: '#' },
];
