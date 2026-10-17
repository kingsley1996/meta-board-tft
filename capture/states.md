# Interaction states — tftacademy.com (reference capture)

Probed with Playwright (reducedMotion, waits for CSSTransitions to settle). Raw: `states.raw.json`.

| Element | Trigger | What changed | Timing |
|---|---|---|---|
| Nav "Tierlist" / "Tools" | hover | absolute dropdown under item (`origin-top`), dark panel ~120px, 3 items (Comps/Items/Augments) 36px each, px-6 py-2, text-sm; item hover text→yellow | scale/fade ~0.15–0.3s |
| Nav links | hover | text white → accent yellow | ~0.15s |
| Sticky nav | scroll 600px | stays top 0, height 63px, 1px bottom border rgb(52,56,60); no shrink, no shadow change | — |
| Comp hexagon (tier row) | hover | scales up (~1.15, overlaps neighbor), tooltip chip above shows comp name (e.g. "Azir Rammus") | ~0.15s ease |
| Search input | focus | border rgb(52,56,60) → rgb(84,86,87); no visible ring (focus ring vars all 0px) | none/instant |
| Home feature-card art | hover | img opacity 0.8 → up, transform (rotate/blobs), `transition: all .3s` | 0.3s ease |
| Tabs Comps/Items/Augments | click | route navigation to /tierlist/{comps,items,augments} (real links, not client tabs) | instant |
| Buttons (Learn Set 18 / Join Academy+) | hover | not measurable (matched wrong node); class hint: `smooth-100` = generic transition helper | — |

Motion kinds: CSS transitions + hover dropdowns; JS-positioned tooltips on hover; YouTube iframe embeds (third-party, studyhall page); no scroll-linked animation observed; no carousel auto-play (episode thumbnails static).

Caveats: the tour overlay (`.toaster`, 868px, fixed) and hidden state pollute `getComputedStyle` sweeps — hidden in all screenshots. Transitions still mid-flight in one probe returned pre-settle values; treat timing column as approximate.
