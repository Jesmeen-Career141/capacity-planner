import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPosition } from '../api/positions';
import { getClients } from '../api/clients';
import { getActiveTAs } from '../api/tas';
import './NewPosition.css';

function NewPosition() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [tas, setTAs] = useState([]);
  const [formData, setFormData] = useState({
    jobOrderId: '',
    client: '',
    position: '',
    pLevel: 'P1',
    status: 'Yet to Activate',
    pipelineStage: 'Hunting',
    assignee: '',
    transferParallel: 'New',
    expectedCloseDate: '',
    completionPercent: 0,
    lsCount: '',
    cvCount: '',
    thisWeekFocus: '',
    remarks: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, taRes] = await Promise.all([
          getClients(),
          getActiveTAs()
        ]);
        setClients(clientRes.data);
        setTAs(taRes.data);
      } catch (err) {
        alert('Failed to load clients/TAs');
      }
    };
    fetchData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!formData.jobOrderId.trim()) return setError('Job Order ID is required');
    if (!formData.client) return setError('Client is required');
    if (!formData.position.trim()) return setError('Position title is required');
    if (!formData.pLevel) return setError('P Level is required');

    setLoading(true);
    try {
      // Clean up empty strings for number fields
      const payload = {
        ...formData,
        lsCount: formData.lsCount ? Number(formData.lsCount) : null,
        cvCount: formData.cvCount ? Number(formData.cvCount) : null,
        expectedCloseDate: formData.expectedCloseDate || null,
        assignee: formData.assignee || null
      };
      await createPosition(payload);
      navigate('/positions');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create position';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-position">
      <h1>New Position</h1>
      <form onSubmit={handleSubmit} className="new-position-form">
        {error && <div className="form-error">{error}</div>}

        <div className="form-row">
          <div className="form-group">
            <label>Job Order ID *</label>
            <input
              name="jobOrderId"
              value={formData.jobOrderId}
              onChange={handleChange}
              placeholder="e.g., JO-001"
            />
          </div>
          <div className="form-group">
            <label>Client *</label>
            <select name="client" value={formData.client} onChange={handleChange}>
              <option value="">Select client...</option>
              {clients.map(c => (
                <option key={c._id} value={c._id}>{c.clientName}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Position Title *</label>
            <input
              name="position"
              value={formData.position}
              onChange={handleChange}
              placeholder="e.g., Senior Java Developer"
            />
          </div>
          <div className="form-group">
            <label>P Level *</label>
            <select name="pLevel" value={formData.pLevel} onChange={handleChange}>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
              <option value="P5">P5</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange}>
              <option value="Yet to Activate">Yet to Activate</option>
              <option value="A&P">A&P</option>
              <option value="Fence">Fence</option>
              <option value="Hold">Hold</option>
              <option value="Paused">Paused</option>
              <option value="Placed">Placed</option>
              <option value="Lost">Lost</option>
            </select>
          </div>
          <div className="form-group">
            <label>Pipeline Stage</label>
            <select name="pipelineStage" value={formData.pipelineStage} onChange={handleChange}>
              <option value="Hunting">Hunting</option>
              <option value="Shortlisted">Shortlisted</option>
              <option value="Client Review">Client Review</option>
              <option value="Interview">Interview</option>
              <option value="Offer">Offer</option>
              <option value="Placed">Placed</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Assignee (TA)</label>
            <select name="assignee" value={formData.assignee} onChange={handleChange}>
              <option value="">Unassigned</option>
              {tas.map(ta => (
                <option key={ta._id} value={ta._id}>{ta.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Transfer/Parallel</label>
            <select name="transferParallel" value={formData.transferParallel} onChange={handleChange}>
              <option value="New">New</option>
              <option value="Transfer">Transfer</option>
              <option value="Parallel">Parallel</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Expected Close Date</label>
            <input
              type="date"
              name="expectedCloseDate"
              value={formData.expectedCloseDate}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Completion %</label>
            <select name="completionPercent" value={formData.completionPercent} onChange={handleChange}>
              <option value="0">0%</option>
              <option value="25">25%</option>
              <option value="50">50%</option>
              <option value="75">75%</option>
              <option value="100">100%</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>LS Count</label>
            <input
              type="number"
              name="lsCount"
              value={formData.lsCount}
              onChange={handleChange}
              placeholder="e.g., 5"
              min="0"
            />
          </div>
          <div className="form-group">
            <label>CV Count</label>
            <input
              type="number"
              name="cvCount"
              value={formData.cvCount}
              onChange={handleChange}
              placeholder="e.g., 10"
              min="0"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group full-width">
            <label>This Week Focus</label>
            <input
              name="thisWeekFocus"
              value={formData.thisWeekFocus}
              onChange={handleChange}
              placeholder="e.g., Shortlist candidates"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group full-width">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows="3"
              placeholder="Any additional notes"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/positions')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Position'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewPosition;
