"use client";

/**
 * Autosave for the long signup/setup forms.
 *
 * Three things this hook is careful about, because each one was a real failure:
 *
 *   1. It never overwrites what the user is looking at. A draft found on the
 *      server is *offered* (`offer`) and only applied when the form calls
 *      `restore()`. While an offer is outstanding, `save()` is a no-op, so an
 *      untouched empty form cannot clobber the draft it is about to be given.
 *   2. It never throws into a form. Signed out, offline, endpoint down, storage
 *      full — every one of those degrades to "autosave is not doing anything
 *      right now", never to a crashed step or a rejected promise nobody awaited.
 *   3. It never sends a field the draft policy excludes. `sanitizeDraft()` runs
 *      here, before the request, so a password or a home address does not even
 *      leave the browser. The API route runs it again; this side is for privacy,
 *      that side is for security.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DRAFT_SAVE_DELAY_MS,
  formatDraftTimestamp,
  hasDraftContent,
  sanitizeDraft,
  type DraftData,
  type DraftInput,
  type DraftKind,
} from "@/lib/drafts";

const ENDPOINT = "/api/drafts";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

export interface UseDraftOptions {
  /**
   * Set false to switch autosave off entirely (e.g. after a successful submit,
   * or on a step that holds nothing worth keeping). Defaults to true.
   */
  enabled?: boolean;
  /** Debounce before writing. Defaults to {@link DRAFT_SAVE_DELAY_MS} (800ms). */
  delayMs?: number;
}

export interface UseDraftResult {
  /** 'idle' before anything is written, then 'saving' | 'saved' | 'error'. */
  status: DraftStatus;
  /** ISO timestamp of the last successful save, or null. */
  savedAt: string | null;
  /** "hari ini 14:05" — ready to render next to the autosave indicator. */
  savedAtLabel: string | null;
  /** Full Indonesian sentence for the indicator, or null when there is nothing to say. */
  statusLabel: string | null;
  /** True while the initial lookup is in flight — hold the restore banner until false. */
  isLoading: boolean;
  /**
   * False when drafts cannot be used at all (signed out). The form should hide
   * every autosave affordance rather than promising something we cannot do.
   */
  isAvailable: boolean;
  /** A saved draft waiting to be accepted, or null. Show the "Lanjutkan?" banner on this. */
  offer: DraftData | null;
  /** ISO timestamp of the offered draft. */
  offerSavedAt: string | null;
  /** "kemarin 21:14" for the offered draft. */
  offerSavedAtLabel: string | null;
  /**
   * Queue a debounced save. Safe to call on every keystroke, and a no-op while
   * `offer` is still set — call `restore()` or `dismissOffer()` first, otherwise
   * autosave stays paused.
   */
  save: (data: DraftInput) => void;
  /** Write any queued save immediately (e.g. before navigating between steps). */
  flush: () => Promise<void>;
  /** Accept the offered draft: clears the offer and returns its data to apply. */
  restore: () => Promise<DraftData | null>;
  /** Stop offering the draft without deleting it (the user kept typing). */
  dismissOffer: () => void;
  /** Delete the draft. Call after a successful submit, and on "mulai dari awal". */
  clear: () => Promise<void>;
}

export function useDraft(
  kind: DraftKind,
  options: UseDraftOptions = {},
): UseDraftResult {
  const enabled = options.enabled !== false;
  const delayMs = options.delayMs ?? DRAFT_SAVE_DELAY_MS;

  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [isAvailable, setIsAvailable] = useState(true);
  const [offer, setOffer] = useState<DraftData | null>(null);
  const [offerSavedAt, setOfferSavedAt] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The most recent sanitized payload that has not made it to the server yet. */
  const pendingRef = useRef<DraftData | null>(null);
  /** Serialized copy of the last thing we stored, so identical saves are skipped. */
  const lastSentRef = useRef<string | null>(null);
  const offerRef = useRef<DraftData | null>(null);
  const offerSavedAtRef = useRef<string | null>(null);
  const availableRef = useRef(true);
  const loadRef = useRef<Promise<void> | null>(null);

  // Read inside stable callbacks so `save` keeps a constant identity — forms put
  // it straight into a useEffect dependency list.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;

  /** Autosave stops applying entirely once we learn there is no session. */
  const markUnavailable = useCallback(() => {
    availableRef.current = false;
    pendingRef.current = null;
    if (mountedRef.current) {
      setIsAvailable(false);
      setStatus("idle");
    }
  }, []);

  const write = useCallback(
    async (payload: DraftData, keepalive = false) => {
      if (!availableRef.current) return;

      // Offline: keep the payload queued and let the `online` listener retry.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (mountedRef.current) {
          setIsOffline(true);
          setStatus("error");
        }
        return;
      }

      if (mountedRef.current) setStatus("saving");

      try {
        const response = await fetch(ENDPOINT, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, data: payload }),
          // Lets the last keystrokes still land when the page is going away.
          keepalive,
        });

        if (response.status === 401) {
          markUnavailable();
          return;
        }

        if (!response.ok) {
          // 4xx is our own fault (too large, malformed) and will never succeed
          // on retry — drop the payload instead of looping on it forever.
          if (response.status < 500) pendingRef.current = null;
          if (mountedRef.current) setStatus("error");
          return;
        }

        const body = (await response.json().catch(() => null)) as
          | { updatedAt?: string }
          | null;

        pendingRef.current = null;
        lastSentRef.current = JSON.stringify(payload);

        if (mountedRef.current) {
          setIsOffline(false);
          setSavedAt(body?.updatedAt ?? new Date().toISOString());
          setStatus("saved");
        }
      } catch {
        // Network blip. The payload stays queued for the next tick.
        if (mountedRef.current) setStatus("error");
      }
    },
    [kind, markUnavailable],
  );

  // Keep the newest `write` reachable from listeners and unmount cleanup, which
  // are registered once.
  const writeRef = useRef(write);
  writeRef.current = write;

  const save = useCallback(
    (data: DraftInput) => {
      if (!enabledRef.current || !availableRef.current) return;
      // A draft is still being offered: the form has not adopted it yet, so
      // whatever is on screen is not the user's real progress.
      if (offerRef.current) return;

      const clean = sanitizeDraft(kind, data);
      if (!hasDraftContent(kind, clean)) return;

      const serialized = JSON.stringify(clean);
      if (serialized === lastSentRef.current) return;

      pendingRef.current = clean;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const payload = pendingRef.current;
        if (payload) void writeRef.current(payload);
      }, delayRef.current);
    },
    [kind],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = pendingRef.current;
    if (!payload) return;
    await writeRef.current(payload);
  }, []);

  const restore = useCallback(async (): Promise<DraftData | null> => {
    // The user may click "Lanjutkan" before the lookup resolves.
    if (loadRef.current) {
      try {
        await loadRef.current;
      } catch {
        /* the loader already swallowed its own errors */
      }
    }

    const draft = offerRef.current;
    if (!draft) return null;

    offerRef.current = null;
    // What we just handed back is exactly what the server holds, so don't
    // immediately write it again.
    lastSentRef.current = JSON.stringify(draft);

    if (mountedRef.current) {
      setOffer(null);
      setSavedAt(offerSavedAtRef.current);
      setStatus("saved");
    }

    return draft;
  }, []);

  const dismissOffer = useCallback(() => {
    offerRef.current = null;
    if (mountedRef.current) setOffer(null);
  }, []);

  const clear = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    lastSentRef.current = null;
    offerRef.current = null;
    offerSavedAtRef.current = null;

    if (mountedRef.current) {
      setOffer(null);
      setOfferSavedAt(null);
      setSavedAt(null);
      setStatus("idle");
    }

    if (!availableRef.current) return;

    try {
      const response = await fetch(ENDPOINT, { method: "DELETE" });
      if (response.status === 401) markUnavailable();
    } catch {
      // Deleting is best-effort: the row is per-user, and the next save
      // overwrites it anyway.
    }
  }, [markUnavailable]);

  // Look up an existing draft once, and offer it.
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setIsLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setIsLoading(true);

    const load = (async () => {
      try {
        const response = await fetch(
          `${ENDPOINT}?kind=${encodeURIComponent(kind)}`,
          { headers: { Accept: "application/json" } },
        );

        if (response.status === 401) {
          // Not signed in: the signup form itself runs this way until the
          // account exists. That is normal, not an error.
          markUnavailable();
          return;
        }
        if (!response.ok) return;

        const body = (await response.json().catch(() => null)) as {
          draft?: { data?: unknown; updatedAt?: string } | null;
        } | null;

        const draft = body?.draft;
        if (!draft) return;

        const clean = sanitizeDraft(kind, draft.data);
        if (!hasDraftContent(kind, clean)) return;

        offerRef.current = clean;
        offerSavedAtRef.current = draft.updatedAt ?? null;
        if (mountedRef.current) {
          setOffer(clean);
          setOfferSavedAt(draft.updatedAt ?? null);
        }
      } catch {
        // Offline or the endpoint is unreachable. Nothing has been lost yet, so
        // stay silent rather than alarming someone who has typed nothing.
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    })();

    loadRef.current = load;

    return () => {
      mountedRef.current = false;
    };
  }, [enabled, kind, markUnavailable]);

  // Deliver whatever is queued when the page goes away or the tab is hidden —
  // on mobile, "hidden" is far more common than an actual unmount.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const flushPending = (keepalive: boolean) => {
      const payload = pendingRef.current;
      if (!payload || !availableRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void writeRef.current(payload, keepalive);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPending(true);
    };
    const onOnline = () => {
      setIsOffline(false);
      flushPending(false);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      flushPending(true);
    };
  }, []);

  const savedAtLabel = useMemo(
    () => (savedAt ? formatDraftTimestamp(savedAt) : null),
    [savedAt],
  );

  const offerSavedAtLabel = useMemo(
    () => (offerSavedAt ? formatDraftTimestamp(offerSavedAt) : null),
    [offerSavedAt],
  );

  const statusLabel = useMemo(() => {
    if (!isAvailable) return null;
    if (status === "saving") return "Menyimpan draf...";
    if (status === "saved") return `Draf tersimpan ${formatDraftTimestamp(savedAt)}`;
    if (status === "error") {
      return isOffline
        ? "Kamu sedang offline. Draf tersimpan otomatis begitu koneksi kembali."
        : "Draf belum tersimpan. Kami coba lagi otomatis.";
    }
    return null;
  }, [status, savedAt, isOffline, isAvailable]);

  return {
    status,
    savedAt,
    savedAtLabel,
    statusLabel,
    isLoading,
    isAvailable,
    offer,
    offerSavedAt,
    offerSavedAtLabel,
    save,
    flush,
    restore,
    dismissOffer,
    clear,
  };
}

export default useDraft;
