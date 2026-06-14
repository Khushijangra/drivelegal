import { readFile } from "node:fs/promises";
import { ingestPdfDocument, ingestTextDocument } from "../services/ingest";

async function main(): Promise<void> {
  const [, , sourceUrl, title, officialSourceId, localFilePath] = process.argv;

  if (!sourceUrl || !title || !officialSourceId) {
    console.error("Usage: tsx src/scripts/ingest-document.ts <sourceUrl> <title> <officialSourceId> [localFilePath]");
    process.exitCode = 1;
    return;
  }

  if (localFilePath && localFilePath.toLowerCase().endsWith('.txt')) {
    const text = await readFile(localFilePath, "utf-8");
    const result = await ingestTextDocument({ sourceUrl, title, officialSourceId, localFilePath }, text);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const result = await ingestPdfDocument({ sourceUrl, title, officialSourceId, localFilePath });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
