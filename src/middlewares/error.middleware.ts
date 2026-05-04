import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { MAX_UPLOAD_SIZE_MB } from '../config/env';

export const errorHandler = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Invalid request payload',
      issues: err.issues,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Requested record was not found',
        code: err.code,
        details: err.message,
      });
    }

    return res.status(400).json({
      error: 'Database request failed',
      code: err.code,
      details: err.message,
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `Uploaded file exceeds the ${MAX_UPLOAD_SIZE_MB} MB limit`,
        code: err.code,
      });
    }

    return res.status(400).json({
      error: 'Upload request failed',
      code: err.code,
      details: err.message,
    });
  }

  if (err instanceof Error && /powershell|ocr/i.test(err.message)) {
    return res.status(500).json({
      error: 'OCR processing failed',
      details: err.message,
    });
  }

  return res.status(500).json({
    error: 'Unexpected server error',
    details: err instanceof Error ? err.message : 'Unknown error',
  });
};
