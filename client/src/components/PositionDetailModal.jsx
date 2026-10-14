import { useState } from 'react';
import { updatePosition } from '../api/positions';
import CandidateCvSection from './CandidateCvSection';
import './PositionDetailModal.css';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PositionDetailModal({ position, onClose, onUpdate, tas }) {
  const [activeTab, setActiveTab] = useState('details');
  const [editData, setEditData] = useState({
    remarks: position?.remarks || '',
    thisWeekFocus: position?.thisWeekFocus || '',
    allocationRounds: position?.allocationRounds || [],
  });
  const [prevPositionId, setPrevPositionId] = useState(position?._id);
  const [saving, setSaving] = useState(false);

  // Sync state if position changes while modal is open (recommended React pattern)
  if (position?._id !== prevPositionId) {
    setPrevPositionId(position?._id);
    setEditData({
      remarks: position?.remarks || '',
      thisWeekFocus: position?.thisWeekFocus || '',
      allocationRounds: position?.allocationRounds || [],
    });
  }

  if (!position) return null;

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        remarks: editData.remarks || '',
        thisWeekFocus: editData.thisWeekFocus || '',
      };
      await updatePosition(position._id, payload);
      await onUpdate();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const historyRounds = [...(editData.allocationRounds || [])]
    .sort((a, b) => new Date(b.dateAssigned) - new Date(a.dateAssigned))
    .slice(0, 5);

  const primaryName = position.assignee?.name || 'Unassigned';
  const parallelNames = (position.parallelAssignees || []).map(ta => ta.name).join(', ');
  const assigneeDisplay = parallelNames ? `${primaryName} (parallel: ${parallelNames})` : primaryName;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg pos-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{position.jobOrderId}</h2>
          <button className="modal-close-btn" onClick={onClose}>
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
        </div>
        <div className="modal-body">
          {activeTab === 'details' ? (
            <>
              <div className="modal-summary">
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Position</span>
                  <span className="modal-summary-value">{position.position}</span>
                </div>
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Client</span>
                  <span className="modal-summary-value">{position.client?.clientName || '—'}</span>
                </div>
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Status</span>
                  <span className="modal-summary-value">{position.status}</span>
                </div>
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Assignee(s)</span>
                  <span className="modal-summary-value">{assigneeDisplay}</span>
                </div>
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Level</span>
                  <span className="modal-summary-value">{position.pLevel}</span>
                </div>
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Stage</span>
                  <span className="modal-summary-value">{position.pipelineStage}</span>
                </div>
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Shortlist (Int/Ext)</span>
                  <span className="modal-summary-value">{position.lsCount ?? '—'} / {position.cvCount ?? '—'}</span>
                </div>
              </div>
              <div className="modal-editable">
                <div className="modal-field">
                  <label>This Week Focus</label>
                  <input
                    type="text"
                    value={editData.thisWeekFocus}
                    onChange={e => handleChange('thisWeekFocus', e.target.value)}
                    className="modal-input"
                    placeholder="e.g., Schedule interviews, Review CVs..."
                  />
                </div>
                <div className="modal-field">
                  <label>Remarks</label>
                  <textarea
                    value={editData.remarks}
                    onChange={e => handleChange('remarks', e.target.value)}
                    className="modal-textarea"
                    rows="4"
                    placeholder="Add any notes or remarks about this position..."
                  />
                </div>
              </div>
              <div className="modal-history">
                <h4>Allocation History</h4>
                {historyRounds.length === 0 ? (
                  <p className="modal-history-empty">No allocation history yet</p>
                ) : (
                  <table className="modal-history-table">
                    <thead>
                      <tr>
                        <th>Round</th>
                        <th>Value</th>
                        <th>Date</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRounds.map((round, idx) => (
                        <tr key={idx}>
                          <td className="col-round">Round {round.roundNumber}</td>
                          <td className="col-value">{round.taAssigned?.name || '—'}</td>
                          <td className="col-date">{round.dateAssigned ? new Date(round.dateAssigned).toLocaleDateString() : '—'}</td>
                          <td className="col-notes">{round.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {historyRounds.length === 5 && (editData.allocationRounds?.length || 0) > 5 && (
                  <p className="modal-history-more">+ {(editData.allocationRounds?.length || 0) - 5} more rounds</p>
                )}
              </div>
            </>
          ) : (
            <CandidateCvSection position={position} tas={tas} />
          )}
        </div>
        <div className="modal-footer">
          {activeTab === 'details' ? (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
