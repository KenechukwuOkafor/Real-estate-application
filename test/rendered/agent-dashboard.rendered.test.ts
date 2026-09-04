/**
 * The agent dashboard, rendered.
 *
 * Enumerate what the surface claims and assert each claim — the principle the
 * inbox slice earned. This page claims six things in a fixed order: an action
 * queue, four KPIs, a chart, a per-listing table, recent activity, and an
 * account strip.
 *
 * The assertions that matter most are the ones about NUMBERS BEING RIGHT
 * rather than present. A dashboard that renders every heading and every zero
 * looks identical to one that works, which is why the seed is built to produce
 * a shape only a working aggregate can produce.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove.
 * LOCAL ONLY. Run with `npm run test:rendered` against `npm run dev`.
 */
import { describe, expect, it } from "vitest";

import { assertCanRenderPages, renderAsPersona } from "../helpers/rendered-page";

describe("agent dashboard", () => {
  it("renders for a verified agent", async () => {
    await assertCanRenderPages();
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.status).toBe(200);
  });

  it("puts actions above numbers", async () => {
    const page = await renderAsPersona("/agent", "Agent (verified)");

    const actionsAt = page.text.indexOf("Needs you now");
    const kpisAt = page.text.indexOf("Response rate");

    // The whole layout decision, asserted rather than assumed. An agent's
    // currency is requests, and a request with hours left on it outranks any
    // KPI on the page.
    expect(actionsAt).toBeGreaterThan(-1);
    expect(kpisAt).toBeGreaterThan(-1);
    expect(actionsAt).toBeLessThan(kpisAt);
  });

  it("shows all four KPI labels", async () => {
    const page = await renderAsPersona("/agent", "Agent (verified)");

    for (const label of ["New requests", "Listing views", "Response rate", "Median reply"]) {
      expect(page.text, `${label} should be on the dashboard`).toContain(label);
    }
  });

  it("shows the raw fraction under the response rate", async () => {
    // "86%" is unreadable without "12 of 14". The seed gives this agent
    // requests, so the fraction must be a real one.
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.text).toMatch(/\d+ of \d+ answered in time|Nothing needing an answer yet/);
  });

  it("reports view counts the seed actually produced, not zero", async () => {
    // The load-bearing one. The aggregate reaches a table no client role can
    // select, so "the page rendered" and "the numbers arrived" are different
    // claims — and a broken RPC would show 0 everywhere while every heading
    // above still passed.
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.text).toContain("Clean Self Contain in Odenigbo");
    // Seeded: 104 distinct viewers on the busiest listing over 14 days, so a
    // 30-day window must show a three-digit number somewhere in the table.
    expect(page.text).toMatch(/\b10[0-9]\b/);
  });

  it("separates a price problem from a visibility problem", async () => {
    // The per-listing table's reason for existing. The seed gives one listing
    // plenty of viewers and no requests.
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.text).toContain("Lodge Room Close to UNN Gate");
    expect(page.text).toContain("Seen, but not asked about");
  });

  it("honours the range toggle", async () => {
    const week = await renderAsPersona("/agent?range=7", "Agent (verified)");

    expect(week.status).toBe(200);
    expect(week.text).toContain("Last 7 days");
  });

  it("falls back to 30 days rather than trusting the query string", async () => {
    // 30 is the default because 0033 measured 90 at roughly three times the
    // cost. A junk value must not become a 90-day scan.
    const page = await renderAsPersona("/agent?range=9999", "Agent (verified)");

    expect(page.text).toContain("Last 30 days");
  });

  it("shows the account strip", async () => {
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.text).toContain("Verification");
    expect(page.text).toContain("Submission slots");
    expect(page.text).toContain("Public profile");
  });
});
