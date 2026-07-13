import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import { env, isProduction } from './config/env';
import { attachSessionUser } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/error.middleware';
import apiRoutes from './routes/index';
import { prisma } from './config/db';
import { ensureDocumentsBucket } from './config/supabase';

const app = express();
const repoRoot = process.cwd();
const publicDir = path.join(repoRoot, 'public');

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
app.use(express.static(publicDir, { extensions: ['html'], maxAge: 0 }));

// Mount API routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use(errorHandler);

let server: ReturnType<typeof app.listen>;

async function bootstrap() {
  try {
    await ensureDocumentsBucket();
  } catch (error) {
    console.error('Failed to ensure Supabase documents bucket exists:', error);
  }

  server = app.listen(env.PORT, () => {
    console.log(`Faculty promotion system listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
}

void bootstrap();

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Closing server...`);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
    return;
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
