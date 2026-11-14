import { describe, expect, it } from "vitest";

import { suspensionNotice } from "@/features/agents/suspension-notice";

describe("suspensionNotice", () => {
  it("shows the moderator's reason verbatim", () => {
    expect(suspensionNotice("Three seekers report deposits taken for rooms that were not available.").reason).toBe(
      "Three seekers report deposits taken for rooms that were not available.",
    );
  });

  it("says plainly when no reason was recorded rather than showing nothing", () => {
    for (const reason of [null, undefined, "", "  "]) {
      expect(suspensionNotice(reason).reason).toBe("No details were recorded.");
    }
  });

  it("says what suspension costs: hidden, and nothing goes to review", () => {
    const { effects } = suspensionNotice("x");

    expect(effects.join(" ")).toMatch(/hidden from seekers/);
    expect(effects.join(" ")).toMatch(/cannot send listings or changes for review/);
  });

  it("says what continues, so seekers mid-conversation are not abandoned", () => {
    // ADR-017-A1: suspension must not strand seekers who have done nothing
    // wrong. An agent who believes everything stopped would do exactly that.
    expect(suspensionNotice("x").continues).toMatch(/conversations and inspections carry on/);
  });

  it("routes to a person, and does not blame the agent", () => {
    const notice = suspensionNotice("x");
    const text = [notice.heading, ...notice.effects, notice.continues, notice.nextStep].join(" ");

    expect(notice.nextStep).toMatch(/WhatsApp/);
    expect(text).not.toMatch(/\b(you violated|your fault|banned|penalt)/i);
  });
});
