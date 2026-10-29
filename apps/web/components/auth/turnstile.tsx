'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18n';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SOLVE_TIMEOUT_MS = 20_000;

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export class TurnstileUnavailable extends Error {}

export function useTurnstile(lang: Lang) {
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [scriptReady, setScriptReady] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const held = useRef<string | null>(null);
  const waiting = useRef<((token: string | null) => void) | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failed = useRef(false);

  const settle = useCallback((token: string | null) => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    if (waiting.current) {
      const resolve = waiting.current;
      waiting.current = null;
      resolve(token);
    } else {
      held.current = token;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/turnstile', { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
      .then(async (response) => {
        if (response.status === 204) return null;
        if (!response.ok) throw new Error('turnstile config unavailable');
        return (await response.json() as { site_key: string }).site_key;
      })
      .then((key) => { if (alive) setSiteKey(key); })
      .catch(() => { if (alive) setSiteKey(null); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!siteKey || !scriptReady || !host.current || !window.turnstile) return;
    failed.current = false;
    widgetId.current = window.turnstile.render(host.current, {
      sitekey: siteKey,
      theme: 'dark',
      language: lang,
      size: 'compact',
      callback: (token: string) => {
        failed.current = false;
        settle(token);
      },
      'expired-callback': () => { held.current = null; },
      'error-callback': () => {
        failed.current = true;
        held.current = null;
        settle(null);
      },
    });
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      held.current = null;
      settle(null);
    };
  }, [siteKey, scriptReady, lang, settle]);

  const take = useCallback(async (): Promise<string | null> => {
    if (siteKey === null) return null;
    if (held.current) {
      const token = held.current;
      // Siteverify accepts a token once, even when the password is wrong.
      held.current = null;
      return token;
    }
    if (!widgetId.current || !window.turnstile || failed.current) throw new TurnstileUnavailable();
    const token = await new Promise<string | null>((resolve) => {
      waiting.current = resolve;
      timeout.current = setTimeout(() => settle(null), SOLVE_TIMEOUT_MS);
      window.turnstile!.reset(widgetId.current!);
    });
    if (!token) throw new TurnstileUnavailable();
    return token;
  }, [siteKey, settle]);

  return {
    loading: siteKey === undefined,
    take,
    widget: siteKey ? (
      <>
        <Script
          id="cloudflare-turnstile"
          src={SCRIPT_SRC}
          onReady={() => setScriptReady(true)}
          onError={() => { failed.current = true; settle(null); }}
        />
        <div ref={host} className="flex w-full justify-center" />
      </>
    ) : null,
  };
}
