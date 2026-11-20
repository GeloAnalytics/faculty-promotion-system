/**
 * Copies uploaded evidence files from their current storage provider (Supabase)
 * into Cloudflare R2 and repoints each document's `extractionMetadata.storage`.
 *
 * Safe by construction:
 *   - the original file is never deleted or modified (it remains the fallback);
 *   - the R2 copy is downloaded back and its SHA-256 compared before the
 *     database row is touched;
 *   - the previous descriptor is kept as `previousStorage` for rollback;
 *   - re-running skips documents that already point at R2.
 *
 *   npx tsx --env-file=.env scripts/migrate-storage-to-r2.ts            # dry run
 *   npx tsx --env-file=.env scripts/migrate-storage-to-r2.ts --apply
 *   npx tsx --env-file=.env scripts/migrate-storage-to-r2.ts --rollback # repoint to previousStorage
 */
import crypto from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../src/config/db';
import { downloadFileBuffer, getActiveStorageProvider, getDefaultBucketName, getS3Client, type StorageDescriptor } from '../src/services/storage.service';
import { toPrismaJson } from '../src/utils/document.utils';

const sha = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

async function main() {
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  if (getActiveStorageProvider() !== 'r2') throw new Error('R2 is not the active storage provider; check the R2_* variables.');
  const s3 = getS3Client();
  if (!s3) throw new Error('No R2 client available.');
  const bucket = getDefaultBucketName();

  const documents = await prisma.uploadedDocument.findMany({ select: { id: true, originalName: true, mimeType: true, extractionMetadata: true } });

  if (rollback) {
    for (const doc of documents) {
      const metadata = asObject(doc.extractionMetadata);
      if (!metadata.previousStorage || metadata.storage?.provider !== 'r2' || !metadata.storageMigratedAt) continue;
      const { previousStorage, storageMigratedAt, ...rest } = metadata;
      await prisma.uploadedDocument.update({ where: { id: doc.id }, data: { extractionMetadata: toPrismaJson({ ...rest, storage: previousStorage }) } });
      console.log('rolled back', doc.id);
    }
    return;
  }

  const candidates = documents.filter((doc) => {
    const storage = asObject(asObject(doc.extractionMetadata).storage);
    return storage.path && storage.provider && storage.provider !== 'r2';
  });
  const byProvider = candidates.reduce<Record<string, number>>((acc, doc) => {
    const provider = asObject(asObject(doc.extractionMetadata).storage).provider;
    return { ...acc, [provider]: (acc[provider] ?? 0) + 1 };
  }, {});
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${candidates.length} of ${documents.length} documents are stored outside R2`, byProvider);

  let copied = 0, skipped = 0, failed = 0, bytes = 0;
  for (const doc of candidates) {
    const metadata = asObject(doc.extractionMetadata);
    const source = metadata.storage as StorageDescriptor;
    try {
      const original = await downloadFileBuffer(source);
      bytes += original.length;
      if (!apply) { copied += 1; continue; }

      const key = String(source.path);
      let alreadyThere = false;
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        alreadyThere = head.ContentLength === original.length;
      } catch { /* not present */ }
      if (!alreadyThere) {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: original, ContentType: doc.mimeType || 'application/octet-stream' }));
      }

      const roundTrip = await downloadFileBuffer({ provider: 'r2', bucket, path: key } as StorageDescriptor);
      if (sha(roundTrip) !== sha(original)) throw new Error('checksum mismatch after upload');

      await prisma.uploadedDocument.update({
        where: { id: doc.id },
        data: {
          extractionMetadata: toPrismaJson({
            ...metadata,
            storage: { provider: 'r2', bucket, path: key },
            previousStorage: source,
            storageMigratedAt: new Date().toISOString(),
          }),
        },
      });
      copied += 1;
    } catch (error) {
      failed += 1;
      console.log(`  FAILED ${doc.id} (${doc.originalName}): ${error instanceof Error ? error.message.slice(0, 120) : error}`);
    }
  }
  console.log({ [apply ? 'migrated' : 'wouldMigrate']: copied, skipped, failed, megabytes: +(bytes / 1048576).toFixed(1) });
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
