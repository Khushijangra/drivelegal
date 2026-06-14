#!/usr/bin/env tsx
/**
 * evaluate-vision.ts — Full benchmark evaluation script
 *
 * Usage: npm run evaluate:vision
 *
 * Iterates all benchmark categories in backend/data/benchmark/,
 * runs actual model inference on each image,
 * and prints TP, FP, TN, FN, Precision, Recall, F1, and Average Latency.
 */

import * as path from 'node:path';
import { evaluateVisionDataset } from '../services/vision';

const BENCHMARK_CATEGORIES = [
  'helmet_present',
  'helmet_absent',
  'seatbelt_present',
  'seatbelt_absent',
  'pothole',
];

interface EvalResult {
  category: string;
  imagesEvaluated: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  averageLatencyMs: number;
}

function printDivider() {
  console.log('─'.repeat(80));
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           DriveLegal Vision Evaluation Suite — Real Model Inference          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const results: EvalResult[] = [];
  const suiteStart = Date.now();

  for (const category of BENCHMARK_CATEGORIES) {
    console.log(`\n▶ Evaluating: ${category}`);
    printDivider();

    const start = Date.now();
    let result;
    try {
      result = await evaluateVisionDataset(category);
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`);
      continue;
    }
    const elapsed = Date.now() - start;

    if (result.imagesEvaluated === 0) {
      console.log(`  No images found in benchmark/${category} — skipping.`);
      continue;
    }

    console.log(`  Images evaluated : ${result.imagesEvaluated}`);
    console.log(`  True Positives   : ${result.truePositives}`);
    console.log(`  False Positives  : ${result.falsePositives}`);
    console.log(`  True Negatives   : ${result.trueNegatives}`);
    console.log(`  False Negatives  : ${result.falseNegatives}`);
    console.log(`  Precision        : ${pct(result.precision)}`);
    console.log(`  Recall           : ${pct(result.recall)}`);
    console.log(`  F1 Score         : ${pct(result.f1)}`);
    console.log(`  Avg Latency      : ${result.averageLatencyMs.toFixed(0)} ms/image`);
    console.log(`  Category time    : ${(elapsed / 1000).toFixed(1)}s`);

    results.push({ category, ...result });
  }

  // ── Aggregate Summary ──
  printDivider();
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         AGGREGATE EVALUATION SUMMARY      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (results.length === 0) {
    console.log('  No categories evaluated. Ensure benchmark images exist in backend/data/benchmark/');
    process.exit(1);
  }

  let totalTP = 0, totalFP = 0, totalTN = 0, totalFN = 0, totalImages = 0, totalLatency = 0;
  for (const r of results) {
    totalTP += r.truePositives;
    totalFP += r.falsePositives;
    totalTN += r.trueNegatives;
    totalFN += r.falseNegatives;
    totalImages += r.imagesEvaluated;
    totalLatency += r.averageLatencyMs * r.imagesEvaluated;
  }

  const aggPrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const aggRecall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
  const aggF1 = aggPrecision + aggRecall > 0 ? (2 * aggPrecision * aggRecall) / (aggPrecision + aggRecall) : 0;
  const aggLatency = totalImages > 0 ? totalLatency / totalImages : 0;

  console.log(`  Total Images     : ${totalImages}`);
  console.log(`  True Positives   : ${totalTP}`);
  console.log(`  False Positives  : ${totalFP}`);
  console.log(`  True Negatives   : ${totalTN}`);
  console.log(`  False Negatives  : ${totalFN}`);
  console.log(`  Precision        : ${pct(aggPrecision)}`);
  console.log(`  Recall           : ${pct(aggRecall)}`);
  console.log(`  F1 Score         : ${pct(aggF1)}`);
  console.log(`  Avg Latency      : ${aggLatency.toFixed(0)} ms/image`);
  console.log(`  Total Suite Time : ${((Date.now() - suiteStart) / 1000).toFixed(1)}s`);

  // ── Per-category table ──
  console.log('\n┌────────────────────┬──────┬────┬────┬────┬────┬────────────┬────────┬────────┐');
  console.log('│ Category           │ Imgs │ TP │ FP │ TN │ FN │ Precision  │ Recall │   F1   │');
  console.log('├────────────────────┼──────┼────┼────┼────┼────┼────────────┼────────┼────────┤');
  for (const r of results) {
    const cat = r.category.padEnd(18).slice(0, 18);
    console.log(
      `│ ${cat} │ ${String(r.imagesEvaluated).padStart(4)} │ ${String(r.truePositives).padStart(2)} │ ${String(r.falsePositives).padStart(2)} │ ${String(r.trueNegatives).padStart(2)} │ ${String(r.falseNegatives).padStart(2)} │ ${pct(r.precision).padStart(10)} │ ${pct(r.recall).padStart(6)} │ ${pct(r.f1).padStart(6)} │`
    );
  }
  console.log('└────────────────────┴──────┴────┴────┴────┴────┴────────────┴────────┴────────┘\n');

  // Save results to JSON
  const outputPath = path.resolve(__dirname, '../../data/evaluation_results.json');
  const fs = await import('node:fs');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        aggregate: { totalImages, totalTP, totalFP, totalTN, totalFN, aggPrecision, aggRecall, aggF1, avgLatencyMs: aggLatency },
        categories: results,
      },
      null,
      2
    )
  );
  console.log(`  Results saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
