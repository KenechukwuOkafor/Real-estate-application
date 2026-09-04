import { describe, expect, it } from "vitest";

import {
  blocksNewRequest,
  conversationExists,
  effectiveInspectionStatus,
  formatTimeRemaining,
  isAwaitingCompletion,
  isAwaitingResponse,
  minutesRemaining,
} from "@/features/inspections/expiry";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function request(
  overrides: Partial<{
    completion_deadline: string | null;
    expires_at: string | null;
    responded_at: string | null;
    status: string;
  }>,
) {
  return {
    completion_deadline: null,
    expires_at: null,
    responded_at: null,
    status: "requested",
    ...overrides,
  };
}

function hoursFromNow(hours: number) {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function daysFromNow(days: number) {
  return hoursFromNow(days * 24);
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

  it("reports an accepted inspection past four days as lapsed, column unchanged", () => {
    const row = request({
      completion_deadline: daysFromNow(-1),
      status: "accepted",
    });

    // The same contract the expired case has: nothing wrote this, and the
    // stored value is stale by design.
    expect(row.status).toBe("accepted");
    expect(effectiveInspectionStatus(row, NOW)).toBe("lapsed");
  });

  it("reports an accepted inspection inside its window as still accepted", () => {
    expect(
      effectiveInspectionStatus(
        request({ completion_deadline: daysFromNow(1), status: "accepted" }),
        NOW,
      ),
    ).toBe("accepted");
  });

  it("lapses exactly at the deadline rather than a moment after", () => {
    expect(
      effectiveInspectionStatus(
        request({ completion_deadline: NOW.toISOString(), status: "accepted" }),
        NOW,
      ),
    ).toBe("lapsed");
  });

  it("treats an accepted inspection with no completion deadline as open", () => {
    // Rows accepted before the completion window existed carry no deadline.
    // They must not all read as lapsed the moment this ships.
    expect(
      effectiveInspectionStatus(request({ status: "accepted" }), NOW),
    ).toBe("accepted");
  });

  it("never lapses a cancelled inspection, deadline or not", () => {
    // The property the cancellation slice rests on: withdrawing leaves the
    // accepted state, so it leaves the window. If this ever fails, a seeker
    // pulling out starts counting against the agent again.
    expect(
      effectiveInspectionStatus(
        request({
          completion_deadline: daysFromNow(-30),
          responded_at: daysFromNow(-34),
          status: "cancelled",
        }),
        NOW,
      ),
    ).toBe("cancelled");
  });

  it.each(["declined", "cancelled", "completed"])(
    "never lapses a %s inspection, whatever deadline it carries",
    (status) => {
      expect(
        effectiveInspectionStatus(
          request({ completion_deadline: daysFromNow(-30), status }),
          NOW,
        ),
      ).toBe(status);
    },
  );

  it("does not let the request window lapse an inspection, or the completion window expire one", () => {
    // The two windows read different columns. Crossing them would resurrect
    // the bug this module exists to prevent, in a new costume.
    expect(
      effectiveInspectionStatus(
        request({ completion_deadline: daysFromNow(-9) }),
        NOW,
      ),
    ).toBe("requested");
    expect(
      effectiveInspectionStatus(
        request({ expires_at: daysFromNow(-9), status: "accepted" }),
        NOW,
      ),
    ).toBe("accepted");
  });
});

describe("conversationExists", () => {
  it("keeps the thread through every ending that had one", () => {
    for (const row of [
      request({ completion_deadline: daysFromNow(1), status: "accepted" }),
      request({ completion_deadline: daysFromNow(-1), status: "accepted" }),
      request({ status: "completed" }),
    ]) {
      expect(conversationExists(row, NOW)).toBe(true);
    }
  });

  it("offers nothing where no conversation ever happened", () => {
    for (const row of [
      request({ expires_at: hoursFromNow(5) }),
      request({ expires_at: hoursFromNow(-5) }),
      request({ responded_at: hoursFromNow(-2), status: "declined" }),
    ]) {
      expect(conversationExists(row, NOW)).toBe(false);
    }
  });

  it("splits a cancellation on whether it had been accepted", () => {
    // Withdrawing from an accepted inspection ends a real conversation both
    // parties should still be able to read. Withdrawing an unanswered request
    // ends only the asking, and its chat row was never used.
    expect(
      conversationExists(
        request({ responded_at: hoursFromNow(-30), status: "cancelled" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      conversationExists(request({ status: "cancelled" }), NOW),
    ).toBe(false);
  });
});

describe("isAwaitingCompletion", () => {
  it("is true only while the agent still has something to mark", () => {
    expect(
      isAwaitingCompletion(
        request({ completion_deadline: daysFromNow(2), status: "accepted" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isAwaitingCompletion(
        request({ completion_deadline: daysFromNow(-2), status: "accepted" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is false once the inspection is marked complete", () => {
    expect(
      isAwaitingCompletion(
        request({ completion_deadline: daysFromNow(2), status: "completed" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is false for a request nobody has answered yet", () => {
    expect(
      isAwaitingCompletion(request({ expires_at: hoursFromNow(5) }), NOW),
    ).toBe(false);
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

  it("stops blocking once an accepted inspection has lapsed", () => {
    // The same principle as the expired case: an agent's silence must not lock
    // a seeker out of a listing. Here they were accepted and then left waiting,
    // which is if anything a stronger claim to ask again.
    expect(
      blocksNewRequest(
        request({ completion_deadline: daysFromNow(-1), status: "accepted" }),
        NOW,
      ),
    ).toBe(false);
  });
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
    // Its 48-hour window closed when the agent answered. The clock it runs
    // against now is the completion deadline, which this row does not carry.
    expect(
      minutesRemaining(
        request({ expires_at: hoursFromNow(5), status: "accepted" }),
        NOW,
      ),
    ).toBe(null);
  });

  it("counts an accepted inspection down to its completion deadline", () => {
    expect(
      minutesRemaining(
        request({ completion_deadline: hoursFromNow(3), status: "accepted" }),
        NOW,
      ),
    ).toBe(180);
  });

  it("has nothing left to count once the inspection has lapsed", () => {
    expect(
      minutesRemaining(
        request({ completion_deadline: hoursFromNow(-3), status: "accepted" }),
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
