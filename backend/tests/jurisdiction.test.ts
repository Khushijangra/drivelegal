import { describe, expect, it } from "vitest";
import { orderJurisdictionChain } from "../src/services/jurisdiction";

describe("orderJurisdictionChain", () => {
  it("sorts jurisdictions from broad to specific", () => {
    const sorted = orderJurisdictionChain([
      { id: "city-1", code: "DL-CT", name: "New Delhi", type: "city", level: "city", parentId: "state-1", priority: 2 },
      { id: "nation-1", code: "IN", name: "India", type: "country", level: "country", parentId: null, priority: 0 },
      { id: "state-1", code: "DL", name: "Delhi", type: "state", level: "state", parentId: "nation-1", priority: 1 },
    ]);

    expect(sorted.map((item) => item.name)).toEqual(["India", "Delhi", "New Delhi"]);
  });
});
