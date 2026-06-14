# Official Data Pipeline

This workspace now seeds a small authoritative corpus that is safe to expand without changing the retrieval contract.

Initial sources:

- Ministry of Road Transport and Highways PDFs from the official MoRTH portal
- Parivahan eChallan and fee pages
- data.gov.in ministry landing page for datasets and licensing context

Ingestion flow:

1. Seed source registry with `npm run seed:sources`.
2. Download and index the curated corpus with `npm run ingest:official-corpus`.
3. Query and evidence generation use the same `documents`, `document_pages`, and `document_chunks` tables.

Storage layout:

- Downloaded raw inputs are written to `backend/data/raw/official-corpus/`.
- A machine-readable import summary is written to `backend/data/raw/official-corpus/import-summary.json`.

Current corpus focus:

- fee-rule notifications
- challan and toll collection policy notices
- the Parivahan eChallan portal and related fee pages
- ministry landing pages for government-owned datasets
- each corpus entry carries source organization, source URL, update frequency, reliability, and why it was included

Validation rules:

- PDF downloads must start with the `%PDF` header.
- Every artifact must produce some extracted text, or be flagged for OCR follow-up.
- Validation output is written alongside the corpus summaries so failed downloads are visible before ingestion.

The goal is to replace fallback-only answers with evidence-backed retrieval rooted in current government sources.