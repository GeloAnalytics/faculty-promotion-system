import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import * as pdf from 'pdf-parse';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { extractFeatures, predictPromotion } from './utils';
import type { Features } from './types';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
    }
  }
}

const app = express();
const prisma = new PrismaClient();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// PDF upload & extract
app.post('/api/pdf-upload', upload.single('pdf'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });

  try {
    const dataBuffer = req.file.buffer!;
    const data = await pdf(dataBuffer);
    const text = data.text;

    const features = extractFeatures(text);

    const profile = await prisma.facultyProfile.create({
      data: { name
