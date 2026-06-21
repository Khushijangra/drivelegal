/**
 * load-jurisdictions.ts
 *
 * Loads India administrative boundary GeoJSON into the PostGIS `jurisdictions` table.
 *
 * Data source:
 *   Organization:  GADM (Database of Global Administrative Areas)
 *   URL:           https://gadm.org/download_country.html
 *   Country:       India (IND)
 *   Levels used:   Level 1 (States/UTs), Level 2 (Districts)
 *   Format:        GeoJSON
 *   Reliability:   HIGH — GADM derives from national census boundaries
 *   Why GADM:      Census of India shapefiles require registration; GADM provides
 *                  equivalent SRID:4326 coverage instantly for non-commercial use.
 *   License:       Free for non-commercial research/educational use.
 *
 * Geometry note:
 *   The `jurisdictions.geom` column is typed GEOMETRY(MULTIPOLYGON, 4326).
 *   GeoJSON Polygon features are automatically wrapped via ST_Multi() on insert.
 *
 * Usage:
 *   1. Download India GeoJSON files:
 *        npm --workspace backend run download:boundaries
 *   2. Load into PostGIS (requires DB):
 *        npm --workspace backend run load:jurisdictions
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { query, withTransaction, closePool } from '../database/db';

interface GadmFeature {
  type: 'Feature';
  properties: Record<string, string | number | null>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: unknown;
  };
}

interface GadmFeatureCollection {
  type: 'FeatureCollection';
  features: GadmFeature[];
}

const DATA_DIR = path.resolve(__dirname, '../../data/boundaries');

// India national record (hardcoded — level 0)
const INDIA_RECORD = {
  id: 'IN',
  code: 'IN',
  name: 'India',
  type: 'country',
  parent_id: null,
  priority: 0,
  // Approximate bounding box for India — real geometry loaded from GADM level 0
  geom_wkt: 'MULTIPOLYGON(((68.1 8.0, 97.4 8.0, 97.4 37.1, 68.1 37.1, 68.1 8.0)))',
};

// Maps GADM property names to jurisdiction types and codes
const STATE_CODE_MAP: Record<string, string> = {
  'Andaman and Nicobar': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chandigarh': 'CH',
  'Chhattisgarh': 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DD',
  'Delhi': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Haryana': 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu and Kashmir': 'JK',
  'Jharkhand': 'JH',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Ladakh': 'LA',
  'Lakshadweep': 'LD',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'MN',
  'Meghalaya': 'ML',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OD',
  'Puducherry': 'PY',
  'Punjab': 'PB',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Tamil Nadu': 'TN',
  'Telangana': 'TG',
  'Tripura': 'TR',
  'Uttar Pradesh': 'UP',
  'Uttarakhand': 'UA',
  'West Bengal': 'WB',
};

async function insertNationalRecord(client: Parameters<Parameters<typeof withTransaction>[0]>[0]): Promise<void> {
  await client.query(
    `
    INSERT INTO jurisdictions (id, code, name, type, parent_id, priority, geom)
    VALUES ($1, $2, $3, $4, $5, $6, ST_Multi(ST_GeomFromText($7, 4326)))
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      geom = EXCLUDED.geom,
      updated_at = NOW()
    `,
    [
      INDIA_RECORD.id,
      INDIA_RECORD.code,
      INDIA_RECORD.name,
      INDIA_RECORD.type,
      INDIA_RECORD.parent_id,
      INDIA_RECORD.priority,
      INDIA_RECORD.geom_wkt,
    ]
  );
  console.log('Inserted national record: India (IN)');
}

async function loadStateLevel(geojsonPath: string, client: Parameters<Parameters<typeof withTransaction>[0]>[0]): Promise<number> {
  const raw = await fs.readFile(geojsonPath, 'utf-8');
  const fc = JSON.parse(raw) as GadmFeatureCollection;

  let inserted = 0;

  for (const feature of fc.features) {
    const name: string =
      (feature.properties['NAME_1'] as string) ||
      (feature.properties['name'] as string) ||
      'Unknown';

    const stateCode = STATE_CODE_MAP[name] ?? name.toUpperCase().slice(0, 3);
    const geomJson = JSON.stringify(feature.geometry);

    await client.query(
      `
      INSERT INTO jurisdictions (id, code, name, type, parent_id, priority, geom)
      VALUES ($1, $2, $3, 'state', 'IN', 1, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        geom = EXCLUDED.geom,
        updated_at = NOW()
      `,
      [stateCode, stateCode, name, geomJson]
    );

    inserted++;
  }

  return inserted;
}

async function loadDistrictLevel(
  geojsonPath: string,
  client: Parameters<Parameters<typeof withTransaction>[0]>[0]
): Promise<number> {
  const raw = await fs.readFile(geojsonPath, 'utf-8');
  const fc = JSON.parse(raw) as GadmFeatureCollection;

  let inserted = 0;

  const stateCodesRes = await client.query('SELECT code FROM jurisdictions WHERE type = $1', ['state']);
  const validStateCodes = new Set(stateCodesRes.rows.map((r: any) => r.code));

  for (const feature of fc.features) {
    const stateName: string = (feature.properties['NAME_1'] as string) || '';
    const districtName: string = (feature.properties['NAME_2'] as string) || 'Unknown';
    const stateCode = STATE_CODE_MAP[stateName] ?? stateName.toUpperCase().slice(0, 3);
    
    if (!validStateCodes.has(stateCode)) {
      console.warn(`    ⚠️ Skipping district '${districtName}' - unknown parent state '${stateName}' (code: ${stateCode})`);
      continue;
    }

    const districtCode = `${stateCode}-${districtName.toUpperCase().replace(/\s+/g, '').slice(0, 6)}`;
    const geomJson = JSON.stringify(feature.geometry);

    await client.query(
      `
      INSERT INTO jurisdictions (id, code, name, type, parent_id, priority, geom)
      VALUES ($1, $2, $3, 'district', $4, 2, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)))
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        geom = EXCLUDED.geom,
        updated_at = NOW()
      `,
      [districtCode, districtCode, districtName, stateCode, geomJson]
    );

    inserted++;
    if (inserted % 100 === 0) {
      console.log(`  ... ${inserted} districts inserted`);
    }
  }

  return inserted;
}

async function main(): Promise<void> {
  const level1Path = path.join(DATA_DIR, 'gadm41_IND_1.json');
  const level2Path = path.join(DATA_DIR, 'gadm41_IND_2.json');

  // Verify files exist
  for (const p of [level1Path, level2Path]) {
    try {
      await fs.stat(p);
    } catch {
      console.error(`\n❌ File not found: ${p}`);
      console.error('Run: npm --workspace backend run download:boundaries');
      process.exitCode = 1;
      return;
    }
  }

  console.log('Loading jurisdiction boundaries into PostGIS...');

  await withTransaction(async (client) => {
    await insertNationalRecord(client);

    console.log('Loading states (Level 1)...');
    const states = await loadStateLevel(level1Path, client);
    console.log(`✅ ${states} state/UT records inserted`);

    console.log('Loading districts (Level 2)...');
    const districts = await loadDistrictLevel(level2Path, client);
    console.log(`✅ ${districts} district records inserted`);

    // Summary
    const res = await client.query<{ count: string }>('SELECT count(*)::text FROM jurisdictions');
    console.log(`\nTotal jurisdictions in DB: ${res.rows[0].count}`);
  });

  await closePool();
  console.log('✅ Jurisdiction load complete.');
}

main().catch((err) => {
  console.error('❌ Jurisdiction load failed:', err.message);
  process.exitCode = 1;
});
