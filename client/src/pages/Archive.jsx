import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getArchiveSnapshots, getArchiveSnapshot, triggerSnapshot, triggerBackfill } from '../api/archive';
import { getPositions, updatePosition } from '../api/positions';
import './Archive.css';

// ---- Constants (mirrors Positions.jsx) ----
const ARCHIVE_STATUSES = ['Placed', 'Lost', 'Hold'];

const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];

const STATUS_COLORS = {
  'Yet to Activate': { bg: '#e5e7eb', text: '#374151' },
  'A&P': { bg: '#d1fae5', text: '#065f46' },
  'Fence': { bg: '#fecaca', text: '#991b1b' },
  'Hold': { bg: '#fef3c7', text: '#92400e' },
  'Paused': { bg: '#fde68a', text: '#78350f' },
  'Placed': { bg: '#bfdbfe', text: '#1e40af' },
  'Lost': { bg: '#fca5a5', text: '#7f1d1d' },
  'Focus': { bg: '#d1fae5', text: '#065f46' },
  'Client Decision': { bg: '#fbcfe8', text: '#831843' },
};

const PLEVEL_COLORS = {
  P1: { bg: '#7f1d1d', text: '#ffffff' },
  P2: { bg: '#dd2121f0', text: '#ffffff' },
  P3: { bg: '#f97316', text: '#ffffff' },
  P4: { bg: '#fdba74', text: '#7c2d12' },
  P5: { bg: '#fde047', text: '#78350f' },
};

// ---- Icons ----
const TableViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="20" />
  </svg>
);
const GridViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// ---- Inline status dropdown (for archive table rows) ----
function ArchiveStatusDropdown({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('down');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDirection(window.innerHeight - rect.bottom >= 240 ? 'down' : 'up');
    }
    setIsOpen(!isOpen);
  };

  const current = STATUS_COLORS[value] || { bg: '#e5e7eb', text: '#374151' };

  return (
    <div className="arch-status-wrap" ref={containerRef}>
      <button
        type="button"
        className="arch-status-btn"
        style={{ backgroundColor: current.bg, color: current.text }}
        onClick={handleToggle}
        disabled={disabled}
      >
        {value}
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`arch-status-list arch-status-list--${direction}`}>
            {STATUS_OPTIONS.map(s => {
              const sc = STATUS_COLORS[s] || { bg: '#e5e7eb', text: '#374151' };
              return (
                <button
                  key={s}
                  type="button"
                  className={`arch-status-option ${s === value ? 'selected' : ''}`}
                  style={{ backgroundColor: sc.bg, color: sc.text }}
                  onClick={() => { onChange(s); setIsOpen(false); }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Archive card (flat, for grid view) ----
function ArchiveCard({ pos }) {
  const statusColor = STATUS_COLORS[pos.status] || { bg: '#e5e7eb', text: '#374151' };
  const levelColor = PLEVEL_COLORS[pos.pLevel] || { bg: '#e5e7eb', text: '#374151' };
  return (
    <div className="arch-card">
      <div className="arch-card-top">
        <span className="arch-card-level" style={{ background: levelColor.bg, color: levelColor.text }}>{pos.pLevel}</span>
        <span className="arch-card-status" style={{ background: statusColor.bg, color: statusColor.text }}>{pos.status}</span>
      </div>
      <h3 className="arch-card-title" title={pos.position}>{pos.position}</h3>
      <div className="arch-card-client">{pos.client?.clientName || '—'}</div>
      <div className="arch-card-assignee">{pos.assignee?.name || 'Unassigned'}</div>
    </div>
  );
}

// ---- Position History Tab ----
function PositionHistoryTab() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [viewMode, setViewMode] = useState('table');

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await getPositions();
        const archived = res.data.filter(p => ARCHIVE_STATUSES.includes(p.status));
        setPositions(archived);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPositions();
  }, []);

  const handleStatusChange = async (pos, newStatus) => {
    const prevStatus = pos.status;
    setUpdatingId(pos._id);

    // Optimistic update
    if (!ARCHIVE_STATUSES.includes(newStatus)) {
      // Moving out of archive — remove immediately
      setPositions(prev => prev.filter(p => p._id !== pos._id));
    } else {
      // Staying in archive but status changed
      setPositions(prev => prev.map(p => p._id === pos._id ? { ...p, status: newStatus } : p));
    }

    try {
      await updatePosition(pos._id, { status: newStatus });
    } catch (err) {
      // Revert on error
      setPositions(prev => {
        const exists = prev.find(p => p._id === pos._id);
        if (exists) return prev.map(p => p._id === pos._id ? { ...p, status: prevStatus } : p);
        if (ARCHIVE_STATUSES.includes(prevStatus)) return [...prev, { ...pos, status: prevStatus }];
        return prev;
      });
      alert(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="arch-loading">Loading position history...</div>;
  if (error) return <div className="arch-error">Error: {error}</div>;

  return (
    <div className="arch-history">
      <div className="arch-history-toolbar">
        <span className="arch-history-count">{positions.length} positions archived</span>
        <div className="arch-view-toggle">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            <TableViewIcon /> Table
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <GridViewIcon /> Grid
          </button>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="arch-empty">No archived positions (Placed, Lost, or Hold)</div>
      ) : viewMode === 'table' ? (
        <div className="arch-table-wrapper">
          <table className="arch-table">
            <thead>
              <tr>
                <th>JO ID</th>
                <th>Client</th>
                <th>Position</th>
                <th>Level</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => (
                <tr key={pos._id}>
                  <td><span className="arch-jo-id">{pos.jobOrderId}</span></td>
                  <td><span className="arch-text-ellipsis">{pos.client?.clientName || '—'}</span></td>
                  <td><span className="arch-text-ellipsis">{pos.position}</span></td>
                  <td>
                    <span
                      className="arch-level-badge"
                      style={{ background: PLEVEL_COLORS[pos.pLevel]?.bg, color: PLEVEL_COLORS[pos.pLevel]?.text }}
                    >
                      {pos.pLevel}
                    </span>
                  </td>
                  <td>{pos.assignee?.name || '—'}</td>
                  <td>
                    <ArchiveStatusDropdown
                      value={pos.status}
                      onChange={newStatus => handleStatusChange(pos, newStatus)}
                      disabled={updatingId === pos._id}
                    />
                  </td>
                  <td>
                    <Link to={`/positions/${pos._id}`} className="arch-view-link">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="arch-grid">
          {positions.map(pos => (
            <ArchiveCard key={pos._id} pos={pos} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Weekly Snapshots Tab ----
function WeeklySnapshotsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async (autoSelectLatest = false) => {
    try {
      const res = await getArchiveSnapshots();
      setSnapshots(res.data);
      if (autoSelectLatest && res.data.length > 0) {
        handleSnapshotClick(res.data[0]._id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSnapshotClick = async (id) => {
    setDetailLoading(true);
    try {
      const res = await getArchiveSnapshot(id);
      setSelectedSnapshot(res.data);
    } catch {
      alert('Failed to load snapshot detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCaptureNow = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await triggerSnapshot();
      setActionMessage({ type: 'success', text: `Captured snapshot for week of ${new Date(res.data.snapshot.weekStart).toLocaleDateString()} with ${res.data.snapshot.positionCount} positions.` });
      await fetchSnapshots(true);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to capture snapshot' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBackfill = async () => {
    if (!window.confirm('Reconstruct and backfill all missing weekly snapshots from historical change logs?')) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await triggerBackfill();
      setActionMessage({ type: 'success', text: `Backfill complete! Created ${res.data.count} missing snapshots.` });
      await fetchSnapshots();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to run backfill' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div>Loading archive...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="snapshot-container">
      {/* Action Toolbar */}
      <div className="snapshot-toolbar">
        <div className="snapshot-toolbar-title">
          <span>Weekly Snapshots Archive</span>
          <span className="snapshot-badge">{snapshots.length} recorded</span>
        </div>
        <div className="snapshot-toolbar-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleBackfill}
            disabled={actionLoading}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            {actionLoading ? 'Working...' : 'Backfill Missing Weeks'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCaptureNow}
            disabled={actionLoading}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            {actionLoading ? 'Capturing...' : 'Capture Snapshot Now'}
          </button>
        </div>
      </div>

      {/* Action Message / Feedback */}
      {actionMessage && (
        <div className={`snapshot-alert snapshot-alert--${actionMessage.type}`}>
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: 'inherit' }}
          >
            ×
          </button>
        </div>
      )}

      <div className="archive-grid">
        <div className="snapshot-list">
          {snapshots.length === 0 ? (
            <p style={{ padding: '16px' }}>No snapshots yet. Click &quot;Capture Snapshot Now&quot; or &quot;Backfill Missing Weeks&quot;.</p>
          ) : (
            <ul className="snapshot-items">
              {snapshots.map(s => {
                const count = s.positionCount ?? s.snapshot?.length ?? 0;
                return (
                  <li
                    key={s._id}
                    className={`snapshot-item ${selectedSnapshot?._id === s._id ? 'active' : ''}`}
                    onClick={() => handleSnapshotClick(s._id)}
                  >
                    <div className="snapshot-info">
                      <span className="snapshot-week">
                        {new Date(s.weekStart).toLocaleDateString()} — {new Date(s.weekEnd).toLocaleDateString()}
                      </span>
                      <span className="snapshot-count">{count} positions</span>
                    </div>
                    <span className="snapshot-date">{new Date(s.createdAt).toLocaleDateString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="snapshot-detail">
          {detailLoading ? (
            <div>Loading snapshot...</div>
          ) : selectedSnapshot ? (
            <>
              <div className="detail-header">
                <h2>Week of {new Date(selectedSnapshot.weekStart).toLocaleDateString()} — {new Date(selectedSnapshot.weekEnd).toLocaleDateString()}</h2>
                <button className="btn-secondary" onClick={() => setSelectedSnapshot(null)}>Close</button>
              </div>
              <div className="detail-table-wrapper">
                {selectedSnapshot.snapshot?.length === 0 ? (
                  <p>No positions in this snapshot</p>
                ) : (
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>TA</th><th>Position</th><th>Client</th><th>Level</th><th>Status</th><th>Focus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSnapshot.snapshot.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.taName || '—'}</td>
                          <td>{item.position}</td>
                          <td>{item.clientName}</td>
                          <td>{item.pLevel}</td>
                          <td>{item.status}</td>
                          <td>{item.thisWeekFocus || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="empty-detail">Select a snapshot to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Archive Component ----
function Archive() {
  const [activeTab, setActiveTab] = useState('snapshots');

  return (
    <div className="archive">
      <h1>Archive</h1>

      {/* Tab bar */}
      <div className="arch-tab-bar">
        <button
          className={`arch-tab ${activeTab === 'snapshots' ? 'arch-tab--active' : ''}`}
          onClick={() => setActiveTab('snapshots')}
        >
          Weekly Snapshots
        </button>
        <button
          className={`arch-tab ${activeTab === 'history' ? 'arch-tab--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Position History
        </button>
      </div>

      {activeTab === 'snapshots' ? <WeeklySnapshotsTab /> : <PositionHistoryTab />}
    </div>
  );
}

export default Archive;