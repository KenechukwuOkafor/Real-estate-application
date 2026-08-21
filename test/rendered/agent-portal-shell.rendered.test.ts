/**
 * The portal shell, rendered.
 *
 * Written against the principle the inbox slice earned the hard way: enumerate
 * what the surface claims to show, then assert each item. The shell claims five
 * destinations, an active tab, a status band of three facts, and listings
 * grouped by state — so there is a line here for each of those, including the
 * ones that would be easy to assume.
 *
 * See test/helpers/rendered-page.ts for what this can and cannot prove. The
 * mobile bar and the sidebar are both in the HTML on every render — which one a
 * person sees is a media query, and a media query is not something a fetch can
 * evaluate. What is asserted here is that both exist and carry the same
 * destinations.
 *
 * LOCAL ONLY. Run with `npm run test:rendered` against `npm run dev`.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assertCanRenderPages, renderAsPersona } from "../helpers/rendered-page";

const NAV_LABELS = ["Home", "Listings", "Requests", "Chats", "Account"];

describe("agent portal shell", () => {
  it("is reachable and wraps the portal", async () => {
    await assertCanRenderPages();
    const page = await renderAsPersona("/agent", "Agent (verified)");

    expect(page.status).toBe(200);
    expect(page.html).toContain("data-portal-shell");
  });

  it("renders every destination twice — once per layout", async () => {
    const page = await renderAsPersona("/agent", "Agent (verified)");

    // Two navigations, one item list. If somebody adds a destination to only
    // one of them, the counts stop matching.
    for (const label of NAV_LABELS) {
      const occurrences = page.html.split(`>${label}<`).length - 1;
      expect(occurrences, `${label} should appear in both navs`).toBe(2);
    }
  });

  it("marks the current tab and only the current tab", async () => {
    const page = await renderAsPersona("/agent/listings", "Agent (verified)");
    const current = page.html.split('aria-current="page"').length - 1;

    // Twice: the sidebar link and the bottom-bar link for the same tab.
    // Anything else means /agent matched a sub-route, which is the bug the
    // per-item `match` function exists to prevent.
    expect(current).toBe(2);
  });

  it("does not mark Home as current when a sub-route is open", async () => {
    const page = await renderAsPersona("/agent/inspections", "Agent (verified)");
    const homeLink = page.html.slice(page.html.indexOf('href="/agent"'));

    expect(homeLink.slice(0, 200)).not.toContain('aria-current="page"');
  });

  it("keeps the shell when an agent opens their conversations", async () => {
    // Chats is a portal tab but lives on a shared route. Without the layout
    // there, tapping it drops an agent out of the shell and the navigation
    // looks like it stopped working.
    const page = await renderAsPersona("/chats", "Agent (verified)");

    expect(page.status).toBe(200);
    expect(page.html).toContain("data-portal-shell");
  });

  it("leaves a seeker's conversations alone", async () => {
    // The paired control. Without it, "the shell renders on /chats" is equally
    // consistent with it rendering for everybody, which would put an agent
    // navigation in front of seekers.
    const page = await renderAsPersona("/chats", "Student");

    expect(page.status).toBe(200);
    expect(page.html).not.toContain("data-portal-shell");
  });

  it("still ships the rule that stands the marketing header down", () => {
    // The header is suppressed in CSS, keyed on the shell's presence, so a
    // rendered assertion cannot see it — display:none content is still in the
    // HTML. This asserts the rule itself exists, because deleting it would
    // restore a second avatar menu with nothing failing.
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).toContain("body:has([data-portal-shell]) > header");
    expect(css).toContain("display: none");
  });

  describe("the status band", () => {
    it("shows all three facts that decide what an agent can do today", async () => {
      const page = await renderAsPersona("/agent", "Agent (verified)");

      expect(page.text).toContain("Verification");
      expect(page.text).toContain("Submission slots");
      expect(page.text).toContain("Inspection requests");
    });

    it("shows the verified persona as verified rather than as a fallback", async () => {
      // The name-shaped mistake again: a band that failed to read the status
      // would render "Not started" for everyone and every assertion above
      // would still pass.
      const page = await renderAsPersona("/agent", "Agent (verified)");

      expect(page.text).toContain("Verified");
      expect(page.text).not.toContain("Not started");
    });

    it("shows an unverified agent what to do about it", async () => {
      const page = await renderAsPersona("/agent", "Agent (unverified)");

      expect(page.text).toContain("Not started");
      expect(page.text).toContain("Start verification");
    });
  });

  describe("the listings screen", () => {
    it("groups by state instead of listing everything flat", async () => {
      const page = await renderAsPersona("/agent/listings", "Agent (verified)");

      expect(page.status).toBe(200);
      expect(page.text).toContain("Live");
      expect(page.text).toContain("Drafts");
    });

    it("explains what each group means", async () => {
      const page = await renderAsPersona("/agent/listings", "Agent (verified)");

      expect(page.text).toContain("Visible to seekers");
    });
  });

  describe("account", () => {
    it("gathers verification, profile and sign-out in one place", async () => {
      const page = await renderAsPersona("/agent/account", "Agent (verified)");

      expect(page.status).toBe(200);
      expect(page.text).toContain("Verification");
      expect(page.text).toContain("Public profile");
      expect(page.text).toContain("Sign out");
    });

    it("is not reachable by a seeker", async () => {
      const page = await renderAsPersona("/agent/account", "Student");

      expect(page.status).not.toBe(200);
    });
  });
});
