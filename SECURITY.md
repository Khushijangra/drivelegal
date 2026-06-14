# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | ✅ Active |
| All other branches | ❌ Not supported |

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in DriveLegal, please report it responsibly:

### Preferred Method

Email: **[your-security-email@example.com]**

Subject line: `[SECURITY] DriveLegal — <brief description>`

### What to Include

Please include as much of the following as possible to help us understand and reproduce the issue:

- **Type of vulnerability** (e.g., SQL injection, authentication bypass, information disclosure)
- **Affected endpoint(s)** or component(s)
- **Steps to reproduce** — be specific
- **Impact assessment** — what data or system could be compromised
- **Proof of concept** (if available) — code, curl commands, screenshots

### What Happens Next

1. **Acknowledgement** within 48 hours
2. **Initial assessment** within 7 days
3. **Fix timeline** communicated within 14 days
4. **Credit** — contributors who responsibly disclose vulnerabilities will be credited in the CHANGELOG (unless they prefer to remain anonymous)

---

## Known Security Considerations

### API Key Exposure
- The `ADMIN_API_KEY` in `.env.example` is a placeholder. **Never use the default value in production.**
- Generate a strong key: `openssl rand -hex 32`

### OpenAI API Key
- The `OPENAI_API_KEY` is optional. If provided, it must be kept in `.env` only — never committed.
- The system runs fully offline without it.

### Database Credentials
- The default Docker Compose credentials (`drivelegal:drivelegal`) are for local development only.
- Production deployments must use strong, unique credentials managed via environment secrets (e.g., AWS Secrets Manager, GitHub Actions secrets).

### Legal Data Integrity
- All legal rules are verified against official government sources.
- The admin verification workflow (`/api/admin/rules/:id/verify`) must be protected — only trusted administrators should hold the `ADMIN_API_KEY`.

---

## Security Architecture

- **Input validation**: All API inputs validated with Zod schemas before processing
- **Parameterized queries**: All database queries use parameterized values — no string interpolation
- **Admin endpoints**: Protected by `X-Admin-Key` header authentication
- **CORS**: Restricted to configured `CORS_ORIGIN` — no wildcard in production
- **No secrets in code**: All secrets loaded from environment variables via `config.ts`
