/**
 * The view-session id.
 *
 * Two behaviours matter and they are opposites, which is why both are here:
 * the id must be STABLE when storage works, because that is what makes a
 * refresh one person rather than two; and it must be FRESH on every call when
 * storage does not, because the alternative — a single shared fallback id, or
 * deduplicating on the server's ip_hash — merges unrelated people behind one
 * address into a single view and under-reports the busiest listings. See 0033.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrCreateViewSessionId } from "@/features/listings/view-session";

type StorageStub = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function withStorage(storage: StorageStub) {
  vi.stubGlobal("window", { localStorage: storage });
}

function workingStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    store,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOrCreateViewSessionId", () => {
  it("returns the same id on every call once storage holds one", () => {
    withStorage(workingStorage());

    const first = getOrCreateViewSessionId();
    const second = getOrCreateViewSessionId();

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(8);
  });

  it("reuses an id a previous visit already stored", () => {
    const storage = workingStorage();
    storage.store.set("ruvo:view-session", "already-here");
    withStorage(storage);

    expect(getOrCreateViewSessionId()).toBe("already-here");
  });

  it("persists under the namespaced key, not a bare one", () => {
    const storage = workingStorage();
    withStorage(storage);

    const id = getOrCreateViewSessionId();

    // The namespace matters: this shares an origin with the feed snapshot
    // cache, which already uses `ruvo:`.
    expect(storage.store.get("ruvo:view-session")).toBe(id);
  });

  it("returns a FRESH id per call when reading storage throws", () => {
    // Private modes and browsers set to block site data throw here rather than
    // returning null.
    withStorage({
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {},
    });

    const first = getOrCreateViewSessionId();
    const second = getOrCreateViewSessionId();

    // Different, deliberately. A stable fallback id would make every
    // storage-blocked visitor the same person.
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThan(8);
  });

  it("still returns an id when writing storage throws", () => {
    // Reading can succeed while writing fails — Safari private mode did
    // exactly this for years. A throw here would take the beacon down, and
    // BR-ANA-003 says analytics must never break the page it measures.
    withStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });

    expect(() => getOrCreateViewSessionId()).not.toThrow();
    expect(getOrCreateViewSessionId().length).toBeGreaterThan(8);
  });

  it("does not throw when there is no window at all", () => {
    // Server-side import, or a prerender pass.
    vi.stubGlobal("window", undefined);

    expect(() => getOrCreateViewSessionId()).not.toThrow();
  });
});
