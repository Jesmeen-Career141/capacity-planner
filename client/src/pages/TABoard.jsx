import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPositions } from '../api/positions';
import { getArchiveSnapshots, getArchiveSnapshot } from '../api/archive';
import { getGrid, updateWeeklyAllocationCell, autofillWeek as autofillWeekAPI } from '../api/weeklyAllocations';
import './TABoard.css';

/* ─── Constants ─── */
const PLEVEL_ORDER = ['P1', 'P2', 'P3', 'P4', 'P5'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/* ─── Week helpers ─── */
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function buildWeekOptions() {
  const today = new Date();
  const currentMonday = getMondayOfWeek(today);
  const weeks = [];
  for (let i = -4; i <= 5; i++) {
    const start = addDays(currentMonday, i * 7);
    const end = addDays(start, 6);
    const fmt = (d, opts) => d.toLocaleDateString('en-GB', opts);
    weeks.push({
      weekStart: toISODate(start),
      weekEnd: toISODate(end),
      label:
        `${fmt(start, { day: '2-digit', month: 'short' })} – ` +
        `${fmt(end, { day: '2-digit', month: 'short', year: 'numeric' })}` +
        (i === 0 ? '  ·  Current' : ''),
    });
  }
  return weeks;
}

const WEEK_OPTIONS = buildWeekOptions();
const CURRENT_WEEK_IDX = 4; // offset for i=0 in range -4..+5

/* ─── Small components ─── */
function StatCard({ label, value, accent }) {
  return (
    <div className={`tb-stat-card${accent ? ` tb-stat-card--${accent}` : ''}`}>
      <span className="tb-stat-label">{label}</span>
      <span className="tb-stat-value">{value}</span>
    </div>
  );
}

/* ─── Main component ─── */
function TABoard() {
  const navigate = useNavigate();

  const [selectedWeekIdx, setSelectedWeekIdx] = useState(CURRENT_WEEK_IDX);
  const [positions, setPositions]             = useState([]);
  const [grid, setGrid]                       = useState([]);
  const [snapshots, setSnapshots]             = useState([]);
  const [carriedForward, setCarriedForward]   = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [gridLoading, setGridLoading]         = useState(false);
  const [error, setError]                     = useState(null);
  const [autofilling, setAutofilling]         = useState(false);

  const selectedWeek = WEEK_OPTIONS[selectedWeekIdx];

  /* ── Initial load: positions + snapshot list ── */
  useEffect(() => {
    const init = async () => {
      try {
        const [posRes, snapRes] = await Promise.all([
          getPositions(),
          getArchiveSnapshots(),
        ]);
        setPositions(posRes.data);
        setSnapshots(snapRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  /* ── Fetch grid whenever selected week or initial load completes ── */
  const fetchGrid = useCallback(async (weekStart, weekEnd) => {
    setGridLoading(true);
    try {
      const res = await getGrid(weekStart, weekEnd);
      setGrid(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load weekly grid');
    } finally {
      setGridLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) fetchGrid(selectedWeek.weekStart, selectedWeek.weekEnd);
  }, [selectedWeek, loading, fetchGrid]);

  /* ── Carried Forward: positions open in prev snapshot still open now ── */
  useEffect(() => {
    if (loading || snapshots.length === 0 || positions.length === 0) {
      setCarriedForward(0);
      return;
    }

    const compute = async () => {
      const selectedStart = new Date(selectedWeek.weekStart);
      const prev = snapshots
        .filter(s => new Date(s.weekStart) < selectedStart)
        .sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart))[0];

      if (!prev) { setCarriedForward(0); return; }

      try {
        const res = await getArchiveSnapshot(prev._id);
        const openIds = new Set(
          positions
            .filter(p => !['Placed', 'Lost'].includes(p.status))
            .map(p => String(p._id))
        );
        const count = res.data.snapshot.filter(
          item =>
            !['Placed', 'Lost'].includes(item.status) &&
            item.positionId &&
            openIds.has(String(item.positionId))
        ).length;
        setCarriedForward(count);
      } catch {
        setCarriedForward(0);
      }
    };

    compute();
  }, [selectedWeek, snapshots, positions, loading]);

  /* ── Optimistic cell update ── */
  const handleCellChange = async (taId, day, newPositionId) => {
    const prevGrid = grid;
    const newPosObj = newPositionId
      ? (positions.find(p => p._id === newPositionId) ?? { _id: newPositionId })
      : null;

    setGrid(prev =>
      prev.map(row => {
        if (String(row.ta._id) !== String(taId)) return row;
        return {
          ...row,
          days: { ...row.days, [day]: { ...row.days[day], position: newPosObj } },
        };
      })
    );

    try {
      await updateWeeklyAllocationCell(taId, selectedWeek.weekStart, {
        day,
        positionId: newPositionId || null,
      });
    } catch (err) {
      setGrid(prevGrid);
      alert(err.response?.data?.error || 'Failed to update cell');
    }
  };

  /* ── Autofill ── */
  const handleAutofill = async () => {
    setAutofilling(true);
    try {
      const res = await autofillWeekAPI(selectedWeek.weekStart, selectedWeek.weekEnd);
      setGrid(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Autofill failed');
    } finally {
      setAutofilling(false);
    }
  };

  /* ── Early returns ── */
  if (loading) return <div className="taboard-loading">Loading TA Board…</div>;
  if (error)   return <div className="taboard-error">Error: {error}</div>;

  /* ── Derived stats ── */
  const openPositions   = positions.filter(p => !['Placed', 'Lost'].includes(p.status));
  const activeTACount   = grid.length;
  const bandwidth       = activeTACount === 0 ? '—' : (openPositions.length / activeTACount).toFixed(1);
  const active          = positions.filter(p => p.status === 'A&P').length;
  const yetToActivate   = positions.filter(p => p.status === 'Yet to Activate').length;
  const fence           = positions.filter(p => p.status === 'Fence').length;
  const reassign        = positions.filter(p => p.flags?.reAssign?.label === 'Reassign').length;

  const sortedPositions = [...positions].sort(
    (a, b) => PLEVEL_ORDER.indexOf(a.pLevel) - PLEVEL_ORDER.indexOf(b.pLevel)
  );

  return (
    <div className="taboard-page">

      {/* ── Header ── */}
      <div className="taboard-header">
        <h1>TA Board</h1>
        <div className="taboard-controls">
          <select
            id="week-selector"
            className="week-select"
            value={selectedWeekIdx}
            onChange={e => setSelectedWeekIdx(Number(e.target.value))}
          >
            {WEEK_OPTIONS.map((w, i) => (
              <option key={w.weekStart} value={i}>{w.label}</option>
            ))}
          </select>
          <button
            id="autofill-btn"
            className="btn-autofill"
            onClick={handleAutofill}
            disabled={autofilling || gridLoading}
          >
            {autofilling ? 'Filling…' : '⚡ Auto-fill Week'}
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="tb-stats-row">
        <StatCard label="TA Bandwidth" value={`${bandwidth}×`} accent="primary" />
        <StatCard label="Total Roles"       value={openPositions.length} />
        <StatCard label="Carried Forward"   value={carriedForward} />
        <StatCard label="Active (A&P)"      value={active}        accent="green"  />
        <StatCard label="Yet to Activate"   value={yetToActivate} />
        <StatCard label="Fence"             value={fence}         accent="purple" />
        <StatCard label="Re-assign"         value={reassign}      accent="red"    />
      </div>

      {/* ── Body: sidebar + grid ── */}
      <div className="taboard-body">

        {/* Position Pool */}
        <aside className="position-pool">
          <div className="pool-header">Position Pool</div>
          <div className="pool-cards">
            {sortedPositions.length === 0 && (
              <p className="pool-empty">No positions found</p>
            )}
            {sortedPositions.map(pos => {
              const isNew = (pos.allocationRounds?.length ?? 0) === 0;
              return (
                <div
                  key={pos._id}
                  className="pool-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/positions/${pos._id}`)}
                  onKeyDown={e => e.key === 'Enter' && navigate(`/positions/${pos._id}`)}
                >
                  <div className="pool-card-top">
                    <span className="pool-jo">{pos.jobOrderId}</span>
                    <span className={`pool-plevel pool-plevel--${pos.pLevel}`}>{pos.pLevel}</span>
                  </div>
                  <div className="pool-card-title">{pos.position}</div>
                  <div className="pool-card-meta">
                    <span>LS: {pos.lsCount ?? '—'}</span>
                    <span>CV: {pos.cvCount ?? '—'}</span>
                    <span className={`pool-badge pool-badge--${isNew ? 'new' : 'round'}`}>
                      {isNew ? 'New' : `Rd ${pos.allocationRounds.length}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Weekly Grid */}
        <div className="grid-wrapper">
          {gridLoading ? (
            <div className="grid-loading">Loading grid…</div>
          ) : (
            <div className="grid-scroll">
              <table className="weekly-grid">
                <thead>
                  <tr>
                    <th className="th-ta">TA</th>
                    {DAYS.map(d => (
                      <th key={d} className="th-day">{DAY_LABELS[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="grid-no-data">No active TAs found for this week</td>
                    </tr>
                  ) : (
                    grid.map(row => (
                      <tr key={row.ta._id}>
                        <td className="td-ta">{row.ta.name}</td>
                        {DAYS.map(day => {
                          const currentPosId = row.days?.[day]?.position?._id || '';
                          return (
                            <td key={day} className="td-cell">
                              <select
                                className="cell-select"
                                value={currentPosId}
                                onChange={e =>
                                  handleCellChange(row.ta._id, day, e.target.value || null)
                                }
                              >
                                <option value="">— None —</option>
                                {positions.map(p => (
                                  <option key={p._id} value={p._id}>
                                    [{p.pLevel}] {p.jobOrderId} – {p.position} · LS:{p.lsCount ?? '?'} CV:{p.cvCount ?? '?'}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default TABoard;
