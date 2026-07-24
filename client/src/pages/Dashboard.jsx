import { useState, useEffect } from 'react';
import { getPositions } from '../api/positions';
import FlagBadge from '../components/FlagBadge';
import StatCard from '../components/StatCard';

// Labels that represent a *good* state, not something needing attention.
// These should never cause a position to show up in "Positions Needing Attention".
const POSITIVE_FLAG_LABELS = ['Healthy', 'Going Good'];

const isAttentionFlag = (flag) => flag !== null && !POSITIVE_FLAG_LABELS.includes(flag.label);

// Helper: parse package range string and return average value as a number (in whole currency units)
function parsePackageRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return 0;
  const numbers = rangeStr.match(/\d+/g);
  if (!numbers || numbers.length === 0) return 0;
  const nums = numbers.map(Number);
  const isK = /k/i.test(rangeStr);
  let average;
  if (nums.length === 1) {
    average = nums[0];
  } else {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    average = (min + max) / 2;
  }
  return isK ? average * 1000 : average;
}

// Helper: format number as currency (Sri Lankan Rupee)
function formatCurrency(value) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(value);
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const posRes = await getPositions();
        setPositions(posRes.data);
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

  // Status counts & package sums per status
  const statusData = positions.reduce(
    (acc, p) => {
      const status = p.status;
      if (!acc.counts[status]) {
        acc.counts[status] = 0;
        acc.sums[status] = 0;
      }
      acc.counts[status] += 1;
      acc.sums[status] += parsePackageRange(p.packageRange);
      return acc;
    },
    { counts: {}, sums: {} }
  );

  const { counts, sums } = statusData;

  // Total package sum (all positions, regardless of status)
  const totalPackageAll = Object.values(sums).reduce((a, b) => a + b, 0);

  // Build cards – order: Total first, then statuses alphabetically
  const statuses = Object.keys(counts).sort();
  const orderedStatuses = ['Total', ...statuses.filter(s => s !== 'Total')];

  // NOTE: this must be checked against the internal `status` key ('Total'),
  // not the display `label` ('Total Positions') — that mismatch was why the
  // Total card wasn't showing its package sum before.
  const formatCardValue = (status, count, sum) => {
    // Show package sum below the count for Total, A&P, Fence, Placed
    const includePackage = ['Total', 'A&P', 'Fence', 'Placed'].includes(status);
    if (includePackage) {
      return (
        <div>
          <div>{count}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {formatCurrency(sum)}
          </div>
        </div>
      );
    }
    // Other statuses: just the count
    return count;
  };

  const cards = orderedStatuses.map((status, index) => {
    let label, count, sum;
    if (status === 'Total') {
      label = 'Total Positions';
      count = totalPositions;
      sum = totalPackageAll;
    } else {
      label = status;
      count = counts[status] || 0;
      sum = sums[status] || 0;
    }
    return {
      label,
      value: formatCardValue(status, count, sum),
      accent: index % 2 === 0 ? 'leaf' : 'gold',
    };
  });

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