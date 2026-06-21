import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "../database/db";
import type { OfficialSource } from "../types";

const dataPath = path.resolve(__dirname, "../../data/official_sources.json");

async function main(): Promise<void> {
  const content = await readFile(dataPath, "utf-8");
  const sources = JSON.parse(content) as OfficialSource[];

  for (const source of sources) {
    await query(
      `
        INSERT INTO official_sources (
          id, name, organization, url, format, update_frequency, reliability, coverage, key_fields, integration_difficulty, expected_impact
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          organization = EXCLUDED.organization,
          url = EXCLUDED.url,
          format = EXCLUDED.format,
          update_frequency = EXCLUDED.update_frequency,
          reliability = EXCLUDED.reliability,
          coverage = EXCLUDED.coverage,
          key_fields = EXCLUDED.key_fields,
          integration_difficulty = EXCLUDED.integration_difficulty,
          expected_impact = EXCLUDED.expected_impact
      `,
      [
        source.id,
        source.name,
        source.organization,
        source.url,
        source.format,
        source.updateFrequency,
        source.reliability,
        source.coverage,
        source.keyFields,
        source.integrationDifficulty,
        source.expectedImpact,
      ],
    );
  }

  console.log(`Seeded ${sources.length} official source records.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
