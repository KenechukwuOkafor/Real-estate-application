import { describe, expect, it } from "vitest";

import { RENT_PERIOD_LABEL } from "@/features/listings/rent-period";

describe("RENT_PERIOD_LABEL", () => {
  it("is the annual label the MVP assumes", () => {
    expect(RENT_PERIOD_LABEL).toBe("per year");
  });

  it("is lower case so it reads as a suffix beside a price", () => {
    expect(RENT_PERIOD_LABEL).toBe(RENT_PERIOD_LABEL.toLowerCase());
  });
});
