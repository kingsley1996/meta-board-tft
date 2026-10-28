'use client';

import { useEffect, useState } from 'react';
import { Mascot } from 'page-mascot';

export const TOMO_DIRECTIONS = '/mascots/drone-directions.webp';
export const TOMO_REACTIONS = '/mascots/drone-reactions.webp';

// Cell names and order match the reactions sheet shipped with page-mascot characters.
export type TomoReaction =
  | 'blink'
  | 'heart'
  | 'sparkle'
  | 'surprised'
  | 'wink'
  | 'bashful'
  | 'sleepy'
  | 'dizzy'
  | 'delighted';

// A new cue object per trigger, so repeating the same reaction re-fires it.
export type TomoCue = { name: TomoReaction; id: string };

const REACTION_CELLS: Record<TomoReaction, string> = {
  blink: '0% 0%',
  heart: '50% 0%',
  sparkle: '100% 0%',
  surprised: '0% 50%',
  wink: '50% 50%',
  bashful: '100% 50%',
  sleepy: '0% 100%',
  dizzy: '50% 100%',
  delighted: '100% 100%',
};

// page-mascot sheets are 3x3 grids; 300% size makes each cell a clean 0/50/100% step.
const spriteLayer = {
  backgroundSize: '300% 300%',
  backgroundRepeat: 'no-repeat',
} as const;

// Expressions cycled while the assistant works, as an "analyzing" state.
const BUSY_CYCLE: TomoReaction[] = ['surprised', 'sparkle', 'wink', 'bashful'];
const BUSY_STEP_MS = 700;

// Header mascot: keeps page-mascot's cursor tracking and boop, plus programmatic
// reactions the chat can drive (page-mascot has no API for that). `busy` runs an
// animated analyzing state while a request is in flight.
export function Tomo({
  cue,
  busy = false,
  size = 64,
  label = 'Tomo',
  durationMs = 1400,
}: {
  cue: TomoCue | null;
  busy?: boolean;
  size?: number;
  label?: string;
  durationMs?: number;
}) {
  const [reaction, setReaction] = useState<TomoReaction | null>(null);
  const [busyStep, setBusyStep] = useState(0);

  useEffect(() => {
    if (!cue) return;
    setReaction(cue.name);
    const timer = window.setTimeout(() => setReaction(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [cue, durationMs]);

  useEffect(() => {
    if (!busy) {
      setBusyStep(0);
      return;
    }
    const timer = window.setInterval(() => setBusyStep((step) => step + 1), BUSY_STEP_MS);
    return () => window.clearInterval(timer);
  }, [busy]);

  const shown = busy ? BUSY_CYCLE[busyStep % BUSY_CYCLE.length] : reaction;

  return (
    <span className={`relative inline-block shrink-0 ${busy ? 'tomo-float' : ''}`} style={{ width: size, height: size }}>
      <Mascot directions={TOMO_DIRECTIONS} reactions={TOMO_REACTIONS} size={size} label={label} />
      {busy ? <span aria-hidden className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-brand/40" /> : null}
      {shown ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${busy ? '' : 'tomo-pop'}`}
          style={{ ...spriteLayer, backgroundImage: `url(${TOMO_REACTIONS})`, backgroundPosition: REACTION_CELLS[shown] }}
        />
      ) : null}
    </span>
  );
}

// Bubble avatar: idle blinking and a slow hover, CSS-only so a long
// conversation stays cheap.
export function TomoSprite({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`tomo-idle inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, ...spriteLayer, backgroundImage: `url(${TOMO_DIRECTIONS})`, backgroundPosition: '50% 50%' }}
    />
  );
}
