const multer = require('multer');
const { MAX_FILE_SIZE_BYTES } = require('../utils/cvValidator');

// Multer in-memory storage (zero file writes to Render filesystem)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10
  }
});

/**
 * Middleware handling multipart/form-data file uploads.
 * Rejects oversized files or batches exceeding 10 files gracefully with clear JSON responses.
 */
function handleMulterUpload(req, res, next) {
  upload.array('files', 10)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const maxMb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
        return res.status(400).json({ error: `File size exceeds the ${maxMb} MB limit.` });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Cannot upload more than 10 files at a time.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    next();
  });
}

module.exports = {
  handleMulterUpload
};
