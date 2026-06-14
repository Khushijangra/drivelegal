# Changelog

All notable changes to DriveLegal are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- pgvector integration for scalable vector search
- Cross-encoder re-ranking post-RRF
- Scanned PDF OCR via cloud provider
- Rule coverage expansion to all 28 Indian states

---

## [1.0.0] — 2024-12-XX — IIT Madras Hackathon Release

### Added

#### Core Infrastructure
- Provenance-first PostgreSQL schema with 8 tables (`official_sources`, `documents`, `document_pages`, `document_chunks`, `rules`, `jurisdictions`, `provenance_events`, `query_logs`)
- PostGIS 3.4 integration for spatial jurisdiction resolution
- Docker Compose stack (PostgreSQL + pgAdmin + Backend + Frontend)
- Zod-validated environment configuration with graceful error reporting
- PostgreSQL connection pool with transaction helpers

#### Retrieval System
- Hybrid RAG pipeline combining BM25 (Postgres `tsvector`) + Semantic cosine similarity
- Reciprocal Rank Fusion (RRF) for combining retrieval rankings
- Authority scoring: official government sources boosted 1.2×, Wikipedia penalized 0.5×
- Source diversity control: maximum 2 items per source document
- Synonym expansion across 19 Indian traffic offense categories
- Similarity threshold gates: per-category (0.38/0.33) and strict mode (0.60/0.55)
- Blacklist for SQL injection patterns and off-topic queries

#### Embeddings
- OpenAI `text-embedding-3-small` (1536-dim) primary embedding
- Xenova `all-MiniLM-L6-v2` (384-dim) offline fallback via ONNX
- Zero-native-dependency TypeScript vector store with cosine similarity
- Separate chunk and rule vector indices with dimensionality mismatch detection

#### Jurisdiction Engine
- PostGIS `ST_Contains` point-in-polygon resolution for 694 Indian administrative boundaries
- District → State → National hierarchy chain
- Delhi/NCT dual-jurisdiction handling (DL/NCT aliasing)

#### Challan Engine
- Deterministic rule-based fine calculator — 0% LLM involvement
- Vehicle class specificity: wildcard (`*`) vs exact class matching
- Most-specific rule selection with tie-breaking by `effective_date`
- Modifiers: repeat offense (+50%), commercial vehicle (+10%), court compounding
- Full provenance: every fine item linked to `source_document_id`, `source_page_number`, `source_clause`
- 22 Vitest unit tests covering all modifier combinations

#### Computer Vision Pipeline
- Stage 1: YOLOS-tiny object detection at 0.1 raw threshold
- Stage 2: ResNet-50 crop classification per bounding box
- Helmet detection (rider and pillion, upper body crop)
- Seatbelt detection (windshield region crop)
- Road hazard detection (lower image half crop)
- Full offline operation via ONNX (no GPU required)
- Stage timing breakdown (`decodeMs`, `yolosMs`, `cropMs`, `classifierMs`)
- Benchmark: Helmet F1=0.938, Seatbelt F1=0.898, Road Hazard F1=0.955

#### Document Ingestion
- PDF ingestion pipeline with `pdfjs-dist` text extraction
- OCR fallback with `tesseract.js` (active on Linux/macOS)
- Async ingestion job tracking with status polling endpoint
- Official source registry with reliability and coverage metadata

#### API Layer
- 13 REST endpoints covering: query, jurisdiction, challan, vision, rules, sources, evidence, admin
- QR-backed challan PDF generation with `PDFKit` + `qrcode`
- Admin rule verification workflow (approved/needs-review/rejected)
- Admin statistics endpoint with document/chunk/rule/jurisdiction counts

#### Frontend
- React 18 + Vite + TypeScript dark-mode UI
- Natural language search interface with jurisdiction display
- Evidence bundle viewer with source citations
- Challan breakdown with line-item fines and source references
- Computer vision upload interface with bounding box results
- Rules search and verification dashboard

#### Data
- 5 official sources registered (MoRTH, Delhi Traffic Police, state transport authorities)
- 55 documents ingested, 43 pages, 950 text chunks
- 109 verified traffic rules across multiple states
- 694 administrative jurisdiction geometries (India districts + states)

### Fixed
- Retrieval hallucination: added similarity thresholds to prevent irrelevant queries returning rules
- Dimensionality mismatch detection in vector store (graceful BM25 fallback)
- Delhi/NCT dual-code aliasing for jurisdiction-scoped rule lookup

### Known Issues
- Red-team test suite has a property mismatch bug (`isRule` stripped from evidence items before test assertion)
- Scanned PDF OCR inactive on Windows due to canvas renderer limitation
- In-memory vector store does not scale beyond ~10k chunks

---

[Unreleased]: https://github.com/YOUR_USERNAME/drivelegal/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/YOUR_USERNAME/drivelegal/releases/tag/v1.0.0
