# DriveLegal Implementation Roadmap

This document records the finalized Plan A implementation order and the code delivered in the repository.

## Phase 0: Project setup
- Goal: Create the monorepo, manifests, and environment contracts.
- Files: `package.json`, `backend/package.json`, `frontend/package.json`, `.env.example`, `docker-compose.yml`.
- Validation: `npm install`, `npm run build`.

## Phase 1: Repository structure
- Goal: Establish backend, frontend, scripts, docs, infra, and data folders.
- Validation: `backend/`, `frontend/`, `docs/`, `infra/`, `scripts/` all exist.

## Phase 2: Database setup (PostgreSQL + PostGIS)
- Goal: Provision the authoritative database and spatial capability.
- Files: `backend/sql/001_init.sql`, `docker-compose.yml`.
- Validation: Start `db` service and confirm `CREATE EXTENSION postgis`.

## Phase 3: Government dataset acquisition
- Goal: Register official sources and ingest only authoritative documents.
- Files: `backend/data/official_sources.json`, `backend/src/scripts/seed-official-sources.ts`, `backend/src/scripts/ingest-document.ts`.
- Validation: `npm --workspace backend run seed:sources`.

## Phase 4: PDF ingestion pipeline
- Goal: Download and parse official PDFs into documents and chunks.
- Files: `backend/src/services/ingest.ts`.
- Validation: Ingest a PDF and observe rows in `documents`, `document_pages`, and `document_chunks`.

## Phase 5: OCR pipeline
- Goal: Preserve OCR confidence and page provenance for scanned documents.
- Files: `backend/sql/001_init.sql`, `backend/src/services/ingest.ts`.
- Validation: OCR-capable documents should populate page provenance and confidence fields.

## Phase 6: Rule extraction pipeline
- Goal: Extract offense codes, fines, compounding amounts, and citations into structured rules.
- Files: `backend/sql/001_init.sql`, `backend/src/app.ts` rule search, `backend/src/types.ts`.
- Validation: Rules appear in `/api/rules/search` and maintain source references.

## Phase 7: Database schema implementation
- Goal: Persist jurisdictions, documents, pages, chunks, rules, provenance, and ingestion jobs.
- Files: `backend/sql/001_init.sql`.
- Validation: Database bootstraps cleanly in Docker.

## Phase 8: Jurisdiction resolver
- Goal: Resolve the most specific applicable jurisdiction using PostGIS.
- Files: `backend/src/services/jurisdiction.ts`, `backend/src/app.ts`.
- Validation: `npm --workspace backend test`.

## Phase 9: Vector indexing
- Goal: Support retrieval over official evidence chunks.
- Files: `backend/src/services/rag.ts`, `backend/sql/001_init.sql`.
- Validation: `/api/query` returns evidence-ranked chunks.

## Phase 10: RAG pipeline
- Goal: Generate answer synthesis only from retrieved evidence.
- Files: `backend/src/services/rag.ts`, `backend/src/app.ts`.
- Validation: `/api/query` returns answer plus evidence bundle.

## Phase 11: Evidence bundle system
- Goal: Return traceable evidence with source, page, and OCR confidence.
- Files: `backend/src/services/evidence.ts`, `backend/src/app.ts`.
- Validation: `/api/query` and `/api/evidence/:documentId`.

## Phase 12: Deterministic challan engine
- Goal: Compute fines deterministically from structured rule data.
- Files: `backend/src/services/challan.ts`, `backend/tests/challan.test.ts`.
- Validation: `npm --workspace backend test`.

## Phase 13: Backend APIs
- Goal: Expose query, ingest, evidence, challan, source registry, and admin verification endpoints.
- Files: `backend/src/app.ts`.
- Validation: `npm --workspace backend run build`.

## Phase 14: Frontend UI
- Goal: Provide the user demo shell for query, evidence, challan, QR, sources, and admin verification.
- Files: `frontend/src/App.tsx`, `frontend/src/styles.css`, `frontend/src/types.ts`.
- Validation: `npm --workspace frontend run build`.

## Phase 15: Admin verification panel
- Goal: Allow human verification and correction of extracted rules.
- Files: `frontend/src/App.tsx`, `backend/src/app.ts`.
- Validation: Search rules and patch verification status.

## Phase 16: QR-backed challan generation
- Goal: Generate a QR-linked PDF challan from deterministic totals.
- Files: `backend/src/services/challan-pdf.ts`, `backend/src/app.ts`, `frontend/src/App.tsx`.
- Validation: Download the generated PDF and scan the QR.

## Phase 17: Testing suite
- Goal: Validate deterministic challan logic, jurisdiction ordering, and the full build.
- Files: `backend/tests/*.test.ts`, `backend/vitest.config.ts`.
- Validation: `npm --workspace backend test` and `npm run build`.

## Phase 18: Deployment
- Goal: Ship reproducibly with Docker.
- Files: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`.
- Validation: `docker compose up --build`.

## Phase 19: Demo preparation
- Goal: Prepare golden queries, seeded sources, and a demo-ready narrative.
- Files: `docs/implementation-roadmap.md`, `README.md`.
- Validation: Stable query output for demo script.

## Delivered in this repository
- Monorepo scaffold
- PostgreSQL + PostGIS schema
- Official source registry
- Ingestion pipeline
- Jurisdiction resolver
- Deterministic challan engine
- Evidence bundle and RAG scaffolding
- QR-backed PDF challan generation
- Backend APIs
- React frontend with admin verification panel
- Docker deployment artifacts
- Passing backend tests and successful root build
