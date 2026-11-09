import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Download,
  Trash2,
  FileEdit,
  UserMinus,
  UserCheck,
  MoreVertical,
  History
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
 * - Candidate name & CV file metadata (filename, size, dates, feedback, optional sourcing attribution)
 * - Internal status pill ("Internally shortlisted")
 * - Quality rating selector (Not rated / Good / Optional)
 * - Client decision selector (Pending / Shortlisted / Rejected) or Withdrawn badge
 * - Accessible actions for viewing/downloading CV, and three-dot actions menu for withdrawal, attribution, notes, delete
 */
export default function CandidateCard({
  candidate,
  selectedAttempt = null,
  tas = [],
  isReadOnly = false,
  onUpdateStatus,
  onDelete,
  onDownload,
  onRequestClientDecisionConfirmation,
  onRequestWithdrawal,
  onViewInterviewHistory
}) {
  const [isUpdatingRating, setIsUpdatingRating] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);
  const [isUpdatingSource, setIsUpdatingSource] = useState(false);
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef(null);
  const sourcePopoverRef = useRef(null);

  // Derive the TAs assigned to the selected recruitment attempt (Primary TA + Supporting TAs)
  const assignedTAs = useMemo(() => {
    const list = [];
    const seen = new Set();
    const allTas = Array.isArray(tas) ? tas : [];

    const resolveTaObj = (taRef, roleLabel) => {
      if (!taRef) return null;
      const idStr = String(taRef._id || taRef);
      if (!idStr || seen.has(idStr)) return null;
      const name =
        (typeof taRef === 'object' && taRef.name) ||
        allTas.find(t => String(t._id) === idStr)?.name ||
        null;
      if (!name) return null;
      seen.add(idStr);
      return { _id: idStr, name, role: roleLabel };
    };

    if (selectedAttempt?.primaryTA) {
      const primary = resolveTaObj(selectedAttempt.primaryTA, 'Primary');
      if (primary) list.push(primary);
    }

    if (Array.isArray(selectedAttempt?.supportingTAs)) {
      selectedAttempt.supportingTAs.forEach(sup => {
        const resolved = resolveTaObj(sup, 'Supporting');
        if (resolved) list.push(resolved);
      });
    }

    return list;
  }, [selectedAttempt, tas]);

  // Resolve explicitly recorded sourcing attribution (never defaulted to primaryTA or submittedBy)
  const { sourcedById, sourcedByName } = useMemo(() => {
    const raw = candidate?.sourcedBy;
    if (!raw) return { sourcedById: '', sourcedByName: null };
    const idStr = String(raw._id || raw);
    if (!idStr) return { sourcedById: '', sourcedByName: null };
    const name =
      (typeof raw === 'object' && raw.name) ||
      assignedTAs.find(t => t._id === idStr)?.name ||
      (Array.isArray(tas) ? tas : []).find(t => String(t._id) === idStr)?.name ||
      null;
    return { sourcedById: idStr, sourcedByName: name };
  }, [candidate?.sourcedBy, assignedTAs, tas]);

  // Resolve uploading TA attribution
  const submittedByName = useMemo(() => {
    const raw = candidate?.submittedBy;
    if (!raw) return null;
    if (typeof raw === 'object' && raw.name) return raw.name;
    const idStr = String(raw._id || raw);
    return (Array.isArray(tas) ? tas : []).find(t => String(t._id) === idStr)?.name || null;
  }, [candidate?.submittedBy, tas]);

  // Close actions menu on click outside or Escape key
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  // Close inline sourcing popover on click outside or Escape key
  useEffect(() => {
    if (!isEditingSource) return;
    const handleClickOutside = (e) => {
      if (sourcePopoverRef.current && !sourcePopoverRef.current.contains(e.target)) {
        setIsEditingSource(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsEditingSource(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditingSource]);

  const handleToggleMenu = () => {
    if (!isMenuOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 190);
    }
    setIsMenuOpen(prev => !prev);
  };

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

  const handleSourceChange = async (newTaId) => {
    if (isReadOnly || isUpdatingSource) return;
    const normalizedNew = newTaId || null;
    const normalizedCurrent = sourcedById || null;
    if (normalizedNew === normalizedCurrent) {
      setIsEditingSource(false);
      return;
    }
    setIsUpdatingSource(true);
    try {
      await onUpdateStatus(candidate._id, { sourcedBy: normalizedNew });
      setIsEditingSource(false);
    } finally {
      setIsUpdatingSource(false);
    }
  };

  const uploadDate = formatDate(candidate.uploadedAt || candidate.internalShortlistDate);
  const clientDate = formatDate(candidate.clientShortlistDate);
  const withdrawalDate = formatDate(candidate.withdrawalDate);

  const isWithdrawn = candidate.isWithdrawn === true;
  const isClientShortlisted = candidate.clientShortlistStatus === 'Shortlisted';
  const canWithdraw = !isReadOnly && isClientShortlisted && !isWithdrawn && typeof onRequestWithdrawal === 'function';
  const canEditAttribution = !isReadOnly && assignedTAs.length > 0;

  const qualityValue = candidate.qualityRating || 'Not Rated';
  const clientDecisionValue = candidate.clientShortlistStatus || 'Pending';
  const isLegacyReviewStatus =
    clientDecisionValue === 'Review' || clientDecisionValue === 'Client Review';

  return (
    <div className={`cv-demo3-row ${isWithdrawn ? 'cv-demo3-row--withdrawn' : ''}`}>
      {/* Column 1: Candidate / CV */}
      <div className="cv-demo3-cell-candidate">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong className="cv-demo3-candidate-name" title={candidate.unverifiedLabel || 'Candidate'}>
            {candidate.unverifiedLabel || 'Candidate'}
          </strong>
          {candidate.setNumber && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                background: '#dcfce7',
                color: '#166534',
                padding: '1px 6px',
                borderRadius: '4px',
                border: '1px solid #bbf7d0',
                lineHeight: '1.2'
              }}
              title={`Belongs to ${candidate.setNumber}`}
            >
              {candidate.setNumber}
            </span>
          )}
        </div>
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
          {isWithdrawn && withdrawalDate && (
            <span> · Withdrawn {withdrawalDate}</span>
          )}
        </small>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {sourcedByName && !isEditingSource && (
            <small className="cv-demo3-candidate-sourced">
              <span>Sourced by: {sourcedByName}</span>
              {canEditAttribution && (
                <button
                  type="button"
                  className="cv-demo3-source-change-link"
                  onClick={() => setIsEditingSource(true)}
                  aria-label={`Change sourcing TA for ${candidate.unverifiedLabel || 'Candidate'}`}
                >
                  Change
                </button>
              )}
            </small>
          )}
          {submittedByName && submittedByName !== sourcedByName && (
            <small className="cv-demo3-candidate-sourced" style={{ color: '#64748b' }}>
              <span>Uploaded by: {submittedByName}</span>
            </small>
          )}
        </div>
        {isEditingSource && canEditAttribution && (
          <div className="cv-demo3-source-popover" ref={sourcePopoverRef}>
            <span className="cv-demo3-source-popover-label">Sourced by:</span>
            <select
              aria-label={`Select sourcing TA for ${candidate.unverifiedLabel || 'Candidate'}`}
              value={sourcedById}
              disabled={isUpdatingSource}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="cv-demo3-source-select"
              autoFocus
            >
              <option value="">— No attribution —</option>
              {assignedTAs.map((ta) => (
                <option key={ta._id} value={ta._id}>
                  {ta.name} ({ta.role})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="cv-demo3-source-cancel-btn"
              onClick={() => setIsEditingSource(false)}
            >
              Cancel
            </button>
          </div>
        )}
        {candidate.clientFeedback && (
          <small className="cv-demo3-candidate-feedback" title={candidate.clientFeedback}>
            Note: {candidate.clientFeedback}
          </small>
        )}
        {isWithdrawn && (
          <small
            className="cv-demo3-candidate-withdrawal"
            title={candidate.withdrawalExplanation ? `${candidate.withdrawalReason}: ${candidate.withdrawalExplanation}` : candidate.withdrawalReason}
          >
            Withdrawal: {candidate.withdrawalReason}
            {candidate.withdrawalExplanation ? ` (${candidate.withdrawalExplanation})` : ''}
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
        {isWithdrawn ? (
          <div className="cv-demo3-withdrawn-status">
            <span
              className="cv-demo3-pill cv-demo3-pill--withdrawn"
              title={candidate.withdrawalReason || 'Withdrawn'}
            >
              Withdrawn
            </span>
            <span
              className="cv-demo3-withdrawn-sub"
              title={candidate.withdrawalReason || 'Candidate withdrew'}
            >
              {candidate.withdrawalReason || 'Candidate withdrew'}
            </span>
          </div>
        ) : (
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
        )}
      </div>

      {/* Column 5: Actions (Open/Download CV, Three-dot Menu) */}
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

        {/* Three-Dot Actions Menu */}
        <div className="cv-demo3-menu-container" ref={menuRef}>
          <button
            type="button"
            className={`cv-demo3-icon-btn cv-demo3-menu-trigger ${isMenuOpen ? 'cv-demo3-menu-trigger--active' : ''}`}
            onClick={handleToggleMenu}
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-label={`More actions for ${candidate.unverifiedLabel || 'Candidate'}`}
            title="More actions"
          >
            <MoreVertical size={14} />
          </button>

          {isMenuOpen && (
            <div
              className={`cv-demo3-actions-dropdown ${openUpward ? 'cv-demo3-actions-dropdown--upward' : ''}`}
              role="menu"
            >
              {canWithdraw && (
                <button
                  type="button"
                  className="cv-demo3-dropdown-item cv-demo3-dropdown-item--warning"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onRequestWithdrawal(candidate);
                  }}
                >
                  <UserMinus size={13} />
                  <span>Record withdrawal</span>
                </button>
              )}

              {canEditAttribution && (
                <button
                  type="button"
                  className="cv-demo3-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsEditingSource(true);
                  }}
                >
                  <UserCheck size={13} />
                  <span>{sourcedByName ? 'Change sourcing TA' : 'Set sourcing TA'}</span>
                </button>
              )}

              {!isReadOnly && onRequestClientDecisionConfirmation && !isWithdrawn && (
                <button
                  type="button"
                  className="cv-demo3-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onRequestClientDecisionConfirmation(
                      candidate,
                      candidate.clientShortlistStatus === 'Rejected' ? 'Rejected' : 'Shortlisted'
                    );
                  }}
                >
                  <FileEdit size={13} />
                  <span>Decision notes & date</span>
                </button>
              )}

              {onViewInterviewHistory && (
                <button
                  type="button"
                  className="cv-demo3-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onViewInterviewHistory(candidate);
                  }}
                >
                  <History size={13} />
                  <span>Interview journey</span>
                </button>
              )}

              <button
                type="button"
                className="cv-demo3-dropdown-item"
                role="menuitem"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDownload(candidate._id);
                }}
              >
                <Download size={13} />
                <span>Download CV</span>
              </button>

              {!isReadOnly && onDelete && (
                <>
                  <div className="cv-demo3-dropdown-divider" />
                  <button
                    type="button"
                    className="cv-demo3-dropdown-item cv-demo3-dropdown-item--danger"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onDelete(candidate);
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete CV</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
