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

  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

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
  generatePresignedDownloadUrl
};
