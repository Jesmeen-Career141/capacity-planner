import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPosition, updatePosition, assignPosition, deletePosition } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import { getPositionHistory } from '../api/positionHistory';
import FlagBadge from '../components/FlagBadge';
import './PositionDetails.css';

function PositionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [position, setPosition] = useState(null);
  const [tas, setTAs] = useState([]);
  const [history, setHistory] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [assignData, setAssignData] = useState({ taId: '', reason: '' });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, taRes, histRes] = await Promise.all([
          getPosition(id),
          getActiveTAs(),
          getPositionHistory(id)
        ]);
        setPosition(posRes.data);
        setFormData(posRes.data);
        // Sort TAs alphabetically
        const sortedTAs = taRes.data.slice().sort((a, b) => a.name.localeCompare(b.name));
        setTAs(sortedTAs);
        setHistory(histRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updatePosition(id, formData);
      setPosition(res.data);
      setFormData(res.data);
      setIsEditing(false);
      const histRes = await getPositionHistory(id);
      setHistory(histRes.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!assignData.taId) return alert('Select a TA');
    if (!assignData.reason.trim()) return alert('Enter a reason');
    setSaving(true);
    try {
      const res = await assignPosition(id, assignData.taId, assignData.reason);
      setPosition(res.data);
      setFormData(res.data);
      setShowAssignModal(false);
      setAssignData({ taId: '', reason: '' });
      const histRes = await getPositionHistory(id);
      setHistory(histRes.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePosition(id);
      navigate('/positions');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="pos-detail-loading">Loading position...</div>;
  if (error) return <div className="pos-detail-error">Error: {error}</div>;
  if (!position) return <div>Position not found</div>;

  const flagValues = position.flags ? Object.values(position.flags).filter(f => f !== null) : [];

  return (
    <div className="pos-detail">
      <div className="detail-header">
        <div>
          <h1>{position.jobOrderId}</h1>
          <p className="subtitle">{position.position} — {position.client?.clientName}</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
          <button className="btn-primary" onClick={() => setShowAssignModal(true)}>
            Assign TA
          </button>
          <button className="btn-danger" onClick={() => setShowDeleteModal(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="flags-bar">
        {flagValues.map((flag, idx) => <FlagBadge key={idx} flag={flag} />)}
      </div>

      <div className="detail-grid">
        <div className="detail-section">
          <h3>Details</h3>
          {isEditing ? (
            <form className="edit-form">
              <label>Job Order ID</label>
              <input name="jobOrderId" value={formData.jobOrderId || ''} onChange={handleFormChange} disabled />
              <label>Position</label>
              <input name="position" value={formData.position || ''} onChange={handleFormChange} />
              <label>P Level</label>
              <select name="pLevel" value={formData.pLevel || ''} onChange={handleFormChange}>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
                <option value="P5">P5</option>
              </select>
              <label>Status</label>
              <select name="status" value={formData.status || ''} onChange={handleFormChange}>
                <option value="Yet to Activate">Yet to Activate</option>
                <option value="A&P">A&P</option>
                <option value="Fence">Fence</option>
                <option value="Hold">Hold</option>
                <option value="Paused">Paused</option>
                <option value="Placed">Placed</option>
                <option value="Lost">Lost</option>
              </select>
              <label>Pipeline Stage</label>
              <select name="pipelineStage" value={formData.pipelineStage || ''} onChange={handleFormChange}>
                <option value="Hunting">Hunting</option>
                <option value="Shortlisted">Shortlisted</option>
                <option value="Client Review">Client Review</option>
                <option value="Interview">Interview</option>
                <option value="Offer">Offer</option>
                <option value="Placed">Placed</option>
              </select>
              <label>Transfer/Parallel</label>
              <select name="transferParallel" value={formData.transferParallel || ''} onChange={handleFormChange}>
                <option value="New">New</option>
                <option value="Transfer">Transfer</option>
                <option value="Parallel">Parallel</option>
              </select>
              {/* Completion % removed */}
              <label>LS Count</label>
              <input name="lsCount" type="number" value={formData.lsCount || ''} onChange={handleFormChange} />
              <label>CV Count</label>
              <input name="cvCount" type="number" value={formData.cvCount || ''} onChange={handleFormChange} />
              <label>Expected Close Date</label>
              <input name="expectedCloseDate" type="date" value={formData.expectedCloseDate?.split('T')[0] || ''} onChange={handleFormChange} />
              <label>This Week Focus</label>
              <input name="thisWeekFocus" value={formData.thisWeekFocus || ''} onChange={handleFormChange} />
              <label>Remarks</label>
              <textarea name="remarks" value={formData.remarks || ''} onChange={handleFormChange} rows="3" />
              <div className="form-actions">
                <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <div className="detail-view">
              <div className="detail-row"><span>Level</span><span>{position.pLevel}</span></div>
              <div className="detail-row"><span>Status</span><span>{position.status}</span></div>
              <div className="detail-row"><span>Stage</span><span>{position.pipelineStage}</span></div>
              <div className="detail-row"><span>Transfer/Parallel</span><span>{position.transferParallel}</span></div>
              <div className="detail-row"><span>Assignee</span><span>{position.assignee?.name || '—'}</span></div>
              <div className="detail-row"><span>Date Assigned</span><span>{position.dateAssigned ? new Date(position.dateAssigned).toLocaleDateString() : '—'}</span></div>
              <div className="detail-row"><span>Expected Close</span><span>{position.expectedCloseDate ? new Date(position.expectedCloseDate).toLocaleDateString() : '—'}</span></div>
              {/* Completion % row removed */}
              <div className="detail-row"><span>LS Count</span><span>{position.lsCount ?? '—'}</span></div>
              <div className="detail-row"><span>CV Count</span><span>{position.cvCount ?? '—'}</span></div>
              <div className="detail-row"><span>This Week Focus</span><span>{position.thisWeekFocus || '—'}</span></div>
              <div className="detail-row"><span>Remarks</span><span>{position.remarks || '—'}</span></div>
              <div className="detail-row"><span>Tags</span><span>{position.tags?.join(', ') || '—'}</span></div>
            </div>
          )}
        </div>

        <div className="detail-section">
          <h3>Allocation Rounds</h3>
          {position.allocationRounds?.length ? (
            <table className="history-table">
              <thead>
                <tr><th>Round</th><th>TA</th><th>Date</th><th>Reason</th><th>CV Count</th></tr>
              </thead>
              <tbody>
                {position.allocationRounds.map((round, idx) => (
                  <tr key={idx}>
                    <td>{round.roundNumber}</td>
                    <td>{round.taAssigned?.name || '—'}</td>
                    <td>{new Date(round.dateAssigned).toLocaleDateString()}</td>
                    <td>{round.reason || '—'}</td>
                    <td>{round.cvCountAtRound ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No allocation rounds</p>
          )}

          <h3 style={{ marginTop: '24px' }}>Change History</h3>
          {history.length ? (
            <table className="history-table">
              <thead>
                <tr><th>Field</th><th>Old</th><th>New</th><th>Changed At</th></tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={idx}>
                    <td>{h.field}</td>
                    <td>{h.oldValue || '—'}</td>
                    <td>{h.newValue || '—'}</td>
                    <td>{new Date(h.changedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No history yet</p>
          )}
        </div>
      </div>

      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Assign TA to {position.jobOrderId}</h3>
            <div className="assign-form">
              <label>Select TA</label>
              <select value={assignData.taId} onChange={e => setAssignData({ ...assignData, taId: e.target.value })}>
                <option value="">Choose...</option>
                {tas.map(ta => <option key={ta._id} value={ta._id}>{ta.name}</option>)}
              </select>
              <label>Reason for assignment</label>
              <input type="text" value={assignData.reason} onChange={e => setAssignData({ ...assignData, reason: e.target.value })} placeholder="e.g., New allocation, reassign, etc." />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAssign} disabled={saving}>
                  {saving ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Position</h3>
            <p>Are you sure you want to delete <strong>{position.jobOrderId}</strong>?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PositionDetails;