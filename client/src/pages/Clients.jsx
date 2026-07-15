import { useState, useEffect } from 'react';
import { getClients, createClient, updateClient, deleteClient } from '../api/clients';
import './Clients.css';

function Clients() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ clientId: '', clientName: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await getClients();
      setClients(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (client = null) => {
    if (client) {
      setEditing(client._id);
      setFormData({ clientId: client.clientId, clientName: client.clientName });
    } else {
      setEditing(null);
      setFormData({ clientId: '', clientName: '' });
    }
    setDeleteError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData({ clientId: '', clientName: '' });
    setDeleteError(null);
  };

  const handleSave = async () => {
    if (!formData.clientId.trim() || !formData.clientName.trim()) {
      return alert('Both fields are required');
    }
    setSaving(true);
    setDeleteError(null);
    try {
      if (editing) {
        await updateClient(editing, formData.clientName);
      } else {
        await createClient(formData.clientId, formData.clientName);
      }
      await fetchClients();
      handleCloseModal();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, clientName) => {
    if (!window.confirm(`Delete client "${clientName}"? This will fail if any positions reference it.`)) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      await deleteClient(id);
      await fetchClients();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete client';
      setDeleteError(msg);
      alert(msg);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div>Loading clients...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="clients">
      <div className="clients-header">
        <h1>Clients</h1>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          + New Client
        </button>
      </div>

      <div className="clients-list">
        {clients.length === 0 ? (
          <p className="no-clients">No clients yet</p>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Client Name</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={client._id}>
                  <td>{client.clientId}</td>
                  <td>{client.clientName}</td>
                  <td className="actions-cell">
                    <button className="action-edit" onClick={() => handleOpenModal(client)}>Edit</button>
                    <button className="action-delete" onClick={() => handleDelete(client._id, client.clientName)} disabled={deleting === client._id}>
                      {deleting === client._id ? '...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editing ? 'Edit Client' : 'New Client'}</h3>
            <div className="modal-form">
              <label>Client ID</label>
              <input
                type="text"
                value={formData.clientId}
                onChange={e => setFormData({ ...formData, clientId: e.target.value })}
                placeholder="e.g., CLIENT001"
                disabled={!!editing}
              />
              <label>Client Name</label>
              <input
                type="text"
                value={formData.clientName}
                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                placeholder="e.g., ABC Corp"
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Clients;
