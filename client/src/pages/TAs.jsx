import { useState, useEffect } from 'react';
import { getTAs, createTA, updateTAStatus, deleteTA } from '../api/tas';
import { getPositions } from '../api/positions';
import './TAs.css';

function TAs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tas, setTAs] = useState([]);
  const [positions, setPositions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [taRes, posRes] = await Promise.all([getTAs(), getPositions()]);
      setTAs(taRes.data);
      setPositions(posRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const countAssignedPositions = (taId) => {
    return positions.filter(p => p.assignee?._id === taId).length;
  };

  const handleOpenModal = (ta = null) => {
    if (ta) {
      setEditing(ta._id);
      setFormData({ name: ta.name });
    } else {
      setEditing(null);
      setFormData({ name: '' });
    }
    setDeleteError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData({ name: '' });
    setDeleteError(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return alert('Name is required');
    setSaving(true);
    setDeleteError(null);
    try {
      if (editing) {
        alert('Editing name is not supported yet. Use status toggle instead.');
      } else {
        await createTA(formData.name);
        await fetchData();
        handleCloseModal();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save TA');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? 'Left' : 'Active';
    const assignedCount = countAssignedPositions(id);
    let confirmMsg = `Mark TA as ${newStatus}?`;
    if (newStatus === 'Left' && assignedCount > 0) {
      confirmMsg = `This TA is assigned to ${assignedCount} position(s). They will be flagged for reassign. Continue?`;
    }
    if (!window.confirm(confirmMsg)) return;

    setUpdating(id);
    try {
      await updateTAStatus(id, newStatus);
      await fetchData(); // refresh both TAs and positions to update flags
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (id, name) => {
    const assignedCount = countAssignedPositions(id);
    if (assignedCount > 0) {
      alert(`Cannot delete TA: assigned to ${assignedCount} position(s). Mark as Left instead.`);
      return;
    }
    if (!window.confirm(`Delete TA "${name}"?`)) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      await deleteTA(id);
      await fetchData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete TA';
      setDeleteError(msg);
      alert(msg);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div>Loading TAs...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="tas">
      <div className="tas-header">
        <h1>Recruiters (TAs)</h1>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          + New TA
        </button>
      </div>

      <div className="tas-list">
        {tas.length === 0 ? (
          <p className="no-tas">No TAs yet</p>
        ) : (
          <table className="tas-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Assigned Positions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tas.map(ta => {
                const assignedCount = countAssignedPositions(ta._id);
                return (
                  <tr key={ta._id}>
                    <td>{ta.name}</td>
                    <td>
                      <span className={`status-badge ${ta.status === 'Active' ? 'status-active' : 'status-left'}`}>
                        {ta.status}
                      </span>
                    </td>
                    <td>{assignedCount}</td>
                    <td className="actions-cell">
                      <button
                        className="action-toggle"
                        onClick={() => handleToggleStatus(ta._id, ta.status)}
                        disabled={updating === ta._id}
                      >
                        {updating === ta._id ? '...' : `Mark ${ta.status === 'Active' ? 'Left' : 'Active'}`}
                      </button>
                      <button
                        className="action-delete"
                        onClick={() => handleDelete(ta._id, ta.name)}
                        disabled={deleting === ta._id || assignedCount > 0}
                        title={assignedCount > 0 ? 'Cannot delete: assigned to positions' : ''}
                      >
                        {deleting === ta._id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal for creating new TA */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New TA</h3>
            <div className="modal-form">
              <label>TA Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., John Doe"
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TAs;