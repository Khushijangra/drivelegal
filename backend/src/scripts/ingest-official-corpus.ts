import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ingestPdfDocument, ingestTextDocument } from "../services/ingest";

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

interface ImportResult {
  id: string;
  title: string;
  kind: OfficialCorpusEntry['kind'];
  sourceOrganization: string;
  documentId: string;
  pageCount: number;
  chunkCount: number;
  localPath: string;
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

async function downloadText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  return response.text();
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function loadCorpus(): Promise<OfficialCorpusEntry[]> {
  const corpusText = await readFile(corpusPath, 'utf-8');
  return JSON.parse(corpusText) as OfficialCorpusEntry[];
}

async function ensureRawDirectory(): Promise<void> {
  await mkdir(rawDir, { recursive: true });
}

async function importEntry(entry: OfficialCorpusEntry): Promise<ImportResult> {
  const fileStem = sanitizeFileName(entry.id);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (entry.kind === 'pdf') {
    const localPath = path.join(rawDir, `${fileStem}.pdf`);
    const buffer = await downloadBuffer(entry.sourceUrl);
    await writeFile(localPath, buffer);

    const result = await ingestPdfDocument({
      sourceUrl: entry.sourceUrl,
      title: entry.title,
      officialSourceId: entry.officialSourceId,
      localFilePath: localPath,
      contentType: 'application/pdf',
      retrievedAt: stamp,
    });

    return {
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      sourceOrganization: entry.sourceOrganization,
      documentId: result.documentId,
      pageCount: result.pageCount,
      chunkCount: result.chunkCount,
      localPath,
    };
  }

  const html = await downloadText(entry.sourceUrl);
  const localHtmlPath = path.join(rawDir, `${fileStem}.html`);
  const localTextPath = path.join(rawDir, `${fileStem}.txt`);
  await writeFile(localHtmlPath, html, 'utf-8');

  const text = htmlToText(html);
  await writeFile(localTextPath, text, 'utf-8');

  const result = await ingestTextDocument({
    sourceUrl: entry.sourceUrl,
    title: entry.title,
    officialSourceId: entry.officialSourceId,
    localFilePath: localTextPath,
    contentType: 'text/html',
    retrievedAt: stamp,
  }, text);

  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    sourceOrganization: entry.sourceOrganization,
    documentId: result.documentId,
    pageCount: result.pageCount,
    chunkCount: result.chunkCount,
    localPath: localTextPath,
  };
}

async function main(): Promise<void> {
  await ensureRawDirectory();
  const corpus = await loadCorpus();
  const results: ImportResult[] = [];

  for (const entry of corpus) {
    const result = await importEntry(entry);
    results.push(result);
    console.log(JSON.stringify({ imported: entry.id, documentId: result.documentId, pages: result.pageCount, chunks: result.chunkCount }, null, 2));
  }

  const summaryPath = path.join(rawDir, 'import-summary.json');
  await writeFile(summaryPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(JSON.stringify({ imported: results.length, summaryPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});