import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import {
  getSupabase,
  isSupabaseStorageConfigured,
  DOCUMENTS_BUCKET as SUPABASE_DOCUMENTS_BUCKET,
} from '../config/supabase';
import { repoRoot } from '../config/globals';

export type StorageProviderType = 'r2' | 's3' | 'supabase' | 'local';

export interface StorageDescriptor {
  provider: StorageProviderType;
  bucket?: string;
  path?: string;
  relativePath?: string;
}

let _s3Client: S3Client | null = null;

export function getS3Client(): S3Client | null {
  if (_s3Client) {
    return _s3Client;
  }

  // 1. Cloudflare R2
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    _s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    return _s3Client;
  }

  // 2. Generic S3 / Wasabi / MinIO / Backblaze B2 / AWS S3
  if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    _s3Client = new S3Client({
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT || undefined,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
    return _s3Client;
  }

  return null;
}

export function getActiveStorageProvider(): StorageProviderType {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    return 'r2';
  }
  if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return 's3';
  }
  if (isSupabaseStorageConfigured()) {
    return 'supabase';
  }
  return 'local';
}

export function isCloudStorageConfigured(): boolean {
  return getActiveStorageProvider() !== 'local';
}

export function getDefaultBucketName(): string {
  if (env.R2_ACCOUNT_ID) {
    return env.R2_BUCKET_NAME || 'documents';
  }
  if (env.S3_BUCKET_NAME) {
    return env.S3_BUCKET_NAME;
  }
  return SUPABASE_DOCUMENTS_BUCKET;
}

export async function createSignedUploadUrl(
  storageKey: string,
  mimeType: string,
): Promise<{
  signedUrl: string;
  storagePath: string;
  token?: string | null;
  provider: StorageProviderType;
}> {
  const provider = getActiveStorageProvider();

  // Cloudflare R2 or S3 presigned PUT URL
  if (provider === 'r2' || provider === 's3') {
    const s3 = getS3Client();
    if (!s3) {
      throw new Error('S3/R2 client is not configured');
    }
    const bucket = getDefaultBucketName();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: mimeType || 'application/octet-stream',
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    return {
      signedUrl,
      storagePath: storageKey,
      token: null, // S3/R2 presigned URLs encode credentials in query string
      provider,
    };
  }

  // Supabase signed upload URL
  if (provider === 'supabase') {
    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from(SUPABASE_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storageKey);

    if (error || !data) {
      throw new Error(`Failed to create Supabase signed URL: ${error?.message ?? 'unknown error'}`);
    }

    return {
      signedUrl: data.signedUrl,
      storagePath: storageKey,
      token: data.token,
      provider: 'supabase',
    };
  }

  throw new Error(
    'No cloud storage provider configured. Please configure Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) or Supabase credentials.',
  );
}

export async function uploadFileBuffer(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<StorageDescriptor> {
  const provider = getActiveStorageProvider();

  if (provider === 'r2' || provider === 's3') {
    const s3 = getS3Client();
    if (s3) {
      const bucket = getDefaultBucketName();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          Body: buffer,
          ContentType: mimeType || 'application/octet-stream',
        }),
      );
      return {
        provider,
        bucket,
        path: storageKey,
      };
    }
  }

  if (provider === 'supabase') {
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { error } = await supabase.storage
          .from(SUPABASE_DOCUMENTS_BUCKET)
          .upload(storageKey, buffer, {
            contentType: mimeType,
            upsert: true,
          });
        if (!error) {
          return {
            provider: 'supabase',
            bucket: SUPABASE_DOCUMENTS_BUCKET,
            path: storageKey,
          };
        }
      }
    } catch {
      // Proceed to local fallback
    }
  }

  // Fallback to local storage (for local development)
  const documentStorageRoot = path.join(repoRoot, 'uploads', 'documents');
  const localFilePath = path.join(documentStorageRoot, storageKey);
  await fs.mkdir(path.dirname(localFilePath), { recursive: true });
  await fs.writeFile(localFilePath, buffer);
  const relativePath = path.relative(repoRoot, localFilePath);

  return {
    provider: 'local',
    relativePath,
  };
}

export async function downloadFileBuffer(storageRef: StorageDescriptor): Promise<Buffer> {
  if (storageRef.provider === 'r2' || storageRef.provider === 's3') {
    const s3 = getS3Client();
    if (!s3) {
      throw new Error('S3/R2 client is not configured');
    }
    const bucket = storageRef.bucket || getDefaultBucketName();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageRef.path!,
    });
    const response = await s3.send(command);
    if (!response.Body) {
      throw new Error('Empty response body received from storage');
    }
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  if (storageRef.provider === 'supabase') {
    const supabase = getSupabase();
    const bucket = storageRef.bucket || SUPABASE_DOCUMENTS_BUCKET;
    const { data, error } = await supabase.storage.from(bucket).download(storageRef.path!);
    if (error || !data) {
      throw new Error(`Failed to download from Supabase storage: ${error?.message ?? 'file not found'}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  if (storageRef.provider === 'local') {
    const localPath = storageRef.relativePath
      ? path.resolve(repoRoot, storageRef.relativePath)
      : storageRef.path!;
    return await fs.readFile(localPath);
  }

  throw new Error(`Unsupported storage provider: ${storageRef.provider}`);
}

export async function getDownloadStream(storageRef: StorageDescriptor): Promise<Readable> {
  if (storageRef.provider === 'r2' || storageRef.provider === 's3') {
    const s3 = getS3Client();
    if (!s3) {
      throw new Error('S3/R2 client is not configured');
    }
    const bucket = storageRef.bucket || getDefaultBucketName();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageRef.path!,
    });
    const response = await s3.send(command);
    if (!response.Body) {
      throw new Error('Empty response body received from storage');
    }
    return response.Body as Readable;
  }

  if (storageRef.provider === 'supabase') {
    const buffer = await downloadFileBuffer(storageRef);
    return Readable.from(buffer);
  }

  if (storageRef.provider === 'local') {
    const localPath = storageRef.relativePath
      ? path.resolve(repoRoot, storageRef.relativePath)
      : storageRef.path!;
    return createReadStream(localPath);
  }

  throw new Error(`Unsupported storage provider: ${storageRef.provider}`);
}

export async function deleteStoredFile(storageRef: any): Promise<void> {
  try {
    if ((storageRef?.provider === 'r2' || storageRef?.provider === 's3') && storageRef.path) {
      const s3 = getS3Client();
      if (s3) {
        const bucket = storageRef.bucket || getDefaultBucketName();
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: storageRef.path,
          }),
        );
      }
    } else if (storageRef?.provider === 'supabase' && storageRef.path) {
      if (isSupabaseStorageConfigured()) {
        const supabase = getSupabase();
        const bucket = storageRef.bucket || SUPABASE_DOCUMENTS_BUCKET;
        await supabase.storage.from(bucket).remove([storageRef.path]);
      }
    } else if (storageRef?.relativePath) {
      const absolutePath = path.resolve(repoRoot, storageRef.relativePath);
      await fs.unlink(absolutePath).catch(() => {});
    }
  } catch {
    // Ignore cleanup failures
  }
}
