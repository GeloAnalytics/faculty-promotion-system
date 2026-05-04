# Faculty Promotion System

A Full-stack TypeScript application for faculty promotion analysis with PDF evidence upload, OCR, and Machine Learning prediction (NBC 461 aligned).

## Architecture

* **Frontend:** Vanilla JS/HTML/CSS with role-based routing (Employee vs. Evaluator).
* **Backend:** Express.js + Prisma + PostgreSQL.
* **Document Processing:** PDF parsing (`pdf-parse`) and Image OCR (Windows OCR / HTTP API).
* **Machine Learning:** Scikit-learn + XGBoost/AdaBoost for promotion outcome prediction.

## System Workflow

1. **Authentication:** Users create accounts and log in. Role-based routing sends them to the appropriate workspace (`/employee` or `/evaluator`).
2. **Data Collection:** Faculty profile data and performance review scores are submitted.
3. **Evidence Upload:** Users upload PDFs and images representing evidence for their Key Result Areas (KRAs). 
4. **OCR & Analysis:** The backend extracts text, scores the documents for completeness and quality, and flags keyword matches.
5. **Prediction & Insights (ML):** A trained Boosting model (AdaBoost) evaluates the structured features and OCR outputs to predict promotion readiness. The system provides decision support and actionable policy insights based on feature importance.

## Machine Learning Pipeline

The project implements **Boosting Machine Learning Algorithms** to evaluate and rank features correlated with successful promotions.

- **Models Evaluated:** AdaBoost, Gradient Boosting, XGBoost.
- **Features Used:** Age, years in service, educational attainment, teaching effectiveness, research outputs, extension services, IPCR average, professional development hours, document completeness, and document quality.
- **Training Strategy:** We export validated faculty data to CSV (`npm run ml:export-dataset`), train the models using Python (`npm run ml:train-boosting`), and persist the best model artifacts.

## Deployment Notes

* **Frontend:** The `public` folder is configured for deployment on Netlify or similar static hosting. Use `public/config.js` to point to the remote backend.
* **Backend:** Must be hosted on a Node-capable environment (Render, Railway, Fly.io, etc.) because it relies on persistent state and file processing.
* **Database:** Connect a managed PostgreSQL database (Neon, Supabase, etc.) and run `npm run db:deploy` during build.
* **OCR Provider:** In production, specify an HTTP OCR provider (like OCR.space) by setting `OCR_PROVIDER=http` and configuring the API keys in your `.env`.

## Development Commands

- `npm run dev`: Start the local development server.
- `npm run build`: Compile TypeScript.
- `npm run ml:build-fallback-dataset`: Build a mock training dataset for testing.
- `npm run ml:export-dataset`: Export PostgreSQL data for ML training.
- `npm run ml:train-boosting`: Train and evaluate the Boosting models.
- `npm run db:migrate`: Run database migrations.
- `npm run db:studio`: Open Prisma Studio.
