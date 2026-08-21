import { describe, expect, it } from "vitest";

import { toggleFilterValue } from "@/features/listings/filter-toggle";

describe("toggleFilterValue", () => {
  it("selects a value when nothing is selected", () => {
    expect(toggleFilterValue(null, "self_contain")).toBe("self_contain");
  });

  it("replaces a different selection rather than clearing it", () => {
    expect(toggleFilterValue("1_bedroom", "self_contain")).toBe("self_contain");
  });

  it("clears the selection when the selected value is tapped again", () => {
    // The behaviour the suggestion sheet was missing: it always returned the
    // tapped value, so the sheet could apply a type but never remove one.
    expect(toggleFilterValue("self_contain", "self_contain")).toBeUndefined();
  });
});
