# DriveLegal API Reference

**Base URL:** `http://localhost:4000`  
**Content-Type:** `application/json` (all requests and responses)  
**Authentication:** Most endpoints are public. Admin endpoints require `X-Admin-Key` header.

---

## Table of Contents

- [Health](#health)
- [Query — Natural Language](#post-apiquery)
- [Jurisdiction Resolution](#get-apijurisdiction)
- [Challan Calculation](#post-apichallancalc)
- [Challan PDF Generation](#post-apichallangenerate)
- [Vision — Image Analysis](#post-apivisionanalyze)
- [Vision — Health](#get-apivisionhealth)
- [Vision — Evaluation](#post-apivisionevaluate)
- [Rules Search](#get-apirulessearch)
- [Official Sources](#get-apiofficial-sources)
- [Evidence Retrieval](#get-apievidencedocumentid)
- [Document Ingestion](#post-apiingest)
- [Ingestion Status](#get-apiingeststatusid)
- [Admin — Rule Verification](#patch-apiadminrulesidverify)
- [Admin — Statistics](#get-apiadminstats)

---

## Health

### `GET /health`

Returns service health status. Use to verify the backend is running.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "service": "drivelegal-backend"
}
```

---

## `POST /api/query`

Primary endpoint. Accepts a natural language legal question and returns a structured answer grounded in official evidence, with optional challan calculation.

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | `string` (min 5 chars) | ✅ | Natural language legal question |
| `lat` | `number` | Optional | Latitude for GPS jurisdiction resolution |
| `lon` | `number` | Optional | Longitude for GPS jurisdiction resolution |
| `stateCode` | `string` | Optional | State code override (e.g. `"DL"`, `"MH"`, `"TN"`) |
| `vehicleClass` | `string` | Optional | Vehicle class for challan (e.g. `"TWO_WHEELER"`, `"FOUR_WHEELER"`) |
| `offenseCodes` | `string[]` | Optional | Explicit offense codes to force challan calculation |
| `history` | `{role, content}[]` | Optional | Conversation history for multi-turn queries |

**Example Request:**
```bash
curl -X POST http://localhost:4000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the fine for riding without a helmet in Delhi?",
    "lat": 28.6139,
    "lon": 77.2090,
    "stateCode": "DL",
    "vehicleClass": "TWO_WHEELER"
  }'
```

**Response `200 OK`:**
```json
{
  "answer": "### 🚦 Fine Summary\n...",
  "jurisdictionChain": [
    {
      "id": "uuid",
      "code": "IN",
      "name": "India",
      "type": "country",
      "priority": 1
    },
    {
      "code": "DL",
      "name": "NCT of Delhi",
      "type": "state",
      "priority": 2
    }
  ],
  "evidenceBundle": {
    "id": "uuid",
    "query": "What is the fine for riding without a helmet in Delhi?",
    "jurisdiction": [...],
    "generatedAt": "2024-12-01T10:00:00.000Z",
    "items": [
      {
        "chunkId": "uuid",
        "documentId": "uuid",
        "documentTitle": "Delhi Traffic Police Challan Schedule",
        "organization": "Delhi Traffic Police",
        "sourceUrl": "https://delhitrafficpolice.nic.in/...",
        "pageNumber": 12,
        "excerpt": "Section 129/194D: ₹1000 fine for riding without ISI-certified helmet",
        "ocrConfidence": 0.98,
        "retrievalConfidence": 0.91,
        "ingestionTimestamp": "2024-11-15T08:00:00.000Z"
      }
    ]
  },
  "challan": {
    "stateCode": "DL",
    "vehicleClass": "TWO_WHEELER",
    "currency": "INR",
    "items": [
      {
        "offenseCode": "NO_HELMET",
        "description": "Riding two-wheeler without ISI-certified helmet",
        "baseFine": 1000,
        "compoundingFine": 0,
        "demeritPoints": 0,
        "sourceClause": "Section 129/194D Motor Vehicles Act",
        "sourceReference": {
          "sourceUrl": "https://...",
          "pageNumber": 12,
          "sourceClause": "Section 129/194D",
          "extractedAt": "2024-11-15T08:00:00.000Z"
        }
      }
    ],
    "subtotal": 1000,
    "adjustments": 0,
    "total": 1000,
    "warnings": [],
    "jurisdictionChain": []
  },
  "confidence": 0.94,
  "disclaimers": [
    "This response is informational and must be verified against the source documents shown in the evidence bundle.",
    "Legal calculations are deterministic and derived only from official source records."
  ]
}
```

**Error `400 Bad Request`:**
```json
{ "error": { "fieldErrors": { "question": ["String must contain at least 5 character(s)"] } } }
```

---

## `GET /api/jurisdiction`

Resolves a GPS coordinate to an ordered jurisdiction chain.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | `number` | ✅ | Latitude |
| `lon` | `number` | ✅ | Longitude |

**Example:**
```bash
curl "http://localhost:4000/api/jurisdiction?lat=28.6139&lon=77.2090"
```

**Response `200 OK`:**
```json
{
  "jurisdictions": [
    { "code": "IN", "name": "India", "type": "country", "priority": 1 },
    { "code": "DL", "name": "NCT of Delhi", "type": "state", "priority": 2 },
    { "code": "DL-WEST", "name": "West Delhi District", "type": "district", "priority": 3 }
  ]
}
```

---

## `POST /api/challan/calc`

Calculates a traffic fine deterministically from offense codes and vehicle class. No LLM involved.

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `stateCode` | `string` | ✅ | State code (e.g. `"DL"`, `"MH"`) |
| `vehicleClass` | `string` | ✅ | Vehicle class (e.g. `"TWO_WHEELER"`) |
| `offenseCodes` | `string[]` (min 1) | ✅ | Offense codes from the rules database |
| `modifiers.repeatOffense` | `boolean` | Optional | Apply +50% base fine adjustment |
| `modifiers.commercialVehicle` | `boolean` | Optional | Apply +10% base fine adjustment |
| `modifiers.courtCompounding` | `boolean` | Optional | Add compounding fine to total |

**Example:**
```bash
curl -X POST http://localhost:4000/api/challan/calc \
  -H "Content-Type: application/json" \
  -d '{
    "stateCode": "DL",
    "vehicleClass": "TWO_WHEELER",
    "offenseCodes": ["NO_HELMET", "TRIPLE_RIDING"],
    "modifiers": { "repeatOffense": true }
  }'
```

**Response `200 OK`:**
```json
{
  "stateCode": "DL",
  "vehicleClass": "TWO_WHEELER",
  "currency": "INR",
  "items": [...],
  "subtotal": 2000,
  "adjustments": 500,
  "total": 2500,
  "warnings": ["Repeat offense modifier applied deterministically."],
  "jurisdictionChain": []
}
```

---

## `POST /api/challan/generate`

Generates a printable challan PDF with embedded QR code linking to the evidence bundle.

### Request Body

Same as `/api/challan/calc` plus:

| Field | Type | Required | Description |
|---|---|---|---|
| `evidenceUrl` | `string` (URL) | ✅ | URL to embed in QR code (evidence bundle link) |
| `title` | `string` | Optional | Document title override |

**Response `200 OK`:**
```json
{
  "challan": { ... },
  "qrDataUrl": "data:image/png;base64,...",
  "pdfBase64": "JVBERi0xLjMKJcTl..."
}
```

---

## `POST /api/vision/analyze`

Analyzes a road image for safety violations using the two-stage ONNX pipeline.

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | `string` | ✅ | Base64 data URI (`data:image/jpeg;base64,...`) |
| `fileName` | `string` | Optional | Filename hint for logging |

**Example:**
```bash
curl -X POST http://localhost:4000/api/vision/analyze \
  -H "Content-Type: application/json" \
  -d '{ "image": "data:image/jpeg;base64,/9j/4AAQ..." }'
```

**Response `200 OK`:**
```json
{
  "safetyScore": 80,
  "violations": [
    {
      "type": "missing-helmet",
      "severity": "high",
      "description": "Missing helmet on rider.",
      "confidence": 0.87,
      "boundingBox": [50, 30, 70, 170],
      "detectionSource": "Xenova/yolos-tiny",
      "recommendation": "Sec 129/194D MVA: fine of ₹1000.",
      "failureExplanation": "Top detected class on rider head was 'hair slide' with score 0.87."
    }
  ],
  "summary": "Detected 1 safety concern(s).",
  "recommendations": ["Riders must wear an ISI-certified helmet."],
  "modelUsed": "Xenova/yolos-tiny",
  "secondaryModelUsed": "Xenova/resnet-50",
  "detectionEngine": "onnxruntime",
  "inferenceTimeMs": 185,
  "stageTimings": {
    "decodeMs": 12,
    "yolosMs": 95,
    "cropMs": 18,
    "classifierMs": 60,
    "totalMs": 185
  },
  "rawDetections": [...],
  "filteredDetections": [...],
  "discardedDetections": [...]
}
```

---

## `GET /api/vision/health`

Returns vision pipeline initialization status.

**Response `200 OK`:**
```json
{
  "detectorLoaded": true,
  "classifierLoaded": true,
  "cacheReady": true,
  "warmupPassed": true,
  "confidenceThreshold": 0.5,
  "yolosRawThreshold": 0.1
}
```

---

## `GET /api/rules/search`

Full-text + wildcard search across the legal rules database.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | `string` (min 2) | ✅ | Search query |
| `stateCode` | `string` | Optional | Filter by state code |

**Example:**
```bash
curl "http://localhost:4000/api/rules/search?q=helmet&stateCode=DL"
```

**Response `200 OK`:**
```json
{
  "rules": [
    {
      "id": "uuid",
      "offenseCode": "NO_HELMET",
      "description": "Riding two-wheeler without ISI-certified helmet",
      "stateCode": "DL",
      "vehicleClass": "*",
      "baseFine": 1000,
      "compoundingFine": 0,
      "demeritPoints": 0,
      "effectiveFrom": "2019-09-01",
      "verificationStatus": "approved",
      "sourceReference": { ... }
    }
  ]
}
```

---

## `GET /api/official-sources`

Lists all registered official government sources.

**Response `200 OK`:**
```json
{
  "sources": [
    {
      "id": "morth",
      "organization": "Ministry of Road Transport and Highways",
      "name": "Motor Vehicles Act 1988 — MoRTH Portal",
      "url": "https://morth.nic.in",
      "format": "PDF",
      "reliability": "authoritative",
      "coverage": "national"
    }
  ]
}
```

---

## `GET /api/evidence/:documentId`

Retrieves all pages and provenance for a specific document.

**Response `200 OK`:**
```json
{
  "document": {
    "id": "uuid",
    "title": "Delhi Traffic Challan Schedule",
    "source_url": "https://...",
    "organization": "Delhi Traffic Police"
  },
  "pages": [
    {
      "page_number": 1,
      "page_text": "...",
      "ocr_confidence": 0.98
    }
  ]
}
```

---

## `POST /api/ingest`

Ingests a new official document into the system.

**Authentication:** None (consider protecting in production)

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `sourceUrl` | `string` (URL) | ✅ | Official source document URL |
| `title` | `string` (min 2) | ✅ | Document title |
| `officialSourceId` | `string` (min 1) | ✅ | ID from `official_sources` table |
| `text` | `string` | Optional | Pre-extracted text (skips PDF parsing) |
| `localFilePath` | `string` | Optional | Local file path for PDF ingestion |

**Response `201 Created`:**
```json
{
  "jobId": "uuid",
  "status": "completed",
  "documentId": "uuid",
  "pageCount": 15,
  "chunkCount": 47
}
```

---

## `GET /api/ingest/status/:id`

Polls the status of an ingestion job.

**Response `200 OK`:**
```json
{
  "id": "uuid",
  "status": "completed",
  "document_id": "uuid",
  "page_count": 15,
  "chunk_count": 47,
  "error_message": null,
  "created_at": "2024-12-01T10:00:00Z",
  "updated_at": "2024-12-01T10:00:05Z"
}
```

---

## `PATCH /api/admin/rules/:id/verify`

Verify or reject a legal rule. Requires admin authentication.

**Authentication:** `X-Admin-Key: <ADMIN_API_KEY>` header

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | `"approved" \| "rejected" \| "needs-review"` | ✅ | Verification decision |
| `notes` | `string` | Optional | Verification notes |
| `verifiedBy` | `string` (min 1) | ✅ | Verifier identifier |

---

## `GET /api/admin/stats`

Returns system-wide statistics.

**Authentication:** `X-Admin-Key: <ADMIN_API_KEY>` header

**Response `200 OK`:**
```json
{
  "documentCount": 55,
  "chunkCount": 950,
  "ruleCount": 109,
  "jurisdictionCount": 694,
  "queryCount": 1247,
  "citationCoveragePercent": 100
}
```

---

## Error Codes

| HTTP Status | Meaning |
|---|---|
| `400` | Invalid request body (Zod validation failure) |
| `401` | Missing or invalid `X-Admin-Key` |
| `404` | Resource not found |
| `500` | Internal server error (check `error` field for details) |

All errors follow the format:
```json
{ "error": "Description of the error" }
```
