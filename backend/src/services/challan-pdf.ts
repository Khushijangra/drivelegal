import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { ChallanResult } from "../types";

export interface ChallanPdfInput {
  challan: ChallanResult;
  evidenceUrl: string;
  title?: string;
}

export interface ChallanPdfOutput {
  pdfBuffer: Buffer;
  qrDataUrl: string;
}

export async function generateChallanPdf(input: ChallanPdfInput): Promise<ChallanPdfOutput> {
  const qrDataUrl = await QRCode.toDataURL(input.evidenceUrl, { margin: 1, width: 220 });
  const qrBuffer = await QRCode.toBuffer(input.evidenceUrl, { margin: 1, width: 220 });
  const document = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];

  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.fontSize(20).text(input.title ?? "DriveLegal Challan Summary", { align: "center" });
  document.moveDown(1);
  document.fontSize(11).text(`Currency: ${input.challan.currency}`);
  document.text(`Subtotal: INR ${input.challan.subtotal}`);
  document.text(`Adjustments: INR ${input.challan.adjustments}`);
  document.text(`Total: INR ${input.challan.total}`);
  document.moveDown(1);
  document.fontSize(13).text("Offense Breakdown", { underline: true });
  document.moveDown(0.5);

  for (const item of input.challan.items) {
    document.fontSize(10).text(`${item.offenseCode} - ${item.description}`);
    document.text(`Base fine: INR ${item.baseFine}`);
    document.text(`Compounding fine: INR ${item.compoundingFine}`);
    document.text(`Source: ${item.sourceReference.sourceUrl} (p.${item.sourceReference.pageNumber})`);
    document.moveDown(0.5);
  }

  document.moveDown(1);
  document.fontSize(13).text("Jurisdiction Chain", { underline: true });
  for (const node of input.challan.jurisdictionChain) {
    document.fontSize(10).text(`${node.type}: ${node.name} [${node.code}]`);
  }

  document.moveDown(1);
  document.fontSize(13).text("Evidence QR", { underline: true });
  document.image(qrBuffer, { fit: [160, 160], align: "center" });
  document.moveDown(0.5);
  document.fontSize(9).text(input.evidenceUrl, { align: "center" });

  document.end();
  const pdfBuffer = await finished;
  return { pdfBuffer, qrDataUrl };
}
