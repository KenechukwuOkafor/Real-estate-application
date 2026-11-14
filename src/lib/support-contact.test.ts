import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSupportContactConfigured,
  normalizeSupportNumber,
  supportMessage,
  supportNumberProblem,
  supportWhatsappNumber,
  supportWhatsappUrl,
} from "@/lib/support-contact";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeSupportNumber", () => {
  it("accepts an international number in the forms people actually type", () => {
    expect(normalizeSupportNumber("+234 803 000 0000")).toBe("2348030000000");
    expect(normalizeSupportNumber("2348030000000")).toBe("2348030000000");
    expect(normalizeSupportNumber("+234-803-000-0000")).toBe("2348030000000");
    expect(normalizeSupportNumber("+234 (803) 000.0000")).toBe("2348030000000");
  });

  it("refuses a local-format number rather than guessing its country", () => {
    // The likeliest mistake. wa.me would open and then fail, which is worse
    // than no link at all.
    expect(normalizeSupportNumber("08030000000")).toBeNull();
  });

  it("refuses empty, too short, too long and non-numeric values", () => {
    expect(normalizeSupportNumber(undefined)).toBeNull();
    expect(normalizeSupportNumber("")).toBeNull();
    expect(normalizeSupportNumber("   ")).toBeNull();
    expect(normalizeSupportNumber("+234 803")).toBeNull();
    expect(normalizeSupportNumber("+1234567890123456")).toBeNull();
    expect(normalizeSupportNumber("call 0803")).toBeNull();
    expect(normalizeSupportNumber("+234 803 000 0000 ext 2")).toBeNull();
  });
});

describe("the build-time check", () => {
  it("refuses a build with no number, naming the variable", () => {
    expect(() => assertSupportContactConfigured({})).toThrow(
      /NEXT_PUBLIC_SUPPORT_WHATSAPP is not set/,
    );
  });

  it("refuses a build with a malformed number, not just a missing one", () => {
    // An empty-string default and a local-format number both reintroduce the
    // defect: a link that leads nowhere.
    expect(() =>
      assertSupportContactConfigured({ NEXT_PUBLIC_SUPPORT_WHATSAPP: "" }),
    ).toThrow(/not set/);
    expect(() =>
      assertSupportContactConfigured({ NEXT_PUBLIC_SUPPORT_WHATSAPP: "08030000000" }),
    ).toThrow(/country code/);
  });

  it("allows a build with a usable number", () => {
    expect(() =>
      assertSupportContactConfigured({ NEXT_PUBLIC_SUPPORT_WHATSAPP: "+234 803 000 0000" }),
    ).not.toThrow();
    expect(supportNumberProblem("+234 803 000 0000")).toBeNull();
  });
});

describe("the runtime getter", () => {
  it("throws rather than defaulting when the number is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WHATSAPP", "");
    expect(() => supportWhatsappNumber()).toThrow(/CONFIG_ENV_VAR_MISSING/);
  });

  it("returns the normalized number when it is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WHATSAPP", "+234 803 000 0000");
    expect(supportWhatsappNumber()).toBe("2348030000000");
  });
});

describe("the prefilled message", () => {
  const agent = { displayName: "Prime Homes Nsukka", handle: "prime-homes-nsukka" };

  it("says who is writing, so the answer does not start with a question", () => {
    expect(supportMessage({ agent, topic: "general" })).toBe(
      "Hi Ruvo, I'm Prime Homes Nsukka (profile: prime-homes-nsukka). I have a question about my account.",
    );
  });

  it("names the listing when the question is about one", () => {
    const message = supportMessage({
      agent,
      listing: { title: "Two Bedroom Flat at Hilltop" },
      topic: "listing_rejected_without_reason",
    });

    expect(message).toContain('"Two Bedroom Flat at Hilltop"');
    expect(message).toContain("no reason was recorded");
  });

  it("gives every topic its own sentence", () => {
    const topics = [
      "general",
      "account_suspended",
      "listing_rejected_without_reason",
      "role_not_self_service",
    ] as const;
    const messages = topics.map((topic) => supportMessage({ agent, topic }));

    expect(new Set(messages).size).toBe(topics.length);
  });

  it("still makes sense before an agent profile exists", () => {
    expect(supportMessage({ topic: "account_suspended" })).toMatch(
      /^Hi Ruvo, I'm an agent on Ruvo\./,
    );
    expect(supportMessage({ agent: { displayName: null, handle: null }, topic: "general" })).toMatch(
      /^Hi Ruvo, I'm an agent on Ruvo\./,
    );
  });

  it("does not claim to know who is writing on the role-selection path", () => {
    expect(supportMessage({ agent, topic: "role_not_self_service" })).not.toContain(
      "Prime Homes",
    );
  });
});

describe("supportWhatsappUrl", () => {
  it("builds a wa.me link with the message encoded", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WHATSAPP", "+234 803 000 0000");

    const url = new URL(
      supportWhatsappUrl({
        agent: { displayName: "Prime Homes Nsukka", handle: "prime-homes-nsukka" },
        topic: "account_suspended",
      }),
    );

    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/2348030000000");
    expect(url.searchParams.get("text")).toContain("My account shows as suspended");
  });
});
