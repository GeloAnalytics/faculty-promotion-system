import { env } from './config/env';
import app from './app';
import { prisma } from './config/db';
import { ensureDocumentsBucket } from './config/supabase';

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
