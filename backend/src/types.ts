export type JurisdictionLevel = 'country' | 'state' | 'district' | 'city' | 'local';

export interface OfficialSource {
  id: string;
  organization: string;
  name: string;
  url: string;
  format: string;
  updateFrequency: string;
  reliability: 'very-high' | 'high' | 'medium';
  coverage: string;
  keyFields: string[];
  integrationDifficulty: 'low' | 'medium' | 'high';
  expectedImpact: 'very-high' | 'high' | 'medium';
}

export interface EvidenceReference {
  documentId: string;
  documentTitle: string;
  organization: string | null;
  sourceUrl: string;
  pageNumber: number;
  excerpt: string;
  ocrConfidence: number;
  retrievalConfidence: number;
  ingestionTimestamp: string;
  chunkId?: string;
  cropUrl?: string | null;
}

export interface EvidenceBundle {
  id: string;
  query: string;
  jurisdiction: JurisdictionRecord[];
  items: EvidenceReference[];
  generatedAt: string;
}

export interface JurisdictionRecord {
  id: string;
  name: string;
  code: string;
  type: JurisdictionLevel;
  level: JurisdictionLevel;
  priority: number;
  parentId?: string | null;
}

export type JurisdictionNode = JurisdictionRecord;

export interface RuleRecord {
  id: string;
  offenseCode: string;
  description: string;
  stateCode: string;
  vehicleClass: string;
  baseFine: number;
  compoundingFine: number;
  demeritPoints: number;
  effectiveFrom: string;
  sourceReference: {
    id: string;
    sourceId: string;
    sourceUrl: string;
    documentId: string;
    pageNumber: number;
    sourceClause: string;
    extractedAt: string;
  };
}

export interface ChallanModifierSet {
  repeatOffense?: boolean;
  commercialVehicle?: boolean;
  courtCompounding?: boolean;
}

export interface ChallanRequest {
  stateCode: string;
  vehicleClass: string;
  offenseCodes: string[];
  modifiers?: ChallanModifierSet;
}

export interface ChallanLineItem {
  offenseCode: string;
  description: string;
  baseFine: number;
  compoundingFine: number;
  demeritPoints: number;
  sourceClause: string;
  sourceReference: RuleRecord['sourceReference'];
}

export interface ChallanResult {
  stateCode: string;
  vehicleClass: string;
  currency: 'INR';
  items: ChallanLineItem[];
  jurisdictionChain: JurisdictionRecord[];
  subtotal: number;
  adjustments: number;
  total: number;
  warnings: string[];
}

export interface QueryRequest {
  question: string;
  lat?: number;
  lon?: number;
  stateCode?: string;
  vehicleClass?: string;
  offenseCodes?: string[];
}

export interface QueryResponse {
  answer: string;
  jurisdictionChain: JurisdictionRecord[];
  evidenceBundle: EvidenceBundle;
  challan?: ChallanResult | null;
  confidence: number;
  disclaimers: string[];
}
