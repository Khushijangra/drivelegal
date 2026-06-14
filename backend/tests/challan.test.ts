import { describe, expect, it } from "vitest";
import { calculateChallan } from "../src/services/challan";
import type { RuleRecord } from "../src/types";

const sourceReference: RuleRecord["sourceReference"] = {
  id: "prov-1",
  sourceId: "doc-1",
  sourceUrl: "https://morth.nic.in",
  documentId: "doc-1",
  pageNumber: 12,
  sourceClause: "Rule 10",
  extractedAt: "2024-01-01T00:00:00.000Z",
};

const baseRule = {
  id: "rule-base",
  offenseCode: "OVERSPEED",
  description: "Overspeeding",
  stateCode: "DL",
  vehicleClass: "LMV",
  baseFine: 1000,
  compoundingFine: 500,
  demeritPoints: 3,
  effectiveFrom: "2024-01-01",
  sourceReference,
} satisfies RuleRecord;

describe("calculateChallan", () => {
  it("returns deterministic totals for matching offenses", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["OVERSPEED"] },
      [baseRule],
    );

    expect(result.total).toBe(1500);
    expect(result.items[0]?.sourceReference.sourceUrl).toContain("morth.nic.in");
  });

  it("applies repeat offense and commercial vehicle modifiers deterministically", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["SEATBELT"],
        modifiers: { repeatOffense: true, commercialVehicle: true },
      },
      [
        {
          id: "rule-2",
          offenseCode: "SEATBELT",
          description: "Seatbelt violation",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 500,
          compoundingFine: 250,
          demeritPoints: 2,
          effectiveFrom: "2024-01-01",
          sourceReference: {
            id: "prov-2",
            sourceId: "doc-2",
            sourceUrl: "https://egazette.nic.in",
            documentId: "doc-2",
            pageNumber: 4,
            sourceClause: "Section 4",
            extractedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      ],
    );

    expect(result.total).toBe(1050);
    expect(result.warnings).toContain("Repeat offense modifier applied deterministically.");
  });

  it("uses wildcard rules when no exact vehicle class exists", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "HMV", offenseCodes: ["PARKING"] },
      [
        {
          id: "rule-3",
          offenseCode: "PARKING",
          description: "Illegal parking",
          stateCode: "DL",
          vehicleClass: "*",
          baseFine: 750,
          compoundingFine: 0,
          demeritPoints: 1,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(750);
    expect(result.items[0]?.sourceReference.pageNumber).toBe(12);
  });

  it("prefers exact vehicle class over wildcard", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["PARKING"] },
      [
        {
          id: "rule-4",
          offenseCode: "PARKING",
          description: "Wildcard parking",
          stateCode: "DL",
          vehicleClass: "*",
          baseFine: 100,
          compoundingFine: 0,
          demeritPoints: 0,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
        {
          id: "rule-5",
          offenseCode: "PARKING",
          description: "LMV parking",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 300,
          compoundingFine: 100,
          demeritPoints: 1,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(400);
    expect(result.items[0]?.description).toBe("LMV parking");
  });

  it("selects the newest effective rule when duplicates exist", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["OVERSPEED"] },
      [
        {
          id: "rule-old",
          offenseCode: "OVERSPEED",
          description: "Old overspeed",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 500,
          compoundingFine: 200,
          demeritPoints: 1,
          effectiveFrom: "2023-01-01",
          sourceReference,
        },
        {
          id: "rule-new",
          offenseCode: "OVERSPEED",
          description: "New overspeed",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 1000,
          compoundingFine: 500,
          demeritPoints: 3,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(1500);
    expect(result.items[0]?.description).toBe("New overspeed");
  });

  it("flags missing offenses", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["UNKNOWN"] },
      [],
    );

    expect(result.total).toBe(0);
    expect(result.warnings[0]).toContain("UNKNOWN");
  });

  it("aggregates multiple offenses deterministically", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["OVERSPEED", "SEATBELT"] },
      [
        {
          id: "rule-6",
          offenseCode: "OVERSPEED",
          description: "Overspeeding",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 1000,
          compoundingFine: 500,
          demeritPoints: 3,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
        {
          id: "rule-7",
          offenseCode: "SEATBELT",
          description: "Seatbelt",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 500,
          compoundingFine: 250,
          demeritPoints: 2,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.subtotal).toBe(2250);
    expect(result.total).toBe(2250);
    expect(result.items).toHaveLength(2);
  });

  it("applies court compounding as a full compounding subtotal", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["SEATBELT"],
        modifiers: { courtCompounding: true },
      },
      [
        {
          id: "rule-8",
          offenseCode: "SEATBELT",
          description: "Seatbelt",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 500,
          compoundingFine: 250,
          demeritPoints: 2,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(1000);
    expect(result.adjustments).toBe(250);
  });

  it("applies all modifiers together", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["SEATBELT"],
        modifiers: { repeatOffense: true, commercialVehicle: true, courtCompounding: true },
      },
      [
        {
          id: "rule-9",
          offenseCode: "SEATBELT",
          description: "Seatbelt",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 500,
          compoundingFine: 250,
          demeritPoints: 2,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.adjustments).toBe(550);
    expect(result.total).toBe(1300);
  });

  it("keeps vehicle classes case-insensitive", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "lmv", offenseCodes: ["OVERSPEED"] },
      [
        {
          id: "rule-10",
          offenseCode: "OVERSPEED",
          description: "Overspeeding",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 1200,
          compoundingFine: 400,
          demeritPoints: 3,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(1600);
  });

  it("returns zero totals when no rules match", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["NO_RULE"] },
      [
        {
          id: "rule-11",
          offenseCode: "OTHER",
          description: "Other",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 200,
          compoundingFine: 100,
          demeritPoints: 1,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("preserves source references on line items", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["OVERSPEED"] },
      [baseRule],
    );

    expect(result.items[0]?.sourceClause).toBe("Rule 10");
    expect(result.items[0]?.sourceReference.documentId).toBe("doc-1");
  });

  it("includes repeat offense warnings", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["OVERSPEED"],
        modifiers: { repeatOffense: true },
      },
      [baseRule],
    );

    expect(result.warnings).toContain("Repeat offense modifier applied deterministically.");
  });

  it("includes commercial vehicle warnings", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["OVERSPEED"],
        modifiers: { commercialVehicle: true },
      },
      [baseRule],
    );

    expect(result.warnings).toContain("Commercial vehicle modifier applied deterministically.");
  });

  it("includes court compounding warnings", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["OVERSPEED"],
        modifiers: { courtCompounding: true },
      },
      [baseRule],
    );

    expect(result.warnings).toContain("Court compounding modifier applied deterministically.");
  });

  it("keeps subtotal separate from adjustments", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["OVERSPEED"],
        modifiers: { repeatOffense: true },
      },
      [baseRule],
    );

    expect(result.subtotal).toBe(1500);
    expect(result.adjustments).toBe(500);
  });

  it("returns jurisdiction chain as an empty array for pure calculation", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["OVERSPEED"] },
      [baseRule],
    );

    expect(result.jurisdictionChain).toEqual([]);
  });

  it("handles multiple missing offense codes", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["A", "B"] },
      [],
    );

    expect(result.warnings[0]).toContain("A");
    expect(result.warnings[0]).toContain("B");
  });

  it("uses numeric rounding for repeat offense adjustments", () => {
    const result = calculateChallan(
      {
        stateCode: "DL",
        vehicleClass: "LMV",
        offenseCodes: ["OVERSPEED"],
        modifiers: { repeatOffense: true },
      },
      [
        {
          id: "rule-18",
          offenseCode: "OVERSPEED",
          description: "Overspeeding",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 999,
          compoundingFine: 1,
          demeritPoints: 3,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.adjustments).toBe(500);
  });

  it("keeps compounding at zero when absent", () => {
    const result = calculateChallan(
      { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["PARKING"] },
      [
        {
          id: "rule-19",
          offenseCode: "PARKING",
          description: "Parking",
          stateCode: "DL",
          vehicleClass: "LMV",
          baseFine: 200,
          compoundingFine: 0,
          demeritPoints: 0,
          effectiveFrom: "2024-01-01",
          sourceReference,
        },
      ],
    );

    expect(result.total).toBe(200);
  });

  it("returns predictable totals for repeated calls", () => {
    const request = { stateCode: "DL", vehicleClass: "LMV", offenseCodes: ["OVERSPEED"] };
    const rules = [baseRule];

    expect(calculateChallan(request, rules).total).toBe(calculateChallan(request, rules).total);
  });
});
