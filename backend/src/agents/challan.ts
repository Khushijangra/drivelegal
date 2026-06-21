import type { ChallanRequest, ChallanResult, RuleRecord } from "../types";

function normalizeVehicleClass(vehicleClass: string): string {
  return vehicleClass.trim().toUpperCase();
}

function matchesVehicleClass(ruleVehicleClass: string, requestedVehicleClass: string): boolean {
  const normalizedRule = normalizeVehicleClass(ruleVehicleClass);
  const normalizedRequest = normalizeVehicleClass(requestedVehicleClass);
  return normalizedRule === "*" || normalizedRule === normalizedRequest;
}

function selectRuleForOffense(rules: RuleRecord[], offenseCode: string, vehicleClass: string): RuleRecord | undefined {
  const exactMatches = rules.filter((rule) => rule.offenseCode === offenseCode && matchesVehicleClass(rule.vehicleClass, vehicleClass));
  if (exactMatches.length === 0) {
    return undefined;
  }

  return exactMatches.sort((left, right) => {
    const vehicleScore = scoreVehicleClassSpecificity(right.vehicleClass) - scoreVehicleClassSpecificity(left.vehicleClass);
    if (vehicleScore !== 0) {
      return vehicleScore;
    }
    return new Date(right.effectiveFrom).getTime() - new Date(left.effectiveFrom).getTime();
  })[0];
}

function scoreVehicleClassSpecificity(vehicleClass: string): number {
  return normalizeVehicleClass(vehicleClass) === "*" ? 0 : 1;
}

export function calculateChallan(request: ChallanRequest, rules: RuleRecord[]): ChallanResult {
  const matchedRules: RuleRecord[] = [];
  const missingOffenses: string[] = [];

  for (const offenseCode of request.offenseCodes) {
    const rule = selectRuleForOffense(rules, offenseCode, request.vehicleClass);
    if (rule) {
      matchedRules.push(rule);
    } else {
      missingOffenses.push(offenseCode);
    }
  }

  const items = matchedRules.map((rule) => ({
    offenseCode: rule.offenseCode,
    description: rule.description,
    baseFine: rule.baseFine,
    compoundingFine: rule.compoundingFine,
    demeritPoints: rule.demeritPoints,
    sourceClause: rule.sourceReference.sourceClause,
    sourceReference: rule.sourceReference,
  }));

  const baseSubtotal = items.reduce((sum, item) => sum + item.baseFine, 0);
  const compoundingSubtotal = items.reduce((sum, item) => sum + item.compoundingFine, 0);
  const adjustments = computeAdjustments(baseSubtotal, compoundingSubtotal, request.modifiers);
  const total = baseSubtotal + compoundingSubtotal + adjustments;

  const warnings: string[] = [];
  if (missingOffenses.length > 0) {
    warnings.push(`No rule found for: ${missingOffenses.join(", ")}`);
  }
  if (request.modifiers?.repeatOffense) {
    warnings.push("Repeat offense modifier applied deterministically.");
  }
  if (request.modifiers?.commercialVehicle) {
    warnings.push("Commercial vehicle modifier applied deterministically.");
  }
  if (request.modifiers?.courtCompounding) {
    warnings.push("Court compounding modifier applied deterministically.");
  }

  return {
    stateCode: request.stateCode,
    vehicleClass: request.vehicleClass,
    currency: "INR",
    items,
    jurisdictionChain: [],
    subtotal: baseSubtotal + compoundingSubtotal,
    adjustments,
    total,
    warnings,
  };
}

function computeAdjustments(baseSubtotal: number, compoundingSubtotal: number, modifiers?: ChallanRequest["modifiers"]): number {
  let adjustments = 0;
  if (modifiers?.repeatOffense) {
    adjustments += Math.max(0, Math.round(baseSubtotal * 0.5));
  }
  if (modifiers?.commercialVehicle) {
    adjustments += Math.max(0, Math.round(baseSubtotal * 0.1));
  }
  if (modifiers?.courtCompounding) {
    adjustments += compoundingSubtotal;
  }
  return adjustments;
}
