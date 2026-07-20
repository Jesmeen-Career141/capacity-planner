import { useState, useEffect } from 'react';
import { getArchiveSnapshots, getArchiveSnapshot } from '../api/archive';
import './Archive.css';

function Archive() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const fetchSnapshots = async () => {
    try {
      const res = await getArchiveSnapshots();
      setSnapshots(res.data);
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
    } catch (err) {
      alert('Failed to load snapshot detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedSnapshot(null);
  };

  if (loading) return <div>Loading archive...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="archive">
      <h1>Archive</h1>
      <p className="subtitle">Weekly snapshots of all positions</p>

      <div className="archive-grid">
        <div className="snapshot-list">
          {snapshots.length === 0 ? (
            <p>No snapshots yet</p>
          ) : (
            <ul className="snapshot-items">
              {snapshots.map(s => (
                <li
                  key={s._id}
                  className={`snapshot-item ${selectedSnapshot?._id === s._id ? 'active' : ''}`}
                  onClick={() => handleSnapshotClick(s._id)}
                >
                  <div className="snapshot-info">
                    <span className="snapshot-week">
                      {new Date(s.weekStart).toLocaleDateString()} — {new Date(s.weekEnd).toLocaleDateString()}
                    </span>
                    <span className="snapshot-count">{s.snapshot?.length || 0} positions</span>
                  </div>
                  <span className="snapshot-date">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="snapshot-detail">
          {detailLoading ? (
            <div>Loading snapshot...</div>
          ) : selectedSnapshot ? (
            <>
              <div className="detail-header">
                <h2>
                  Week of {new Date(selectedSnapshot.weekStart).toLocaleDateString()} — {new Date(selectedSnapshot.weekEnd).toLocaleDateString()}
                </h2>
                <button className="btn-secondary" onClick={handleCloseDetail}>Close</button>
              </div>
              <div className="detail-table-wrapper">
                {selectedSnapshot.snapshot?.length === 0 ? (
                  <p>No positions in this snapshot</p>
                ) : (
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>TA</th>
                        <th>Position</th>
                        <th>Client</th>
                        <th>Level</th>
                        <th>Status</th>
                        <th>Focus</th>
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

export default Archive;