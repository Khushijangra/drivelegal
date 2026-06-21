/**
 * download-boundaries.ts
 *
 * DB-FREE script to download India administrative boundary GeoJSON from GADM.
 *
 * GADM (Global Administrative Areas) Source:
 *   Organization:   University of Berkeley / GADM project
 *   URL:            https://gadm.org/download_country.html
 *   Data:           India Level 1 (States), Level 2 (Districts)
 *   Format:         GeoJSON
 *   SRID:           4326 (WGS84)
 *   Reliability:    HIGH — derived from Census of India boundaries
 *   License:        Free for non-commercial research/educational use
 *   Why used:       Census of India shapefiles require registration;
 *                   GADM provides equivalent coverage for research use.
 *
 * Usage:
 *   npm --workspace backend run download:boundaries
 */
import path from 'node:path';
import fs from 'node:fs/promises';

const BOUNDARIES_DIR = path.resolve(__dirname, '../../data/boundaries');

// GADM 4.1 India GeoJSON download URLs
const SOURCES = [
  {
    id: 'gadm41_IND_1',
    name: 'India States and Union Territories (Level 1)',
    url: 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_IND_1.json',
    outputFile: 'gadm41_IND_1.json',
    minExpectedFeatures: 30,
  },
  {
    id: 'gadm41_IND_2',
    name: 'India Districts (Level 2)',
    url: 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_IND_2.json',
    outputFile: 'gadm41_IND_2.json',
    minExpectedFeatures: 500,
  },
];

async function downloadFile(url: string, outputPath: string): Promise<{ sizeBytes: number; features: number }> {
  console.log(`Downloading: ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DriveLegal/1.0 (drivelegal-research; educational-use)' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = Buffer.from(buffer);
  await fs.writeFile(outputPath, bytes);

  // Validate GeoJSON
  const json = JSON.parse(bytes.toString('utf-8'));
  const features: number = json.features?.length ?? 0;

  return { sizeBytes: bytes.length, features };
}

async function main(): Promise<void> {
  await fs.mkdir(BOUNDARIES_DIR, { recursive: true });

  console.log('DriveLegal — Downloading India administrative boundaries from GADM 4.1');
  console.log('Source: https://gadm.org/download_country.html');
  console.log('='.repeat(70));

  const results: Array<{ id: string; status: 'ok' | 'fail'; features?: number; sizeBytes?: number; error?: string }> = [];

  for (const source of SOURCES) {
    const outputPath = path.join(BOUNDARIES_DIR, source.outputFile);

    // Check if already downloaded
    try {
      const stat = await fs.stat(outputPath);
      if (stat.size > 10000) {
        const existing = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
        const features = existing.features?.length ?? 0;
        console.log(`[SKIP] ${source.id} already on disk (${features} features, ${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        results.push({ id: source.id, status: 'ok', features, sizeBytes: stat.size });
        continue;
      }
    } catch { /* not on disk — download */ }

    try {
      const { sizeBytes, features } = await downloadFile(source.url, outputPath);

      if (features < source.minExpectedFeatures) {
        throw new Error(`Expected ≥${source.minExpectedFeatures} features, got ${features}`);
      }

      console.log(`✅ ${source.id}: ${features} features, ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`);
      results.push({ id: source.id, status: 'ok', features, sizeBytes });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${source.id}: ${error}`);
      results.push({ id: source.id, status: 'fail', error });
    }
  }

  const summaryPath = path.join(BOUNDARIES_DIR, 'download-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({ downloadedAt: new Date().toISOString(), results }, null, 2), 'utf-8');

  const ok = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log(`\nComplete: ${ok} downloaded, ${failed} failed`);
  console.log(`Summary: ${summaryPath}`);

  if (failed > 0) {
    console.error('\nSome downloads failed. GADM may be rate-limiting.');
    console.error('Manual download: https://gadm.org/download_country.html → India → Level 1 & 2 GeoJSON');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Download failed:', err);
  process.exitCode = 1;
});
