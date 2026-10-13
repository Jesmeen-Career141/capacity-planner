const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Retrieve Cloudflare R2 bucket name from environment (configured as career141-cv-storage in Render)
const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'career141-cv-storage';

/**
 * Validates required Cloudflare R2 environment variables.
 * Returns an array of missing key names without exposing values.
 */
function getMissingR2ConfigKeys() {
  const missing = [];
  if (!process.env.R2_ENDPOINT && !process.env.R2_ACCOUNT_ID) {
    missing.push('R2_ENDPOINT (or R2_ACCOUNT_ID)');
  }
  if (!process.env.R2_ACCESS_KEY_ID) {
    missing.push('R2_ACCESS_KEY_ID');
  }
  if (!process.env.R2_SECRET_ACCESS_KEY) {
    missing.push('R2_SECRET_ACCESS_KEY');
  }
  return missing;
}

function isR2Configured() {
  return getMissingR2ConfigKeys().length === 0;
}

/**
 * Normalizes and validates the Cloudflare R2 endpoint URL.
 * Accepts optional parameters for unit testing.
 * Trims whitespace, strips quotes and invisible unicode characters,
 * prepends https:// if missing, extracts origin, and validates via new URL().
 * Throws a clear configuration error if the resulting endpoint is invalid.
 */
function getNormalizedR2Endpoint(rawEndpoint = process.env.R2_ENDPOINT, rawAccountId = process.env.R2_ACCOUNT_ID) {
  // Strip whitespace, zero-width characters (\u200B-\u200D), BOM (\uFEFF), non-breaking spaces (\u00A0), and quotes
  let endpoint = (rawEndpoint || '')
    .toString()
    .trim()
    .replace(/^[\u200B-\u200D\uFEFF\u00A0"']+|[\u200B-\u200D\uFEFF\u00A0"']+$/g, '')
    .trim();

  const accountId = (rawAccountId || '')
    .toString()
    .trim()
    .replace(/^[\u200B-\u200D\uFEFF\u00A0"']+|[\u200B-\u200D\uFEFF\u00A0"']+$/g, '')
    .trim();

  // If R2_ENDPOINT is empty, construct standard Cloudflare R2 endpoint from R2_ACCOUNT_ID
  if (!endpoint && accountId) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  } else if (endpoint && !endpoint.includes('.') && !endpoint.includes('/')) {
    // If an account ID was entered directly into R2_ENDPOINT (no dots or slashes)
    endpoint = `https://${endpoint}.r2.cloudflarestorage.com`;
  }

  if (!endpoint) {
    throw new Error('Cloudflare R2 endpoint is empty or missing. Please configure R2_ENDPOINT or R2_ACCOUNT_ID.');
  }

  // Prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(endpoint)) {
    endpoint = `https://${endpoint}`;
  }

  // Clean any accidental whitespace after protocol (e.g. "https:// ")
  endpoint = endpoint.replace(/^(https?:\/\/)\s+/, '$1');

  // Validate and extract origin to eliminate accidental paths or trailing slashes
  try {
    const parsed = new URL(endpoint);
    if (!parsed.hostname || parsed.hostname.includes(' ') || !parsed.protocol.startsWith('http')) {
      throw new Error('Invalid URL hostname or protocol');
    }
    return parsed.origin;
  } catch (err) {
    throw new Error(
      `Invalid Cloudflare R2 endpoint URL format: "${rawEndpoint}". ` +
      `Expected a valid HTTPS URL such as https://<account_id>.r2.cloudflarestorage.com (${err.message})`
    );
  }
}

/**
 * Initializes and returns an AWS S3 client configured for Cloudflare R2.
 * Never logs or exposes credentials.
 * Throws a safe, informative error if required R2 keys are missing locally.
 */
function getR2Client() {
  const missing = getMissingR2ConfigKeys();
  if (missing.length > 0) {
    throw new Error(
      `Cloudflare R2 storage is not configured. Missing environment variable(s): ${missing.join(', ')}. ` +
      `Please configure these in server/.env to enable CV uploads.`
    );
  }

  const endpoint = getNormalizedR2Endpoint();

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
}

/**
 * Resolves storage client: only accepts objects with a valid .send method.
 * Never treats Express's `next` callback or invalid objects as an S3 client.
 */
function resolveStorageClient(client) {
  if (client && typeof client.send === 'function') {
    return client;
  }
  return getR2Client();
}

/**
 * Uploads a file buffer directly to Cloudflare R2.
 * Accepts an optional client parameter for test mocking without hitting production R2.
 */
async function uploadFileToR2({ buffer, key, mimeType, client = null }) {
  const s3Client = resolveStorageClient(client);
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType
  });

  return await s3Client.send(command);
}

/**
 * Deletes an object from Cloudflare R2.
 * Accepts an optional client parameter for test mocking without hitting production R2.
 */
async function deleteFileFromR2({ key, client = null }) {
  const s3Client = resolveStorageClient(client);
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });

  return await s3Client.send(command);
}

/**
 * Generates a short-lived presigned GET URL for viewing or downloading a CV.
 * Bucket remains 100% private.
 * Default expiration: 900 seconds (15 minutes).
 */
async function generatePresignedDownloadUrl({ key, originalFileName, expiresIn = 900, client = null }) {
  const s3Client = resolveStorageClient(client);
  // Sanitize filename for HTTP header
  const safeFileName = (originalFileName || 'resume.pdf').replace(/[^\w.-]/g, '_');

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `inline; filename="${safeFileName}"`
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

module.exports = {
  BUCKET_NAME,
  getR2Client,
  isR2Configured,
  getMissingR2ConfigKeys,
  resolveStorageClient,
  uploadFileToR2,
  deleteFileFromR2,
  generatePresignedDownloadUrl,
  getNormalizedR2Endpoint
};
