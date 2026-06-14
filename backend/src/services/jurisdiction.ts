import { PoolClient } from 'pg';
import { JurisdictionRecord } from '../types';

export async function resolveJurisdictionChain(client: PoolClient, lat: number, lon: number): Promise<JurisdictionRecord[]> {
  if (process.env.DEBUG) {
    console.log('[jurisdiction] resolving lat:', lat, 'lon:', lon);
  }
  const rows = await client.query<JurisdictionRecord>(
    `
    SELECT
      id,
      name,
      code,
      type,
      type AS level,
      priority,
      parent_id AS "parentId"
    FROM jurisdictions
    WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    ORDER BY priority ASC, ST_Area(geom::geography) ASC
    `,
    [lon, lat],
  );

  return rows.rows;
}

export function sortJurisdictionChain(chain: JurisdictionRecord[]): JurisdictionRecord[] {
  return [...chain].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return specificityRank(left.level) - specificityRank(right.level);
  });
}

export function orderJurisdictionChain(chain: JurisdictionRecord[]): JurisdictionRecord[] {
  return sortJurisdictionChain(chain);
}

function specificityRank(level: JurisdictionRecord['level']): number {
  switch (level) {
    case 'local':
      return 5;
    case 'city':
      return 4;
    case 'district':
      return 3;
    case 'state':
      return 2;
    case 'country':
    default:
      return 1;
  }
}
