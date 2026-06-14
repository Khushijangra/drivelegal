# Contributing to DriveLegal

Thank you for your interest in contributing. This document covers everything you need to get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Contribution Areas](#contribution-areas)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Format](#commit-message-format)
- [Testing Requirements](#testing-requirements)

---

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, constructive, and collaborative.

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 22 | Backend and frontend runtime |
| PostgreSQL | ≥ 16 with PostGIS 3.4 | Database |
| Docker Desktop | Latest | Optional but recommended |
| Git | Latest | Version control |

### Fork and Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/drivelegal.git
cd drivelegal
git remote add upstream https://github.com/ORIGINAL_OWNER/drivelegal.git
```

### Local Setup

```bash
# Backend
cd backend
npm install
cp ../.env.example .env
# Edit .env with your local DATABASE_URL

# Run migrations
npm run db:migrate

# Seed development data
npm run extract:rules

# Start backend (hot-reload)
npm run dev

# Frontend (new terminal)
cd ../frontend
npm install
npm run dev
```

---

## Project Architecture

Before contributing, read [`docs/architecture/architecture.md`](docs/architecture/architecture.md) for a complete system overview.

Key areas:
- **`backend/src/services/`** — Core business logic (challan, RAG, jurisdiction, vision)
- **`backend/sql/`** — Database schema (provenance-first design)
- **`frontend/src/`** — React UI components
- **`backend/tests/`** — Vitest unit and integration tests

---

## Contribution Areas

### 🟢 Good First Issues
- Adding new synonym mappings to `services/synonyms.ts` (19 categories expandable)
- Writing unit tests for existing services
- Improving error messages and response formatting
- Documentation improvements

### 🟡 Medium Complexity
- Adding state-specific rule coverage (currently: DL, MH, TN, KA)
- Implementing new API endpoints following existing patterns in `app.ts`
- Frontend component refactoring (splitting `App.tsx` into smaller components)
- Adding new document types to the ingestion pipeline

### 🔴 Advanced
- pgvector integration to replace in-memory cosine similarity
- Cross-encoder re-ranking post-RRF
- Hindi language query support
- Mobile app (React Native)

---

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes** following the coding standards below.

3. **Write or update tests** for any changed logic.

4. **Run the test suite:**
   ```bash
   cd backend && npm test
   cd frontend && npm run build   # Ensure no TypeScript errors
   ```

5. **Ensure TypeScript compiles cleanly:**
   ```bash
   cd backend && npm run lint    # tsc --noEmit
   cd frontend && npm run build
   ```

6. **Commit** using the conventional commit format (see below).

7. **Push and open a PR** against the `main` branch.

8. **PR description must include:**
   - What changed and why
   - Testing performed
   - Any breaking changes
   - Screenshots if UI was changed

---

## Coding Standards

### TypeScript
- **Strict mode** is enabled — no `any` without justification
- All function parameters and return types must be explicitly typed
- Use `zod` for all external input validation (API requests, env vars)
- Prefer `const` over `let`; never use `var`

### API Design
- All routes must validate request body/query with a `zod` schema before processing
- Error responses must follow the format: `{ error: string, hint?: string }`
- All admin routes must use the `requireAdminKey` middleware
- Log meaningful events but never log secrets or full request bodies

### Database
- All queries must use parameterized values — no string concatenation
- New tables must follow the provenance pattern: include `created_at`, `updated_at` timestamps
- Any data that references a legal rule or document must carry a `source_document_id` and `source_page_number`

### Services
- Services must be pure functions or stateless classes where possible
- No direct `process.env` access in services — use the validated `config` object from `config.ts`
- Async errors must be caught and re-thrown with meaningful messages

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:**
| Type | Use for |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change without bug fix or feature |
| `test` | Adding or fixing tests |
| `chore` | Build process, dependency updates |
| `perf` | Performance improvement |

**Examples:**
```
feat(rag): add source diversity cap (max 2 items per document)
fix(challan): handle missing vehicle class with wildcard fallback
docs(api): add curl examples for vision endpoint
test(challan): add unit tests for commercial vehicle modifier
```

---

## Testing Requirements

- All new service logic must have corresponding Vitest unit tests
- Tests live in `backend/tests/`
- Run the suite with: `cd backend && npm test`
- All tests must pass before a PR will be merged
- Aim for >80% coverage on new code added in the PR

---

## Questions?

Open a [GitHub Discussion](../../discussions) for design questions or feature proposals before starting significant work. This avoids duplicate effort.
