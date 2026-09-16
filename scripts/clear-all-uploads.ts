/**
 * Clear all uploaded evidence files and records for a fresh start.
 * 
 * 1. Removes all document files from Supabase Storage (root and all KRA subfolders).
 * 2. Deletes all UploadedDocument database records.
 * 3. Resets criterion reviews status to PENDING so evaluation starts clean.
 * 
 * Usage:
 *   npx tsx scripts/clear-all-uploads.ts
 */
import { PrismaClient } from '@prisma/client';
import { getSupabase } from '../src/config/supabase';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const bucketName = 'documents';

async function removeFolderContents(supabase: any, folderPath: string = ''): Promise<number> {
  let count = 0;
  const { data: files, error } = await supabase.storage.from(bucketName).list(folderPath, { limit: 1000 });
  if (error || !files || !files.length) return count;

  const filesToRemove: string[] = [];
  for (const file of files) {
    const fullPath = folderPath ? `${folderPath}/${file.name}` : file.name;
    if (file.id === null || !file.metadata) {
      // It's a folder/subpath
      count += await removeFolderContents(supabase, fullPath);
    } else {
      filesToRemove.push(fullPath);
    }
  }

  if (filesToRemove.length > 0) {
    const { error: removeErr } = await supabase.storage.from(bucketName).remove(filesToRemove);
    if (removeErr) {
      console.warn(`Warning deleting files in '${folderPath}':`, removeErr.message);
    } else {
      console.log(`Deleted ${filesToRemove.length} storage file(s) from '${folderPath || 'root'}'.`);
      count += filesToRemove.length;
    }
  }

  return count;
}

async function main() {
  console.log('--- Clearing All Uploaded Client Files & Records ---');

  // 1. Delete files from Supabase Storage
  let totalDeletedStorageFiles = 0;
  try {
    const supabase = getSupabase();
    console.log('Cleaning Supabase Storage bucket:', bucketName);

    // Check root and subfolders
    const rootFolders = ['', 'kra1', 'kra2', 'kra3', 'kra4', 'general'];
    for (const folder of rootFolders) {
      totalDeletedStorageFiles += await removeFolderContents(supabase, folder);
    }
  } catch (err) {
    console.warn('Could not connect to Supabase storage:', err instanceof Error ? err.message : err);
  }

  // 2. Delete database records in uploaded_documents
  const deletedDocs = await prisma.uploadedDocument.deleteMany({});
  console.log(`Deleted ${deletedDocs.count} document record(s) from database table 'uploaded_documents'.`);

  // 3. Reset criterion reviews to PENDING decision for clean state
  const resetReviews = await prisma.criterionReview.updateMany({
    data: {
      decision: 'PENDING',
      notes: null,
      reviewedByUserId: null,
    },
  });
  console.log(`Reset ${resetReviews.count} criterion review(s) back to PENDING status.`);

  console.log(`\nFresh restart ready. Cleaned ${totalDeletedStorageFiles} file(s) from storage and ${deletedDocs.count} document record(s) from database.`);
}

main()
  .catch((err) => {
    console.error('Error during upload cleanup:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
