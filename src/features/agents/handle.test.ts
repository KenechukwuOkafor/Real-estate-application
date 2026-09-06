import { describe, expect, it } from "vitest";

import {
  HANDLE_MAX_LENGTH,
  RESERVED_HANDLES,
  agentHandleCandidates,
  isWellFormedHandle,
  slugifyAgentHandle,
} from "@/features/agents/handle";

describe("slugifyAgentHandle", () => {
  it("lowercases and hyphenates a business name", () => {
    expect(slugifyAgentHandle("Prime Homes Nsukka")).toBe("prime-homes-nsukka");
  });

  it("drops punctuation rather than transliterating it", () => {
    expect(slugifyAgentHandle("Chidi & Sons' Properties, Ltd.")).toBe(
      "chidi-sons-properties-ltd",
    );
  });

  it("collapses runs of separators into one hyphen", () => {
    expect(slugifyAgentHandle("Campus   Keys -- Property")).toBe(
      "campus-keys-property",
    );
  });

  it("never starts or ends with a hyphen", () => {
    expect(slugifyAgentHandle("--Ugwuoba Lodge--")).toBe("ugwuoba-lodge");
  });

  it("strips accents to their base letter", () => {
    // A name typed with accents must not lose its syllables to the filter.
    expect(slugifyAgentHandle("Óbí Résidences")).toBe("obi-residences");
  });

  it("truncates without leaving a trailing hyphen", () => {
    const long = "Nsukka Student Accommodation And Property Management Services";
    const handle = slugifyAgentHandle(long);

    expect(handle.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
    expect(handle.endsWith("-")).toBe(false);
  });

  it("truncates at a word boundary when there is one to use", () => {
    // Cutting mid-word produces a handle that reads like a typo of the name.
    // The cut keeps whole words up to the limit: "-services" is what does not
    // fit, and "nsukka-student-accommodation" is 28 characters.
    expect(slugifyAgentHandle("Nsukka Student Accommodation Services")).toBe(
      "nsukka-student-accommodation",
    );
  });

  it("returns empty for a name with nothing latin in it", () => {
    // Not a fallback here. The caller decides what to do with nothing, because
    // inventing a handle silently is how an agent ends up with a URL they did
    // not recognise and will not paste.
    expect(slugifyAgentHandle("字字字")).toBe("");
  });
});

describe("isWellFormedHandle", () => {
  it.each(["prime-homes", "abc", "a1-b2-c3"])("accepts %s", (handle) => {
    expect(isWellFormedHandle(handle)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["ab", "shorter than three characters"],
    ["-leading", "leading hyphen"],
    ["trailing-", "trailing hyphen"],
    ["double--hyphen", "a doubled hyphen"],
    ["Upper-Case", "uppercase"],
    ["with space", "a space"],
    ["under_score", "an underscore"],
    ["emoji-🏠", "a non-ascii character"],
  ])("rejects %j — %s", (handle) => {
    expect(isWellFormedHandle(handle)).toBe(false);
  });

  it("rejects anything longer than the maximum", () => {
    expect(isWellFormedHandle("a".repeat(HANDLE_MAX_LENGTH + 1))).toBe(false);
  });

  it("rejects a reserved word", () => {
    // These read as Ruvo speaking rather than an agent, which is the whole
    // risk of a global namespace on a page whose job is establishing trust.
    for (const reserved of RESERVED_HANDLES) {
      expect(isWellFormedHandle(reserved)).toBe(false);
    }
  });
});

describe("agentHandleCandidates", () => {
  it("offers the plain handle first", () => {
    const [first] = agentHandleCandidates("Prime Homes Nsukka");

    expect(first).toBe("prime-homes-nsukka");
  });

  it("disambiguates with a counter, not a random suffix", () => {
    // A second Prime Homes gets prime-homes-2. Readable, and it tells the
    // agent something true: somebody got there first.
    expect(agentHandleCandidates("Prime Homes").slice(0, 3)).toEqual([
      "prime-homes",
      "prime-homes-2",
      "prime-homes-3",
    ]);
  });

  it("keeps every candidate within the length limit", () => {
    const candidates = agentHandleCandidates(
      "Nsukka Student Accommodation And Property Management",
    );

    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
      expect(isWellFormedHandle(candidate)).toBe(true);
    }
  });

  it("shortens the stem so a long name's counter still fits", () => {
    const long = "a".repeat(HANDLE_MAX_LENGTH);
    const candidates = agentHandleCandidates(long);

    expect(candidates[0]).toHaveLength(HANDLE_MAX_LENGTH);
    expect(candidates[1]).toBe(`${"a".repeat(HANDLE_MAX_LENGTH - 2)}-2`);
  });

  it("falls back to a generic stem when the name yields nothing", () => {
    // The fallback lives here rather than in slugify: this function's contract
    // is that it always returns something usable, because a profile cannot be
    // created without a handle.
    const candidates = agentHandleCandidates("字字字");

    expect(candidates[0]).toBe("agent");
    expect(isWellFormedHandle(candidates[0])).toBe(true);
  });

  it("escapes a stem that slugifies to a reserved word", () => {
    // "Admin Properties" truncated at a word boundary is "admin", which must
    // not be offered even as a first candidate.
    const candidates = agentHandleCandidates("Admin");

    expect(candidates).not.toContain("admin");
    expect(candidates[0]).toBe("admin-2");
  });

  it("pads a stem that is too short to be well formed", () => {
    // A two-letter business name is real. "Ac" cannot be a handle on its own.
    const candidates = agentHandleCandidates("Ac");

    expect(isWellFormedHandle(candidates[0])).toBe(true);
    expect(candidates[0]).toContain("ac");
  });
});
