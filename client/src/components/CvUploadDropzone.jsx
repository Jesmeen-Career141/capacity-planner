import { useState, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * CvUploadDropzone
 * Multi-file drag-and-drop zone with client-side type and size validation (10 MB).
 */
export default function CvUploadDropzone({
  onUpload,
  disabled = false,
  isUploading = false
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientErrors, setClientErrors] = useState([]);
  const fileInputRef = useRef(null);

  const validateFiles = (fileList) => {
    const valid = [];
    const errors = [];

    Array.from(fileList).forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
      const isMimeAllowed = !file.type || ALLOWED_MIME_TYPES.includes(file.type);

      if (!isExtAllowed || !isMimeAllowed) {
        errors.push(`${file.name}: Invalid file format. Allowed formats: PDF, DOC, DOCX.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: File exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
        return;
      }

      valid.push(file);
    });

    return { valid, errors };
  };

  const handleFiles = async (files) => {
    if (disabled || isUploading || !files || files.length === 0) return;

    setClientErrors([]);
    const { valid, errors } = validateFiles(files);

    if (errors.length > 0) {
      setClientErrors(errors);
    }

    if (valid.length > 0) {
      try {
        await onUpload(valid);
      } catch {
        // Parent component can also surface errors
      }
    }

    // Reset file input so user can re-upload if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || isUploading) return;
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFiles(dt.files);
    }
  };

  return (
    <div className="cv-upload-wrapper">
      <div
        className={`cv-dropzone ${isDragOver ? 'cv-dropzone--active' : ''} ${
          disabled ? 'cv-dropzone--disabled' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled && !isUploading && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx"
          className="cv-file-input-hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled || isUploading}
        />

        <div className="cv-dropzone-content">
          {isUploading ? (
            <div className="cv-upload-loading">
              <Loader2 size={18} className="animate-spin text-forest-600" />
              <span className="cv-upload-loading-text">Uploading CV files directly to secure storage...</span>
            </div>
          ) : (
            <div className="cv-dropzone-compact">
              <div className="cv-dropzone-primary-line">
                <strong className="cv-dropzone-strong">⇧ Upload shortlisted CVs</strong>
                <span className="cv-dropzone-dash"> — </span>
                <span className="cv-dropzone-browse">click to browse or drag and drop</span>
              </div>
              <small className="cv-dropzone-secondary-text">
                PDF, DOC, DOCX · Maximum 10 MB per file
              </small>
            </div>
          )}
        </div>
      </div>

      {clientErrors.length > 0 && (
        <div className="cv-upload-errors">
          <div className="cv-upload-errors-header">
            <AlertTriangle size={15} />
            <span>Upload Pre-Validation Warnings ({clientErrors.length})</span>
          </div>
          <ul className="cv-upload-errors-list">
            {clientErrors.map((errMsg, idx) => (
              <li key={idx}>{errMsg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
