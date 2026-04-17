# Netlify Deployment Notes

## Short Answer

The frontend can be hosted on Netlify.

The backend should **not** be hosted on Netlify in its current form.

This project is a full-stack Express + Prisma + PostgreSQL application with:

- server-side authentication
- Prisma database access
- PDF parsing
- multipart file uploads
- Windows-only OCR via PowerShell

Netlify is a good fit for the static frontend, but not for the current backend runtime.

## Recommended Deployment Architecture

### Frontend

Host the `public` frontend on Netlify.

### Backend

Host the Express API separately on a Node-capable service such as:

- Render
- Railway
- Fly.io
- VPS / dedicated VM

### Database

Host PostgreSQL separately:

- Neon
- Supabase
- Railway Postgres
- Render Postgres
- managed PostgreSQL on your cloud provider

## Why The Backend Is Not Netlify-Ready

### 1. Long-running Express server

This app is designed as a persistent Node server.

Netlify primarily expects:

- static frontend assets
- serverless functions
- edge functions

The current backend is not structured as serverless handlers.

### 2. Prisma + serverless tradeoffs

Prisma can run in serverless environments, but this backend is currently written for a normal Node process, not function-by-function execution.

### 3. File upload and OCR workflow

The backend currently accepts multipart uploads and processes them directly.

That is possible in some serverless setups, but the current implementation also depends on:

- local temp-file handling
- PowerShell execution
- Windows OCR

That is not compatible with Netlify Functions.

### 4. Windows OCR dependency

The current OCR implementation uses:

- `scripts/ocr-image.ps1`
- Windows OCR runtime APIs

Netlify does not run Windows workloads, so this OCR path will not work there.

## OCR Migration Status

The backend now supports provider-based OCR:

- `windows`
- `http`
- `ocrspace`
- `disabled`

This means local development can still use the Windows OCR script, while hosted deployments can switch to an HTTP OCR API.

### OCR environment variables

```env
OCR_PROVIDER=ocrspace
OCR_API_URL=https://api.ocr.space/parse/image
OCR_API_KEY=your-secret-key
OCR_API_KEY_HEADER=Authorization
OCR_FILE_FIELD_NAME=file
OCR_TIMEOUT_MS=30000
```

### Recommended first provider: OCR.space

OCR.space is a practical first hosted OCR option for this project because:

- it exposes a simple multipart OCR endpoint
- it returns JSON text results
- it has a free tier for integration testing
- it is much easier to wire into the current upload flow than a larger document-processing platform

Official references:

- OCR API docs: https://ocr.space/ocrapi
- OCR FAQ: https://ocr.space/faq/
- OCR status page: https://status.ocr.space/

### HTTP OCR expectations

The current HTTP OCR adapter:

- sends a multipart `POST`
- includes the uploaded image file under `OCR_FILE_FIELD_NAME`
- attaches `OCR_API_KEY` using `OCR_API_KEY_HEADER`
- accepts either:
  - plain text responses
  - JSON responses containing text-like fields such as `text`, `extractedText`, `fullText`, `content`, or nested text values

This keeps the backend flexible while you decide which OCR vendor to use.

## What Was Added To Prepare For Netlify

### Static hosting config

Added:

- [netlify.toml](/c:/Users/PC/faculty-promotion-system/netlify.toml)

This publishes the `public` folder and maps:

- `/` to `index.html`
- `/employee` to `employee.html`
- `/evaluator` to `evaluator.html`

### Frontend API base URL config

Added:

- [public/config.js](/c:/Users/PC/faculty-promotion-system/public/config.js)
- [public/config.example.js](/c:/Users/PC/faculty-promotion-system/public/config.example.js)

The frontend now supports:

- same-origin API during local/full-stack deployment
- separate backend URL when the frontend is hosted on Netlify

To point the frontend at a hosted backend, edit `public/config.js`:

```js
window.APP_CONFIG = {
  apiBaseUrl: "https://your-backend-domain.example.com",
};
```

## Minimum Hosted Setup

### Frontend on Netlify

Deploy the `public` folder.

### Backend on Node host

Deploy the Express app with:

- `DATABASE_URL`
- `AUTH_SECRET`
- `CORS_ORIGIN`
- `NODE_ENV`
- `TRUST_PROXY`

### Database

Provision PostgreSQL and run:

```powershell
node .\node_modules\prisma\build\index.js migrate deploy
node .\node_modules\prisma\build\index.js generate
```

## CORS Requirement

If the frontend is on Netlify and the backend is elsewhere, set:

```env
CORS_ORIGIN=https://your-netlify-site.netlify.app
```

If you use a custom frontend domain, use that domain instead.

## Remaining Hosting Work

The following still needs to be done before production deployment:

- choose and configure the production OCR API provider
- decide where uploaded source files will be stored in production
- move file storage to persistent object storage if required
- review secure cookie behavior across frontend/backend domains
- harden auth/session management for production
- add environment-specific frontend config handling for Netlify builds

## Practical Recommendation

Use this split:

1. Netlify for frontend pages
2. Render or Railway for the Express backend
3. Hosted PostgreSQL for data

That is the cleanest path with the least rework.

## Current Frontend Page Structure

The frontend is now intentionally split into three pages:

1. `index.html` for sign in and account creation
2. `employee.html` for employee uploads, draft points, and upload logs
3. `evaluator.html` for evaluator review logs and actual scoring

This is better for Netlify than the old combined page because the role-specific pages can be routed cleanly as static assets while still calling the same hosted backend API.
