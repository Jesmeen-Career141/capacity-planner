import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Lock,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  X,
  Target,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import {
  getAttempts,
  createAttempt,
  updateAttempt,
  getSubmissions,
  uploadCvs,
  getDownloadUrl,
  deleteSubmission,
  updateSubmissionStatus
} from '../api/cvs';
import AttemptMetricsCard from './AttemptMetricsCard';
import CvUploadDropzone from './CvUploadDropzone';
import CandidatePipeline from './CandidatePipeline';
import './CandidateCvSection.css';

/**
 * CandidateCvSection
 * Main container for the CV Tracking tab inside PositionDetailModal.
 */
export default function CandidateCvSection({ position, tas = [] }) {
  // Attempt state
  const [attempts, setAttempts] = useState([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [loadingAttempts, setLoadingAttempts] = useState(true);
  const [attemptsError, setAttemptsError] = useState(null);

  // Submissions state
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState(null);

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState(null);

  // Modal dialog states
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [tempTargetValue, setTempTargetValue] = useState(0);
  const [savingTarget, setSavingTarget] = useState(false);

  const [showNewAttemptModal, setShowNewAttemptModal] = useState(false);
  const [newAttemptData, setNewAttemptData] = useState({
    requiredGoodCvTarget: 0,
    primaryTA: '',
    reopenReason: ''
  });
  const [creatingAttempt, setCreatingAttempt] = useState(false);


  const [decisionModalCandidate, setDecisionModalCandidate] = useState(null);
  const [decisionData, setDecisionData] = useState({
    status: 'Shortlisted',
    date: () => new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [savingDecision, setSavingDecision] = useState(false);

  const [deleteModalCandidate, setDeleteModalCandidate] = useState(null);
  const [deletingCandidate, setDeletingCandidate] = useState(false);

  // Safely derive array lists
  const attemptsList = Array.isArray(attempts) ? attempts : [];
  const submissionsList = Array.isArray(submissions) ? submissions : [];

  // Selected attempt derived
  const selectedAttempt = attemptsList.find(a => a?._id === selectedAttemptId) || null;
  const isReadOnly = !selectedAttempt || selectedAttempt.status !== 'Active';

  // 1. Load recruitment attempts
  const loadAttempts = useCallback(async () => {
    if (!position?._id) return;
    setLoadingAttempts(true);
    setAttemptsError(null);
    try {
      const res = await getAttempts(position._id);
      let list = [];
      let active = null;

      // Handle both { position, attempts, activeAttempt } payload and raw array payload
      if (Array.isArray(res?.data)) {
        list = res.data;
        active = list.find(a => a?.status === 'Active') || null;
      } else if (res?.data && Array.isArray(res.data.attempts)) {
        list = res.data.attempts;
        active = res.data.activeAttempt || list.find(a => a?.status === 'Active') || null;
      } else if (res?.data?.error) {
        throw new Error(res.data.error);
      } else {
        throw new Error('Unexpected response format received from recruitment attempts API.');
      }

      setAttempts(list);

      // Default to the Active attempt if present, else latest attempt
      if (active) {
        setSelectedAttemptId(active._id);
      } else if (list.length > 0) {
        setSelectedAttemptId(list[0]._id);
      } else {
        setSelectedAttemptId(null);
      }
    } catch (err) {
      console.error('Failed to load recruitment attempts:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to load recruitment attempts.';
      setAttemptsError(errMsg);
      setAttempts([]);
      setSelectedAttemptId(null);
    } finally {
      setLoadingAttempts(false);
    }
  }, [position?._id]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  // 2. Load candidate submissions when selected attempt changes
  const loadSubmissions = useCallback(async () => {
    if (!position?._id || !selectedAttemptId) {
      setSubmissions([]);
      setLoadingSubmissions(false);
      return;
    }
    setLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      const res = await getSubmissions(position._id, selectedAttemptId);
      let list = [];
      if (Array.isArray(res?.data)) {
        list = res.data;
      } else if (res?.data && Array.isArray(res.data.submissions)) {
        list = res.data.submissions;
      } else if (res?.data?.error) {
        throw new Error(res.data.error);
      } else {
        throw new Error('Unexpected response format received from candidate submissions API.');
      }
      setSubmissions(list);
    } catch (err) {
      console.error('Failed to load candidate submissions:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to load candidate submissions.';
      setSubmissionsError(errMsg);
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  }, [position?._id, selectedAttemptId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // 3. Handle Target Editing
  const handleOpenTargetModal = () => {
    if (isReadOnly || !selectedAttempt) return;
    setTempTargetValue(selectedAttempt.requiredGoodCvTarget || 0);
    setShowTargetModal(true);
  };

  const handleSaveTarget = async () => {
    const targetNum = Number(tempTargetValue);
    if (isNaN(targetNum) || targetNum < 0) {
      alert('Target must be a non-negative number.');
      return;
    }
    setSavingTarget(true);
    try {
      const res = await updateAttempt(position._id, selectedAttempt._id, {
        requiredGoodCvTarget: targetNum
      });
      // Update local attempt record safely
      const updated = res.data;
      if (updated && updated._id) {
        setAttempts(prev => (Array.isArray(prev) ? prev : []).map(a => (a._id === updated._id ? updated : a)));
        setShowTargetModal(false);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update Required Good CV Target.');
    } finally {
      setSavingTarget(false);
    }
  };

  // 4. Handle Starting a New Recruitment Attempt
  const handleOpenNewAttemptModal = () => {
    const hasPrevious = attemptsList.length > 0;
    setNewAttemptData({
      requiredGoodCvTarget: 0,
      primaryTA: position?.assignee?._id || '',
      reopenReason: hasPrevious ? '' : ''
    });
    setShowNewAttemptModal(true);
  };

  const handleCreateAttempt = async () => {
    const targetNum = Number(newAttemptData.requiredGoodCvTarget);
    if (isNaN(targetNum) || targetNum < 0) {
      alert('Required Good CV Target must be a non-negative number.');
      return;
    }

    setCreatingAttempt(true);
    try {
      const payload = {
        requiredGoodCvTarget: targetNum,
        primaryTA: newAttemptData.primaryTA || null,
        reopenReason: newAttemptData.reopenReason || ''
      };
      const res = await createAttempt(position._id, payload);
      const created = res.data;
      if (created && created._id) {
        setAttempts(prev => [created, ...(Array.isArray(prev) ? prev : [])]);
        setSelectedAttemptId(created._id);
        setShowNewAttemptModal(false);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start recruitment attempt.');
    } finally {
      setCreatingAttempt(false);
    }
  };

  // 5. Handle Upload
  const handleUploadFiles = async (files) => {
    if (isReadOnly || !selectedAttempt) return;
    setIsUploading(true);
    setUploadFeedback(null);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('attemptId', selectedAttempt._id);
    if (position?.assignee?._id) {
      formData.append('submittedBy', position.assignee._id);
    }

    try {
      const res = await uploadCvs(position._id, formData);
      const data = res.data;

      // Reload fresh submissions from backend to ensure consistent population
      await loadSubmissions();

      setUploadFeedback({
        successfulCount: data.successful?.length || 0,
        failedCount: data.failed?.length || 0,
        failed: data.failed || []
      });
    } catch (err) {
      const responseData = err.response?.data;
      const failedList = Array.isArray(responseData?.failed) ? responseData.failed : [];

      if (failedList.length > 0) {
        setUploadFeedback({
          successfulCount: responseData?.successful?.length || 0,
          failedCount: failedList.length,
          failed: failedList
        });
      }

      const errorMessage =
        responseData?.error ||
        failedList[0]?.error ||
        err.message ||
        'File upload failed. Please try again.';

      if (import.meta.env?.DEV) {
        console.error('[CV Upload Error]', {
          status: err.response?.status,
          message: errorMessage,
          failed: failedList
        });
      }

      alert(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  // 6. Handle Download
  const handleDownloadCv = async (submissionId) => {
    try {
      const res = await getDownloadUrl(submissionId);
      const { downloadUrl } = res.data;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate secure download link.');
    }
  };

  // 7. Handle Delete
  const handleConfirmDelete = async () => {
    if (!deleteModalCandidate || isReadOnly) return;
    setDeletingCandidate(true);
    try {
      await deleteSubmission(deleteModalCandidate._id);
      setSubmissions(prev => (Array.isArray(prev) ? prev : []).filter(s => s._id !== deleteModalCandidate._id));
      setDeleteModalCandidate(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete CV submission.');
    } finally {
      setDeletingCandidate(false);
    }
  };

  // 8. Handle Status Updates
  const handleUpdateStatus = async (submissionId, updates) => {
    if (isReadOnly) return;

    // Snapshot previous state for rollback
    const previous = Array.isArray(submissions) ? [...submissions] : [];

    // Optimistic update
    setSubmissions(prev =>
      (Array.isArray(prev) ? prev : []).map(s => {
        if (s._id !== submissionId) return s;
        return { ...s, ...updates };
      })
    );

    try {
      const res = await updateSubmissionStatus(submissionId, updates);
      // Synchronize with server response
      const updated = res.data;
      setSubmissions(prev =>
        (Array.isArray(prev) ? prev : []).map(s => (s._id === updated._id ? updated : s))
      );
    } catch (err) {
      // Revert on error
      setSubmissions(previous);
      alert(err.response?.data?.error || 'Failed to update candidate status.');
    }
  };

  // 9. Handle Client Decision Confirmation
  const handleConfirmClientDecision = async () => {
    if (!decisionModalCandidate || isReadOnly) return;
    setSavingDecision(true);
    try {
      const payload = {
        sentToClient: true,
        clientShortlistStatus: decisionData.status,
        clientFeedback: decisionData.notes || ''
      };
      if (decisionData.status === 'Shortlisted') {
        payload.clientShortlistDate = new Date(decisionData.date);
      } else {
        payload.clientShortlistDate = null;
      }

      await handleUpdateStatus(decisionModalCandidate._id, payload);
      setDecisionModalCandidate(null);
    } finally {
      setSavingDecision(false);
    }
  };

  if (loadingAttempts) {
    return (
      <div className="flex-items-center justify-center p-8 text-forest-600 gap-2">
        <Loader2 size={24} className="animate-spin" />
        <span>Loading recruitment attempts...</span>
      </div>
    );
  }

  if (attemptsError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-800 text-center my-4">
        <AlertCircle size={28} className="mx-auto mb-2 text-red-600" />
        <h4 className="font-semibold text-base mb-1">Failed to Load Recruitment Attempts</h4>
        <p className="text-sm text-red-700 mb-4">{attemptsError}</p>
        <button
          type="button"
          className="btn-secondary inline-flex items-center gap-1.5"
          onClick={loadAttempts}
        >
          <RotateCcw size={14} />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="cv-section-wrapper">
      {/* Attempt Navigation Row */}
      <div className="attempt-nav-bar">
        <div className="attempt-selector-group">
          <label htmlFor="attempt-select-input" className="attempt-selector-label">Recruitment Cycle:</label>
          {attemptsList.length === 0 ? (
            <span className="text-muted text-sm italic">No attempts created yet</span>
          ) : (
            <select
              id="attempt-select-input"
              value={selectedAttemptId || ''}
              onChange={(e) => setSelectedAttemptId(e.target.value)}
              className="attempt-select"
            >
              {attemptsList.map((att) => (
                <option key={att._id} value={att._id}>
                  Attempt #{att.attemptNumber} ({att.status}) — Target: {att.requiredGoodCvTarget || 0}
                </option>
              ))}
            </select>
          )}

          {selectedAttempt && (
            <span
              className={`attempt-status-badge attempt-status-badge--${selectedAttempt.status.toLowerCase()}`}
            >
              {selectedAttempt.status === 'Active' ? '● Active' : selectedAttempt.status}
            </span>
          )}
        </div>

        <div>
          <button
            type="button"
            className="btn-new-attempt"
            onClick={handleOpenNewAttemptModal}
          >
            <Plus size={14} />
            <span>{attemptsList.length === 0 ? 'Start Attempt 1' : 'Start New Attempt'}</span>
          </button>
        </div>
      </div>

      {/* Historical Attempt Read-Only Notice */}
      {isReadOnly && selectedAttempt && (
        <div className="attempt-readonly-banner">
          <Lock size={16} />
          <div>
            <strong>Historical Attempt — Read-Only Mode:</strong> Uploading, deleting, target modifications, and status changes are disabled for closed attempts.
          </div>
        </div>
      )}

      {/* No Attempt Empty State */}
      {attemptsList.length === 0 && (
        <div className="metrics-hero-card text-center p-8">
          <Target size={36} className="text-forest-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800 mb-1">No Recruitment Attempt Active</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Recruitment attempts manage candidate CV uploads, required targets, and the 4-stage pipeline. Start Attempt 1 to begin uploading CVs.
          </p>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            onClick={handleOpenNewAttemptModal}
          >
            <Plus size={16} />
            <span>Start First Recruitment Attempt</span>
          </button>
        </div>
      )}

      {/* Submissions Error Notice */}
      {submissionsError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
            <span>{submissionsError}</span>
          </div>
          <button
            type="button"
            className="text-red-800 underline hover:text-red-950 font-medium text-xs ml-4"
            onClick={loadSubmissions}
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics Card */}
      {selectedAttempt && (
        <AttemptMetricsCard
          attempt={selectedAttempt}
          submissions={submissionsList}
          isReadOnly={isReadOnly}
          onEditTarget={handleOpenTargetModal}
        />
      )}

      {/* CV Upload Dropzone */}
      {selectedAttempt && (
        <CvUploadDropzone
          onUpload={handleUploadFiles}
          disabled={isReadOnly}
          isUploading={isUploading}
        />
      )}

      {/* Upload Feedback Notice */}
      {uploadFeedback && (
        <div
          className={`p-3 rounded-md text-sm border ${
            uploadFeedback.failedCount > 0
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center justify-between mb-1 font-semibold">
            <span className="flex items-center gap-1.5">
              {uploadFeedback.failedCount > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              Upload Results: {uploadFeedback.successfulCount} successful
              {uploadFeedback.failedCount > 0 ? `, ${uploadFeedback.failedCount} rejected` : ''}
            </span>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 text-xs"
              onClick={() => setUploadFeedback(null)}
            >
              Dismiss
            </button>
          </div>
          {uploadFeedback.failed && uploadFeedback.failed.length > 0 && (
            <ul className="list-disc pl-5 text-xs space-y-1">
              {uploadFeedback.failed.map((f, i) => (
                <li key={i}>
                  <strong>{f.fileName}</strong>: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 4-Stage Workflow Pipeline */}
      {selectedAttempt && (
        <>
          {loadingSubmissions ? (
            <div className="flex-items-center justify-center p-8 text-forest-600 gap-2">
              <Loader2 size={20} className="animate-spin" />
              <span>Loading candidate submissions...</span>
            </div>
          ) : (
            <CandidatePipeline
              submissions={submissionsList}
              isReadOnly={isReadOnly}
              target={selectedAttempt?.requiredGoodCvTarget || 0}
              onUpdateStatus={handleUpdateStatus}
              onDelete={(cand) => setDeleteModalCandidate(cand)}
              onDownload={handleDownloadCv}
              onRequestClientDecisionConfirmation={(cand, defaultStatus = 'Shortlisted') => {
                setDecisionModalCandidate(cand);
                setDecisionData({
                  status: defaultStatus,
                  date: new Date().toISOString().split('T')[0],
                  notes: cand.clientFeedback || ''
                });
              }}
            />
          )}
        </>
      )}

      {/* ============================================================
          Sub-Modals (Target, New Attempt, Send, Decision, Delete)
          ============================================================ */}

      {/* 1. Target Edit Modal */}
      {showTargetModal && (
        <div className="cv-submodal-overlay" onClick={() => setShowTargetModal(false)}>
          <div className="cv-submodal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <h3>Edit Required Good CV Target</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowTargetModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="cv-submodal-body">
              <p className="text-sm text-gray-600">
                Set the number of <strong>Good CVs</strong> required for Attempt #{selectedAttempt?.attemptNumber}.
                Optional candidates do not count toward this target.
              </p>
              <div className="cv-form-field">
                <label htmlFor="target-input-field">Target Number of Good CVs:</label>
                <input
                  id="target-input-field"
                  type="number"
                  min="0"
                  value={tempTargetValue}
                  onChange={e => setTempTargetValue(e.target.value)}
                  className="cv-form-input"
                  autoFocus
                />
              </div>
            </div>
            <div className="cv-submodal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowTargetModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveTarget}
                disabled={savingTarget}
              >
                {savingTarget ? 'Saving...' : 'Save Target'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Start New Attempt Modal */}
      {showNewAttemptModal && (
        <div className="cv-submodal-overlay" onClick={() => setShowNewAttemptModal(false)}>
          <div className="cv-submodal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <h3>
                {attempts.length === 0 ? 'Start Attempt 1' : `Start Attempt #${attempts.length + 1}`}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowNewAttemptModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="cv-submodal-body">
              <p className="text-sm text-gray-600">
                Starting a new attempt starts a clean candidate pipeline while preserving historical attempts and submissions.
              </p>
              <div className="cv-form-field">
                <label htmlFor="required-good-cv-input">Required Good CV Target:</label>
                <input
                  id="required-good-cv-input"
                  type="number"
                  min="0"
                  value={newAttemptData.requiredGoodCvTarget}
                  onChange={e =>
                    setNewAttemptData(prev => ({ ...prev, requiredGoodCvTarget: e.target.value }))
                  }
                  className="cv-form-input"
                />
              </div>
              <div className="cv-form-field">
                <label htmlFor="primary-ta-select">Primary TA Assigned:</label>
                <select
                  id="primary-ta-select"
                  value={newAttemptData.primaryTA}
                  onChange={e =>
                    setNewAttemptData(prev => ({ ...prev, primaryTA: e.target.value }))
                  }
                  className="cv-form-input"
                >
                  <option value="">(None / Position Assignee)</option>
                  {tas.map(ta => (
                    <option key={ta._id} value={ta._id}>
                      {ta.name}
                    </option>
                  ))}
                </select>
              </div>
              {attempts.length > 0 && (
                <div className="cv-form-field">
                  <label htmlFor="reopen-reason-input">Reopen / Initiation Reason:</label>
                  <input
                    id="reopen-reason-input"
                    type="text"
                    value={newAttemptData.reopenReason}
                    onChange={e =>
                      setNewAttemptData(prev => ({ ...prev, reopenReason: e.target.value }))
                    }
                    placeholder="e.g. Candidate backed out, client expanded headcount"
                    className="cv-form-input"
                  />
                </div>
              )}
            </div>
            <div className="cv-submodal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowNewAttemptModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateAttempt}
                disabled={creatingAttempt}
              >
                {creatingAttempt ? 'Creating...' : 'Start Attempt'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 4. Client Decision Modal */}
      {decisionModalCandidate && (
        <div className="cv-submodal-overlay" onClick={() => setDecisionModalCandidate(null)}>
          <div className="cv-submodal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <h3>Record Client Decision</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDecisionModalCandidate(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="cv-submodal-body">
              <p className="text-sm text-gray-700">
                Select client outcome for <strong>{decisionModalCandidate.unverifiedLabel}</strong>:
              </p>
              <div className="cv-decision-options">
                <label className="cv-decision-option">
                  <input
                    type="radio"
                    name="clientDecision"
                    value="Shortlisted"
                    checked={decisionData.status === 'Shortlisted'}
                    onChange={() => setDecisionData(prev => ({ ...prev, status: 'Shortlisted' }))}
                  />
                  <div className="cv-decision-option-content">
                    <span className="cv-decision-option-title text-forest-700">Client Shortlisted</span>
                    <span className="cv-decision-option-desc">Candidate accepted and moving to interviews (Stage D).</span>
                  </div>
                </label>

                <label className="cv-decision-option">
                  <input
                    type="radio"
                    name="clientDecision"
                    value="Review"
                    checked={decisionData.status === 'Review'}
                    onChange={() => setDecisionData(prev => ({ ...prev, status: 'Review' }))}
                  />
                  <div className="cv-decision-option-content">
                    <span className="cv-decision-option-title text-purple-700">Client Review</span>
                    <span className="cv-decision-option-desc">Client is evaluating candidate profile (Stays in Stage C).</span>
                  </div>
                </label>

                <label className="cv-decision-option">
                  <input
                    type="radio"
                    name="clientDecision"
                    value="Rejected"
                    checked={decisionData.status === 'Rejected'}
                    onChange={() => setDecisionData(prev => ({ ...prev, status: 'Rejected' }))}
                  />
                  <div className="cv-decision-option-content">
                    <span className="cv-decision-option-title text-red-700">Client Rejected</span>
                    <span className="cv-decision-option-desc">Client decided not to proceed (Stays in Stage C with rejected badge).</span>
                  </div>
                </label>

                <label className="cv-decision-option">
                  <input
                    type="radio"
                    name="clientDecision"
                    value="Pending"
                    checked={decisionData.status === 'Pending'}
                    onChange={() => setDecisionData(prev => ({ ...prev, status: 'Pending' }))}
                  />
                  <div className="cv-decision-option-content">
                    <span className="cv-decision-option-title text-gray-700">Pending Decision</span>
                    <span className="cv-decision-option-desc">Awaiting initial feedback from client.</span>
                  </div>
                </label>
              </div>

              {decisionData.status === 'Shortlisted' && (
                <div className="cv-form-field mt-2">
                  <label htmlFor="decision-date-input">Client Shortlist Date:</label>
                  <input
                    id="decision-date-input"
                    type="date"
                    value={decisionData.date}
                    onChange={e => setDecisionData(prev => ({ ...prev, date: e.target.value }))}
                    className="cv-form-input"
                  />
                </div>
              )}

              <div className="cv-form-field">
                <label htmlFor="client-notes-textarea">Client Feedback / Notes (Optional):</label>
                <textarea
                  id="client-notes-textarea"
                  value={decisionData.notes}
                  onChange={e => setDecisionData(prev => ({ ...prev, notes: e.target.value }))}
                  rows="2"
                  placeholder="e.g. Likes domain experience, schedule technical round"
                  className="cv-form-textarea"
                />
              </div>
            </div>
            <div className="cv-submodal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDecisionModalCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmClientDecision}
                disabled={savingDecision}
              >
                {savingDecision ? 'Saving...' : 'Save Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Delete Confirmation Modal */}
      {deleteModalCandidate && (
        <div className="cv-submodal-overlay" onClick={() => setDeleteModalCandidate(null)}>
          <div className="cv-submodal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <h3>Confirm CV Deletion</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeleteModalCandidate(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="cv-submodal-body">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete the CV for <strong>{deleteModalCandidate.unverifiedLabel}</strong> (
                {deleteModalCandidate.originalFileName})?
              </p>
              <p className="text-xs text-red-600 font-semibold">
                This will permanently delete the file from Cloudflare R2 private storage and remove the candidate submission record from the database.
              </p>
            </div>
            <div className="cv-submodal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteModalCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDelete}
                disabled={deletingCandidate}
              >
                {deletingCandidate ? 'Deleting...' : 'Delete CV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
