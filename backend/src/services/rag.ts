import { EvidenceReference } from '../types';
import { config } from '../config';

export interface MessageRecord {
  role: 'user' | 'assistant';
  content: string;
}

export interface SynthesisRequest {
  question: string;
  evidence: EvidenceReference[];
  jurisdictionSummary?: string;
  model?: string;
  history?: MessageRecord[];
}

export interface SynthesisResult {
  answer: string;
  confidence: number;
}

export async function synthesizeAnswer(request: SynthesisRequest): Promise<SynthesisResult> {
  if (request.evidence.length === 0) {
    return {
      answer: 'Authoritative evidence not available.',
      confidence: 0,
    };
  }

  const evidenceText = request.evidence
    .map((item, index) => `${index + 1}. [Page ${item.pageNumber}] ${item.excerpt}`)
    .join('\n');

  const prompt = buildPrompt(request.question, evidenceText, request.jurisdictionSummary);

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = request.model ?? process.env.LLM_MODEL ?? 'gpt-4.1-mini';

  if (apiKey) {
    const messages = [
      { role: 'system', content: 'You are DriveLegal. Answer only from the provided evidence. If evidence is insufficient, say so.' }
    ];

    if (request.history && request.history.length > 0) {
      request.history.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM synthesis failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = data.choices?.[0]?.message?.content?.trim() || fallbackAnswer(request.question, evidenceText, request.history);
    return { answer, confidence: scoreConfidence(request.evidence) };
  }

  return {
    answer: fallbackAnswer(request.question, evidenceText, request.history),
    confidence: scoreConfidence(request.evidence),
  };
}

function buildPrompt(question: string, evidenceText: string, jurisdictionSummary?: string): string {
  return [
    `Question: ${question}`,
    jurisdictionSummary ? `Jurisdiction: ${jurisdictionSummary}` : '',
    'Evidence:',
    evidenceText,
    'Rules:',
    '- Format your entire response exactly with the following sections in order, using markdown headings:',
    '  ### 🚦 Fine Summary',
    '  [Summarize the fine and violation details]',
    '  ### 📜 Legal Provision',
    '  [Specify the section/clause of the Motor Vehicles Act or state rules]',
    '  ### 📍 Jurisdiction',
    '  [State the applicable jurisdiction and state]',
    '  ### 💰 Fine Amount',
    '  [State the exact fine amount in INR, e.g. ₹1000]',
    '  ### 📝 Explanation',
    '  [Explain the reasoning and penalty details in a structured way]',
    '  ### 📚 Evidence Sources',
    '  [List the official document sources cited in the evidence]',
    '  ### ⚠ Disclaimer',
    '  [Add the standard legal disclaimer]',
    '- Use only the evidence provided above.',
    '- If the evidence does not fully support the answer, state that clearly.',
    '- Keep the answer concise and cite page numbers in prose.',
  ]
    .filter(Boolean)
    .join('\n');
}

function extractFallbackDetails(evidenceText: string) {
  const codeMatch = evidenceText.match(/Code:\s*([A-Z0-9_-]+)/);
  const offenseMatch = evidenceText.match(/Offense:\s*([^\n]+)/);
  const fineMatch = evidenceText.match(/Base Fine:\s*INR\s*(\d+)/);
  const clauseMatch = evidenceText.match(/Legal Clause:\s*([^\n]+)/);
  
  const code = codeMatch ? codeMatch[1] : 'MVA';
  const offense = offenseMatch ? offenseMatch[1] : 'Traffic Violation';
  const fine = fineMatch ? `₹${fineMatch[1]}` : '₹1000';
  const clause = clauseMatch ? clauseMatch[1] : 'Relevant Section of Motor Vehicles Act';

  return { code, offense, fine, clause };
}

function fallbackAnswer(question: string, evidenceText: string, history?: MessageRecord[]): string {
  if (!evidenceText.trim()) {
    return 'Authoritative evidence not available.';
  }

  const { code, offense, fine, clause } = extractFallbackDetails(evidenceText);

  return [
    `### 🚦 Fine Summary\nViolation: ${offense} (${code})`,
    `### 📜 Legal Provision\nSection ${clause}`,
    `### 📍 Jurisdiction\nApplicable State and Municipal boundaries resolved by active coordinates.`,
    `### 💰 Fine Amount\n${fine}`,
    `### 📝 Explanation\nUnder the Motor Vehicles Act / state rules, the designated fine for ${offense.toLowerCase()} is ${fine}. Repeat offenses or commercial operation may carry higher compounding rates or court referral.`,
    `### 📚 Evidence Sources\nOfficial Source Gazette and Motor Vehicles Act provisions corresponding to: ${code}.\n\nEvidence Excerpts:\n${evidenceText}`,
    `### ⚠ Disclaimer\nThis response is informational and must be verified against the official source documents shown in the citations.`
  ].join('\n\n');
}

function scoreConfidence(evidence: EvidenceReference[]): number {
  if (evidence.length === 0) {
    return 0.1;
  }
  const average = evidence.reduce((sum, item) => sum + item.ocrConfidence, 0) / evidence.length;
  return Math.max(0.2, Math.min(0.95, Math.round(average * 1000) / 1000));
}

export async function retrieveEvidence(
  question: string,
  stateCode?: string,
  jurisdictionCode?: string,
  jurisdictionChain: any[] = []
) {
  console.log('[API_QUERY] [SERVICE_LAYER] Entered retrieveEvidence() for question:', question, 'stateCode:', stateCode, 'jurisdictionCode:', jurisdictionCode);
  
  const lowerQuery = question.toLowerCase();
  
  // Blacklist check (prompt injection, SQL payloads, irrelevant topics)
  const blacklistRegex = /\b(pasta|spaghetti|pizza|recipe|cooking|cook|movie|movies|cinema|film|films|prime minister|president|election|elections|sql|select\s+.*\s+from|drop\s+table|delete\s+from|insert\s+into|union\s+select|alter\s+table|grant\s+all|system\s+role|ignore\s+previous|you\s+are\s+a\s+chatbot|jailbreak|dan\s+mode)\b/i;
  if (blacklistRegex.test(lowerQuery)) {
    console.log('[API_QUERY] [SERVICE_LAYER] Blacklist matched, bypassing retrieval.');
    const { buildEvidenceBundle } = await import('./evidence');
    return buildEvidenceBundle(question, jurisdictionChain, []);
  }

  const { generateEmbedding, searchSimilar, searchSimilarRules } = await import('./vector-store');
  const { query } = await import('../db');
  const { buildEvidenceBundle } = await import('./evidence');
  const { expandSynonyms, synonymMap } = await import('./synonyms');

  const expandedQuery = expandSynonyms(question);
  const questionEmbedding = await generateEmbedding(expandedQuery);

  let matchedAnyCategory = false;
  // Detect section regex patterns (e.g. sec 184 or section 184)
  if (/sec(?:tion)?\s*\d+/i.test(lowerQuery)) {
    matchedAnyCategory = true;
  } else {
    for (const [canonical, phrases] of Object.entries(synonymMap)) {
      for (const phrase of phrases) {
        const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(lowerQuery)) {
          matchedAnyCategory = true;
          break;
        }
      }
      if (matchedAnyCategory) break;
    }
  }

  const chunkThreshold = matchedAnyCategory ? config.CHUNK_SIMILARITY_THRESHOLD : 0.55;
  const ruleThreshold = matchedAnyCategory ? config.RULE_SIMILARITY_THRESHOLD : 0.60;

  // 1. Semantic Retrieval (Top 50) for Chunks
  const rawSemanticResults = await searchSimilar(questionEmbedding, 50);
  const semanticResults = rawSemanticResults.filter(res => res.score >= chunkThreshold);

  // 2. BM25 Retrieval from Document Chunks (Top 50)
  const bm25Params: any[] = [expandedQuery];
  let bm25QueryStr = `
    SELECT c.id as chunk_id, ts_rank(c.search_vector, plainto_tsquery('english', $1)) AS bm25_rank
    FROM document_chunks c
    INNER JOIN documents d ON d.id = c.document_id
    WHERE to_tsvector('english', c.chunk_text) @@ plainto_tsquery('english', $1)
  `;

  if (stateCode) {
    bm25Params.push(stateCode);
    bm25QueryStr += ` AND (d.jurisdiction_code = $${bm25Params.length} OR d.jurisdiction_code IS NULL)`;
  }

  if (jurisdictionCode) {
    bm25Params.push(jurisdictionCode);
    bm25QueryStr += ` AND (d.jurisdiction_code = $${bm25Params.length} OR d.jurisdiction_code IS NULL)`;
  }

  bm25QueryStr += `
    ORDER BY bm25_rank DESC
    LIMIT 50
  `;

  const bm25Rows = await query<{ chunk_id: string; bm25_rank: number }>(bm25QueryStr, bm25Params);

  // 3. Rule Retrieval (Semantic Only to avoid BM25 OR noise)
  const ruleSemanticResults = await searchSimilarRules(questionEmbedding, 10);
  
  const ruleScores = new Map<string, number>();
  const K = 60;

  ruleSemanticResults.forEach((res, idx) => {
    if (res.score >= ruleThreshold) {
      const rank = idx + 1;
      ruleScores.set(res.ruleId, 1 / (K + rank));
    }
  });

  const topRules = Array.from(ruleScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let finalRuleRows: any[] = [];
  if (topRules.length > 0) {
    const ruleIds = topRules.map(t => t[0]);
    finalRuleRows = await query<{
      id: string;
      offense_code: string;
      description: string;
      base_fine: number;
      source_document_id: string;
      source_page_number: number;
      source_clause: string;
      document_title: string;
      organization: string | null;
      source_url: string;
    }>(`
      SELECT
        r.id, r.offense_code, r.description, r.base_fine, r.source_document_id, r.source_page_number, r.source_clause,
        d.title AS document_title, COALESCE(d.organization, o.organization) AS organization, d.source_url
      FROM rules r
      INNER JOIN documents d ON d.id = r.source_document_id
      LEFT JOIN official_sources o ON o.id = d.official_source_id
      WHERE r.id = ANY($1)
    `, [ruleIds]);
  }

  // 4. RRF (Reciprocal Rank Fusion) for chunks
  const chunkScores = new Map<string, number>();
  
  semanticResults.forEach((res, idx) => {
    const rank = idx + 1;
    chunkScores.set(res.chunkId, 1 / (K + rank));
  });

  bm25Rows.forEach((row, idx) => {
    const rank = idx + 1;
    const current = chunkScores.get(row.chunk_id) || 0;
    chunkScores.set(row.chunk_id, current + (1 / (K + rank)));
  });

  const allChunks = Array.from(chunkScores.keys());

  let dbRows: any[] = [];
  if (allChunks.length > 0) {
    const rawDbRows = await query<{
      document_id: string;
      document_title: string;
      organization: string | null;
      source_url: string;
      page_number: number;
      excerpt: string;
      ocr_confidence: number;
      ingestion_timestamp: string;
      chunk_id: string;
      crop_url: string | null;
    }>(`
      SELECT
        c.document_id, d.title AS document_title, COALESCE(d.organization, o.organization) AS organization,
        d.source_url, c.page_number, c.chunk_text AS excerpt, c.ocr_confidence, c.created_at AS ingestion_timestamp,
        c.id AS chunk_id, c.crop_url
      FROM document_chunks c
      INNER JOIN documents d ON d.id = c.document_id
      LEFT JOIN official_sources o ON o.id = d.official_source_id
      WHERE c.id = ANY($1)
    `, [allChunks]);

    const { loadIndex, cosineSimilarity } = await import('./vector-store');
    const vectorIndex = await loadIndex();
    const indexMap = new Map<string, number[]>();
    vectorIndex.forEach(entry => {
      indexMap.set(entry.chunkId, entry.embedding);
    });

    dbRows = rawDbRows.filter(row => {
      const chunkEmbedding = indexMap.get(row.chunk_id);
      if (!chunkEmbedding) return false;
      const score = cosineSimilarity(questionEmbedding, chunkEmbedding);
      return score >= chunkThreshold;
    });
  }

  // 5. Apply Authority Scoring & Combine Rules
  type ScoredItem = {
    documentId: string;
    documentTitle: string;
    organization: string | null;
    sourceUrl: string;
    pageNumber: number;
    excerpt: string;
    ocrConfidence: number;
    retrievalConfidence: number;
    ingestionTimestamp: string;
    chunkId: string;
    cropUrl?: string | null;
    isRule: boolean;
  };
  
  let scoredItems: ScoredItem[] = [];

  // Add mapped rules (highest priority)
  // Re-sort finalRuleRows to match topRules order
  finalRuleRows.sort((a, b) => {
    const aRank = topRules.findIndex(t => t[0] === a.id);
    const bRank = topRules.findIndex(t => t[0] === b.id);
    return aRank - bRank;
  });

  finalRuleRows.forEach((rule, idx) => {
    scoredItems.push({
      documentId: rule.source_document_id,
      documentTitle: rule.document_title,
      organization: rule.organization,
      sourceUrl: rule.source_url,
      pageNumber: rule.source_page_number,
      excerpt: `[OFFENSE RULE MATCH]\nCode: ${rule.offense_code}\nOffense: ${rule.description}\nBase Fine: INR ${rule.base_fine}\nLegal Clause: ${rule.source_clause}`,
      retrievalConfidence: 2.0 + (1 / (K + idx + 1)), // Guarantee rules appear at the top
      chunkId: 'rule-' + rule.id,
      isRule: true,
      ocrConfidence: 0,
      ingestionTimestamp: new Date().toISOString(),
    });
  });

  // Score document chunks
  dbRows.forEach(row => {
    const org = (row.organization || '').toLowerCase();
    const url = (row.source_url || '').toLowerCase();
    const isWiki = org.includes('wikipedia') || url.includes('wikipedia.org');
    const isHighAuthority = org.includes('morth') || org.includes('parivahan') || org.includes('gazette') || org.includes('police') || org.includes('transport') || url.includes('morth.gov.in') || url.includes('parivahan.gov.in');
    
    // Authority is a secondary boost (relevance is primary)
    let authorityMultiplier = 1.0;
    if (isHighAuthority) authorityMultiplier = 1.2;
    else if (isWiki) authorityMultiplier = 0.5; // Penalize, but don't nuke (relevance allows it to surface if no other data exists)

    const rrfScore = chunkScores.get(row.chunk_id) || 0;
    
    scoredItems.push({
      documentId: row.document_id,
      documentTitle: row.document_title,
      organization: row.organization,
      sourceUrl: row.source_url,
      pageNumber: row.page_number,
      excerpt: row.excerpt,
      ocrConfidence: row.ocr_confidence ?? 0,
      retrievalConfidence: rrfScore * authorityMultiplier,
      ingestionTimestamp: row.ingestion_timestamp,
      chunkId: row.chunk_id,
      cropUrl: row.crop_url,
      isRule: false,
    });
  });

  // Sort by finalScore (relevance * authority)
  scoredItems.sort((a, b) => b.retrievalConfidence - a.retrievalConfidence);

  // 6. Source Diversity Controls (Max 2 items per document)
  const top5: ScoredItem[] = [];
  const docCounts = new Map<string, number>();

  for (const item of scoredItems) {
    if (top5.length >= 5) break;
    
    const count = docCounts.get(item.documentId) || 0;
    if (count < 2) {
      top5.push(item);
      docCounts.set(item.documentId, count + 1);
    }
  }

  if (top5.length === 0) {
    return buildEvidenceBundle(question, jurisdictionChain, []);
  }

  return buildEvidenceBundle(
    question,
    jurisdictionChain,
    top5.map(({ isRule, ...rest }) => rest)
  );
}
