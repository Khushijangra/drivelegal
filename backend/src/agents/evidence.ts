import { EvidenceBundle, JurisdictionRecord } from '../types';

export interface EvidenceBundleInput {
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

export function buildEvidenceBundle(query: string, jurisdiction: JurisdictionRecord[], items: EvidenceBundleInput[]): EvidenceBundle {
  return {
    id: `evidence-${Date.now()}`,
    query,
    jurisdiction,
    generatedAt: new Date().toISOString(),
    items: items.map((item) => ({
      documentId: item.documentId,
      documentTitle: item.documentTitle,
      organization: item.organization,
      sourceUrl: item.sourceUrl,
      pageNumber: item.pageNumber,
      excerpt: item.excerpt.trim(),
      ocrConfidence: roundConfidence(item.ocrConfidence),
      retrievalConfidence: roundConfidence(item.retrievalConfidence),
      ingestionTimestamp: item.ingestionTimestamp,
      chunkId: item.chunkId,
      cropUrl: item.cropUrl ?? null,
    })),
  };
}

function roundConfidence(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return Math.round(bounded * 1000) / 1000;
}
