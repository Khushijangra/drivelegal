import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { withTransaction, closePool } from '../db';

async function main() {
  const rulesPath = path.resolve(__dirname, '../../data/mv-act-2019-rules.json');
  const raw = await fs.readFile(rulesPath, 'utf-8');
  const data = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, ''));

  await withTransaction(async (client) => {
    // Delete existing rules to prevent duplicates
    await client.query('DELETE FROM rules');
    
    // First, ensure there's a dummy document for the MV Act 2019
    const docId = 'mv-act-2019-dummy-doc';
    const meta = data[0]._meta;
    await client.query(`
      INSERT INTO documents (id, source_url, title, file_name, document_type, page_count)
      VALUES ($1, $2, $3, $4, $5, 1)
      ON CONFLICT DO NOTHING
    `, [docId, meta.sourceUrl, meta.dataset, 'mv-act-2019.pdf', 'pdf']);

    let count = 0;
    const rules = data.slice(1);
    for (const rule of rules) {
      await client.query(`
        INSERT INTO rules (id, offense_code, description, state_code, vehicle_class, base_fine, compounding_fine, demerit_points, source_document_id, source_page_number, source_clause, effective_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        randomUUID(),
        rule.offense_code,
        rule.description,
        rule.state_code || '*',
        rule.vehicle_class || '*',
        rule.base_fine,
        rule.compounding_fine || 0,
        rule.demerit_points || 0,
        docId,
        1,
        rule.source_clause,
        meta.effectiveDate || '2019-09-01'
      ]);
      count++;
    }
    console.log(`Loaded ${count} rules from MV Act 2019`);

    // Load Delhi Traffic Fines
    const delhiPath = path.resolve(__dirname, '../../data/delhi-traffic-fines.json');
    const delhiRaw = await fs.readFile(delhiPath, 'utf-8');
    const delhiData = JSON.parse(delhiRaw);
    
    const delhiDocId = 'delhi-traffic-fines-dummy-doc';
    const delhiMeta = delhiData[0]._meta;
    await client.query(`
      INSERT INTO documents (id, source_url, title, file_name, document_type, page_count)
      VALUES ($1, $2, $3, $4, $5, 1)
      ON CONFLICT DO NOTHING
    `, [delhiDocId, delhiMeta.sourceUrl, delhiMeta.dataset, 'delhi-fines.json', 'text']);

    let delhiCount = 0;
    const delhiRules = delhiData.slice(1);
    for (const rule of delhiRules) {
      await client.query(`
        INSERT INTO rules (id, offense_code, description, state_code, vehicle_class, base_fine, compounding_fine, demerit_points, source_document_id, source_page_number, source_clause, effective_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        randomUUID(),
        rule.offense_code,
        rule.description,
        rule.state_code || 'NCT',
        rule.vehicle_class || '*',
        rule.base_fine,
        rule.compounding_fine || 0,
        rule.demerit_points || 0,
        delhiDocId,
        1,
        rule.source_clause,
        '2019-09-01'
      ]);
      delhiCount++;
    }
    console.log(`Loaded ${delhiCount} rules from Delhi Traffic Police`);

  });

  await closePool();
}

main().catch(console.error);
