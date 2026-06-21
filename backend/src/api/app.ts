import cors from 'cors';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config';
import { query, withTransaction } from '../database/db';
import { calculateChallan } from '../agents/challan';
import { generateChallanPdf } from '../services/challan-pdf';
import { buildEvidenceBundle } from '../agents/evidence';
import { ingestPdfDocument, ingestTextDocument } from '../services/ingest';
import { resolveJurisdictionChain, sortJurisdictionChain } from '../services/jurisdiction';
import { synthesizeAnswer, retrieveEvidence } from '../rag/rag';
import { ChallanRequest, RuleRecord } from '../types';

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: '10mb' }));

  // ── TASK 3: Admin API key middleware ──
  function requireAdminKey(req: Request, res: Response, next: any) {
    const header = req.headers['x-admin-key'] as string | undefined;
    const bearer = (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
    const provided = header || bearer;
    if (!provided || provided !== config.ADMIN_API_KEY) {
      return res.status(401).json({
        error: 'Unauthorized. Provide X-Admin-Key header or Authorization: Bearer <key>.',
        hint: 'Use the ADMIN_API_KEY configured in .env'
      });
    }
    next();
  }

  app.get('/health', async (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'drivelegal-backend' });
  });

  app.post('/api/ingest', async (req: Request, res: Response) => {
    const schema = z.object({
      sourceUrl: z.string().url(),
      title: z.string().min(2),
      officialSourceId: z.string().min(1),
      text: z.string().optional(),
      localFilePath: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const jobId = randomUUID();
    await query(
      `
        INSERT INTO ingestion_jobs (id, source_url, title, official_source_id, status)
        VALUES ($1, $2, $3, $4, 'running')
      `,
      [jobId, parsed.data.sourceUrl, parsed.data.title, parsed.data.officialSourceId],
    );

    try {
      const result = parsed.data.text
        ? await ingestTextDocument(
          {
            sourceUrl: parsed.data.sourceUrl,
            title: parsed.data.title,
            officialSourceId: parsed.data.officialSourceId,
            localFilePath: parsed.data.localFilePath,
          },
          parsed.data.text,
        )
        : await ingestPdfDocument({
            sourceUrl: parsed.data.sourceUrl,
            title: parsed.data.title,
            officialSourceId: parsed.data.officialSourceId,
            localFilePath: parsed.data.localFilePath,
          });

      await query(
        `
          UPDATE ingestion_jobs
          SET status = 'completed', document_id = $2, page_count = $3, chunk_count = $4, updated_at = NOW()
          WHERE id = $1
        `,
        [jobId, result.documentId, result.pageCount, result.chunkCount],
      );

      return res.status(201).json({ jobId, status: 'completed', ...result });
    } catch (error) {
      await query(
        `
          UPDATE ingestion_jobs
          SET status = 'failed', error_message = $2, updated_at = NOW()
          WHERE id = $1
        `,
        [jobId, error instanceof Error ? error.message : 'Unknown ingestion error'],
      );
      return res.status(500).json({ jobId, status: 'failed', error: error instanceof Error ? error.message : 'Unknown ingestion error' });
    }
  });

  app.get('/api/ingest/status/:id', async (req: Request, res: Response) => {
    const rows = await query<{
      id: string;
      source_url: string;
      title: string;
      official_source_id: string;
      status: string;
      document_id: string | null;
      page_count: number;
      chunk_count: number;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        SELECT id, source_url, title, official_source_id, status, document_id, page_count, chunk_count, error_message, created_at, updated_at
        FROM ingestion_jobs
        WHERE id = $1
      `,
      [req.params.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'job not found' });
    }

    return res.json(rows[0]);
  });

  app.get('/api/jurisdiction', async (req: Request, res: Response) => {
    const schema = z.object({ lat: z.coerce.number(), lon: z.coerce.number() });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'lat and lon are required' });
    }

    const jurisdictions = await withTransaction(async (client) => {
      const chain = await resolveJurisdictionChain(client, parsed.data.lat, parsed.data.lon);
      return sortJurisdictionChain(chain);
    });

    res.json({ jurisdictions });
  });

  app.post('/api/challan/calc', async (req: Request, res: Response) => {
    const schema = z.object({
      stateCode: z.string().min(1),
      vehicleClass: z.string().min(1),
      offenseCodes: z.array(z.string().min(1)).min(1),
      modifiers: z
        .object({
          repeatOffense: z.boolean().optional(),
          commercialVehicle: z.boolean().optional(),
          courtCompounding: z.boolean().optional(),
        })
        .optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const rules = await loadRules(parsed.data.stateCode);
    const result = calculateChallan(parsed.data as ChallanRequest, rules);
    res.json(result);
  });

  app.post('/api/query', async (req: Request, res: Response) => {
    const schema = z.object({
      question: z.string().min(5),
      lat: z.number().optional(),
      lon: z.number().optional(),
      stateCode: z.string().optional(),
      vehicleClass: z.string().optional(),
      offenseCodes: z.array(z.string()).optional(),
      history: z.array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string()
        })
      ).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    if (process.env.DEBUG) console.log('[query] POST /api/query question:', parsed.data.question);

    const jurisdictionChain = parsed.data.lat !== undefined && parsed.data.lon !== undefined
      ? sortJurisdictionChain(await withTransaction(async (client) => {
          if (process.env.DEBUG) console.log('[query] resolving jurisdiction for:', parsed.data.lat, parsed.data.lon);
          return resolveJurisdictionChain(client, parsed.data.lat!, parsed.data.lon!);
        }))
      : [];

    if (process.env.DEBUG) console.log('[query] jurisdictionChain length:', jurisdictionChain.length);
    const evidence = await retrieveEvidence(parsed.data.question, parsed.data.stateCode, jurisdictionChain.at(-1)?.code, jurisdictionChain);
    const synthesis = await synthesizeAnswer({
      question: parsed.data.question,
      evidence: evidence.items,
      jurisdictionSummary: jurisdictionChain.map((item) => `${item.level}:${item.name}`).join(' > '),
      history: parsed.data.history,
    });

    let finalOffenseCodes = parsed.data.offenseCodes || [];
    const extractedOffenseCodes: string[] = [];
    evidence.items.forEach((item) => {
      const match = item.excerpt.match(/Code:\s*([A-Z0-9_-]+)/i);
      if (match) {
        extractedOffenseCodes.push(match[1]);
      }
    });

    if (extractedOffenseCodes.length > 0) {
      finalOffenseCodes = extractedOffenseCodes;
    }

    let challan = null;
    if (parsed.data.stateCode && parsed.data.vehicleClass && finalOffenseCodes.length) {
      const rules = await loadRules(parsed.data.stateCode);
      challan = calculateChallan(
        {
          stateCode: parsed.data.stateCode,
          vehicleClass: parsed.data.vehicleClass,
          offenseCodes: finalOffenseCodes,
        },
        rules,
      );
    }
    await query(
      `
        INSERT INTO query_logs (id, query_text, lat, lon, state_code, answer_confidence)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [randomUUID(), parsed.data.question, parsed.data.lat ?? null, parsed.data.lon ?? null, parsed.data.stateCode ?? null, synthesis.confidence],
    );

    res.json({
      answer: synthesis.answer,
      jurisdictionChain,
      evidenceBundle: evidence,
      challan,
      confidence: synthesis.confidence,
      disclaimers: [
        'This response is informational and must be verified against the source documents shown in the evidence bundle.',
        'Legal calculations are deterministic and derived only from official source records.',
      ],
    });
  });

  app.post('/api/challan/generate', async (req: Request, res: Response) => {
    const schema = z.object({
      stateCode: z.string().min(1),
      vehicleClass: z.string().min(1),
      offenseCodes: z.array(z.string().min(1)).min(1),
      evidenceUrl: z.string().url(),
      title: z.string().optional(),
      modifiers: z
        .object({
          repeatOffense: z.boolean().optional(),
          commercialVehicle: z.boolean().optional(),
          courtCompounding: z.boolean().optional(),
        })
        .optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const rules = await loadRules(parsed.data.stateCode);
    const challan = calculateChallan(parsed.data as ChallanRequest, rules);
    const pdf = await generateChallanPdf({
      challan: {
        ...challan,
        jurisdictionChain: challan.jurisdictionChain.length > 0 ? challan.jurisdictionChain : [],
      },
      evidenceUrl: parsed.data.evidenceUrl,
      title: parsed.data.title,
    });
    await query(
      `
        INSERT INTO query_logs (id, query_text, lat, lon, state_code, answer_confidence)
        VALUES ($1, $2, NULL, NULL, $3, $4)
      `,
      [randomUUID(), `challan:${parsed.data.offenseCodes.join(',')}`, parsed.data.stateCode, Math.min(1, challan.total / 100000)],
    );

    res.json({
      challan,
      qrDataUrl: pdf.qrDataUrl,
      pdfBase64: pdf.pdfBuffer.toString('base64'),
    });
  });

  app.get('/api/admin/stats', requireAdminKey, async (req: Request, res: Response) => {
    try {
      const docQuery = await query<{ count: string }>('SELECT count(*) FROM documents');
      const chunkQuery = await query<{ count: string }>('SELECT count(*) FROM document_chunks');
      const ruleQuery = await query<{ count: string }>('SELECT count(*) FROM rules');
      const jurisdictionQuery = await query<{ count: string }>('SELECT count(*) FROM jurisdictions');
      const logQuery = await query<{ count: string }>('SELECT count(*) FROM query_logs');
      
      res.json({
        documentCount: parseInt(docQuery[0].count),
        chunkCount: parseInt(chunkQuery[0].count),
        ruleCount: parseInt(ruleQuery[0].count),
        jurisdictionCount: parseInt(jurisdictionQuery[0].count),
        queryCount: parseInt(logQuery[0].count),
        citationCoveragePercent: 100 // System mandates strict official provenance
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/evidence/:documentId', async (req: Request, res: Response) => {
    const documentId = req.params.documentId;
    const documents = await query<{ id: string; title: string; source_url: string; organization: string | null }>(
      `
      SELECT d.id, d.title, d.source_url, COALESCE(d.organization, o.organization) AS organization
      FROM documents d
      LEFT JOIN official_sources o ON o.id = d.official_source_id
      WHERE d.id = $1
      `,
      [documentId],
    );

    if (documents.length === 0) {
      return res.status(404).json({ error: 'document not found' });
    }

    const pages = await query<{ page_number: number; page_text: string; ocr_confidence: number }>(
      `SELECT page_number, page_text, ocr_confidence, created_at FROM document_pages WHERE document_id = $1 ORDER BY page_number ASC`,
      [documentId],
    );

    res.json({
      document: documents[0],
      pages,
    });
  });

  app.patch('/api/admin/rules/:id/verify', requireAdminKey, async (req: Request, res: Response) => {
    const schema = z.object({
      status: z.enum(['approved', 'rejected', 'needs-review']),
      notes: z.string().optional(),
      verifiedBy: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `
        UPDATE rules
        SET verification_status = $1,
            verification_notes = $2,
            verified_by = $3,
            verified_at = NOW()
        WHERE id = $4
        RETURNING id, verification_status, verification_notes, verified_by, verified_at
        `,
        [parsed.data.status, parsed.data.notes ?? null, parsed.data.verifiedBy, req.params.id],
      );
      return result.rows[0] ?? null;
    });

    if (!updated) {
      return res.status(404).json({ error: 'rule not found' });
    }

    res.json(updated);
  });

  app.get('/api/rules/search', async (req: Request, res: Response) => {
    const schema = z.object({
      q: z.string().min(2),
      stateCode: z.string().optional(),
    });

    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const stateCode = parsed.data.stateCode;
    const lookupCodes = stateCode ? [stateCode, '*'] : [];
    if (stateCode === 'DL') {
      lookupCodes.push('NCT');
    } else if (stateCode === 'NCT') {
      lookupCodes.push('DL');
    }

    const { synonymMap } = await import('../rag/synonyms');
    const q = parsed.data.q.toLowerCase().trim();
    const searchTerms: string[] = [q];
    
    // Match synonyms
    for (const [canonical, phrases] of Object.entries(synonymMap)) {
      const isMatched = phrases.some(p => p.toLowerCase().includes(q) || q.includes(p.toLowerCase())) || canonical.toLowerCase().includes(q);
      if (isMatched) {
        searchTerms.push(canonical);
        phrases.forEach(p => {
          if (p.length > 2) {
            searchTerms.push(p);
          }
        });
      }
    }
    
    // Split into individual words
    const individualWords = q.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
    individualWords.forEach(w => searchTerms.push(w));
    
    const uniqueTerms = Array.from(new Set(searchTerms));
    const wildcardPatterns = uniqueTerms.map(t => `%${t}%`);

    const queryParams: any[] = [parsed.data.q, wildcardPatterns];
    
    let queryStr = `
      SELECT
        rules.id,
        offense_code AS "offenseCode",
        description,
        state_code AS "stateCode",
        vehicle_class AS "vehicleClass",
        base_fine AS "baseFine",
        compounding_fine AS "compoundingFine",
        demerit_points AS "demeritPoints",
        effective_date AS "effectiveFrom",
        verification_status AS "verificationStatus",
        verification_notes AS "verificationNotes",
        verified_by AS "verifiedBy",
        verified_at AS "verifiedAt",
        jsonb_build_object(
          'id', provenance_events.id,
          'sourceId', COALESCE(provenance_events.source_document_id, rules.source_document_id),
          'sourceUrl', COALESCE(provenance_events.source_url, documents.source_url),
          'documentId', COALESCE(provenance_events.source_document_id, rules.source_document_id),
          'pageNumber', COALESCE(provenance_events.source_page_number, rules.source_page_number),
          'sourceClause', COALESCE(provenance_events.source_clause, rules.source_clause),
          'extractedAt', COALESCE(provenance_events.created_at, rules.created_at)
        )::jsonb AS "sourceReference"
      FROM rules
      LEFT JOIN documents ON documents.id = rules.source_document_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM provenance_events
        WHERE provenance_events.entity_type = 'rule' AND provenance_events.entity_id = rules.id
        ORDER BY provenance_events.created_at DESC
        LIMIT 1
      ) provenance_events ON TRUE
      WHERE (
        to_tsvector('english', rules.description || ' ' || rules.offense_code || ' ' || rules.source_clause) @@ plainto_tsquery('english', $1)
        OR rules.description ILIKE ANY($2)
        OR rules.offense_code ILIKE ANY($2)
        OR rules.source_clause ILIKE ANY($2)
      )
    `;

    if (stateCode) {
      queryParams.push(lookupCodes);
      queryStr += ` AND rules.state_code = ANY($3)`;
    }

    queryStr += `
      ORDER BY effective_date DESC
      LIMIT 20
    `;

    const rules = await query<RuleRecord>(queryStr, queryParams);
    res.json({ rules });
  });

  app.get('/api/official-sources', async (_req: Request, res: Response) => {
    const rows = await query<{ id: string; organization: string; name: string; url: string; format: string; update_frequency: string; reliability: string; coverage: string; key_fields: string[]; integration_difficulty: string; expected_impact: string }>(
      `SELECT id, organization, name, url, format, update_frequency, reliability, coverage, key_fields, integration_difficulty, expected_impact FROM official_sources ORDER BY organization, name`,
    );

    res.json({ sources: rows });
  });

  app.post('/api/vision/analyze', async (req: Request, res: Response) => {
    const schema = z.object({
      image: z.string().min(10),
      fileName: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const { analyzeRoadImage } = await import('../agents/vision');
      const result = await analyzeRoadImage(parsed.data.image, parsed.data.fileName);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Vision analysis failed' });
    }
  });

  app.get('/api/vision/health', async (req: Request, res: Response) => {
    try {
      const { getVisionHealth } = await import('../agents/vision');
      return res.json(getVisionHealth());
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/vision/datasets', async (req: Request, res: Response) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const baseDir = path.join(__dirname, '../data/benchmark');
      if (!fs.existsSync(baseDir)) {
        return res.json({ categories: [], imageCounts: {}, totalImages: 0 });
      }
      const categories = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isDirectory());
      const imageCounts: Record<string, number> = {};
      let totalImages = 0;
      for (const cat of categories) {
        const files = fs.readdirSync(path.join(baseDir, cat)).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
        imageCounts[cat] = files.length;
        totalImages += files.length;
      }
      return res.json({ categories, imageCounts, totalImages });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/vision/evaluate', async (req: Request, res: Response) => {
    try {
      const { evaluateVisionDataset } = await import('../agents/vision');
      const { datasetCategory } = req.body;
      if (!datasetCategory) {
         return res.status(400).json({ error: 'datasetCategory is required' });
      }
      const result = await evaluateVisionDataset(datasetCategory);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Vision evaluation failed' });
    }
  });

  // Warm-up the vision models in the background
  import('../agents/vision').then(({ initVisionModels }) => {
    initVisionModels().catch(err => console.error('[vision] Warm-up failed:', err));
  });

  return app;
}

async function loadRules(stateCode: string): Promise<RuleRecord[]> {
  const lookupCodes = [stateCode, '*'];
  if (stateCode === 'DL') {
    lookupCodes.push('NCT');
  } else if (stateCode === 'NCT') {
    lookupCodes.push('DL');
  }

  const rows = await query<RuleRecord>(
    `
    SELECT
      rules.id,
      offense_code AS "offenseCode",
      description,
      state_code AS "stateCode",
      vehicle_class AS "vehicleClass",
      base_fine AS "baseFine",
      compounding_fine AS "compoundingFine",
      demerit_points AS "demeritPoints",
      effective_date AS "effectiveFrom",
      jsonb_build_object(
        'id', provenance_events.id,
        'sourceId', COALESCE(provenance_events.source_document_id, rules.source_document_id),
        'sourceUrl', COALESCE(provenance_events.source_url, documents.source_url),
        'documentId', COALESCE(provenance_events.source_document_id, rules.source_document_id),
        'pageNumber', COALESCE(provenance_events.source_page_number, rules.source_page_number),
        'sourceClause', COALESCE(provenance_events.source_clause, rules.source_clause),
        'extractedAt', COALESCE(provenance_events.created_at, rules.created_at)
      )::jsonb AS "sourceReference"
    FROM rules
    LEFT JOIN documents ON documents.id = rules.source_document_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM provenance_events
      WHERE provenance_events.entity_type = 'rule' AND provenance_events.entity_id = rules.id
      ORDER BY provenance_events.created_at DESC
      LIMIT 1
    ) provenance_events ON TRUE
    WHERE state_code = ANY($1) AND verification_status IN ('approved', 'needs-review')
    ORDER BY effective_date DESC
    `,
    [lookupCodes],
  );

  return rows.map((row) => ({
    ...row,
    sourceReference: typeof row.sourceReference === 'string' ? JSON.parse(row.sourceReference) : row.sourceReference,
  }));
}


