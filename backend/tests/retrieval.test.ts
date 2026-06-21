import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../src/rag/vector-store';

describe('Vector Store & Retrieval', () => {
  it('calculates cosine similarity correctly', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];
    const vecD = [0.707106, 0.707106, 0]; 
    
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0);
    expect(cosineSimilarity(vecA, vecD)).toBeCloseTo(0.707106);
  });
});
