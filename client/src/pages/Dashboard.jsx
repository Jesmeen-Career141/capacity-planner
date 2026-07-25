import { useState, useEffect } from 'react';
import { getPositions } from '../api/positions';
import FlagBadge from '../components/FlagBadge';
import StatCard from '../components/StatCard';

// Labels that represent a *good* state, not something needing attention.
// These should never cause a position to show up in "Positions Needing Attention".
const POSITIVE_FLAG_LABELS = ['Healthy', 'Going Good'];

const isAttentionFlag = (flag) => flag !== null && !POSITIVE_FLAG_LABELS.includes(flag.label);

// Helper: parse package range string into { currency, amount }
// amount is the average of the range, in whole currency units (or null if unparseable)
function parsePackageRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') {
    return { currency: null, amount: null };
  }

  const str = rangeStr.trim();

  // Detect currency
  let currency = null;
  if (/usd/i.test(str)) currency = 'USD';
  else if (/lkr/i.test(str)) currency = 'LKR';

  // "Open To Discuss" or similar non-numeric text -> unspecified
  const hasDigits = /\d/.test(str);
  if (!hasDigits) {
    return { currency, amount: null };
  }

  // Match decimal-aware numbers, e.g. 1.2, 350, 900
  const numberMatches = str.match(/\d+(\.\d+)?/g);
  if (!numberMatches || numberMatches.length === 0) {
    return { currency, amount: null };
  }
  const nums = numberMatches.map(Number);

  // Detect magnitude suffix per the whole string (K = thousand, Mn/M = million)
  const isMillion = /mn\b|(?<!\w)m\b|million/i.test(str);
  const isThousand = !isMillion && /k\b/i.test(str);
  const multiplier = isMillion ? 1_000_000 : isThousand ? 1_000 : 1;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const average = nums.length === 1 ? nums[0] : (min + max) / 2;

  // If no currency was detected but numbers exist, treat as unspecified currency
  if (!currency) {
    return { currency: 'UNSPECIFIED', amount: average * multiplier };
  }

  return { currency, amount: average * multiplier };
}

// Currency-aware formatter
function formatCurrency(value, currency) {
  if (currency === 'UNSPECIFIED') {
    return `${new Intl.NumberFormat('en-US').format(value)} (currency unclear)`;
  }
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: currency || 'LKR',
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

  // Status counts & package sums per status, per currency
  const statusData = positions.reduce(
    (acc, p) => {
      const status = p.status;
      if (!acc.counts[status]) {
        acc.counts[status] = 0;
        acc.sums[status] = {}; // { LKR: n, USD: n, UNSPECIFIED: n }
        acc.unspecified[status] = 0;
      }
      acc.counts[status] += 1;

      const { currency, amount } = parsePackageRange(p.packageRange);
      if (amount === null) {
        acc.unspecified[status] += 1;
      } else {
        const key = currency || 'UNSPECIFIED';
        acc.sums[status][key] = (acc.sums[status][key] || 0) + amount;
      }
      return acc;
    },
    { counts: {}, sums: {}, unspecified: {} }
  );

  const { counts, sums, unspecified } = statusData;

  // Total package sums across all statuses, per currency
  const totalPackageAll = {};
  Object.values(sums).forEach((currMap) => {
    Object.entries(currMap).forEach(([curr, val]) => {
      totalPackageAll[curr] = (totalPackageAll[curr] || 0) + val;
    });
  });
  const totalUnspecified = Object.values(unspecified).reduce((a, b) => a + b, 0);

  // Build cards – order: Total first, then statuses alphabetically
  const statuses = Object.keys(counts).sort();
  const orderedStatuses = ['Total', ...statuses.filter(s => s !== 'Total')];

  const formatCardValue = (status, count, currMap, unspecifiedCount) => {
    const includePackage = ['Total', 'A&P', 'Fence', 'Placed'].includes(status);
    if (!includePackage) return count;

    const currencyEntries = Object.entries(currMap || {}); // [[LKR, n], [USD, n], ...]

    return (
      <div>
        <div>{count}</div>
        {currencyEntries.map(([curr, val]) => (
          <div key={curr} style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {formatCurrency(val, curr)}
          </div>
        ))}
        {unspecifiedCount > 0 && (
          <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
            +{unspecifiedCount} not specified
          </div>
        )}
      </div>
    );
  };

  const cards = orderedStatuses.map((status, index) => {
    let label, count, currMap, unspecifiedCount;
    if (status === 'Total') {
      label = 'Total Positions';
      count = totalPositions;
      currMap = totalPackageAll;
      unspecifiedCount = totalUnspecified;
    } else {
      label = status;
      count = counts[status] || 0;
      currMap = sums[status] || {};
      unspecifiedCount = unspecified[status] || 0;
    }
    return {
      label,
      value: formatCardValue(status, count, currMap, unspecifiedCount),
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