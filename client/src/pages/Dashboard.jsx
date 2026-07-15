import { useState, useEffect } from 'react';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import FlagBadge from '../components/FlagBadge';
import './Dashboard.css';

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState([]);
  const [activeTAs, setActiveTAs] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, taRes] = await Promise.all([
          getPositions(),
          getActiveTAs()
        ]);
        setPositions(posRes.data);
        setActiveTAs(taRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="dashboard-loading">Loading dashboard...</div>;
  if (error) return <div className="dashboard-error">Error: {error}</div>;

  const totalPositions = positions.length;
  const activeTACount = activeTAs.length;
  const statusCounts = positions.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const flaggedPositions = positions.filter(p => {
    return p.flags && Object.values(p.flags).some(f => f !== null);
  });

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Positions</span>
          <span className="stat-value">{totalPositions}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active TAs</span>
          <span className="stat-value">{activeTACount}</span>
        </div>
        {Object.entries(statusCounts).map(([status, count]) => (
          <div className="stat-card" key={status}>
            <span className="stat-label">{status}</span>
            <span className="stat-value">{count}</span>
          </div>
        ))}
      </div>

      <div className="flagged-section">
        <h2>Positions Needing Attention</h2>
        {flaggedPositions.length === 0 ? (
          <p>No flagged positions.</p>
        ) : (
          <ul className="flagged-list">
            {flaggedPositions.map(p => (
              <li key={p._id} className="flagged-item">
                <span>{p.jobOrderId} - {p.position}</span>
                <div className="flag-list">
                  {Object.values(p.flags).filter(f => f !== null).map((flag, idx) => (
                    <FlagBadge key={idx} flag={flag} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
