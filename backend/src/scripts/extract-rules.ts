/**
 * extract-rules.ts
 *
 * DB-FREE rule extraction engine.
 *
 * Reads extracted .txt files from data/raw/official-corpus/,
 * applies multi-strategy pattern matching to detect challan rule clauses,
 * normalizes them to the `rules` table schema,
 * and writes data/extracted-rules.json (ready to import when DB is available).
 *
 * Strategies applied in priority order:
 *   1. Section-fine pattern     — "Section 177 ... Rs. 500" or "Section 177 ... ₹500"
 *   2. Table row pattern        — structured fine table rows in GSR notifications
 *   3. Fine mention pattern     — "fine of Rs./₹ NNN" near a legal clause keyword
 *
 * Usage (no DB needed):
 *   npm --workspace backend run extract:rules
 */
import path from 'node:path';
import fs from 'node:fs/promises';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedRule {
  // Match quality
  extractionStrategy: 'section-fine' | 'table-row' | 'fine-mention';
  confidenceScore: number; // 0.0–1.0
  rawSnippet: string; // The original text passage that was matched

  // Rule fields (maps to `rules` table)
  offense_code: string;
  description: string;
  state_code: string; // '*' for national
  vehicle_class: string; // '*' for all vehicles
  base_fine: number;
  compounding_fine: number;
  demerit_points: number;
  source_clause: string;
  effective_date: string;

  // Provenance
  sourceDocumentId: string; // corpus entry id
  sourceDocumentTitle: string;
  sourceOrganization: string;
  sourceUrl: string;
  sourceFileName: string;
  lineNumber: number;
}

interface CorpusEntry {
  id: string;
  title: string;
  sourceOrganization: string;
  sourceUrl: string;
  reliability: string;
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

// Matches: "Section 177", "Sec. 194D", "S. 183(1)"
const SECTION_REF_RE = /\b(?:Section|Sec\.?|S\.)\s*(\d{2,3}[A-Z]?(?:\(\d+\))?)/gi;

// Matches: "Rs. 1,000", "Rs.500", "₹ 10,000", "₹5000", "rupees five hundred"
const FINE_AMOUNT_RE = /(?:Rs\.?\s*|₹\s*)(\d{1,3}(?:,\d{3})*|\d+)/gi;

// Matches a table row like: "177 | General violation | 500 | 1000"
const TABLE_ROW_RE = /(\d{2,3}[A-Z]?)\s*\|\s*(.{10,80}?)\s*\|\s*(\d{2,6})\s*(?:\|\s*(\d{2,6}))?/g;

// Legal clause keywords that indicate a fine context
const LEGAL_KEYWORDS = [
  'fine', 'penalty', 'challan', 'offence', 'violation',
  'exceed', 'without', 'failure', 'driving', 'helmet',
  'seatbelt', 'seat belt', 'alcohol', 'speed', 'signal',
  'licence', 'license', 'insurance', 'registration',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFineAmount(str: string): number {
  // Remove commas and parse
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function hasLegalKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return LEGAL_KEYWORDS.some((kw) => lower.includes(kw));
}

function buildOffenseCode(sectionNum: string, index: number): string {
  return `MV${sectionNum.replace(/[()]/g, '_').toUpperCase()}_EX${index}`;
}

// ─── Strategy 1: Section-fine pattern ─────────────────────────────────────────

function extractSectionFinePatterns(
  text: string,
  meta: CorpusEntry,
  fileName: string
): ExtractedRule[] {
  const rules: ExtractedRule[] = [];
  const lines = text.split('\n');
  const windowSize = 5; // Lines to look ahead for a fine amount after section ref

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const sectionMatches = [...line.matchAll(SECTION_REF_RE)];

    for (const sMatch of sectionMatches) {
      const sectionNum = sMatch[1];

      // Build a window of text around this line to find fine amount
      const windowText = lines
        .slice(lineIdx, Math.min(lines.length, lineIdx + windowSize))
        .join(' ');

      const fineMatches = [...windowText.matchAll(FINE_AMOUNT_RE)];
      if (fineMatches.length === 0) continue;

      const baseFine = parseFineAmount(fineMatches[0][1]);
      const compoundingFine = fineMatches.length > 1 ? parseFineAmount(fineMatches[1][1]) : 0;

      if (baseFine < 100 || baseFine > 500000) continue; // Sanity check

      // Description: take the sentence around the section reference
      const description = windowText
        .slice(0, 300)
        .replace(/\s+/g, ' ')
        .trim();

      rules.push({
        extractionStrategy: 'section-fine',
        confidenceScore: 0.75,
        rawSnippet: windowText.slice(0, 400),
        offense_code: buildOffenseCode(sectionNum, rules.length),
        description: description.slice(0, 250),
        state_code: '*',
        vehicle_class: '*',
        base_fine: baseFine,
        compounding_fine: compoundingFine,
        demerit_points: 0,
        source_clause: `Section ${sectionNum}`,
        effective_date: '2019-09-01',
        sourceDocumentId: meta.id,
        sourceDocumentTitle: meta.title,
        sourceOrganization: meta.sourceOrganization,
        sourceUrl: meta.sourceUrl,
        sourceFileName: fileName,
        lineNumber: lineIdx + 1,
      });
    }
  }

  return rules;
}

// ─── Strategy 2: Table row pattern ───────────────────────────────────────────

function extractTableRowPatterns(
  text: string,
  meta: CorpusEntry,
  fileName: string
): ExtractedRule[] {
  const rules: ExtractedRule[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  TABLE_ROW_RE.lastIndex = 0;
  while ((match = TABLE_ROW_RE.exec(text)) !== null) {
    const sectionNum = match[1];
    const description = (match[2] || '').trim();
    const baseFine = parseFineAmount(match[3]);
    const compoundingFine = match[4] ? parseFineAmount(match[4]) : 0;

    if (!description || baseFine < 100 || baseFine > 500000) continue;

    rules.push({
      extractionStrategy: 'table-row',
      confidenceScore: 0.85,
      rawSnippet: match[0],
      offense_code: buildOffenseCode(sectionNum, index++),
      description: description.slice(0, 250),
      state_code: '*',
      vehicle_class: '*',
      base_fine: baseFine,
      compounding_fine: compoundingFine,
      demerit_points: 0,
      source_clause: `Section ${sectionNum}`,
      effective_date: '2019-09-01',
      sourceDocumentId: meta.id,
      sourceDocumentTitle: meta.title,
      sourceOrganization: meta.sourceOrganization,
      sourceUrl: meta.sourceUrl,
      sourceFileName: fileName,
      lineNumber: 0,
    });
  }

  return rules;
}

// ─── Strategy 3: Fine-mention pattern ────────────────────────────────────────

function extractFineMentionPatterns(
  text: string,
  meta: CorpusEntry,
  fileName: string
): ExtractedRule[] {
  const rules: ExtractedRule[] = [];
  const lines = text.split('\n');
  let index = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (!hasLegalKeyword(line)) continue;

    const fineMatches = [...line.matchAll(FINE_AMOUNT_RE)];
    if (fineMatches.length === 0) continue;

    const baseFine = parseFineAmount(fineMatches[0][1]);
    if (baseFine < 100 || baseFine > 500000) continue;

    const compoundingFine = fineMatches.length > 1 ? parseFineAmount(fineMatches[1][1]) : 0;

    rules.push({
      extractionStrategy: 'fine-mention',
      confidenceScore: 0.45, // Low confidence — no section reference
      rawSnippet: line.slice(0, 400),
      offense_code: `MENTION_${meta.id.toUpperCase()}_${index++}`,
      description: line.slice(0, 250).replace(/\s+/g, ' ').trim(),
      state_code: '*',
      vehicle_class: '*',
      base_fine: baseFine,
      compounding_fine: compoundingFine,
      demerit_points: 0,
      source_clause: `(unresolved — extracted from: ${meta.title})`,
      effective_date: '2019-09-01',
      sourceDocumentId: meta.id,
      sourceDocumentTitle: meta.title,
      sourceOrganization: meta.sourceOrganization,
      sourceUrl: meta.sourceUrl,
      sourceFileName: fileName,
      lineNumber: lineIdx + 1,
    });
  }

  return rules;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateRules(rules: ExtractedRule[]): ExtractedRule[] {
  // Keep only the highest-confidence rule for each (section + fine) combination
  const seen = new Map<string, ExtractedRule>();

  for (const rule of rules) {
    const key = `${rule.source_clause.toUpperCase()}::${rule.base_fine}`;
    const existing = seen.get(key);
    if (!existing || rule.confidenceScore > existing.confidenceScore) {
      seen.set(key, rule);
    }
  }

  return Array.from(seen.values());
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const corpusManifestPath = path.join(workspaceRoot, 'backend', 'data', 'official_corpus.json');
  const rawDir = path.join(workspaceRoot, 'backend', 'data', 'raw', 'official-corpus');
  const outputPath = path.join(workspaceRoot, 'backend', 'data', 'extracted-rules.json');

  const manifestText = await fs.readFile(corpusManifestPath, 'utf-8');
  const manifest = JSON.parse(manifestText) as CorpusEntry[];

  const allRules: ExtractedRule[] = [];

  for (const entry of manifest) {
    const txtPath = path.join(rawDir, `${entry.id}.txt`);

    let text: string;
    try {
      text = await fs.readFile(txtPath, 'utf-8');
    } catch {
      console.error(`[SKIP] ${entry.id} — .txt file not found (run download:official-corpus first)`);
      continue;
    }

    if (!text.trim()) {
      console.error(`[SKIP] ${entry.id} — empty text file (may be scanned PDF, needs OCR)`);
      continue;
    }

    const normalized = normalizeText(text);

    const strategy1 = extractSectionFinePatterns(normalized, entry, `${entry.id}.txt`);
    const strategy2 = extractTableRowPatterns(normalized, entry, `${entry.id}.txt`);
    const strategy3 = extractFineMentionPatterns(normalized, entry, `${entry.id}.txt`);

    const entryRules = deduplicateRules([...strategy1, ...strategy2, ...strategy3]);

    console.log(
      `[${entry.id}] s1=${strategy1.length} s2=${strategy2.length} s3=${strategy3.length} dedup=${entryRules.length}`
    );

    allRules.push(...entryRules);
  }

  // Final dedup across all documents
  const finalRules = deduplicateRules(allRules);

  // Sort by confidence descending
  finalRules.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const output = {
    generatedAt: new Date().toISOString(),
    totalRulesExtracted: finalRules.length,
    byStrategy: {
      'section-fine': finalRules.filter((r) => r.extractionStrategy === 'section-fine').length,
      'table-row': finalRules.filter((r) => r.extractionStrategy === 'table-row').length,
      'fine-mention': finalRules.filter((r) => r.extractionStrategy === 'fine-mention').length,
    },
    averageConfidence:
      finalRules.length > 0
        ? (finalRules.reduce((s, r) => s + r.confidenceScore, 0) / finalRules.length).toFixed(3)
        : 0,
    rules: finalRules,
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nExtracted ${finalRules.length} rules → ${outputPath}`);
}

main().catch((err) => {
  console.error('Rule extraction failed:', err);
  process.exitCode = 1;
});
