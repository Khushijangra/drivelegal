export interface EvidenceItem {
  chunkId: string;
  documentId: string;
  sourceUrl: string;
  documentTitle: string;
  organization?: string | null;
  pageNumber: number;
  excerpt: string;
  cropUrl?: string | null;
  ocrConfidence?: number;
  retrievalConfidence?: number;
  ingestionTimestamp?: string;
}

export interface JurisdictionNode {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId?: string | null;
  priority: number;
}

// Matches backend ChallanLineItem exactly:
// baseFine + compoundingFine are separate — no per-item total field
export interface ChallanItem {
  offenseCode: string;
  description: string;
  baseFine: number;
  compoundingFine: number;
  demeritPoints: number;
  sourceClause: string;
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

export interface ChallanResult {
  stateCode: string;
  vehicleClass: string;
  currency: 'INR';
  items: ChallanItem[];
  jurisdictionChain: JurisdictionNode[];
  subtotal: number;
  adjustments: number;
  total: number;
  warnings: string[];
}

export interface QueryResponse {
  answer: string;
  evidenceBundle: {
    id: string;
    query: string;
    jurisdiction: JurisdictionNode[];
    items: EvidenceItem[];
    generatedAt: string;
  };
  challan?: ChallanResult;
  confidence: number;
  disclaimers: string[];
}

export interface OfficialSource {
  id: string;
  organization: string;
  name: string;
  url: string;
  format: string;
  update_frequency: string;
  reliability: string;
  coverage: string;
  key_fields: string[];
  integration_difficulty: string;
  expected_impact: string;
}

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
  verificationStatus?: 'approved' | 'rejected' | 'needs-review';
  verificationNotes?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
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

export interface VisionViolation {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  confidence: number;
  boundingBox?: [number, number, number, number];
  detectionSource?: string;
  recommendation?: string;
  failureExplanation?: string;
}

export interface RawDetection {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  detectionSource?: string;
  discarded?: boolean;
  discardReason?: string;
}

export interface OwlViTDiagnostic {
  prompt: string;
  confidence: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

export interface StageTimings {
  decodeMs: number;
  yolosMs: number;
  cropMs: number;
  classifierMs: number;
  totalMs: number;
}

export interface VisionAnalysisResult {
  safetyScore: number;
  violations: VisionViolation[];
  summary: string;
  recommendations: string[];
  modelUsed: string;
  secondaryModelUsed?: string;
  detectionEngine: string;
  inferenceTimeMs?: number;
  stageTimings: StageTimings;
  rawDetections: RawDetection[];
  filteredDetections: RawDetection[];
  discardedDetections: RawDetection[];
  stage1Detections?: any[];
  helmetDetections?: any[];
  seatbeltDetections?: any[];
  roadDetections?: any[];
  finalViolations?: VisionViolation[];
  owlViTDiagnostics?: OwlViTDiagnostic[];
}

export type SuiteType = 'Helmet' | 'Seatbelt' | 'Road Hazard' | 'Traffic' | 'Custom';

export interface EvaluationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  avgConfidence: number;
  avgInferenceTimeMs: number;
}

export interface BenchmarkCase {
  id: string;
  suite: SuiteType;
  imageSrc: string;
  groundTruth: string;
  prediction?: string;
  confidence?: number;
  inferenceTimeMs?: number;
  isCorrect?: boolean;
  failureReason?: string;
  rawAnalysisResult?: VisionAnalysisResult;
}
