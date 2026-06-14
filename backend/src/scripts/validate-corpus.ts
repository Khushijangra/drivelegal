/**
 * validate-corpus.ts
 *
 * DB-FREE corpus validation script.
 *
 * Reads all downloaded files in data/raw/official-corpus/,
 * runs the two-tier OCR extraction pipeline on each PDF,
 * and produces a detailed extraction statistics report.
 *
 * Usage:
 *   npm --workspace backend run validate:corpus
 *
 * Output:
 *   - Per-document extraction report (JSON lines to stdout)
 *   - Summary statistics
 *   - Writes data/raw/official-corpus/extraction-report.json
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { extractPdfWithOcrFallback } from '../services/ocr';

interface CorpusEntry {
  id: string;
  title: string;
  sourceOrganization: string;
  sourceUrl: string;
  kind: 'pdf' | 'html' | 'text';
  reliability: string;
}

interface FileReport {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  kind: 'pdf' | 'html' | 'text';
  sourceOrganization: string;
  sourceUrl: string;
  reliability: string;
  pageCount: number;
  totalCharacters: number;
  pagesWithNativeText: number;
  pagesRequiringOcr: number;
  pagesOcrSuccess: number;
  averageOcrConfidence: number;
  extractionSummary: string;
  validationStatus: 'ok' | 'warning' | 'fail';
  validationIssues: string[];
  processingTimeMs: number;
}

const CORPUS_DIR = path.resolve(__dirname, '../../data/raw/official-corpus');
const CORPUS_MANIFEST = path.resolve(__dirname, '../../data/official_corpus.json');

function validateReport(report: FileReport): void {
  if (report.totalCharacters === 0) {
    report.validationIssues.push('zero characters extracted — document may be unreadable');
    report.validationStatus = 'fail';
  } else if (report.totalCharacters < 500) {
    report.validationIssues.push(`low character count (${report.totalCharacters}) — may be mostly images or covers`);
    report.validationStatus = 'warning';
  }

  if (report.pagesRequiringOcr > 0 && report.pagesOcrSuccess === 0) {
    report.validationIssues.push('OCR required but no pages extracted successfully');
    report.validationStatus = 'fail';
  }

  if (report.averageOcrConfidence > 0 && report.averageOcrConfidence < 0.5) {
    report.validationIssues.push(`low average OCR confidence: ${(report.averageOcrConfidence * 100).toFixed(1)}%`);
    if (report.validationStatus === 'ok') {
      report.validationStatus = 'warning';
    }
  }
}

async function getTextFileStats(filePath: string): Promise<{ charCount: number }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { charCount: content.trim().length };
  } catch {
    return { charCount: 0 };
  }
}

async function processEntry(entry: CorpusEntry): Promise<FileReport> {
  const fileStem = entry.id;
  const start = Date.now();

  const report: FileReport = {
    id: entry.id,
    fileName: '',
    fileSizeBytes: 0,
    kind: entry.kind,
    sourceOrganization: entry.sourceOrganization,
    sourceUrl: entry.sourceUrl,
    reliability: entry.reliability,
    pageCount: 0,
    totalCharacters: 0,
    pagesWithNativeText: 0,
    pagesRequiringOcr: 0,
    pagesOcrSuccess: 0,
    averageOcrConfidence: 0,
    extractionSummary: '',
    validationStatus: 'ok',
    validationIssues: [],
    processingTimeMs: 0,
  };

  if (entry.kind === 'pdf') {
    const pdfPath = path.join(CORPUS_DIR, `${fileStem}.pdf`);
    const txtPath = path.join(CORPUS_DIR, `${fileStem}.txt`);

    // Check if PDF exists on disk
    try {
      const stat = await fs.stat(pdfPath);
      report.fileName = `${fileStem}.pdf`;
      report.fileSizeBytes = stat.size;
    } catch {
      report.validationIssues.push('PDF file not found on disk — run download:official-corpus first');
      report.validationStatus = 'fail';
      report.extractionSummary = 'NOT DOWNLOADED';
      report.processingTimeMs = Date.now() - start;
      return report;
    }

    // Check if we already have a .txt extract (from prior download run)
    const txtExists = await fs.stat(txtPath).then(() => true).catch(() => false);
    if (txtExists) {
      const { charCount } = await getTextFileStats(txtPath);
      if (charCount > 0) {
        // Use cached text stats without re-running OCR (saves time)
        report.totalCharacters = charCount;
        report.pageCount = 1; // conservative — pages not tracked in .txt
        report.pagesWithNativeText = 1;
        report.extractionSummary = `cached .txt: ${charCount} chars`;
        report.processingTimeMs = Date.now() - start;
        validateReport(report);
        return report;
      }
    }

    // Run full OCR pipeline
    console.error(`[OCR] Processing ${fileStem}.pdf ...`);
    const extraction = await extractPdfWithOcrFallback(pdfPath);

    report.pageCount = extraction.pageCount;
    report.totalCharacters = extraction.totalCharacters;
    report.pagesWithNativeText = extraction.pagesWithNativeText;
    report.pagesRequiringOcr = extraction.pagesRequiringOcr;
    report.pagesOcrSuccess = extraction.pagesOcrSuccess;
    report.extractionSummary = extraction.extractionSummary;

    const ocrPages = extraction.pages.filter((p) => p.ocrMethod === 'tesseract' && p.characterCount > 0);
    if (ocrPages.length > 0) {
      report.averageOcrConfidence = ocrPages.reduce((s, p) => s + p.ocrConfidence, 0) / ocrPages.length;
    }

    // Save OCR output to .txt for future runs
    const ocrText = extraction.pages.map((p) => p.text).join('\n\n--- PAGE BREAK ---\n\n');
    await fs.writeFile(txtPath, ocrText, 'utf-8');

  } else {
    // HTML or text: just read the existing .txt file
    const txtPath = path.join(CORPUS_DIR, `${fileStem}.txt`);
    const htmlPath = path.join(CORPUS_DIR, `${fileStem}.html`);

    const sourceFile = await fs.stat(txtPath).then(() => txtPath).catch(async () => {
      await fs.stat(htmlPath).then(() => htmlPath).catch(() => null);
      return htmlPath;
    });

    if (!sourceFile) {
      report.validationIssues.push('Neither .txt nor .html file found on disk');
      report.validationStatus = 'fail';
      report.extractionSummary = 'NOT DOWNLOADED';
      report.processingTimeMs = Date.now() - start;
      return report;
    }

    try {
      const stat = await fs.stat(sourceFile);
      report.fileName = path.basename(sourceFile);
      report.fileSizeBytes = stat.size;
    } catch { /* already caught above */ }

    const { charCount } = await getTextFileStats(txtPath.replace('.html', '.txt'));
    report.totalCharacters = charCount || 0;
    report.pageCount = 1;
    report.pagesWithNativeText = charCount > 0 ? 1 : 0;
    report.extractionSummary = charCount > 0
      ? `${charCount} chars (HTML→text)`
      : 'empty or not extracted';
  }

  report.processingTimeMs = Date.now() - start;
  validateReport(report);
  return report;
}

async function main(): Promise<void> {
  console.error('DriveLegal corpus validation — DB-free extraction report');
  console.error('='.repeat(60));

  const manifestText = await fs.readFile(CORPUS_MANIFEST, 'utf-8');
  const manifest = JSON.parse(manifestText) as CorpusEntry[];

  const reports: FileReport[] = [];

  for (const entry of manifest) {
    console.error(`\nProcessing [${entry.id}]...`);
    const report = await processEntry(entry);
    reports.push(report);
    // Emit JSON line for real-time streaming
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  // Summary statistics
  const total = reports.length;
  const ok = reports.filter((r) => r.validationStatus === 'ok').length;
  const warnings = reports.filter((r) => r.validationStatus === 'warning').length;
  const failed = reports.filter((r) => r.validationStatus === 'fail').length;
  const totalChars = reports.reduce((s, r) => s + r.totalCharacters, 0);
  const totalPages = reports.reduce((s, r) => s + r.pageCount, 0);
  const needsOcr = reports.reduce((s, r) => s + r.pagesRequiringOcr, 0);
  const ocrSuccess = reports.reduce((s, r) => s + r.pagesOcrSuccess, 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    totalDocuments: total,
    statusOk: ok,
    statusWarning: warnings,
    statusFailed: failed,
    totalCharactersExtracted: totalChars,
    totalPages,
    pagesRequiringOcr: needsOcr,
    pagesOcrSuccess: ocrSuccess,
    ocrCoveragePercent: needsOcr > 0 ? Math.round((ocrSuccess / needsOcr) * 100) : 100,
    documents: reports,
  };

  // Write full report
  const reportPath = path.join(CORPUS_DIR, 'extraction-report.json');
  await fs.writeFile(reportPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.error('\n' + '='.repeat(60));
  console.error('EXTRACTION SUMMARY');
  console.error('='.repeat(60));
  console.error(`Documents:  ${total} total | ${ok} OK | ${warnings} warnings | ${failed} failed`);
  console.error(`Characters: ${totalChars.toLocaleString()} total across ${totalPages} pages`);
  console.error(`OCR:        ${needsOcr} pages needed OCR | ${ocrSuccess} succeeded`);
  console.error(`Coverage:   ${summary.ocrCoveragePercent}% OCR coverage`);
  console.error(`Report:     ${reportPath}`);
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exitCode = 1;
});
