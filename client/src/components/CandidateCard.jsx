import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';

export const INTERVIEW_OUTCOME_OPTIONS = [
  'In Progress',
  '1st Int. Shortlisted',
  '2nd Int. Shortlisted',
  'Rejected – 1st Interview',
  'Rejected – 2nd Interview',
  'Rejected – 3rd Interview',
  'Rejected – Final Interview',
  'Withdrawn',
  'Selected'
];

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function getEffectiveOutcome(candidate) {
  if (!candidate || candidate.clientShortlistStatus !== 'Shortlisted') {
    return '';
  }
  if (candidate.interviewOutcome) {
    return candidate.interviewOutcome;
  }
  if (candidate.isWithdrawn === true) {
    return 'Withdrawn';
  }
  if (candidate.isPlaced === true) {
    return 'Selected';
  }
  return 'In Progress';
}

export function getOutcomeColorClass(outcome) {
  if (!outcome) return '';
  if (outcome === 'Withdrawn') return 'cv-demo3-select--withdrawn';
  if (outcome === 'Selected') return 'cv-demo3-select--selected';
  if (outcome.startsWith('Rejected')) return 'cv-demo3-select--rejected';
  if (outcome === 'In Progress') return 'cv-demo3-select--progress';
  return 'cv-demo3-select--shortlisted';
}

export function getEffectiveCandidateNote(candidate) {
  if (!candidate) return '';
  if (candidate.candidateNote !== undefined && candidate.candidateNote !== null) {
    return String(candidate.candidateNote).trim();
  }
  if (candidate.isWithdrawn && candidate.withdrawalReason) {
    return candidate.withdrawalExplanation
      ? `${candidate.withdrawalReason} (${candidate.withdrawalExplanation})`
      : String(candidate.withdrawalReason).trim();
  }
  if (candidate.clientFeedback) {
    return String(candidate.clientFeedback).trim();
  }
  return '';
}

/**
 * CandidateCard (CV Tracking V3 — Two-Stage Client Shortlist & Interview Outcome)
 * Renders the 4-column candidate row:
 * 1. Candidate / CV (clicking candidate name or file name opens CV; optional sourcing attribution & note editor)
 * 2. Quality (Not rated / Good / Optional)
 * 3. Client CV Decision (Pending / Shortlisted / CV Rejected)
 * 4. Interview / Final Outcome (Appears when Shortlisted: In Progress, 1st/2nd Int. Shortlisted, Rejected rounds, Withdrawn, Selected + hover Note icon when note exists)
 */
export default function CandidateCard({
  candidate,
  position = null,
  selectedAttempt = null,
  tas = [],
  positionSets = [],
  isReadOnly = false,
  onUpdateStatus,
  onDownload
}) {
  const [isUpdatingRating, setIsUpdatingRating] = useState(false);
  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);
  const [isUpdatingOutcome, setIsUpdatingOutcome] = useState(false);
  const [isUpdatingSource, setIsUpdatingSource] = useState(false);
  const [isEditingSource, setIsEditingSource] = useState(false);

  // Optional candidate note editing state
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const sourcePopoverRef = useRef(null);
  const noteInputRef = useRef(null);

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

  // Resolve explicitly recorded sourcing attribution
  const { sourcedById, displaySourcedName } = useMemo(() => {
    const allTas = Array.isArray(tas) ? tas : [];
    const raw = candidate?.sourcedBy;
    if (raw) {
      const idStr = String(raw._id || raw);
      if (idStr) {
        const name =
          (typeof raw === 'object' && raw.name) ||
          assignedTAs.find(t => t._id === idStr)?.name ||
          allTas.find(t => String(t._id) === idStr)?.name ||
          null;
        if (name) {
          return { sourcedById: idStr, displaySourcedName: name };
        }
      }
    }

    const safeSets = Array.isArray(positionSets) ? positionSets : [];
    const candidateSetId = candidate?.submissionSet?._id || candidate?.submissionSet;
    const matchedSet = safeSets.find(
      s =>
        (candidateSetId && String(s._id) === String(candidateSetId)) ||
        (candidate?.setNumber && s.setNumber === candidate.setNumber)
    );
    if (matchedSet && Array.isArray(matchedSet.sourcingTAs) && matchedSet.sourcingTAs.length > 0) {
      const names = matchedSet.sourcingTAs
        .map(t => {
          if (!t) return null;
          if (typeof t === 'object' && t.name) return t.name;
          const idStr = String(t._id || t);
          return allTas.find(item => String(item._id) === idStr)?.name || null;
        })
        .filter(Boolean);
      if (names.length > 0) {
        return { sourcedById: '', displaySourcedName: names.join(', ') };
      }
    }

    return { sourcedById: '', displaySourcedName: null };
  }, [candidate?.sourcedBy, candidate?.submissionSet, candidate?.setNumber, assignedTAs, tas, positionSets]);

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

  useEffect(() => {
    if (isEditingNote) {
      setTimeout(() => noteInputRef.current?.focus(), 10);
    }
  }, [isEditingNote]);

  const handleRatingChange = async (newRating) => {
    if (isReadOnly || isUpdatingRating || candidate.qualityRating === newRating) return;
    setIsUpdatingRating(true);
    try {
      const payload = { qualityRating: newRating };
      if (candidate.internalShortlistStatus !== 'Shortlisted' && newRating !== 'Not Rated') {
        payload.internalShortlistStatus = 'Shortlisted';
      }
      await onUpdateStatus(candidate._id, payload);
    } finally {
      setIsUpdatingRating(false);
    }
  };

  // Stage 1: Client CV Decision Change (Pending / Shortlisted / CV Rejected)
  const handleClientDecisionChange = async (newDecision) => {
    const normalizedDecision = newDecision === 'CV Rejected' ? 'Rejected' : newDecision;
    const currentDecision = candidate.clientShortlistStatus || 'Pending';
    if (isReadOnly || isUpdatingDecision || currentDecision === normalizedDecision) return;
    setIsUpdatingDecision(true);
    try {
      if (normalizedDecision === 'Pending') {
        await onUpdateStatus(candidate._id, {
          clientShortlistStatus: 'Pending',
          clientShortlistDate: null,
          isWithdrawn: false
        });
      } else if (normalizedDecision === 'Shortlisted') {
        const nextOutcome = candidate.interviewOutcome || 'In Progress';
        await onUpdateStatus(candidate._id, {
          sentToClient: true,
          clientShortlistStatus: 'Shortlisted',
          clientShortlistDate: candidate.clientShortlistDate || new Date().toISOString(),
          interviewOutcome: nextOutcome,
          isWithdrawn: nextOutcome === 'Withdrawn'
        });
      } else if (normalizedDecision === 'Rejected') {
        await onUpdateStatus(candidate._id, {
          sentToClient: true,
          clientShortlistStatus: 'Rejected',
          clientShortlistDate: candidate.clientShortlistDate || new Date().toISOString(),
          isWithdrawn: false
        });
      }
    } finally {
      setIsUpdatingDecision(false);
    }
  };

  // Stage 2: Interview / Final Outcome Change
  const handleInterviewOutcomeChange = async (newOutcome) => {
    const currentOutcome = getEffectiveOutcome(candidate);
    if (isReadOnly || isUpdatingOutcome || currentOutcome === newOutcome) return;
    setIsUpdatingOutcome(true);
    try {
      await onUpdateStatus(candidate._id, {
        sentToClient: true,
        clientShortlistStatus: 'Shortlisted',
        interviewOutcome: newOutcome,
        interviewOutcomeDate: new Date().toISOString(),
        isWithdrawn: newOutcome === 'Withdrawn'
      });
    } finally {
      setIsUpdatingOutcome(false);
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

  const noteText = getEffectiveCandidateNote(candidate);
  const hasNote = Boolean(noteText);

  const handleOpenNoteEditor = () => {
    if (isReadOnly) return;
    setNoteDraft(noteText);
    setIsEditingNote(true);
  };

  const handleSaveNote = async () => {
    if (isReadOnly || isSavingNote) return;
    setIsSavingNote(true);
    try {
      const trimmed = noteDraft.trim();
      await onUpdateStatus(candidate._id, {
        candidateNote: trimmed
      });
      setIsEditingNote(false);
    } finally {
      setIsSavingNote(false);
    }
  };

  const uploadDate = formatDate(candidate.uploadedAt || candidate.internalShortlistDate);
  const canEditAttribution = !isReadOnly && assignedTAs.length > 0;

  const interviewTrackerLink = useMemo(() => {
    const params = new URLSearchParams();
    const candName = candidate?.unverifiedLabel || candidate?.candidateName || '';
    if (candName) params.set('search', candName);
    const clientName = position?.clientName || position?.client?.clientName || (typeof position?.client === 'string' ? position.client : '');
    if (clientName) params.set('client', clientName);
    const posName = position?.position || position?.title || position?.positionName || '';
    if (posName) params.set('position', posName);
    return `/interviews?${params.toString()}`;
  }, [candidate, position]);

  const qualityValue = candidate.qualityRating || 'Not Rated';
  const clientDecisionValue =
    candidate.clientShortlistStatus === 'Review' || candidate.clientShortlistStatus === 'Client Review'
      ? 'Shortlisted'
      : candidate.clientShortlistStatus || 'Pending';
  const isClientShortlisted = clientDecisionValue === 'Shortlisted';
  const effectiveOutcome = getEffectiveOutcome({
    ...candidate,
    clientShortlistStatus: clientDecisionValue
  });

  return (
    <div className="cv-demo3-row">
      {/* Column 1: Candidate / CV */}
      <div className="cv-demo3-cell-candidate">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cv-demo3-candidate-name-btn"
            onClick={() => onDownload(candidate._id)}
            title={`Open CV for ${candidate.unverifiedLabel || 'Candidate'}`}
          >
            {candidate.unverifiedLabel || 'Candidate'}
          </button>
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
          <a
            href={interviewTrackerLink}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Interview Tracker"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
              color: '#059669',
              borderRadius: '4px',
              textDecoration: 'none'
            }}
          >
            <ArrowUpRight size={14} />
          </a>
        </div>

        <small className="cv-demo3-candidate-meta">
          {uploadDate && <span>Added {uploadDate}</span>}
          {!isReadOnly && (
            <>
              {uploadDate && <span> · </span>}
              <button
                type="button"
                className="cv-demo3-note-trigger-link"
                onClick={handleOpenNoteEditor}
                title={hasNote ? 'Edit candidate note' : 'Add optional candidate note'}
              >
                {hasNote ? 'Edit note' : '+ Note'}
              </button>
            </>
          )}
        </small>

        {isEditingNote && (
          <div className="cv-demo3-note-editor">
            <input
              ref={noteInputRef}
              type="text"
              className="cv-demo3-note-input"
              placeholder="Optional note (e.g. Candidate withdrew, feedback...)"
              value={noteDraft}
              disabled={isSavingNote}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveNote();
                } else if (e.key === 'Escape') {
                  setIsEditingNote(false);
                }
              }}
            />
            <button
              type="button"
              className="cv-demo3-note-save-btn"
              onClick={handleSaveNote}
              disabled={isSavingNote}
            >
              Save
            </button>
            {hasNote && (
              <button
                type="button"
                className="cv-demo3-note-clear-btn"
                onClick={async () => {
                  setNoteDraft('');
                  setIsSavingNote(true);
                  try {
                    await onUpdateStatus(candidate._id, { candidateNote: '' });
                    setIsEditingNote(false);
                  } finally {
                    setIsSavingNote(false);
                  }
                }}
                disabled={isSavingNote}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="cv-demo3-source-cancel-btn"
              onClick={() => setIsEditingNote(false)}
              disabled={isSavingNote}
            >
              Cancel
            </button>
          </div>
        )}

        {displaySourcedName && !isEditingSource && (
          <div
            className="cv-demo3-candidate-sourced"
            onClick={canEditAttribution ? () => setIsEditingSource(true) : undefined}
            role={canEditAttribution ? 'button' : undefined}
            tabIndex={canEditAttribution ? 0 : undefined}
            onKeyDown={canEditAttribution ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsEditingSource(true);
              }
            } : undefined}
            title={canEditAttribution ? 'Click to change sourcing TA' : undefined}
            style={canEditAttribution ? { cursor: 'pointer' } : undefined}
          >
            <span>{displaySourcedName}</span>
          </div>
        )}

        {isEditingSource && canEditAttribution && (
          <div className="cv-demo3-source-popover" ref={sourcePopoverRef}>
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
      </div>

      {/* Column 2: Quality Rating */}
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

      {/* Column 3: Dropdown 1 — Client CV Decision */}
      <div className="cv-demo3-cell-decision">
        <select
          aria-label={`Client CV decision for ${candidate.unverifiedLabel || 'Candidate'}`}
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
          <option value="Pending">Pending</option>
          <option value="Shortlisted">Shortlisted</option>
          <option value="Rejected">CV Rejected</option>
        </select>
      </div>

      {/* Column 4: Dropdown 2 — Interview / Final Outcome + Optional Hover Note Icon */}
      <div className="cv-demo3-cell-outcome">
        <div className="cv-v3-second-wrap">
          {isClientShortlisted ? (
            <select
              aria-label={`Interview outcome for ${candidate.unverifiedLabel || 'Candidate'}`}
              value={effectiveOutcome}
              disabled={isReadOnly || isUpdatingOutcome}
              onChange={(e) => handleInterviewOutcomeChange(e.target.value)}
              className={`cv-demo3-select ${getOutcomeColorClass(effectiveOutcome)}`}
            >
              {INTERVIEW_OUTCOME_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <span className="cv-v3-empty">Shown when shortlisted</span>
          )}

          {hasNote && (
            <span className="reason-wrap">
              <button
                className="reason-btn"
                type="button"
                aria-label="View note"
                onClick={handleOpenNoteEditor}
              >
                i
              </button>
              <span className="reason-tooltip" role="tooltip">
                <strong>Note</strong>
                {noteText}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
