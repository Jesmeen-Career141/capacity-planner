import { useState, useEffect, useMemo } from 'react';
import { updatePosition } from '../api/positions';
import { getClients } from '../api/clients';
import CandidateCvSection from './CandidateCvSection';
import PositionActivityHistory from './PositionActivityHistory';
import './PositionDetailModal.css';

const ALL_STATUS_OPTIONS = [
  'Yet to Activate',
  'A&P',
  'Fence',
  'Hold',
  'Paused',
  'Placed',
  'Lost',
  'Focus',
  'Client Decision',
  'Reactivated'
];

const PLEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

const STAGE_OPTIONS = [
  { value: 'Hunting', label: 'Hunting' },
  { value: 'Shortlisted', label: 'Shortlisting' },
  { value: 'Client Review', label: 'Client Review' },
  { value: 'Interview', label: 'Interview' },
  { value: 'Offer', label: 'Offer' },
  { value: 'Placed', label: 'Placed' }
];

function toDateInputValue(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function resolveInitialActivationDate(position) {
  if (!position) return '';
  if (position.activationDateManuallyOverridden) {
    return toDateInputValue(position.activatedAt);
  }
  if (Array.isArray(position.submissionSets) && position.submissionSets.length > 0) {
    const sortedSets = [...position.submissionSets].sort(
      (a, b) => (Number(a.setSequence) || 0) - (Number(b.setSequence) || 0)
    );
    if (sortedSets[0]?.sentToClientAt) {
      return toDateInputValue(sortedSets[0].sentToClientAt);
    }
  }
  return toDateInputValue(position.activatedAt);
}

function buildEditStateFromPosition(position) {
  return {
    position: position?.position || '',
    client: position?.client?._id || position?.client || '',
    status: position?.status || 'Yet to Activate',
    assignee: position?.assignee?._id || position?.assignee || '',
    pLevel: position?.pLevel || 'P1',
    pipelineStage: position?.pipelineStage || 'Hunting',
    receivedDate: toDateInputValue(position?.receivedDate || position?.createdAt),
    activatedAt: resolveInitialActivationDate(position),
    activationDateManuallyOverridden: Boolean(position?.activationDateManuallyOverridden),
    activationDateTouched: false
  };
}

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PositionDetailModal({ position, onClose, onUpdate, tas = [], clients: passedClients, initialTab = 'details' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editData, setEditData] = useState(() => buildEditStateFromPosition(position));
  const [prevPositionId, setPrevPositionId] = useState(position?._id);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  const [prevActivatedAt, setPrevActivatedAt] = useState(resolveInitialActivationDate(position));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [fetchedClients, setFetchedClients] = useState([]);

  useEffect(() => {
    if (Array.isArray(passedClients) && passedClients.length > 0) return;
    let mounted = true;
    getClients()
      .then(res => {
        if (mounted && Array.isArray(res?.data)) {
          setFetchedClients(res.data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [passedClients]);

  const clientsList = useMemo(() => {
    const base = Array.isArray(passedClients) && passedClients.length > 0 ? passedClients : fetchedClients;
    const currentClientId = position?.client?._id;
    if (currentClientId && !base.some(c => String(c._id) === String(currentClientId))) {
      return [{ _id: currentClientId, clientName: position.client.clientName || 'Client' }, ...base];
    }
    return base;
  }, [passedClients, fetchedClients, position]);

  const currentResolvedActivation = resolveInitialActivationDate(position);

  // Sync state if position or initialTab changes while modal is open
  if (position?._id !== prevPositionId || initialTab !== prevInitialTab) {
    setPrevPositionId(position?._id);
    setPrevInitialTab(initialTab);
    setPrevActivatedAt(currentResolvedActivation);
    setActiveTab(initialTab);
    setEditData(buildEditStateFromPosition(position));
    setFeedback(null);
  } else if (currentResolvedActivation !== prevActivatedAt && !editData.activationDateTouched) {
    setPrevActivatedAt(currentResolvedActivation);
    setEditData(prev => ({
      ...prev,
      activatedAt: currentResolvedActivation,
      activationDateManuallyOverridden: Boolean(position?.activationDateManuallyOverridden)
    }));
  }

  if (!position) return null;

  const handleChange = (field, value) => {
    setFeedback(null);
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleActivationDateChange = (value) => {
    setFeedback(null);
    setEditData(prev => ({
      ...prev,
      activatedAt: value,
      activationDateManuallyOverridden: true,
      activationDateTouched: true
    }));
  };

  const handleCancel = () => {
    setEditData(buildEditStateFromPosition(position));
    setFeedback(null);
    onClose();
  };

  const handleSave = async () => {
    if (!editData.position || !editData.position.trim()) {
      setFeedback({ type: 'error', message: 'Position name is required.' });
      return;
    }
    if (!editData.client) {
      setFeedback({ type: 'error', message: 'Client is required.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        position: editData.position.trim(),
        client: editData.client,
        status: editData.status,
        assignee: editData.assignee || null,
        pLevel: editData.pLevel,
        pipelineStage: editData.pipelineStage,
        receivedDate: editData.receivedDate || null
      };

      if (editData.activationDateTouched) {
        payload.activatedAt = editData.activatedAt || null;
        payload.activationDateManuallyOverridden = true;
      }

      await updatePosition(position._id, payload);
      if (typeof onUpdate === 'function') {
        await onUpdate();
      }
      setEditData(prev => ({ ...prev, activationDateTouched: false }));
      setFeedback({ type: 'success', message: 'Position details saved successfully.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error || 'Failed to save changes'
      });
    } finally {
      setSaving(false);
    }
  };

  const clientName = position.client?.clientName || position.clientName || '';
  const positionTitle = position.position || '';
  const headerHeading = clientName && positionTitle
    ? `${clientName} — ${positionTitle}`
    : (positionTitle || clientName || position.jobOrderId);
  const headerSubtitle = activeTab === 'cvTracking'
    ? 'CV Tracking'
    : activeTab === 'workActivity'
    ? 'Daily Work & Activity'
    : 'Position Details';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg pos-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>
              {headerHeading}
              {(position.isReactivated || position.status === 'Reactivated') && (
                <span className="reactivated-tag" style={{ marginLeft: '10px', fontSize: '12px', verticalAlign: 'middle' }} title="Reactivated Requirement">↻ Reactivated</span>
              )}
            </h2>
            <div className="pos-detail-header-subtitle">{headerSubtitle}</div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="pos-detail-tab-bar">
          <button
            type="button"
            className={`pos-detail-tab ${activeTab === 'details' ? 'pos-detail-tab--active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Position Details
          </button>
          <button
            type="button"
            className={`pos-detail-tab ${activeTab === 'cvTracking' ? 'pos-detail-tab--active' : ''}`}
            onClick={() => setActiveTab('cvTracking')}
          >
            CV Tracking
          </button>
          <button
            type="button"
            className={`pos-detail-tab ${activeTab === 'workActivity' ? 'pos-detail-tab--active' : ''}`}
            onClick={() => setActiveTab('workActivity')}
          >
            Daily Work & Activity
          </button>
        </div>
        <div className="modal-body">
          {activeTab === 'details' ? (
            <div className="pdm-details-main">
              <div className="pdm-intro">
                <div>
                  <h2>Position Details</h2>
                  <p>Update the position information and key dates below.</p>
                </div>
                <span className="pdm-status-pill">
                  <span className="pdm-status-dot" />
                  <span>Active position</span>
                </span>
              </div>

              {feedback && (
                <div className={`pdm-feedback pdm-feedback--${feedback.type}`}>
                  <span>{feedback.message}</span>
                </div>
              )}

              <section className="pdm-card">
                <h3 className="pdm-card-title">Position information</h3>
                <div className="pdm-grid">
                  <div className="pdm-field">
                    <label htmlFor="pdm-position-input">Position</label>
                    <input
                      id="pdm-position-input"
                      type="text"
                      value={editData.position}
                      onChange={e => handleChange('position', e.target.value)}
                    />
                  </div>
                  <div className="pdm-field">
                    <label htmlFor="pdm-client-select">Client</label>
                    <select
                      id="pdm-client-select"
                      value={editData.client}
                      onChange={e => handleChange('client', e.target.value)}
                    >
                      <option value="">Select client</option>
                      {clientsList.map(c => (
                        <option key={c._id} value={c._id}>{c.clientName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="pdm-field">
                    <label htmlFor="pdm-status-select">Status</label>
                    <select
                      id="pdm-status-select"
                      value={editData.status}
                      onChange={e => handleChange('status', e.target.value)}
                    >
                      {ALL_STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="pdm-field">
                    <label htmlFor="pdm-assignee-select">Assignee(s)</label>
                    <select
                      id="pdm-assignee-select"
                      value={editData.assignee}
                      onChange={e => handleChange('assignee', e.target.value)}
                    >
                      <option value="">— Unassigned —</option>
                      {tas.map(ta => (
                        <option key={ta._id} value={ta._id}>{ta.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="pdm-field">
                    <label htmlFor="pdm-level-select">Level</label>
                    <select
                      id="pdm-level-select"
                      value={editData.pLevel}
                      onChange={e => handleChange('pLevel', e.target.value)}
                    >
                      {PLEVEL_OPTIONS.map(lvl => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>
                  <div className="pdm-field">
                    <label htmlFor="pdm-stage-select">Stage</label>
                    <select
                      id="pdm-stage-select"
                      value={editData.pipelineStage}
                      onChange={e => handleChange('pipelineStage', e.target.value)}
                    >
                      {STAGE_OPTIONS.map(stg => (
                        <option key={stg.value} value={stg.value}>{stg.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="pdm-date-panel">
                <div className="pdm-date-panel-head">
                  <strong>Key position dates</strong>
                </div>
                <div className="pdm-date-grid">
                  <div className="pdm-field">
                    <label htmlFor="pdm-received-date">Received date</label>
                    <input
                      id="pdm-received-date"
                      type="date"
                      value={editData.receivedDate}
                      onChange={e => handleChange('receivedDate', e.target.value)}
                    />
                  </div>
                  <div className="pdm-field">
                    <label htmlFor="pdm-activation-date">Activation date</label>
                    <input
                      id="pdm-activation-date"
                      type="date"
                      value={editData.activatedAt}
                      onChange={e => handleActivationDateChange(e.target.value)}
                    />
                  </div>
                </div>
              </section>
            </div>
          ) : activeTab === 'cvTracking' ? (
            <CandidateCvSection position={position} tas={tas} onUpdate={onUpdate} />
          ) : (
            <div style={{ padding: '20px 28px' }}>
              <PositionActivityHistory positionId={position._id} jobOrderId={position.jobOrderId} />
            </div>
          )}
        </div>
        <div className="modal-footer">
          {activeTab === 'details' ? (
            <>
              <button type="button" className="pdm-btn" onClick={handleCancel}>Cancel</button>
              <button type="button" className="pdm-btn pdm-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button type="button" className="pdm-btn" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
