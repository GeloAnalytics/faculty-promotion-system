import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { env, isProduction } from './config/env';
import { attachSessionUser } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/error.middleware';
import apiRoutes from './routes/index';

const app = express();
const repoRoot = process.cwd();
const publicDir = path.join(repoRoot, 'public');

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);

// Directives are scoped to what the app actually loads: same-origin scripts
// only (no inline <script>, no CDN JS), Google Fonts' stylesheet + font files,
// and blob: URLs for the in-app document preview iframe (created via
// URL.createObjectURL in workflow.js). style-src allows 'unsafe-inline'
// because the app toggles element.style.display extensively - CSP's real XSS
// protection comes from locking down script-src, which has no such exception.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  // Allow fetch() to the API itself and to Supabase storage (for direct browser uploads)
  "connect-src 'self' https://*.supabase.co https://*.supabase.in",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
    credentials: true,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(attachSessionUser);

// Temporary routes for the old vanilla JS frontend
app.get('/employee', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'employee.html'));
});
app.get('/evaluator', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'evaluator.html'));
});
app.get('/admin', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});
app.use(express.static(publicDir, { extensions: ['html'], maxAge: 0 }));

// Mount API routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
