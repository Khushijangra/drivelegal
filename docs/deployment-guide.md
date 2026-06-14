# DriveLegal — Deployment Guide

This guide covers deploying DriveLegal to a production environment.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Docker Compose (Recommended)](#docker-compose-recommended)
- [Manual Deployment](#manual-deployment)
- [Database Setup](#database-setup)
- [Data Pipeline](#data-pipeline)
- [Vision Models](#vision-models)
- [Reverse Proxy (Nginx)](#reverse-proxy-nginx)
- [Security Hardening](#security-hardening)
- [Health Monitoring](#health-monitoring)

---

## Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB | 8 GB |
| CPU | 2 cores | 4 cores |
| Storage | 10 GB | 20 GB (for ML models + corpus) |
| OS | Linux (Ubuntu 22.04+) | Ubuntu 22.04 LTS |
| Docker | 24+ | Latest |
| Docker Compose | 2.20+ | Latest |

---

## Environment Configuration

```bash
cp .env.example .env
```

Critical variables for production:

```bash
# Use a strong, unique admin key
ADMIN_API_KEY=$(openssl rand -hex 32)

# Set your public-facing domain
CORS_ORIGIN=https://yourdomain.com
EVIDENCE_PUBLIC_URL=https://api.yourdomain.com

# Set NODE_ENV to production
NODE_ENV=production

# Use production DB credentials (not the defaults)
DATABASE_URL=postgresql://STRONG_USER:STRONG_PASSWORD@db:5432/drivelegal
```

---

## Docker Compose (Recommended)

### Production docker-compose.yml

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    restart: always
    environment:
      POSTGRES_DB: drivelegal
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - drivelegal_pgdata:/var/lib/postgresql/data
      - ./backend/sql/001_init.sql:/docker-entrypoint-initdb.d/001_init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d drivelegal"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      target: production
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/drivelegal
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ADMIN_API_KEY: ${ADMIN_API_KEY}
      CORS_ORIGIN: ${CORS_ORIGIN}
      EVIDENCE_PUBLIC_URL: ${EVIDENCE_PUBLIC_URL}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
    restart: always
    depends_on:
      - backend

volumes:
  drivelegal_pgdata:
```

### Deploy

```bash
docker-compose -f docker-compose.yml up -d --build
```

---

## Database Setup

```bash
# Run migrations
docker exec drivelegal-backend npm run db:migrate

# Verify PostGIS extension
docker exec drivelegal-db psql -U drivelegal -d drivelegal \
  -c "SELECT PostGIS_Version();"
```

---

## Data Pipeline

Run once after initial deployment:

```bash
# 1. Register official government sources
docker exec drivelegal-backend npm run seed:sources

# 2. Download Indian jurisdiction boundaries (694 districts/states)
docker exec drivelegal-backend npm run download:boundaries
docker exec drivelegal-backend npm run load:jurisdictions

# 3. Download and ingest official legal corpus
docker exec drivelegal-backend npm run download:official-corpus
docker exec drivelegal-backend npm run ingest:official-corpus

# 4. Extract and seed traffic rules
docker exec drivelegal-backend npm run extract:rules

# 5. Build vector indices for semantic search
docker exec drivelegal-backend npm run seed:sources  # ensure sources exist first
```

---

## Vision Models

Download ONNX model weights for offline vision inference:

```bash
docker exec drivelegal-backend npm run download:models
```

This downloads:
- `Xenova/yolos-tiny` — ONNX object detection model (~28 MB)
- `Xenova/resnet-50` — ONNX image classification model (~97 MB)

Models are stored in `backend/data/models/` (gitignored).

---

## Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 15m;  # Allow image uploads
    }
}
```

---

## Security Hardening

```bash
# 1. Never use default credentials
# Change DATABASE_URL, ADMIN_API_KEY from defaults

# 2. Restrict pgAdmin to internal access only
# Remove pgAdmin from production docker-compose.yml
# or bind to 127.0.0.1 only

# 3. Use environment secrets, not .env files in production
# AWS: use AWS Secrets Manager
# GCP: use Secret Manager
# Self-hosted: use Docker secrets or HashiCorp Vault

# 4. Enable firewall
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 4000/tcp   # Block direct backend access
ufw deny 5432/tcp   # Block direct DB access
ufw enable
```

---

## Health Monitoring

```bash
# Backend health
curl http://localhost:4000/health

# Vision pipeline status
curl http://localhost:4000/api/vision/health

# Admin stats (requires ADMIN_API_KEY)
curl -H "X-Admin-Key: YOUR_ADMIN_KEY" http://localhost:4000/api/admin/stats

# Container status
docker-compose ps
docker-compose logs -f backend
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `PostGIS extension not found` | Ensure `postgis/postgis:16-3.4` image is used, not plain postgres |
| `Vector index not found` | Run `npm run build-vector-index` in the backend container |
| `Vision models not loaded` | Run `npm run download:models` and verify `backend/data/models/` exists |
| `CORS errors in browser` | Verify `CORS_ORIGIN` matches your frontend URL exactly (no trailing slash) |
| `OpenAI embedding fails` | Check `OPENAI_API_KEY` is set; system will auto-fallback to Xenova |
| `Jurisdiction resolution returns empty` | Verify PostGIS extension and jurisdiction data was loaded |
