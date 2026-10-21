import React, { useState } from 'react';
import {
  Download,
  Trash2,
  FileEdit
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

/**
 * CandidateCard
 * Renders a compact candidate row for HTML Demo 3 (Option 3 — Compact Searchable List):
 * - Candidate name & CV file metadata (filename, size, dates, feedback)
 * - Internal status pill ("Internally shortlisted")
 * - Quality rating selector (Not rated / Good / Optional)
 * - Client decision selector (Pending / Shortlisted / Rejected)
 * - Accessible actions for viewing/downloading CV, editing decision details/notes, and deleting CV
 */
export default function CandidateCard({
  candidate,
  isReadOnly = false,
  onUpdateStatus,
  onDelete,
  onDownload,
  onRequestClientDecisionConfirmation
}) {
  const [isUpdatingRating, setIsUpdatingRating] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);

  const handleRatingChange = async (newRating) => {
    if (isReadOnly || isUpdatingRating || candidate.qualityRating === newRating) return;
    setIsUpdatingRating(true);
    try {
      await onUpdateStatus(candidate._id, { qualityRating: newRating });
    } finally {
      setIsUpdatingRating(false);
    }
  };

  const handleClientDecisionChange = async (newDecision) => {
    const currentDecision = candidate.clientShortlistStatus || 'Pending';
    if (isReadOnly || isUpdatingDecision || currentDecision === newDecision) return;
    setIsUpdatingDecision(true);
    try {
      if (newDecision === 'Pending') {
        await onUpdateStatus(candidate._id, {
          clientShortlistStatus: 'Pending',
          clientShortlistDate: null
        });
      } else {
        await onUpdateStatus(candidate._id, {
          sentToClient: true,
          clientShortlistStatus: newDecision,
          clientShortlistDate: candidate.clientShortlistDate || new Date().toISOString()
        });
      }
    } finally {
      setIsUpdatingDecision(false);
    }
  };

  const uploadDate = formatDate(candidate.uploadedAt || candidate.internalShortlistDate);
  const clientDate = formatDate(candidate.clientShortlistDate);

  const qualityValue = candidate.qualityRating || 'Not Rated';
  const clientDecisionValue = candidate.clientShortlistStatus || 'Pending';
  const isLegacyReviewStatus =
    clientDecisionValue === 'Review' || clientDecisionValue === 'Client Review';

  return (
    <div className="cv-demo3-row">
      {/* Column 1: Candidate / CV */}
      <div className="cv-demo3-cell-candidate">
        <strong className="cv-demo3-candidate-name" title={candidate.unverifiedLabel || 'Candidate'}>
          {candidate.unverifiedLabel || 'Candidate'}
        </strong>
        <small className="cv-demo3-candidate-meta">
          <button
            type="button"
            className="cv-demo3-file-link"
            onClick={() => onDownload(candidate._id)}
            title={`Open / download ${candidate.originalFileName}`}
          >
            {candidate.originalFileName}
          </button>
          <span> · {formatBytes(candidate.fileSize)}</span>
          {uploadDate && <span> · Added {uploadDate}</span>}
          {clientDate && clientDecisionValue !== 'Pending' && (
            <span> · Decided {clientDate}</span>
          )}
        </small>
        {candidate.clientFeedback && (
          <small className="cv-demo3-candidate-feedback" title={candidate.clientFeedback}>
            Note: {candidate.clientFeedback}
          </small>
        )}
      </div>

      {/* Column 2: Internal status */}
      <div className="cv-demo3-cell-status">
        <span className="cv-demo3-pill">
          {candidate.internalShortlistStatus === 'Shortlisted'
            ? 'Internally shortlisted'
            : candidate.internalShortlistStatus || 'Internally shortlisted'}
        </span>
      </div>

      {/* Column 3: Quality rating */}
      <div className="cv-demo3-cell-quality">
        <select
          aria-label={`Quality rating for ${candidate.unverifiedLabel || 'Candidate'}`}
          value={qualityValue}
          disabled={isReadOnly || isUpdatingRating}
          onChange={(e) => handleRatingChange(e.target.value)}
          className={`cv-demo3-select ${
            qualityValue === 'Good'
              ? 'cv-demo3-select--good'
              : qualityValue === 'Optional'
              ? 'cv-demo3-select--optional'
              : ''
          }`}
        >
          <option value="Not Rated">Not rated</option>
          <option value="Good">Good</option>
          <option value="Optional">Optional</option>
        </select>
      </div>

      {/* Column 4: Client decision */}
      <div className="cv-demo3-cell-decision">
        <select
          aria-label={`Client decision for ${candidate.unverifiedLabel || 'Candidate'}`}
          value={clientDecisionValue}
          disabled={isReadOnly || isUpdatingDecision}
          onChange={(e) => handleClientDecisionChange(e.target.value)}
          className={`cv-demo3-select ${
            clientDecisionValue === 'Shortlisted'
              ? 'cv-demo3-select--shortlisted'
              : clientDecisionValue === 'Rejected'
              ? 'cv-demo3-select--rejected'
              : ''
          }`}
        >
          <option value="Pending">
            {candidate.sentToClient === false ? 'Not sent' : 'Pending'}
          </option>
          <option value="Shortlisted">Shortlisted</option>
          <option value="Rejected">Rejected</option>
          {isLegacyReviewStatus && (
            <option value={clientDecisionValue}>{clientDecisionValue}</option>
          )}
        </select>
      </div>

      {/* Column 5: Actions (Open/Download CV, Decision Details/Notes, Delete) */}
      <div className="cv-demo3-cell-actions">
        <button
          type="button"
          className="cv-demo3-action-btn cv-demo3-action-btn--download"
          onClick={() => onDownload(candidate._id)}
          title={`View / download ${candidate.originalFileName}`}
        >
          <Download size={13} />
          <span>CV</span>
        </button>

        {!isReadOnly && onRequestClientDecisionConfirmation && (
          <button
            type="button"
            className="cv-demo3-icon-btn"
            onClick={() =>
              onRequestClientDecisionConfirmation(
                candidate,
                candidate.clientShortlistStatus === 'Rejected' ? 'Rejected' : 'Shortlisted'
              )
            }
            title="Record client decision date & notes"
          >
            <FileEdit size={13} />
          </button>
        )}

        {!isReadOnly && onDelete && (
          <button
            type="button"
            className="cv-demo3-icon-btn cv-demo3-icon-btn--danger"
            onClick={() => onDelete(candidate)}
            title={`Delete CV for ${candidate.unverifiedLabel || 'Candidate'}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
