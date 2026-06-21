import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";

interface OfficialCorpusEntry {
  id: string;
  officialSourceId: string;
  sourceOrganization: string;
  title: string;
  sourceUrl: string;
  kind: 'pdf' | 'html' | 'text';
  updateFrequency: string;
  reliability: 'very-high' | 'high' | 'medium';
  whyUsed: string;
  notes?: string;
}

interface DownloadResult {
  id: string;
  title: string;
  kind: OfficialCorpusEntry['kind'];
  sourceOrganization: string;
  rawPath: string;
  textPath: string;
  pageCount: number;
  extractedCharacters: number;
  validation: {
    ok: boolean;
    issues: string[];
  };
}

const workspaceRoot = path.resolve(process.cwd(), '..');
const corpusPath = path.join(workspaceRoot, 'backend', 'data', 'official_corpus.json');
const rawDir = path.join(workspaceRoot, 'backend', 'data', 'raw', 'official-corpus');

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadCorpus(): Promise<OfficialCorpusEntry[]> {
  const corpusText = await readFile(corpusPath, 'utf-8');
  return JSON.parse(corpusText) as OfficialCorpusEntry[];
}

async function ensureRawDirectory(): Promise<void> {
  await mkdir(rawDir, { recursive: true });
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function downloadText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  return response.text();
}

async function savePdf(entry: OfficialCorpusEntry): Promise<DownloadResult> {
  const fileStem = sanitizeFileName(entry.id);
  const rawPath = path.join(rawDir, `${fileStem}.pdf`);
  const textPath = path.join(rawDir, `${fileStem}.txt`);
  const buffer = await downloadBuffer(entry.sourceUrl);
  await writeFile(rawPath, buffer);

  const parsed = await pdfParse(buffer);
  const extractedText = (parsed.text ?? '').trim();
  await writeFile(textPath, extractedText, 'utf-8');
  const validation = validateArtifact('pdf', buffer, extractedText, entry.sourceUrl);

  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    sourceOrganization: entry.sourceOrganization,
    rawPath,
    textPath,
    pageCount: parsed.numpages,
    extractedCharacters: extractedText.length,
    validation,
  };
}

async function saveHtml(entry: OfficialCorpusEntry): Promise<DownloadResult> {
  const fileStem = sanitizeFileName(entry.id);
  const rawPath = path.join(rawDir, `${fileStem}.html`);
  const textPath = path.join(rawDir, `${fileStem}.txt`);
  const html = await downloadText(entry.sourceUrl);
  await writeFile(rawPath, html, 'utf-8');

  const extractedText = htmlToText(html);
  await writeFile(textPath, extractedText, 'utf-8');
  const validation = validateArtifact('html', Buffer.from(html, 'utf-8'), extractedText, entry.sourceUrl);

  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    sourceOrganization: entry.sourceOrganization,
    rawPath,
    textPath,
    pageCount: 1,
    extractedCharacters: extractedText.length,
    validation,
  };
}

async function saveText(entry: OfficialCorpusEntry): Promise<DownloadResult> {
  const fileStem = sanitizeFileName(entry.id);
  const rawPath = path.join(rawDir, `${fileStem}.txt`);
  const text = await downloadText(entry.sourceUrl);
  await writeFile(rawPath, text, 'utf-8');
  const validation = validateArtifact('text', Buffer.from(text, 'utf-8'), text, entry.sourceUrl);

  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    sourceOrganization: entry.sourceOrganization,
    rawPath,
    textPath: rawPath,
    pageCount: 1,
    extractedCharacters: text.trim().length,
    validation,
  };
}

function validateArtifact(kind: OfficialCorpusEntry['kind'], rawContent: Buffer, textContent: string, sourceUrl: string): DownloadResult['validation'] {
  const issues: string[] = [];

  if (rawContent.byteLength === 0) {
    issues.push('downloaded artifact is empty');
  }

  if (kind === 'pdf' && rawContent.byteLength > 4 && rawContent.subarray(0, 4).toString('utf-8') !== '%PDF') {
    issues.push('pdf file header is missing');
  }

  if (!textContent.trim()) {
    issues.push('no extractable text found');
  }

  if (!sourceUrl.startsWith('https://')) {
    issues.push('source is not served over https');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

async function main(): Promise<void> {
  await ensureRawDirectory();
  const corpus = await loadCorpus();
  const results: DownloadResult[] = [];

  for (const entry of corpus) {
    try {
      const result = entry.kind === 'pdf' ? await savePdf(entry) : entry.kind === 'html' ? await saveHtml(entry) : await saveText(entry);
      results.push(result);
      console.log(JSON.stringify({
        downloaded: entry.id,
        pages: result.pageCount,
        characters: result.extractedCharacters,
        validation: result.validation,
      }, null, 2));
    } catch (err: any) {
      console.error(`Failed to download ${entry.id}: ${err.message}`);
    }
  }

  const summaryPath = path.join(rawDir, 'download-summary.json');
  await writeFile(summaryPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(JSON.stringify({ downloaded: results.length, summaryPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
