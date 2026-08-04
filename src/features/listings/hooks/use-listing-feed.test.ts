import { describe, expect, it } from "vitest";

import { buildFeedCacheKey } from "@/features/listings/hooks/use-listing-feed";

describe("buildFeedCacheKey", () => {
  it("namespaces the key so it cannot collide with other session data", () => {
    expect(buildFeedCacheKey("")).toBe("ruvo:feed:");
  });

  it("varies with the filter query so each filter set restores separately", () => {
    expect(buildFeedCacheKey("area=Hill+Top")).toBe("ruvo:feed:area=Hill+Top");
    expect(buildFeedCacheKey("area=Hill+Top")).not.toBe(
      buildFeedCacheKey("area=Odenigbo"),
    );
  });
});
