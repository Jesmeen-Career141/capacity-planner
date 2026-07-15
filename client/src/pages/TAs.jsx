import { useState, useEffect } from 'react';
import { getTAs, createTA, updateTAStatus, deleteTA } from '../api/tas';
import './TAs.css';

function TAs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tas, setTAs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    fetchTAs();
  }, []);

  const fetchTAs = async () => {
    try {
      const res = await getTAs();
      setTAs(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
        // For editing, we only update name via status endpoint? Actually we only have status update.
        // We need a PUT to update name. But backend doesn't have a generic PUT for TA.
        // We'll add a new endpoint: PUT /tas/:id { name } – but since not built, we'll implement frontend with existing.
        // However, we only have PUT /tas/:id/status. So we cannot edit name. We'll just allow create and toggle status.
        // Let's disable edit for now and allow only create + status toggle + delete.
        alert('Editing name is not supported yet. Use status toggle instead.');
      } else {
        await createTA(formData.name);
        await fetchTAs();
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
    if (!window.confirm(`Mark TA as ${newStatus}?`)) return;
    setUpdating(id);
    try {
      await updateTAStatus(id, newStatus);
      await fetchTAs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete TA "${name}"? This will fail if they are assigned to any position.`)) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      await deleteTA(id);
      await fetchTAs();
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tas.map(ta => (
                <tr key={ta._id}>
                  <td>{ta.name}</td>
                  <td>
                    <span className={`status-badge ${ta.status === 'Active' ? 'status-active' : 'status-left'}`}>
                      {ta.status}
                    </span>
                  </td>
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
                      disabled={deleting === ta._id}
                    >
                      {deleting === ta._id ? '...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal – only for create */}
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
