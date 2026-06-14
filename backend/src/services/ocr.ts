/**
 * ocr.ts
 *
 * OCR pipeline for DriveLegal.
 *
 * Strategy (two-tier):
 *   Tier 1 — Native text extraction via pdf-parse (fast, lossless)
 *   Tier 2 — Tesseract.js OCR on rendered PDF pages (for scanned/image PDFs)
 *
 * PDF-to-image rendering uses pdfjs-dist + canvas (NodeCanvasFactory).
 * Tesseract.js is WASM-based — no native compilation needed beyond canvas.
 *
 * Provenance attached to every result:
 *   ocr_method: 'native' | 'tesseract'
 *   ocr_confidence: 0.0–1.0
 *   page_number: number
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { createCanvas, type Canvas } from 'canvas';
import { createWorker } from 'tesseract.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PageExtractionResult {
  pageNumber: number;
  text: string;
  ocrMethod: 'native' | 'tesseract';
  ocrConfidence: number; // 0.0–1.0
  characterCount: number;
}

export interface DocumentExtractionResult {
  pageCount: number;
  pages: PageExtractionResult[];
  totalCharacters: number;
  pagesWithNativeText: number;
  pagesRequiringOcr: number;
  pagesOcrSuccess: number;
  extractionSummary: string;
}

// ─── PDF page rendering ────────────────────────────────────────────────────────

/**
 * NodeCanvasFactory for pdfjs-dist.
 * pdfjs-dist requires a factory that creates canvas objects in Node.js.
 */
class NodeCanvasFactory {
  create(width: number, height: number): { canvas: Canvas; context: ReturnType<Canvas['getContext']> } {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(
    canvasAndContext: { canvas: Canvas; context: ReturnType<Canvas['getContext']> },
    width: number,
    height: number
  ): void {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: Canvas; context: ReturnType<Canvas['getContext']> }): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

/**
 * Renders a single PDF page to a PNG Buffer using pdfjs-dist + canvas.
 * Scale factor 2.0 improves OCR accuracy on low-resolution scanned documents.
 */
async function renderPdfPageToBuffer(pdfPath: string, pageNumber: number, scale = 2.0): Promise<Buffer> {
  // Dynamic import — pdfjs-dist is an ESM-only package in v4+.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(await fs.readFile(pdfPath));
  // @ts-ignore
  const loadingTask = pdfjsLib.getDocument({ data, disableFontFace: true, isEvalSupported: false });
  const pdfDoc = await loadingTask.promise;

  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvasFactory = new NodeCanvasFactory();
  const { canvas, context } = canvasFactory.create(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  );

  const renderContext: any = {
    canvasContext: context!,
    viewport: viewport,
    canvasFactory: canvasFactory,
  };

  await page.render(renderContext).promise;

  await loadingTask.destroy();

  return (canvas as unknown as import('canvas').Canvas).toBuffer('image/png');
}

// ─── Tesseract OCR ────────────────────────────────────────────────────────────

/**
 * Runs Tesseract.js OCR on a PNG image buffer.
 * Returns extracted text and normalized confidence (0.0–1.0).
 *
 * Language: 'eng' (English). Government PDFs in Hindi will need 'hin' — 
 * added as future language expansion when Tesseract lang packs are available.
 */
async function ocrImageBuffer(
  imageBuffer: Buffer,
  language = 'eng'
): Promise<{ text: string; confidence: number }> {
  const worker = await createWorker(language, 1, {
    // Suppress verbose Tesseract logging in production
    logger: () => {},
    errorHandler: () => {},
  });

  const { data } = await worker.recognize(imageBuffer);
  await worker.terminate();

  // Tesseract returns confidence as 0–100; normalize to 0.0–1.0
  const confidence = (data.confidence ?? 0) / 100;
  return { text: data.text ?? '', confidence };
}

// ─── Main extraction pipeline ─────────────────────────────────────────────────

/**
 * Extracts text from a single PDF page using the two-tier strategy:
 *   1. If native text is present (nativeText.trim().length > MIN_CHARS) → use it
 *   2. Otherwise render the page to PNG and run Tesseract OCR
 */
const MIN_NATIVE_CHARS_PER_PAGE = 30;

async function extractPageText(
  pdfPath: string,
  pageNumber: number,
  nativePageText: string
): Promise<PageExtractionResult> {
  const nativeTrimmed = nativePageText.trim();

  if (nativeTrimmed.length >= MIN_NATIVE_CHARS_PER_PAGE) {
    return {
      pageNumber,
      text: nativeTrimmed,
      ocrMethod: 'native',
      ocrConfidence: 1.0,
      characterCount: nativeTrimmed.length,
    };
  }

  // Page is scanned or image-only — fall back to Tesseract
  try {
    const imageBuffer = await renderPdfPageToBuffer(pdfPath, pageNumber);
    const { text, confidence } = await ocrImageBuffer(imageBuffer);
    const trimmedOcrText = text.trim();

    return {
      pageNumber,
      text: trimmedOcrText,
      ocrMethod: 'tesseract',
      ocrConfidence: confidence,
      characterCount: trimmedOcrText.length,
    };
  } catch (renderError) {
    console.error(`[OCR Error on page ${pageNumber}]:`, renderError);
    // OCR rendering failed — return empty with zero confidence
    return {
      pageNumber,
      text: '',
      ocrMethod: 'tesseract',
      ocrConfidence: 0.0,
      characterCount: 0,
    };
  }
}

/**
 * Full document extraction pipeline with OCR fallback.
 *
 * @param pdfPath   Absolute path to the PDF file on disk
 * @param nativePages  Array of per-page text from pdf-parse (may be empty strings for scanned pages)
 */
export async function extractDocumentWithOcrFallback(
  pdfPath: string,
  nativePages: string[]
): Promise<DocumentExtractionResult> {
  const pages: PageExtractionResult[] = [];
  let pagesWithNativeText = 0;
  let pagesRequiringOcr = 0;
  let pagesOcrSuccess = 0;

  for (let i = 0; i < nativePages.length; i++) {
    const pageNumber = i + 1;
    const result = await extractPageText(pdfPath, pageNumber, nativePages[i]);

    pages.push(result);

    if (result.ocrMethod === 'native') {
      pagesWithNativeText++;
    } else {
      pagesRequiringOcr++;
      if (result.characterCount > 0) {
        pagesOcrSuccess++;
      }
    }
  }

  const totalCharacters = pages.reduce((sum, p) => sum + p.characterCount, 0);

  const extractionSummary = [
    `${pages.length} pages total`,
    `${pagesWithNativeText} native text`,
    `${pagesRequiringOcr} required OCR`,
    `${pagesOcrSuccess} OCR succeeded`,
    `${totalCharacters} total characters`,
  ].join(' | ');

  return {
    pageCount: pages.length,
    pages,
    totalCharacters,
    pagesWithNativeText,
    pagesRequiringOcr,
    pagesOcrSuccess,
    extractionSummary,
  };
}

/**
 * Convenience: extract a PDF from disk using two-tier OCR fallback.
 * Splits native text by form-feed chars (\f) to approximate page boundaries.
 */
export async function extractPdfWithOcrFallback(
  pdfPath: string
): Promise<DocumentExtractionResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as typeof import('pdf-parse');

  const buffer = await fs.readFile(pdfPath);
  const parsed = await pdfParse(buffer);

  const fullText: string = parsed.text ?? '';
  const pageCount: number = parsed.numpages ?? 1;

  // Split by form-feed; pad/trim to actual page count
  let nativePages: string[] = fullText.split(/\f+/).filter((_, i) => i < pageCount);
  while (nativePages.length < pageCount) {
    nativePages.push('');
  }
  nativePages = nativePages.slice(0, pageCount);

  return extractDocumentWithOcrFallback(pdfPath, nativePages);
}
