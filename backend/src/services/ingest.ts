import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../database/db";
import { extractPdfWithOcrFallback } from "./ocr";

export interface IngestInput {
  sourceUrl: string;
  title: string;
  officialSourceId: string;
  localFilePath?: string;
  contentType?: string;
  retrievedAt?: string;
}

export interface IngestedDocument {
  documentId: string;
  chunkCount: number;
  pageCount: number;
}

export function chunkText(text: string, chunkSize = 1200, overlap = 150): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + chunkSize);
    chunks.push(normalized.slice(cursor, end));
    if (end === normalized.length) {
      break;
    }
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
}

function buildProvenance(input: IngestInput, documentType: string, pageNumber: number, localFilePath?: string): Record<string, unknown> {
  return {
    sourceUrl: input.sourceUrl,
    title: input.title,
    officialSourceId: input.officialSourceId,
    documentType,
    pageNumber,
    contentType: input.contentType ?? null,
    localFilePath: localFilePath ?? input.localFilePath ?? null,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
  };
}

function splitPdfPages(text: string, pageCount: number): string[] {
  const parts = text.split(/\f+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === pageCount && pageCount > 0) {
    return parts;
  }

  if (text.trim()) {
    return [text.trim()];
  }

  return [];
}

async function readDocumentBuffer(input: IngestInput): Promise<Buffer> {
  if (input.localFilePath) {
    return fs.readFile(input.localFilePath);
  }

  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download source document from ${input.sourceUrl}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function ingestPdfDocument(input: IngestInput): Promise<IngestedDocument> {
  // Resolve local file path — required for OCR page rendering
  let localPath = input.localFilePath;
  if (!localPath) {
    // Download to a temp location so OCR can read it from disk
    const buffer = await readDocumentBuffer(input);
    localPath = path.join(process.cwd(), `tmp_${randomUUID()}.pdf`);
    await fs.writeFile(localPath, buffer);
  }

  // Two-tier extraction: native text first, Tesseract OCR fallback for scanned pages
  const extraction = await extractPdfWithOcrFallback(localPath);

  const documentId = randomUUID();
  const pageCount = extraction.pageCount;
  const fullText = extraction.pages.map((p) => p.text).join('\n\n');
  const baseProvenance = buildProvenance(input, 'pdf', 1, localPath);

  await query(
    `
      INSERT INTO documents (id, source_url, official_source_id, title, file_name, document_type, page_count, extracted_text)
      VALUES ($1, $2, $3, $4, $5, 'pdf', $6, $7)
    `,
    [
      documentId,
      input.sourceUrl,
      input.officialSourceId,
      input.title,
      path.basename(localPath),
      pageCount,
      fullText,
    ],
  );

  let totalChunks = 0;

  for (const page of extraction.pages) {
    if (!page.text.trim()) continue; // skip genuinely empty pages

    const pageProvenance = {
      ...baseProvenance,
      pageNumber: page.pageNumber,
      ocrMethod: page.ocrMethod,
      ocrConfidence: page.ocrConfidence,
    };

    await query(
      `
        INSERT INTO document_pages (id, document_id, page_number, page_text, ocr_confidence, provenance_json)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (document_id, page_number) DO UPDATE SET
          page_text = EXCLUDED.page_text,
          ocr_confidence = EXCLUDED.ocr_confidence,
          provenance_json = EXCLUDED.provenance_json,
          created_at = NOW()
      `,
      [randomUUID(), documentId, page.pageNumber, page.text, page.ocrConfidence, JSON.stringify(pageProvenance)],
    );

    const pageChunks = chunkText(page.text);
    for (let chunkIndex = 0; chunkIndex < pageChunks.length; chunkIndex += 1) {
      const chunk = pageChunks[chunkIndex];
      await query(
        `
          INSERT INTO document_chunks (id, document_id, page_number, chunk_index, chunk_text, search_vector, ocr_confidence, provenance_json)
          VALUES ($1, $2, $3, $4, $5, to_tsvector('english', $5), $6, $7)
        `,
        [randomUUID(), documentId, page.pageNumber, chunkIndex, chunk, page.ocrConfidence, JSON.stringify(pageProvenance)],
      );
      totalChunks++;
    }
  }

  return {
    documentId,
    chunkCount: totalChunks,
    pageCount,
  };
}

export async function ingestTextDocument(input: IngestInput, text: string): Promise<IngestedDocument> {
  const documentId = randomUUID();
  const chunks = chunkText(text);
  const provenance = buildProvenance(input, 'text', 1, input.localFilePath);

  await query(
    `
      INSERT INTO documents (id, source_url, official_source_id, title, file_name, document_type, page_count, extracted_text)
      VALUES ($1, $2, $3, $4, $5, 'text', 1, $6)
    `,
    [documentId, input.sourceUrl, input.officialSourceId, input.title, input.title, text],
  );

  await query(
    `
      INSERT INTO document_pages (id, document_id, page_number, page_text, ocr_confidence, provenance_json)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (document_id, page_number) DO UPDATE SET
        page_text = EXCLUDED.page_text,
        ocr_confidence = EXCLUDED.ocr_confidence,
        provenance_json = EXCLUDED.provenance_json,
        created_at = NOW()
    `,
    [randomUUID(), documentId, 1, text, 1.0, JSON.stringify(provenance)],
  );

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkId = randomUUID();
    await query(
      `
        INSERT INTO document_chunks (id, document_id, page_number, chunk_index, chunk_text, search_vector, ocr_confidence, provenance_json)
        VALUES ($1, $2, $3, $4, $5, to_tsvector('english', $5), 1.0, $6)
      `,
        [chunkId, documentId, 1, index, chunk, JSON.stringify(provenance)],
    );
  }

  return {
    documentId,
    chunkCount: chunks.length,
    pageCount: 1,
  };
}
