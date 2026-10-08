import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEffectiveOcrProvider,
  isOcrReady,
  extractImageTextWithOcr,
  terminateOcrWorkers,
  type OcrConfig,
} from '../src/ocr';

test('resolveEffectiveOcrProvider correctly falls back to tesseract on non-windows or missing script', () => {
  const config: OcrConfig = {
    provider: 'windows',
    scriptPath: '/non/existent/script.ps1',
    apiKeyHeader: 'Authorization',
    fileFieldName: 'file',
    timeoutMs: 5000,
  };

  const effective = resolveEffectiveOcrProvider(config);
  if (process.platform === 'win32') {
    // If on win32 but script doesn't exist, it falls back to tesseract
    assert.equal(effective, 'tesseract');
  } else {
    assert.equal(effective, 'tesseract');
  }
});

test('resolveEffectiveOcrProvider prioritizes google-vision when apiKey is provided', () => {
  const config: OcrConfig = {
    provider: 'google-vision',
    scriptPath: '',
    apiKey: 'mock-google-api-key',
    apiKeyHeader: 'Authorization',
    fileFieldName: 'file',
    timeoutMs: 5000,
  };

  assert.equal(resolveEffectiveOcrProvider(config), 'google-vision');
});

test('resolveEffectiveOcrProvider respects disabled provider', () => {
  const config: OcrConfig = {
    provider: 'disabled',
    scriptPath: '',
    apiKeyHeader: 'Authorization',
    fileFieldName: 'file',
    timeoutMs: 5000,
  };

  assert.equal(resolveEffectiveOcrProvider(config), 'disabled');
  assert.equal(isOcrReady(config), false);
});

test('isOcrReady returns true for tesseract or ready providers', () => {
  const config: OcrConfig = {
    provider: 'tesseract',
    scriptPath: '',
    apiKeyHeader: 'Authorization',
    fileFieldName: 'file',
    timeoutMs: 5000,
  };

  assert.equal(isOcrReady(config), true);
});

test('extractImageTextWithOcr does not crash with empty or corrupted buffers', async () => {
  const dummyBuffer = Buffer.from('not an actual image file content');
  const config: OcrConfig = {
    provider: 'disabled',
    scriptPath: '',
    apiKeyHeader: 'Authorization',
    fileFieldName: 'file',
    timeoutMs: 1000,
  };

  try {
    const result = await extractImageTextWithOcr(dummyBuffer, 'test.png', config);
    assert.equal(typeof result.text, 'string');
    assert.equal(typeof result.lineCount, 'number');
  } catch (err) {
    // If disabled and all fallbacks fail, it should throw a clean Error rather than unhandled rejection
    assert.ok(err instanceof Error);
  } finally {
    await terminateOcrWorkers();
  }
});
