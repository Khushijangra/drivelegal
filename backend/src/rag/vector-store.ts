import { pipeline, env } from '@xenova/transformers';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Dynamically resolve cache directory
async function setupCacheDir() {
  const possiblePaths = [
    path.resolve(process.cwd(), 'data/models'),
    path.resolve(process.cwd(), 'backend/data/models'),
    path.resolve(__dirname, '../../data/models')
  ];
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      env.cacheDir = p;
      return;
    } catch {}
  }
  env.cacheDir = possiblePaths[0];
}
setupCacheDir().catch(() => {});

export interface VectorEntry {
  chunkId: string;
  documentId: string;
  embedding: number[];
}

export interface SearchResult {
  chunkId: string;
  score: number;
}

export interface RuleVectorEntry {
  ruleId: string;
  embedding: number[];
}

export interface RuleSearchResult {
  ruleId: string;
  score: number;
}

let extractor: any = null;

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

  if (apiKey) {
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI embedding failed: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.data[0].embedding;
    } catch (e) {
      console.warn("OpenAI embedding failed, falling back to Xenova", e);
    }
  }

  // Xenova fallback
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let indexCache: VectorEntry[] | null = null;

async function getIndexPath(): Promise<string> {
  const possiblePaths = [
    path.resolve(process.cwd(), 'data/vector.index.json'),
    path.resolve(process.cwd(), 'backend/data/vector.index.json'),
    path.resolve(__dirname, '../../data/vector.index.json'),
    path.resolve(__dirname, '../../../data/vector.index.json')
  ];
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  return possiblePaths[0];
}

async function getRuleIndexPath(): Promise<string> {
  const possiblePaths = [
    path.resolve(process.cwd(), 'data/rules.vector.index.json'),
    path.resolve(process.cwd(), 'backend/data/rules.vector.index.json'),
    path.resolve(__dirname, '../../data/rules.vector.index.json'),
    path.resolve(__dirname, '../../../data/rules.vector.index.json')
  ];
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  return possiblePaths[0];
}

export async function loadIndex(): Promise<VectorEntry[]> {
  if (indexCache) return indexCache;
  try {
    const p = await getIndexPath();
    const raw = await fs.readFile(p, 'utf-8');
    indexCache = JSON.parse(raw);
    return indexCache!;
  } catch (e) {
    console.warn("Index not found or invalid, returning empty.");
    indexCache = [];
    return indexCache;
  }
}

export async function saveIndex(entries: VectorEntry[]): Promise<void> {
  const p = await getIndexPath();
  await fs.writeFile(p, JSON.stringify(entries), 'utf-8');
  indexCache = entries;
}

export async function searchSimilar(queryEmbedding: number[], topK: number = 20): Promise<SearchResult[]> {
  const index = await loadIndex();
  
  if (index.length === 0) return [];
  
  // Dimensionality check
  if (index[0].embedding.length !== queryEmbedding.length) {
    console.warn(`Dimensionality mismatch! Index: ${index[0].embedding.length}, Query: ${queryEmbedding.length}. Ensure model consistency.`);
    // If there's a mismatch, we can't reliably do cosine similarity across all vectors
    // Return empty to fallback fully to BM25
    return [];
  }

  const scores = index.map(entry => ({
    chunkId: entry.chunkId,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

let ruleIndexCache: RuleVectorEntry[] | null = null;

export async function loadRuleIndex(): Promise<RuleVectorEntry[]> {
  if (ruleIndexCache) return ruleIndexCache;
  try {
    const p = await getRuleIndexPath();
    const raw = await fs.readFile(p, 'utf-8');
    ruleIndexCache = JSON.parse(raw);
    return ruleIndexCache!;
  } catch (e) {
    console.warn("Rule Index not found or invalid, returning empty.");
    ruleIndexCache = [];
    return ruleIndexCache;
  }
}

export async function saveRuleIndex(entries: RuleVectorEntry[]): Promise<void> {
  const p = await getRuleIndexPath();
  await fs.writeFile(p, JSON.stringify(entries), 'utf-8');
  ruleIndexCache = entries;
}

export async function searchSimilarRules(queryEmbedding: number[], topK: number = 20): Promise<RuleSearchResult[]> {
  const index = await loadRuleIndex();
  
  if (index.length === 0) return [];
  
  if (index[0].embedding.length !== queryEmbedding.length) {
    console.warn(`Dimensionality mismatch! Index: ${index[0].embedding.length}, Query: ${queryEmbedding.length}.`);
    return [];
  }

  const scores = index.map(entry => ({
    ruleId: entry.ruleId,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}
