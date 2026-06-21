import { retrieveEvidence, synthesizeAnswer } from '../rag/rag';
import { getPool, closePool } from '../database/db';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const GOLDEN_QUERIES = [
  "What is the fine for driving without a helmet in Delhi?",
  "What are the rules regarding FASTag on national highways?",
  "Can I drive a commercial vehicle without a badge?",
  "Is triple riding allowed on a two-wheeler?",
  "What is the penalty for drunken driving under the Motor Vehicles Act?"
];

async function runAudit() {
  console.log("Starting Retrieval Validation Audit...");
  const results = [];
  let totalLatency = 0;
  let successful = 0;
  let failed = 0;
  const sourceDist: Record<string, number> = {};

  for (const q of GOLDEN_QUERIES) {
    console.log(`\nQuery: "${q}"`);
    const startTime = Date.now();
    
    try {
      const evidence = await retrieveEvidence(q, 'NCT', undefined, []);
      const synthesis = await synthesizeAnswer({
        question: q,
        evidence: evidence.items,
        jurisdictionSummary: 'National > NCT (Delhi)'
      });
      
      const latency = Date.now() - startTime;
      totalLatency += latency;
      
      if (evidence.items.length > 0) {
        successful++;
        evidence.items.forEach(item => {
          sourceDist[item.documentTitle] = (sourceDist[item.documentTitle] || 0) + 1;
        });
      } else {
        failed++;
      }

      results.push({
        query: q,
        success: evidence.items.length > 0,
        latencyMs: latency,
        evidenceCount: evidence.items.length,
        answer: synthesis.answer,
        confidence: synthesis.confidence,
        topSources: [...new Set(evidence.items.map(i => i.documentTitle))]
      });
      console.log(`[Success] Evidence: ${evidence.items.length}, Latency: ${latency}ms`);
    } catch (e: any) {
      failed++;
      console.error(`[Failed] ${e.message}`);
      results.push({ query: q, success: false, error: e.message });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    metrics: {
      totalQueries: GOLDEN_QUERIES.length,
      successful,
      failed,
      averageLatencyMs: Math.round(totalLatency / GOLDEN_QUERIES.length),
      evidenceCoverage: Math.round((successful / GOLDEN_QUERIES.length) * 100) + '%',
      sourceDistribution: sourceDist
    },
    queries: results
  };

  const reportPath = path.resolve(__dirname, '../../data/retrieval-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nAudit complete. Saved to ${reportPath}`);
}

runAudit()
  .then(() => closePool())
  .catch(console.error);
