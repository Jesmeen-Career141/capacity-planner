import { useState, useEffect, useMemo } from 'react';
import { getClients, createClient, updateClient, deleteClient } from '../api/clients';
import './Clients.css';

function Clients() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ clientName: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await getClients();
        if (!ignore) setClients(res.data);
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [refreshKey]);

  const generateSlug = (name) => {
    return (name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  const formatCreatedDate = (dateVal) => {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  };

  const filteredAndSortedClients = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    let result = clients;
    if (trimmedQuery) {
      result = result.filter(c => c.clientName?.toLowerCase().includes(trimmedQuery));
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'name-asc') {
        return (a.clientName || '').localeCompare(b.clientName || '', undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'name-desc') {
        return (b.clientName || '').localeCompare(a.clientName || '', undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'newest') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'oldest') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
        return timeA - timeB;
      }
      return 0;
    });
  }, [clients, searchQuery, sortBy]);

  const handleOpenModal = (client = null) => {
    if (client) {
      setEditing(client._id);
      setFormData({ clientName: client.clientName });
    } else {
      setEditing(null);
      setFormData({ clientName: '' });
    }
    setDeleteError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData({ clientName: '' });
    setDeleteError(null);
  };

  const handleSave = async () => {
    const trimmedName = formData.clientName.trim();
    if (!trimmedName) {
      return alert('Client name is required');
    }

    if (!editing) {
      const slug = generateSlug(trimmedName);
      if (!slug) {
        return alert('Please enter a valid client name containing letters or numbers.');
      }

      // Pre-validation duplicate check
      const collision = clients.some(c =>
        c.clientId === slug ||
        c.clientId?.toUpperCase() === slug ||
        generateSlug(c.clientName) === slug
      );

      if (collision) {
        return alert('A client with this generated identifier already exists. Please use a different client name or contact an administrator.');
      }
    }

    setSaving(true);
    setDeleteError(null);
    try {
      if (editing) {
        await updateClient(editing, trimmedName);
      } else {
        const slug = generateSlug(trimmedName);
        await createClient(slug, trimmedName);
      }
      setRefreshKey(k => k + 1);
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
      setRefreshKey(k => k + 1);
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

      <div className="clients-controls">
        <div className="clients-search-wrap">
          <input
            type="text"
            className="clients-search-input"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clients-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="clients-sort-wrap">
          <label htmlFor="client-sort-select" className="clients-sort-label">Sort by:</label>
          <select
            id="client-sort-select"
            className="clients-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      {deleteError && (
        <div className="clients-delete-error" role="alert">
          {deleteError}
        </div>
      )}

      <div className="clients-list">
        {clients.length === 0 ? (
          <p className="no-clients">No clients yet</p>
        ) : filteredAndSortedClients.length === 0 ? (
          <p className="no-clients">No clients matching &quot;{searchQuery}&quot;</p>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Client Name</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedClients.map(client => (
                <tr key={client._id}>
                  <td className="client-name-cell">{client.clientName}</td>
                  <td className="client-date-cell">{formatCreatedDate(client.createdAt)}</td>
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
              <label>Client Name</label>
              <input
                type="text"
                value={formData.clientName}
                onChange={e => setFormData({ clientName: e.target.value })}
                placeholder="e.g., ABC Corp"
                autoFocus
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleCloseModal} disabled={saving}>Cancel</button>
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
