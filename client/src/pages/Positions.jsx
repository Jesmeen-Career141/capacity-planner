import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPositions, deletePosition } from '../api/positions';
import { getClients } from '../api/clients';
import { getActiveTAs } from '../api/tas';
import FlagBadge from '../components/FlagBadge';
import './Positions.css';

function Positions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState([]);
  const [clients, setClients] = useState([]);
  const [tas, setTAs] = useState([]);
  const [filters, setFilters] = useState({
    client: '',
    assignee: '',
    status: '',
    pLevel: '',
    search: ''
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, clientRes, taRes] = await Promise.all([
          getPositions(),
          getClients(),
          getActiveTAs()
        ]);
        setPositions(posRes.data);
        setClients(clientRes.data);
        setTAs(taRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const filteredPositions = useMemo(() => {
    return positions.filter(pos => {
      const matchesClient = !filters.client || pos.client?._id === filters.client;
      const matchesAssignee = !filters.assignee || pos.assignee?._id === filters.assignee;
      const matchesStatus = !filters.status || pos.status === filters.status;
      const matchesPLevel = !filters.pLevel || pos.pLevel === filters.pLevel;
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = !filters.search ||
        pos.jobOrderId.toLowerCase().includes(searchLower) ||
        pos.position.toLowerCase().includes(searchLower) ||
        (pos.client?.clientName || '').toLowerCase().includes(searchLower);
      return matchesClient && matchesAssignee && matchesStatus && matchesPLevel && matchesSearch;
    });
  }, [positions, filters]);

  const handleDeleteClick = (pos) => {
    setDeleteTarget(pos);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePosition(deleteTarget._id);
      setPositions(positions.filter(p => p._id !== deleteTarget._id));
      setShowDeleteModal(false);
      setDeleteTarget(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete position');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  if (loading) return <div className="positions-loading">Loading positions...</div>;
  if (error) return <div className="positions-error">Error: {error}</div>;

  return (
    <div className="positions">
      <div className="positions-header">
        <h1>Positions</h1>
        <button className="btn-primary" onClick={() => navigate('/positions/new')}>
          + New Position
        </button>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          name="search"
          placeholder="Search by JO ID, position, client..."
          value={filters.search}
          onChange={handleFilterChange}
          className="filter-search"
        />
        <select
          name="client"
          value={filters.client}
          onChange={handleFilterChange}
          className="filter-select"
        >
          <option value="">All Clients</option>
          {clients.map(c => (
            <option key={c._id} value={c._id}>{c.clientName}</option>
          ))}
        </select>
        <select
          name="assignee"
          value={filters.assignee}
          onChange={handleFilterChange}
          className="filter-select"
        >
          <option value="">All TAs</option>
          {tas.map(ta => (
            <option key={ta._id} value={ta._id}>{ta.name}</option>
          ))}
        </select>
        <select
          name="status"
          value={filters.status}
          onChange={handleFilterChange}
          className="filter-select"
        >
          <option value="">All Statuses</option>
          <option value="Yet to Activate">Yet to Activate</option>
          <option value="A&P">A&P</option>
          <option value="Fence">Fence</option>
          <option value="Hold">Hold</option>
          <option value="Paused">Paused</option>
          <option value="Placed">Placed</option>
          <option value="Lost">Lost</option>
        </select>
        <select
          name="pLevel"
          value={filters.pLevel}
          onChange={handleFilterChange}
          className="filter-select"
        >
          <option value="">All Levels</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
          <option value="P4">P4</option>
          <option value="P5">P5</option>
        </select>
      </div>

      <div className="table-wrapper">
        <table className="positions-table">
          <thead>
            <tr>
              <th>JO ID</th>
              <th>Client</th>
              <th>Position</th>
              <th>Level</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Assignee</th>
              <th>Flags</th>
              <th>%</th>
              <th>LS</th>
              <th>CV</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.length === 0 ? (
              <tr><td colSpan="12" className="no-rows">No positions found</td></tr>
            ) : (
              filteredPositions.map(pos => {
                const flagValues = pos.flags ? Object.values(pos.flags).filter(f => f !== null) : [];
                return (
                  <tr key={pos._id}>
                    <td><Link to={`/positions/${pos._id}`} className="jo-link">{pos.jobOrderId}</Link></td>
                    <td>{pos.client?.clientName || '—'}</td>
                    <td>{pos.position}</td>
                    <td>{pos.pLevel}</td>
                    <td><span className={`status-badge status-${pos.status?.replace(/\s/g, '-')}`}>{pos.status}</span></td>
                    <td>{pos.pipelineStage}</td>
                    <td>{pos.assignee?.name || '—'}</td>
                    <td className="flags-cell">
                      {flagValues.map((flag, idx) => <FlagBadge key={idx} flag={flag} />)}
                    </td>
                    <td>{pos.completionPercent}%</td>
                    <td>{pos.lsCount ?? '—'}</td>
                    <td>{pos.cvCount ?? '—'}</td>
                    <td className="actions-cell">
                      <Link to={`/positions/${pos._id}`} className="action-link">View</Link>
                      <button className="action-delete" onClick={() => handleDeleteClick(pos)}>Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete position <strong>{deleteTarget.jobOrderId}</strong>?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelDelete} disabled={deleting}>Cancel</button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Positions;
