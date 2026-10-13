const crypto = require('crypto');
const path = require('path');

// File size limit: 10 MB default (10,485,760 bytes), configurable via environment variable
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES, 10) || 10 * 1024 * 1024;

/**
 * Inspects file buffer header bytes (magic numbers) and filename extension.
 * Rejects files where magic numbers do not match allowed formats (PDF, DOCX, DOC).
 */
function validateFileContent(buffer, originalFileName, customMaxBytes = MAX_FILE_SIZE_BYTES) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, error: 'Empty or missing file buffer.' };
  }

  if (buffer.length > customMaxBytes) {
    const maxMb = Math.round(customMaxBytes / (1024 * 1024));
    return { valid: false, error: `File size exceeds the ${maxMb} MB limit.` };
  }

  const ext = path.extname(originalFileName || '').toLowerCase();
  const allowedExtensions = ['.pdf', '.docx', '.doc'];

  if (!allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: 'Invalid file extension. Only .pdf, .docx, and .doc files are permitted.'
    };
  }

  // Magic bytes verification
  // 1. PDF: Starts with "%PDF-" (bytes: 0x25, 0x50, 0x44, 0x46)
  if (ext === '.pdf') {
    const isPdf = buffer.length >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46;

    if (!isPdf) {
      return {
        valid: false,
        error: 'File content signature does not match PDF document format.'
      };
    }
    return { valid: true, detectedMimeType: 'application/pdf' };
  }

  // 2. DOCX: OpenXML ZIP archive starting with PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
  if (ext === '.docx') {
    const isDocx = buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4B &&
      (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
      (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);

    if (!isDocx) {
      return {
        valid: false,
        error: 'File content signature does not match Word (.docx) document format.'
      };
    }
    return {
      valid: true,
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  }

  // 3. DOC: Legacy binary Word format (OLE Compound File)
  // Header: 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1
  if (ext === '.doc') {
    const isDoc = buffer.length >= 8 &&
      buffer[0] === 0xD0 &&
      buffer[1] === 0xCF &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xE0 &&
      buffer[4] === 0xA1 &&
      buffer[5] === 0xB1 &&
      buffer[6] === 0x1A &&
      buffer[7] === 0xE1;

    if (!isDoc) {
      return {
        valid: false,
        error: 'File content signature does not match legacy Word (.doc) document format.'
      };
    }
    return { valid: true, detectedMimeType: 'application/msword' };
  }

  return { valid: false, error: 'Unsupported file format.' };
}

/**
 * Derives an unverified candidate display label from original filename.
 * Strips extension, replaces separators, normalizes spacing, and capitalizes.
 */
function deriveUnverifiedLabel(originalFileName) {
  if (!originalFileName || typeof originalFileName !== 'string') return 'Unknown Candidate';

  const baseName = path.basename(originalFileName, path.extname(originalFileName));
  const cleaned = baseName
    .replace(/[._-]+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!cleaned) return 'Candidate CV';

  // Capitalize words
  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Computes a SHA-256 hash of the file buffer for duplicate detection.
 */
function generateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generates a unique, collision-free Cloudflare R2 storage key.
 * Pattern: positions/{jobOrderId}/attempts/{attemptNumber}/{timestamp}_{random}_{safeFilename}
 */
function generateR2StorageKey(jobOrderId, attemptNumber, originalFileName) {
  const safeJobId = (jobOrderId || 'UNKNOWN').replace(/[^\w-]/g, '_');
  const safeAttempt = String(attemptNumber || 1);
  const ext = path.extname(originalFileName || '').toLowerCase();
  const baseName = path.basename(originalFileName || 'cv', ext)
    .replace(/[^\w-]/g, '_')
    .slice(0, 50);

  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString('hex');
  const safeKeyName = `${timestamp}_${randomHex}_${baseName}${ext}`;

  return `positions/${safeJobId}/attempts/${safeAttempt}/${safeKeyName}`;
}

module.exports = {
  MAX_FILE_SIZE_BYTES,
  validateFileContent,
  deriveUnverifiedLabel,
  generateFileHash,
  generateR2StorageKey
};
