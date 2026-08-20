import { describe, expect, it } from "vitest";

import {
  blocksNewRequest,
  effectiveInspectionStatus,
  formatTimeRemaining,
  isAwaitingResponse,
  minutesRemaining,
} from "@/features/inspections/expiry";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function request(overrides: Partial<{ expires_at: string | null; status: string }>) {
  return { expires_at: null, status: "requested", ...overrides };
}

function hoursFromNow(hours: number) {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

describe("effectiveInspectionStatus", () => {
  it("reports a request past its deadline as expired even though the column says requested", () => {
    const row = request({ expires_at: hoursFromNow(-1) });

    // The whole point of evaluating on read: the stored value is stale by
    // design and must not be believed.
    expect(row.status).toBe("requested");
    expect(effectiveInspectionStatus(row, NOW)).toBe("expired");
  });

  it("reports a request inside its window as still requested", () => {
    expect(
      effectiveInspectionStatus(request({ expires_at: hoursFromNow(1) }), NOW),
    ).toBe("requested");
  });

  it("expires exactly at the deadline rather than a moment after", () => {
    expect(
      effectiveInspectionStatus(
        request({ expires_at: NOW.toISOString() }),
        NOW,
      ),
    ).toBe("expired");
  });

  it("leaves an accepted request alone once its deadline passes", () => {
    // The deadline was the agent's window to answer. Answering ended it, and
    // an accepted visit does not evaporate 48 hours later.
    expect(
      effectiveInspectionStatus(
        request({ expires_at: hoursFromNow(-100), status: "accepted" }),
        NOW,
      ),
    ).toBe("accepted");
  });

  it.each(["declined", "cancelled", "completed"])(
    "leaves a %s request alone once its deadline passes",
    (status) => {
      expect(
        effectiveInspectionStatus(
          request({ expires_at: hoursFromNow(-100), status }),
          NOW,
        ),
      ).toBe(status);
    },
  );

  it("treats a missing deadline as open rather than guessing one", () => {
    expect(effectiveInspectionStatus(request({}), NOW)).toBe("requested");
  });
});

describe("blocksNewRequest", () => {
  it("stops a second request while one is still awaiting an answer", () => {
    expect(blocksNewRequest(request({ expires_at: hoursFromNow(5) }), NOW)).toBe(
      true,
    );
  });

  it("stops a second request while one is accepted, deadline or not", () => {
    expect(
      blocksNewRequest(
        request({ expires_at: hoursFromNow(-100), status: "accepted" }),
        NOW,
      ),
    ).toBe(true);
  });

  it("stops blocking once the request has expired", () => {
    // The defect this file exists for: an agent who did nothing at all used to
    // lock a seeker out of that listing permanently.
    expect(
      blocksNewRequest(request({ expires_at: hoursFromNow(-1) }), NOW),
    ).toBe(false);
  });

  it.each(["declined", "cancelled", "completed"])(
    "does not block after a %s request",
    (status) => {
      expect(
        blocksNewRequest(request({ expires_at: hoursFromNow(5), status }), NOW),
      ).toBe(false);
    },
  );
});

describe("isAwaitingResponse", () => {
  it("is true only while an answer can still be given", () => {
    expect(isAwaitingResponse(request({ expires_at: hoursFromNow(1) }), NOW)).toBe(
      true,
    );
    expect(isAwaitingResponse(request({ expires_at: hoursFromNow(-1) }), NOW)).toBe(
      false,
    );
  });
});

describe("minutesRemaining", () => {
  it("counts whole minutes left", () => {
    expect(minutesRemaining(request({ expires_at: hoursFromNow(2) }), NOW)).toBe(
      120,
    );
  });

  it("never goes negative", () => {
    // A countdown that has stopped counting down is not a countdown. Anything
    // past the deadline has no time left, it is expired.
    expect(minutesRemaining(request({ expires_at: hoursFromNow(-9) }), NOW)).toBe(
      null,
    );
  });

  it("does not apply to a request that has already been answered", () => {
    expect(
      minutesRemaining(
        request({ expires_at: hoursFromNow(5), status: "accepted" }),
        NOW,
      ),
    ).toBe(null);
  });
});

describe("formatTimeRemaining", () => {
  it.each([
    [null, null],
    [0, "less than a minute left"],
    [1, "1 minute left"],
    [2, "2 minutes left"],
    [59, "59 minutes left"],
    [60, "1 hour left"],
    [119, "1 hour left"],
    [120, "2 hours left"],
    [1439, "23 hours left"],
    [1440, "1 day left"],
    [2880, "2 days left"],
  ])("renders %s minutes as %s", (minutes, expected) => {
    expect(formatTimeRemaining(minutes)).toBe(expected);
  });

  it("never says '1 minutes' or '1 hours'", () => {
    // Singulars are where countdown copy usually goes wrong, and the last
    // minute is the one an agent is most likely to be looking at.
    for (const minutes of [1, 60, 1440]) {
      expect(formatTimeRemaining(minutes)).not.toMatch(/\b1 (minutes|hours|days)\b/);
    }
  });
});
