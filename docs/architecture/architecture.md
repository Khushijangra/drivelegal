# DriveLegal — System Architecture

## Overview

DriveLegal is a multi-layer AI system built on a **provenance-first** principle: every legal answer must trace back to an official government document with a specific page number and statutory clause. This document covers the complete system design, component interactions, data flows, and key engineering decisions.

---

## High-Level Architecture

```mermaid
graph TD
    subgraph Client ["👤 Client Layer"]
        UI[React Frontend]
        CAM[Image Upload / Road Camera]
    end

    subgraph Gateway ["⚙️ API Gateway — Express + TypeScript"]
        ZOD[Zod Request Validation]
        AUTH[Admin Key Middleware]
        ROUTES[REST Routes — app.ts]
    end

    subgraph Services ["🔧 Service Layer"]
        GEO[Jurisdiction Resolver]
        RAG[Hybrid RAG Engine]
        CHALLAN[Challan Calculator]
        VISION[Vision Pipeline]
        INGEST[Ingestion Pipeline]
        PDF[PDF Generator]
    end

    subgraph ML ["🤖 ML Layer"]
        OPENAI[OpenAI Embeddings\ntext-embedding-3-small]
        XENOVA[Xenova/all-MiniLM-L6-v2\nOffline Fallback]
        YOLOS[YOLOS-tiny\nObject Detection]
        RESNET[ResNet-50\nCrop Classification]
    end

    subgraph Data ["🗄️ Data Layer"]
        PG[(PostgreSQL 16)]
        POSTGIS[(PostGIS 3.4\nSpatial Extension)]
        VIDX[("vector.index.json\nPure TS Cosine Similarity")]
        RIDX[("rules.vector.index.json\nRule Embeddings")]
    end

    UI --> ZOD --> ROUTES
    CAM --> ROUTES
    ROUTES --> GEO --> POSTGIS
    ROUTES --> RAG
    ROUTES --> CHALLAN --> PG
    ROUTES --> VISION --> YOLOS --> RESNET
    ROUTES --> INGEST --> PG

    RAG --> OPENAI
    RAG --> XENOVA
    RAG --> VIDX
    RAG --> RIDX
    RAG --> PG

    CHALLAN --> PDF
    INGEST --> VIDX
```

---

## Request Flow — Natural Language Query

```mermaid
sequenceDiagram
    actor User
    participant UI as React UI
    participant API as Express API
    participant GEO as Jurisdiction Resolver
    participant SYN as Synonym Expander
    participant EMB as Embedding Generator
    participant VEC as Vector Store
    participant BM25 as Postgres BM25
    participant RRF as RRF Fusion
    participant LLM as LLM Synthesizer
    participant DB as PostgreSQL

    User->>UI: "Fine for helmet violation in Delhi?"
    UI->>API: POST /api/query {question, lat, lon, stateCode}

    API->>GEO: resolveJurisdictionChain(lat, lon)
    GEO->>DB: ST_Contains(geom, ST_MakePoint(lon, lat))
    DB-->>GEO: [India, NCT Delhi, West District]
    GEO-->>API: jurisdictionChain

    API->>SYN: expandSynonyms(question)
    SYN-->>API: expandedQuery (+ "no helmet", "ISI certified")

    API->>EMB: generateEmbedding(expandedQuery)
    EMB->>EMB: Try OpenAI → fallback Xenova
    EMB-->>API: queryVector[1536]

    par Semantic Search
        API->>VEC: searchSimilar(queryVector, top=50)
        VEC-->>API: semanticResults (filtered by threshold)
    and BM25 Search
        API->>BM25: plainto_tsquery('english', expandedQuery)
        BM25-->>API: bm25Rows (ranked by ts_rank)
    and Rule Search
        API->>VEC: searchSimilarRules(queryVector, top=10)
        VEC-->>API: ruleResults (filtered by ruleThreshold)
    end

    API->>RRF: fuse(semanticResults, bm25Rows)
    RRF->>RRF: Apply authority scoring (×1.2 official, ×0.5 wiki)
    RRF->>RRF: Source diversity cap (max 2/document)
    RRF-->>API: top5Items + ruleMatches

    API->>DB: Fetch chunk details + rule details
    DB-->>API: evidenceBundle

    API->>LLM: synthesizeAnswer(question, evidence, jurisdiction)
    LLM-->>API: formattedAnswer + confidence

    API->>DB: INSERT INTO query_logs
    API-->>UI: {answer, jurisdictionChain, evidenceBundle, challan, confidence}
    UI-->>User: Formatted answer with citations
```

---

## RAG Pipeline Detail

```mermaid
flowchart TD
    Q[User Question] --> BL{Blacklist Check}
    BL -- Blocked --> EMPTY[Return Empty Evidence]
    BL -- Pass --> SYN[Synonym Expansion\n19 offense categories]
    SYN --> CAT{Category\nMatched?}
    CAT -- Yes --> LOW_T[Low Thresholds\nChunk: 0.33 · Rule: 0.38]
    CAT -- No --> HIGH_T[Strict Thresholds\nChunk: 0.55 · Rule: 0.60]

    SYN --> EMB[Generate Embedding\nOpenAI or Xenova]

    EMB --> SEM[Semantic Search\nTop 50 chunks]
    SEM --> FILTER[Apply Threshold Filter]
    LOW_T --> FILTER
    HIGH_T --> FILTER

    EMB --> RULE[Rule Semantic Search\nTop 10 rules]
    RULE --> RULE_FILTER[Apply Rule Threshold]
    LOW_T --> RULE_FILTER
    HIGH_T --> RULE_FILTER

    Q --> BM25[BM25 Full-Text Search\nPostgres tsvector · Top 50]

    FILTER --> RRF[Reciprocal Rank Fusion\nK=60]
    BM25 --> RRF

    RULE_FILTER --> RULES_TOP[Top 5 Rules\nretrievalConfidence = 2.0+]

    RRF --> AUTH[Authority Scoring]
    AUTH --> DIVERSITY[Source Diversity\nMax 2 per document]
    RULES_TOP --> DIVERSITY

    DIVERSITY --> TOP5[Top 5 Evidence Items]
    TOP5 --> BUNDLE[Evidence Bundle]
```

---

## Database Schema Flow

```mermaid
erDiagram
    official_sources {
        TEXT id PK
        TEXT name
        TEXT organization
        TEXT url
        TEXT format
        TEXT reliability
        TEXT coverage
    }

    documents {
        TEXT id PK
        TEXT official_source_id FK
        TEXT source_url
        TEXT title
        TEXT organization
        INTEGER page_count
        TEXT jurisdiction_code
    }

    document_pages {
        TEXT id PK
        TEXT document_id FK
        INTEGER page_number
        TEXT page_text
        NUMERIC ocr_confidence
        TEXT crop_url
        JSONB provenance_json
    }

    document_chunks {
        TEXT id PK
        TEXT document_id FK
        INTEGER page_number
        INTEGER chunk_index
        TEXT chunk_text
        TSVECTOR search_vector
        NUMERIC ocr_confidence
        TEXT crop_url
        JSONB provenance_json
    }

    rules {
        TEXT id PK
        TEXT offense_code
        TEXT description
        TEXT state_code
        TEXT vehicle_class
        INTEGER base_fine
        INTEGER compounding_fine
        INTEGER demerit_points
        TEXT source_document_id FK
        INTEGER source_page_number
        TEXT source_clause
        DATE effective_date
        TEXT verification_status
    }

    jurisdictions {
        TEXT id PK
        TEXT code
        TEXT name
        TEXT type
        TEXT parent_id FK
        INTEGER priority
        GEOMETRY geom
    }

    provenance_events {
        TEXT id PK
        TEXT entity_type
        TEXT entity_id
        TEXT source_document_id FK
        INTEGER source_page_number
        TEXT source_clause
        TEXT action
        JSONB metadata_json
    }

    query_logs {
        TEXT id PK
        TEXT query_text
        NUMERIC lat
        NUMERIC lon
        TEXT state_code
        NUMERIC answer_confidence
    }

    ingestion_jobs {
        TEXT id PK
        TEXT official_source_id FK
        TEXT source_url
        TEXT title
        TEXT status
        TEXT document_id
        TEXT error_message
    }

    official_sources ||--o{ documents : "authorizes"
    official_sources ||--o{ ingestion_jobs : "tracks"
    documents ||--o{ document_pages : "contains"
    documents ||--o{ document_chunks : "chunked into"
    documents ||--o{ rules : "mandates"
    documents ||--o{ provenance_events : "referenced by"
    jurisdictions ||--o{ jurisdictions : "parent of"
```

---

## Computer Vision Pipeline

```mermaid
flowchart TD
    IMG[Base64 Image Input] --> DECODE[Jimp Decode\nAny format → bitmap]
    DECODE --> FULL[Full Image RawImage]

    FULL --> YOLOS[YOLOS-tiny\nObject Detection\nthreshold: 0.1]

    YOLOS --> ALL[All Raw Detections\nlogged before filtering]
    ALL --> FILTER{score ≥ 0.5?}
    FILTER -- Discarded --> DISC[Discarded Detections\nwith reason logged]
    FILTER -- Kept --> KEPT[Filtered Detections]

    ALL --> PERSONS[Persons]
    ALL --> MOTOS[Motorcycles]
    ALL --> CARS[Cars / Trucks / Buses]

    subgraph CropAnalysis ["Stage 2 — Parallel Crop Classification"]
        MOTOS --> OVERLAP{Person overlaps\nmotorcycle?}
        OVERLAP -- Yes --> HELMET_CROP[Crop: Rider upper 50%]
        HELMET_CROP --> RESNET1[ResNet-50\nTop-5 Classification]
        RESNET1 --> HELMET_DEC{helmet label\nscore > 0.05?}
        HELMET_DEC -- Yes --> HELMET_OK[Helmet Detected ✅]
        HELMET_DEC -- No --> HELMET_VIOL[Helmet Violation 🔴\nSec 129/194D MVA]

        CARS --> WIND_CROP[Crop: Windshield\nupper 50% of car]
        WIND_CROP --> RESNET2[ResNet-50\nTop-5 Classification]
        RESNET2 --> SEAT_DEC{seatbelt label\nfound?}
        SEAT_DEC -- Yes --> SEAT_OK[Seatbelt Detected ✅]
        SEAT_DEC -- No --> SEAT_VIOL[Seatbelt Violation 🔴\nSec 194B MVA]

        FULL --> ROAD_CROP[Crop: Lower 50% of image]
        ROAD_CROP --> RESNET3[ResNet-50\nTop-5 Classification]
        RESNET3 --> HAZARD_DEC{manhole / stone\nwall label found?}
        HAZARD_DEC -- Yes --> HAZARD[Road Hazard 🟡]
        HAZARD_DEC -- No --> SAFE[Road Clear ✅]
    end

    HELMET_OK & HELMET_VIOL & SEAT_OK & SEAT_VIOL & HAZARD & SAFE --> SCORE[Safety Score Calculation\n100 - 20×critical - 10×medium]
    SCORE --> RESULT[VisionAnalysisResult\nviolations · safetyScore · timings · rawDetections]
```

---

## Deployment Architecture

```mermaid
graph LR
    subgraph Docker Compose
        FE[Frontend\nReact/Vite\n:5173]
        BE[Backend\nNode.js\n:4000]
        DB[(PostgreSQL\nPostGIS\n:5432)]
        PGA[pgAdmin\n:5050]
    end

    FE --> BE
    BE --> DB
    PGA --> DB

    DEV([Developer]) --> FE
    DEV --> PGA
```

---

## Key Indexes

| Table | Index | Type | Purpose |
|---|---|---|---|
| `jurisdictions` | `jurisdictions_geom_gix` | GIST | Spatial point-in-polygon queries |
| `document_chunks` | `document_chunks_search_gix` | GIN | BM25 full-text search |
| `document_chunks` | `document_chunks_jurisdiction_gix` | GIN | Jurisdiction-scoped chunk retrieval |
| `rules` | `rules_state_ix` | B-tree | State + offense + vehicle class + date lookup |
| `rules` | `rules_search_gix` | GIN | Rule full-text search |

---

## Performance Characteristics

| Operation | Latency (warm) | Notes |
|---|---|---|
| Jurisdiction resolution | < 5ms | PostGIS GIST index on 694 geometries |
| Embedding generation (OpenAI) | 80–150ms | Network + API |
| Embedding generation (Xenova) | 2000ms cold / 40ms warm | ONNX model warm-up |
| Cosine similarity (1000 vectors) | < 5ms | Pure TypeScript, in-memory |
| BM25 search (950 chunks) | < 10ms | Postgres tsvector + GIN index |
| Full query pipeline (warm) | ~158ms | All stages combined |
| Vision pipeline (warm) | ~185ms total | Decode + YOLOS + crops + classifier |
