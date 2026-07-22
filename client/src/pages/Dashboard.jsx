import { useState, useEffect } from 'react';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import FlagBadge from '../components/FlagBadge';
import StatCard from '../components/StatCard';

// Labels that represent a *good* state, not something needing attention.
// These should never cause a position to show up in "Positions Needing Attention".
const POSITIVE_FLAG_LABELS = ['Healthy', 'Going Good'];

const isAttentionFlag = (flag) => flag !== null && !POSITIVE_FLAG_LABELS.includes(flag.label);

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState([]);
  const [activeTAs, setActiveTAs] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, taRes] = await Promise.all([getPositions(), getActiveTAs()]);
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-forest-500">
        Loading dashboard...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Error: {error}
      </div>
    );
  }

  const totalPositions = positions.length;
  const activeTACount = activeTAs.length;
  const statusCounts = positions.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  // Only positions with an actual problem flag (not "Healthy" / "Going Good")
  // belong in the attention list.
  const flaggedPositions = positions.filter(
    (p) => p.flags && Object.values(p.flags).some(isAttentionFlag)
  );

  // Positions with only positive flags (Healthy / Going Good), and no
  // problem flags, go in the "Going Well" list instead.
  const goingWellPositions = positions.filter((p) => {
    if (!p.flags) return false;
    const values = Object.values(p.flags).filter((f) => f !== null);
    if (values.length === 0) return false;
    const hasProblem = values.some(isAttentionFlag);
    const hasPositive = values.some((f) => POSITIVE_FLAG_LABELS.includes(f.label));
    return hasPositive && !hasProblem;
  });

  const cards = [
    { label: 'Total Positions', value: totalPositions },
    { label: 'Active TAs', value: activeTACount },
    ...Object.entries(statusCounts).map(([status, count]) => ({
      label: status,
      value: count,
    })),
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold text-forest-900">
        Dashboard
      </h1>

      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}
      >
        {cards.map((c, i) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value}
            accent={i % 2 === 0 ? 'leaf' : 'gold'}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold text-forest-900">
            Positions Needing Attention
          </h2>
          {flaggedPositions.length === 0 ? (
            <p className="text-sm text-forest-500">No flagged positions.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {flaggedPositions.map((p) => (
                <li
                  key={p._id}
                  className="flex items-center justify-between rounded-xl border
                             border-forest-200/60 bg-white/70 px-4 py-3 backdrop-blur-md
                             shadow-sm"
                >
                  <span className="text-sm font-medium text-forest-800">
                    {p.jobOrderId} - {p.position}
                  </span>
                  <div className="flex gap-1.5">
                    {Object.values(p.flags)
                      .filter(isAttentionFlag)
                      .map((flag, idx) => (
                        <FlagBadge key={idx} flag={flag} />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold text-forest-900">
            Going Well
          </h2>
          {goingWellPositions.length === 0 ? (
            <p className="text-sm text-forest-500">No positions here yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {goingWellPositions.map((p) => (
                <li
                  key={p._id}
                  className="flex items-center justify-between rounded-xl border
                             border-forest-200/60 bg-white/70 px-4 py-3 backdrop-blur-md
                             shadow-sm"
                >
                  <span className="text-sm font-medium text-forest-800">
                    {p.jobOrderId} - {p.position}
                  </span>
                  <div className="flex gap-1.5">
                    {Object.values(p.flags)
                      .filter((f) => f !== null && POSITIVE_FLAG_LABELS.includes(f.label))
                      .map((flag, idx) => (
                        <FlagBadge key={idx} flag={flag} />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;