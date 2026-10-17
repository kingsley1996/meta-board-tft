# Plan — MetaBoard (reference build of tftacademy.com)

Lane: **reference build**. tftacademy.com is run by a third party (Frodan/Dishsoap); the user does not own it and has no authorization. Captured as a pattern source only: section order, grid, spacing rhythm, interaction ideas. Name, logo, palette, typefaces, copy and imagery are new and the user's own.

Stack: Next.js (App Router) + Tailwind CSS v4 (CSS-first `@theme` tokens), content as local TS data in `lib/`. No CMS, no auth, no third-party embeds.

Widths captured/checked: 390, 768, 1440. Source breakpoints: 640/768/1024/1280/1536 + custom 1150/1160.

## Measured pattern tokens (source)

- Spacing rhythm: 4 / 8 / 12 / 16 / 20 / 24 px (+48 hero gap). Gap-heavy flex layouts.
- Type: body 14/20, small 12/16, semibold 16–18/24–28, display 72px/900 caps. Source font Overpass — **not reused**; MetaBoard uses Space Grotesk (display) + Inter (body).
- Radii: 8, 12, 24, pill. Flat design: 0 box-shadows, 1px borders (rgb(52,56,60)) everywhere.
- Containers: nav/columns 1160px, page card 1280px, page bg 1536px.
- Palette source: near-black bg + white + yellow accent (255,200,8) + tier colors. **Not reused** — MetaBoard palette is navy/violet (see `app/globals.css`).

## Page templates and section order (all captured in `capture/source/<page>/`)

1. **home** — sticky nav (63px) → hero (set logo, 72px/900 headline, subtitle ~55% width, 2 CTAs) → 6 feature cards (3×2, art tile + condensed caps label) → promo card → footer (social, legal links, trademark note).
2. **comps / items / augments** (`/tierlist/*`) — patch bar (patch + updated) → display title `TITLE ▸ <name>` → tab row (routes) + search + 2 filter dropdowns → tier rows S/A/B/C/X: 128px tier chip (colored border+glow) + bordered row of 64px unit hexagons, hover scale + name tooltip → footer.
3. **comp-detail** — tier list with the selected comp expanded inline as a panel: left sidebar (comp title, playstyle label, cost/units chips, augments 4×2 grid, augment priority chips) + right: final board (8 hexes w/ star + item badges), Early Units, Item Priority, Positioning Example (hex grid with unit placement), Alt Builds, Tips box, Stage 2/3/4 cards.
4. **guides** — featured guide hero card → sticky-ish category filter row → guide card list (thumbnail + title + author + tags).
5. **guide article** — prose column (max 1150px), headings/paragraphs/list styles → related guides row → footer.
6. **learn champions** — filter row (cost/trait chips) → dense grid `repeat(auto-fill, 270px)` of champion cards (portrait, name, trait chips, cost).
7. **media (studyhall analogue)** — full-bleed colored hero: brand lockup + description left, video embed + episode thumbnails + platform toggle right.
8. **legal** — single ProseMirror-style prose column.

## Interaction ideas worth borrowing (see `states.md`)

- Hover dropdowns in nav (origin-top, dark panel, 36px items).
- Sticky nav, constant height, hairline border, no shadow.
- Unit hexagon hover: scale + name tooltip.
- Tier rows expand the selected comp inline rather than navigating away.
- Flat panels separated by 1px borders; no shadows.

## Acceptance (reference lane)

User review + side-by-side proving name, logo, palette, typefaces, copy and imagery all differ from the reference. No pixel-diff target. Box heights from `capture/source/<page>/boxes-*.json` used as spacing guidance only.

## Deliberately left out

- Sign-in, dashboard, checkout — third-party brand's account surfaces, not copied (skill decline rule).
- Academy+/Patreon paywalled meta reads.
- Tools (builder, tierlist maker) — separate apps, not presentation layer.
- Riot Games art (champion/item icons) — source serves mirrored Riot assets; MetaBoard uses CSS placeholder hexes. Owner supplies licensed art later.
- Analytics/ads/Toaster tour overlay.
