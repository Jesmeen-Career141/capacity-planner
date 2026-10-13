import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Star,
  CheckCircle,
  MoreVertical
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
 * Displays an individual candidate CV card with:
 * - Quality rating selector (Good / Optional / Not Rated)
 * - Visual Good CV badge / indicator
 * - Client shortlist outcome badge
 * - Secure download and deletion controls
 * - Workflow action menu
 */
export default function CandidateCard({
  candidate,
  columnKey,
  isReadOnly = false,
  onUpdateStatus,
  onDelete,
  onDownload,
  onRequestClientDecisionConfirmation,
  onDragStart
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isUpdatingRating, setIsUpdatingRating] = useState(false);

  const handleRatingChange = async (newRating) => {
    if (isReadOnly || isUpdatingRating || candidate.qualityRating === newRating) return;
    setIsUpdatingRating(true);
    try {
      await onUpdateStatus(candidate._id, { qualityRating: newRating });
    } finally {
      setIsUpdatingRating(false);
    }
  };

  const uploadDate = formatDate(candidate.uploadedAt || candidate.internalShortlistDate);
  const sentDate = formatDate(candidate.sentToClientDate);
  const clientDate = formatDate(candidate.clientShortlistDate);

  const isGood = candidate.qualityRating === 'Good';
  const hasClientDecision =
    candidate.clientShortlistStatus && candidate.clientShortlistStatus !== 'Pending';

  return (
    <div
      className={`candidate-card ${isReadOnly ? 'candidate-card--readonly' : ''} ${
        isGood ? 'candidate-card--good' : ''
      }`}
      draggable={!isReadOnly}
      onDragStart={(e) => onDragStart && onDragStart(e, candidate)}
    >
      {/* Card Header: Candidate Name, Good Badge & Header Actions */}
      <div className="candidate-card-header">
        <div className="candidate-name-block">
          <div className="candidate-name-row">
            <span className="candidate-name" title={candidate.unverifiedLabel}>
              {candidate.unverifiedLabel || 'Candidate'}
            </span>
            {isGood && (
              <span className="candidate-good-indicator" title="Included in Good CVs (Counts toward target)">
                <Star size={10} fill="#15803d" className="text-emerald-700" />
                <span>Good CV</span>
              </span>
            )}
          </div>
          {!candidate.nameIsVerified && (
            <span className="candidate-unverified-tag" title="Name derived from filename (unverified)">
              Unverified
            </span>
          )}
        </div>

        <div className="candidate-card-header-actions">
          <button
            type="button"
            className="candidate-icon-btn candidate-download-btn"
            onClick={() => onDownload(candidate._id)}
            title={`Download ${candidate.originalFileName}`}
          >
            <Download size={14} />
          </button>

          {!isReadOnly && (
            <div className="candidate-menu-wrapper">
              <button
                type="button"
                className="candidate-icon-btn candidate-menu-btn"
                onClick={() => setShowMenu(prev => !prev)}
                title="Candidate actions"
              >
                <MoreVertical size={14} />
              </button>

              {showMenu && (
                <>
                  <div className="candidate-menu-backdrop" onClick={() => setShowMenu(false)} />
                  <div className="candidate-menu-dropdown">
                    <div className="candidate-menu-title">Quality Rating</div>
                    <button
                      type="button"
                      className={`candidate-menu-item ${candidate.qualityRating === 'Good' ? 'active' : ''}`}
                      onClick={() => {
                        setShowMenu(false);
                        handleRatingChange('Good');
                      }}
                    >
                      <Star size={13} className="text-emerald-600" />
                      <span>★ Rate as Good</span>
                    </button>
                    <button
                      type="button"
                      className={`candidate-menu-item ${candidate.qualityRating === 'Optional' ? 'active' : ''}`}
                      onClick={() => {
                        setShowMenu(false);
                        handleRatingChange('Optional');
                      }}
                    >
                      <span>Rate as Optional</span>
                    </button>
                    <button
                      type="button"
                      className={`candidate-menu-item ${candidate.qualityRating === 'Not Rated' ? 'active' : ''}`}
                      onClick={() => {
                        setShowMenu(false);
                        handleRatingChange('Not Rated');
                      }}
                    >
                      <span>Reset to Not Rated</span>
                    </button>

                    <div className="candidate-menu-divider" />

                    <div className="candidate-menu-title">Client Decisions</div>
                    <button
                      type="button"
                      className="candidate-menu-item candidate-menu-item--primary"
                      onClick={() => {
                        setShowMenu(false);
                        onRequestClientDecisionConfirmation(candidate);
                      }}
                    >
                      <CheckCircle size={13} />
                      <span>
                        {candidate.clientShortlistStatus === 'Shortlisted'
                          ? 'Change Client Decision...'
                          : 'Record Client Decision...'}
                      </span>
                    </button>

                    <div className="candidate-menu-divider" />

                    <button
                      type="button"
                      className="candidate-menu-item candidate-menu-item--danger"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(candidate);
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Delete CV</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File Metadata */}
      <div className="candidate-file-meta" title={candidate.originalFileName}>
        <FileText size={13} className="text-muted flex-shrink-0" />
        <span className="candidate-filename truncate">{candidate.originalFileName}</span>
        <span className="candidate-filesize flex-shrink-0">({formatBytes(candidate.fileSize)})</span>
      </div>

      {/* Quality Rating Selector */}
      <div className="candidate-rating-row">
        <span className="candidate-rating-label">Rating:</span>
        {isReadOnly ? (
          <span
            className={`rating-badge ${
              candidate.qualityRating === 'Good'
                ? 'rating-badge--good'
                : candidate.qualityRating === 'Optional'
                ? 'rating-badge--optional'
                : 'rating-badge--none'
            }`}
          >
            {candidate.qualityRating === 'Good' && '★ '}
            {candidate.qualityRating}
          </span>
        ) : (
          <select
            value={candidate.qualityRating}
            disabled={isUpdatingRating}
            onChange={(e) => handleRatingChange(e.target.value)}
            className={`rating-select ${
              candidate.qualityRating === 'Good'
                ? 'rating-select--good'
                : candidate.qualityRating === 'Optional'
                ? 'rating-select--optional'
                : 'rating-select--none'
            }`}
          >
            <option value="Not Rated">Not Rated</option>
            <option value="Good">★ Good</option>
            <option value="Optional">Optional</option>
          </select>
        )}
      </div>

      {/* Timeline Dates & Client Decision Badges */}
      <div className="candidate-footer-meta">
        <div className="candidate-dates-list">
          {uploadDate && (
            <div className="candidate-date-item">
              <span className="candidate-date-prefix">Added:</span> {uploadDate}
            </div>
          )}
          {sentDate && (
            <div className="candidate-date-item text-blue-700">
              <span className="candidate-date-prefix">Sent:</span> {sentDate}
            </div>
          )}
          {hasClientDecision && (
            <div
              className={`candidate-client-status-badge ${
                candidate.clientShortlistStatus === 'Shortlisted'
                  ? 'status-badge--accepted'
                  : candidate.clientShortlistStatus === 'Rejected'
                  ? 'status-badge--rejected'
                  : 'status-badge--review'
              }`}
            >
              Client: {candidate.clientShortlistStatus}
              {clientDate ? ` (${clientDate})` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
