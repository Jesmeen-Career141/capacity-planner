import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Lock,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  X,
  Target,
  Loader2,
  AlertTriangle,
  Layers,
  Calendar,
  ExternalLink
} from 'lucide-react';
import {
  getAttempts,
  createAttempt,
  updateAttempt,
  getSubmissions,
  uploadCvs,
  getDownloadUrl,
  deleteSubmission,
  updateSubmissionStatus,
  withdrawCandidate
} from '../api/cvs';
import {
  getPositionSets,
  createSubmissionSet
} from '../api/submissionSets';
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

  // Submission Sets state
  const [positionSets, setPositionSets] = useState([]);
  const [selectedSetFilter, setSelectedSetFilter] = useState('ALL');
  const [targetUploadSetId, setTargetUploadSetId] = useState('');

  // Modal dialog states
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [tempTargetValue, setTempTargetValue] = useState(0);
  const [savingTarget, setSavingTarget] = useState(false);

  const [showNewAttemptModal, setShowNewAttemptModal] = useState(false);
  const [newAttemptData, setNewAttemptData] = useState({
    requiredGoodCvTarget: 0,
    primaryTA: '',
    supportingTAs: [],
    reopenReason: ''
  });
  const [creatingAttempt, setCreatingAttempt] = useState(false);

  const [showEditTasModal, setShowEditTasModal] = useState(false);
  const [editTasData, setEditTasData] = useState({
    primaryTA: '',
    supportingTAs: []
  });
  const [savingTas, setSavingTas] = useState(false);

  const [decisionModalCandidate, setDecisionModalCandidate] = useState(null);
  const [decisionData, setDecisionData] = useState({
    status: 'Shortlisted',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [savingDecision, setSavingDecision] = useState(false);

  const [deleteModalCandidate, setDeleteModalCandidate] = useState(null);
  const [deletingCandidate, setDeletingCandidate] = useState(false);

  // Withdrawal modal state
  const [withdrawalModalCandidate, setWithdrawalModalCandidate] = useState(null);
  const [withdrawalData, setWithdrawalData] = useState({
    reason: 'Candidate withdrew',
    explanation: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [savingWithdrawal, setSavingWithdrawal] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState(null);

  // Safely derive array lists
  const attemptsList = Array.isArray(attempts) ? attempts : [];
  const submissionsList = Array.isArray(submissions) ? submissions : [];

  // Filter submissions by selected submission set if active
  const displayedSubmissions = useMemo(() => {
    if (selectedSetFilter === 'ALL') return submissionsList;
    if (selectedSetFilter === 'UNASSIGNED') {
      return submissionsList.filter(s => !s.submissionSet && !s.setNumber);
    }
    return submissionsList.filter(s =>
      String(s.submissionSet?._id || s.submissionSet) === String(selectedSetFilter) ||
      s.setNumber === selectedSetFilter ||
      s.submissionSetId === selectedSetFilter
    );
  }, [submissionsList, selectedSetFilter]);

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

  // Load submission sets for this position
  const loadPositionSets = useCallback(async () => {
    if (!position?._id) return;
    try {
      const res = await getPositionSets(position._id);
      setPositionSets(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load position submission sets:', err);
    }
  }, [position?._id]);

  useEffect(() => {
    loadPositionSets();
  }, [loadPositionSets]);

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

  // 3b. Handle Editing Attempt TA Assignments
  const handleOpenEditTasModal = () => {
    if (isReadOnly || !selectedAttempt) return;
    const currentPrimary = selectedAttempt.primaryTA
      ? String(selectedAttempt.primaryTA._id || selectedAttempt.primaryTA)
      : '';
    const currentSupporting = Array.isArray(selectedAttempt.supportingTAs)
      ? selectedAttempt.supportingTAs
          .map(t => String(t?._id || t))
          .filter(id => id && id !== currentPrimary)
      : [];
    setEditTasData({
      primaryTA: currentPrimary,
      supportingTAs: currentSupporting
    });
    setShowEditTasModal(true);
  };

  const handleSaveEditTas = async () => {
    if (isReadOnly || !selectedAttempt) return;
    setSavingTas(true);
    try {
      const primaryId = editTasData.primaryTA || null;
      const cleanSupporting = (editTasData.supportingTAs || []).filter(
        id => id && id !== primaryId
      );
      const res = await updateAttempt(position._id, selectedAttempt._id, {
        primaryTA: primaryId,
        supportingTAs: cleanSupporting
      });
      const updated = res.data;
      if (updated && updated._id) {
        setAttempts(prev => (Array.isArray(prev) ? prev : []).map(a => (a._id === updated._id ? updated : a)));
        setShowEditTasModal(false);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update TA assignments.');
    } finally {
      setSavingTas(false);
    }
  };

  // 4. Handle Starting a New Recruitment Attempt
  const handleOpenNewAttemptModal = () => {
    const hasPrevious = attemptsList.length > 0;
    setNewAttemptData({
      requiredGoodCvTarget: 0,
      primaryTA: position?.assignee?._id || '',
      supportingTAs: [],
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
      const effectivePrimary = newAttemptData.primaryTA || position?.assignee?._id || null;
      const cleanSupporting = Array.isArray(newAttemptData.supportingTAs)
        ? newAttemptData.supportingTAs.filter(id => id && String(id) !== String(effectivePrimary))
        : [];
      const payload = {
        requiredGoodCvTarget: targetNum,
        primaryTA: newAttemptData.primaryTA || null,
        supportingTAs: cleanSupporting,
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
    if (targetUploadSetId) {
      formData.append('submissionSetId', targetUploadSetId);
    }

    try {
      const res = await uploadCvs(position._id, formData);
      const data = res.data;

      // Reload fresh submissions and sets from backend to ensure consistent population
      await loadSubmissions();
      await loadPositionSets();

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
        clientShortlistDate: decisionData.date ? new Date(decisionData.date) : new Date(),
        clientFeedback: decisionData.notes || ''
      };

      await handleUpdateStatus(decisionModalCandidate._id, payload);
      setDecisionModalCandidate(null);
    } finally {
      setSavingDecision(false);
    }
  };

  // 10. Handle Candidate Withdrawal (Phase 2)
  const handleRequestWithdrawal = (candidate) => {
    if (isReadOnly || !candidate) return;
    if (candidate.clientShortlistStatus !== 'Shortlisted') {
      alert('Withdrawal can only be recorded for candidates whose client decision is Shortlisted.');
      return;
    }
    if (candidate.isWithdrawn) {
      alert('This candidate has already been marked as withdrawn.');
      return;
    }
    setWithdrawalError(null);
    setWithdrawalData({
      reason: 'Candidate withdrew',
      explanation: '',
      date: new Date().toISOString().split('T')[0]
    });
    setWithdrawalModalCandidate(candidate);
  };

  const handleConfirmWithdrawal = async () => {
    if (!withdrawalModalCandidate || isReadOnly) return;

    if (withdrawalData.reason === 'Other' && (!withdrawalData.explanation || !withdrawalData.explanation.trim())) {
      setWithdrawalError('A brief explanation is required when "Other" is selected as the withdrawal reason.');
      return;
    }

    setSavingWithdrawal(true);
    setWithdrawalError(null);

    // Save previous snapshot for rollback
    const previous = Array.isArray(submissions) ? [...submissions] : [];

    // Optimistic update
    setSubmissions(prev =>
      (Array.isArray(prev) ? prev : []).map(s => {
        if (s._id !== withdrawalModalCandidate._id) return s;
        return {
          ...s,
          isWithdrawn: true,
          withdrawalDate: withdrawalData.date ? new Date(withdrawalData.date).toISOString() : new Date().toISOString(),
          withdrawalReason: withdrawalData.reason,
          withdrawalExplanation: withdrawalData.reason === 'Other' ? withdrawalData.explanation.trim() : ''
        };
      })
    );

    try {
      const payload = {
        withdrawalReason: withdrawalData.reason,
        withdrawalExplanation: withdrawalData.reason === 'Other' ? withdrawalData.explanation.trim() : '',
        withdrawalDate: withdrawalData.date || new Date().toISOString().split('T')[0]
      };
      const res = await withdrawCandidate(withdrawalModalCandidate._id, payload);
      const updated = res.data;
      if (updated && updated._id) {
        setSubmissions(prev =>
          (Array.isArray(prev) ? prev : []).map(s => (s._id === updated._id ? updated : s))
        );
      }
      setWithdrawalModalCandidate(null);
    } catch (err) {
      // Revert on error
      setSubmissions(previous);
      const errMsg =
        err.response?.data?.error ||
        (err.response?.status === 404
          ? 'Candidate withdrawal endpoint not found (404). Please ensure the backend server has reloaded with the latest routes.'
          : err.message) ||
        'Failed to record candidate withdrawal.';
      setWithdrawalError(errMsg);
    } finally {
      setSavingWithdrawal(false);
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

  // Derive TA display names for the selected attempt
  const resolveTaName = (taRef) => {
    if (!taRef) return null;
    if (typeof taRef === 'object' && taRef.name) return taRef.name;
    const idStr = String(taRef._id || taRef);
    const found = (Array.isArray(tas) ? tas : []).find(t => String(t._id) === idStr);
    return found ? found.name : null;
  };

  const selectedPrimaryTaName = selectedAttempt
    ? (resolveTaName(selectedAttempt.primaryTA) || position?.assignee?.name || null)
    : null;

  const selectedSupportingTaNames = selectedAttempt && Array.isArray(selectedAttempt.supportingTAs)
    ? selectedAttempt.supportingTAs.map(resolveTaName).filter(Boolean)
    : [];

  const effectiveNewAttemptPrimaryId = String(newAttemptData.primaryTA || position?.assignee?._id || '');
  const availableSupportingTasForNew = (Array.isArray(tas) ? tas : []).filter(
    ta => String(ta._id) !== effectiveNewAttemptPrimaryId
  );

  const availableSupportingTasForEdit = (Array.isArray(tas) ? tas : []).filter(
    ta => String(ta._id) !== String(editTasData.primaryTA || '')
  );

  const toggleNewAttemptSupportingTa = (taId) => {
    const idStr = String(taId);
    if (idStr === effectiveNewAttemptPrimaryId) return;
    setNewAttemptData(prev => {
      const current = Array.isArray(prev.supportingTAs) ? prev.supportingTAs : [];
      const exists = current.includes(idStr);
      return {
        ...prev,
        supportingTAs: exists ? current.filter(id => id !== idStr) : [...current, idStr]
      };
    });
  };

  const toggleEditAttemptSupportingTa = (taId) => {
    const idStr = String(taId);
    if (idStr === String(editTasData.primaryTA || '')) return;
    setEditTasData(prev => {
      const current = Array.isArray(prev.supportingTAs) ? prev.supportingTAs : [];
      const exists = current.includes(idStr);
      return {
        ...prev,
        supportingTAs: exists ? current.filter(id => id !== idStr) : [...current, idStr]
      };
    });
  };

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

          {selectedAttempt && (selectedPrimaryTaName || selectedSupportingTaNames.length > 0 || (!isReadOnly && tas.length > 0)) && (
            <span className="attempt-ta-summary">
              {selectedPrimaryTaName && (
                <span className="attempt-ta-item">
                  Primary TA: <strong>{selectedPrimaryTaName}</strong>
                </span>
              )}
              {selectedSupportingTaNames.length > 0 && (
                <span className="attempt-ta-item">
                  {selectedPrimaryTaName ? ' · ' : ''}Supporting: <strong>{selectedSupportingTaNames.join(', ')}</strong>
                </span>
              )}
              {!isReadOnly && tas.length > 0 && (
                <button
                  type="button"
                  className="attempt-ta-edit-link"
                  onClick={handleOpenEditTasModal}
                  title="Edit Primary and Supporting TAs for this attempt"
                >
                  {selectedPrimaryTaName || selectedSupportingTaNames.length > 0 ? 'Edit TAs' : 'Assign TAs'}
                </button>
              )}
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

      {/* CV Upload Dropzone (Demo 3 top upload area) */}
      {selectedAttempt && positionSets.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#475569',
          padding: '6px 12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px'
        }}>
          <span style={{ fontWeight: 600 }}>Target Submission Set:</span>
          <select
            value={targetUploadSetId}
            onChange={e => setTargetUploadSetId(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              background: '#ffffff',
              color: '#1e293b'
            }}
          >
            <option value="">General Upload (Auto / Legacy)</option>
            {positionSets.map(s => (
              <option key={s._id} value={s._id}>
                {s.setNumber} ({s.submissionSetId}) — Sent {s.sentToClientAt ? new Date(s.sentToClientAt).toLocaleDateString() : '—'}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            {targetUploadSetId ? 'CVs will be attached to this batch' : 'Or create new sets in the Sets tab'}
          </span>
        </div>
      )}

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

      {/* Metrics Summary Bar (Demo 3 3-card stats row) */}
      {selectedAttempt && (
        <AttemptMetricsCard
          attempt={selectedAttempt}
          submissions={submissionsList}
          isReadOnly={isReadOnly}
          onEditTarget={handleOpenTargetModal}
        />
      )}

      {/* Submission Sets Filter Sub-Bar */}
      {selectedAttempt && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '8px 12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: '#166534' }}>
              <Layers size={14} /> Sets Filter:
            </span>
            <button
              type="button"
              className={`sets-toggle-btn ${selectedSetFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedSetFilter('ALL')}
            >
              All Submissions ({submissionsList.length})
            </button>
            {positionSets.map(set => (
              <button
                key={set._id}
                type="button"
                className={`sets-toggle-btn ${selectedSetFilter === set._id ? 'active' : ''}`}
                onClick={() => setSelectedSetFilter(set._id)}
                title={`Sent to client: ${set.sentToClientAt ? new Date(set.sentToClientAt).toLocaleDateString() : '—'}`}
              >
                {set.setNumber} ({set.cvCount || 0})
              </button>
            ))}
            {submissionsList.some(s => !s.submissionSet && !s.setNumber) && (
              <button
                type="button"
                className={`sets-toggle-btn ${selectedSetFilter === 'UNASSIGNED' ? 'active' : ''}`}
                onClick={() => setSelectedSetFilter('UNASSIGNED')}
                title="CVs not linked to a specific set"
              >
                Unassigned ({submissionsList.filter(s => !s.submissionSet && !s.setNumber).length})
              </button>
            )}
          </div>

          <Link
            to={`/submission-sets?position=${position._id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#2d6a4f',
              textDecoration: 'none'
            }}
          >
            Manage in Sets Hub <ExternalLink size={12} />
          </Link>
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
              position={position}
              selectedAttempt={selectedAttempt}
              tas={tas}
              submissions={displayedSubmissions}
              isReadOnly={isReadOnly}
              target={selectedAttempt?.requiredGoodCvTarget || 0}
              onUpdateStatus={handleUpdateStatus}
              onDelete={(cand) => setDeleteModalCandidate(cand)}
              onDownload={handleDownloadCv}
              onRequestClientDecisionConfirmation={(cand, defaultStatus = 'Shortlisted') => {
                setDecisionModalCandidate(cand);
                const initialStatus =
                  defaultStatus === 'Rejected' || cand.clientShortlistStatus === 'Rejected'
                    ? 'Rejected'
                    : 'Shortlisted';
                setDecisionData({
                  status: initialStatus,
                  date: cand.clientShortlistDate
                    ? new Date(cand.clientShortlistDate).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0],
                  notes: cand.clientFeedback || ''
                });
              }}
              onRequestWithdrawal={handleRequestWithdrawal}
            />
          )}
        </>
      )}

      {/* ============================================================
          Sub-Modals (Target, New Attempt, Edit TAs, Decision, Delete)
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
                  onChange={e => {
                    const nextPrimary = e.target.value;
                    const effectivePrimary = String(nextPrimary || position?.assignee?._id || '');
                    setNewAttemptData(prev => ({
                      ...prev,
                      primaryTA: nextPrimary,
                      supportingTAs: (Array.isArray(prev.supportingTAs) ? prev.supportingTAs : []).filter(
                        id => String(id) !== effectivePrimary
                      )
                    }));
                  }}
                  className="cv-form-input"
                >
                  <option value="">
                    {position?.assignee?.name
                      ? `(Default: ${position.assignee.name})`
                      : '(None / Position Assignee)'}
                  </option>
                  {tas.map(ta => (
                    <option key={ta._id} value={ta._id}>
                      {ta.name}
                    </option>
                  ))}
                </select>
              </div>
              {availableSupportingTasForNew.length > 0 && (
                <div className="cv-form-field">
                  <label>Supporting TAs (Optional):</label>
                  <div className="cv-supporting-tas-selector" role="group" aria-label="Supporting TAs">
                    {availableSupportingTasForNew.map(ta => {
                      const isSelected = (newAttemptData.supportingTAs || []).includes(String(ta._id));
                      return (
                        <button
                          key={ta._id}
                          type="button"
                          onClick={() => toggleNewAttemptSupportingTa(ta._id)}
                          className={`cv-ta-chip ${isSelected ? 'cv-ta-chip--selected' : ''}`}
                          aria-pressed={isSelected}
                        >
                          <span>{ta.name}</span>
                          {isSelected && <span className="cv-ta-chip-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <span className="cv-supporting-tas-hint">
                    {(newAttemptData.supportingTAs || []).length === 0
                      ? 'Select zero or more supporting TAs for this attempt.'
                      : `${newAttemptData.supportingTAs.length} supporting TA(s) selected.`}
                  </span>
                </div>
              )}
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

      {/* 3. Edit Attempt TAs Modal */}
      {showEditTasModal && (
        <div className="cv-submodal-overlay" onClick={() => setShowEditTasModal(false)}>
          <div className="cv-submodal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <h3>Attempt #{selectedAttempt?.attemptNumber} — TA Assignments</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowEditTasModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="cv-submodal-body">
              <div className="cv-form-field">
                <label htmlFor="edit-primary-ta-select">Primary TA Assigned:</label>
                <select
                  id="edit-primary-ta-select"
                  value={editTasData.primaryTA}
                  onChange={e => {
                    const nextPrimary = e.target.value;
                    setEditTasData(prev => ({
                      ...prev,
                      primaryTA: nextPrimary,
                      supportingTAs: (Array.isArray(prev.supportingTAs) ? prev.supportingTAs : []).filter(
                        id => String(id) !== String(nextPrimary)
                      )
                    }));
                  }}
                  className="cv-form-input"
                >
                  <option value="">(None)</option>
                  {tas.map(ta => (
                    <option key={ta._id} value={ta._id}>
                      {ta.name}
                    </option>
                  ))}
                </select>
              </div>
              {availableSupportingTasForEdit.length > 0 && (
                <div className="cv-form-field">
                  <label>Supporting TAs (Optional):</label>
                  <div className="cv-supporting-tas-selector" role="group" aria-label="Supporting TAs">
                    {availableSupportingTasForEdit.map(ta => {
                      const isSelected = (editTasData.supportingTAs || []).includes(String(ta._id));
                      return (
                        <button
                          key={ta._id}
                          type="button"
                          onClick={() => toggleEditAttemptSupportingTa(ta._id)}
                          className={`cv-ta-chip ${isSelected ? 'cv-ta-chip--selected' : ''}`}
                          aria-pressed={isSelected}
                        >
                          <span>{ta.name}</span>
                          {isSelected && <span className="cv-ta-chip-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="cv-submodal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowEditTasModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveEditTas}
                disabled={savingTas}
              >
                {savingTas ? 'Saving...' : 'Save TAs'}
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
                    <span className="cv-decision-option-desc">Candidate accepted and moving forward to client interviews.</span>
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
                    <span className="cv-decision-option-desc">Client decided not to proceed with this candidate.</span>
                  </div>
                </label>
              </div>

              <div className="cv-form-field mt-2">
                <label htmlFor="decision-date-input">Client Decision Date:</label>
                <input
                  id="decision-date-input"
                  type="date"
                  value={decisionData.date}
                  onChange={e => setDecisionData(prev => ({ ...prev, date: e.target.value }))}
                  className="cv-form-input"
                />
              </div>

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

      {/* 6. Candidate Withdrawal Confirmation Modal (Phase 2) */}
      {withdrawalModalCandidate && (
        <div
          className="cv-submodal-overlay"
          onClick={() => !savingWithdrawal && setWithdrawalModalCandidate(null)}
        >
          <div className="cv-submodal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <h3>Confirm Candidate Withdrawal</h3>
              <button
                type="button"
                className="modal-close-btn"
                disabled={savingWithdrawal}
                onClick={() => setWithdrawalModalCandidate(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="cv-submodal-body">
              <p className="text-sm text-gray-700">
                Record withdrawal for client-shortlisted candidate <strong>{withdrawalModalCandidate.unverifiedLabel || 'Candidate'}</strong>:
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                This marks the candidate as withdrawn while preserving their CV file, submission record, and client decision history.
              </div>

              {withdrawalError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {withdrawalError}
                </div>
              )}

              <div className="cv-form-field">
                <label htmlFor="withdrawal-reason-select">Withdrawal Reason:</label>
                <select
                  id="withdrawal-reason-select"
                  value={withdrawalData.reason}
                  onChange={e => setWithdrawalData(prev => ({ ...prev, reason: e.target.value }))}
                  className="cv-form-input"
                  disabled={savingWithdrawal}
                >
                  <option value="Candidate withdrew">Candidate withdrew</option>
                  <option value="Candidate declined the opportunity">Candidate declined the opportunity</option>
                  <option value="Candidate no longer available">Candidate no longer available</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {withdrawalData.reason === 'Other' && (
                <div className="cv-form-field">
                  <label htmlFor="withdrawal-explanation-input">Explanation (Required):</label>
                  <textarea
                    id="withdrawal-explanation-input"
                    value={withdrawalData.explanation}
                    onChange={e => setWithdrawalData(prev => ({ ...prev, explanation: e.target.value }))}
                    placeholder="Provide a brief explanation for withdrawal..."
                    rows="2"
                    className="cv-form-textarea"
                    disabled={savingWithdrawal}
                    required
                  />
                </div>
              )}

              <div className="cv-form-field">
                <label htmlFor="withdrawal-date-input">Withdrawal Date:</label>
                <input
                  id="withdrawal-date-input"
                  type="date"
                  value={withdrawalData.date}
                  onChange={e => setWithdrawalData(prev => ({ ...prev, date: e.target.value }))}
                  className="cv-form-input"
                  disabled={savingWithdrawal}
                />
              </div>
            </div>
            <div className="cv-submodal-footer">
              <button
                type="button"
                className="btn-secondary"
                disabled={savingWithdrawal}
                onClick={() => setWithdrawalModalCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-warning-action"
                disabled={savingWithdrawal}
                onClick={handleConfirmWithdrawal}
              >
                {savingWithdrawal ? 'Recording...' : 'Confirm Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
