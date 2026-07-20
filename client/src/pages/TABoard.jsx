import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getPositions, assignPosition, setFlagOverride } from '../api/positions';
import { getArchiveSnapshots, getArchiveSnapshot } from '../api/archive';
import { getActiveTAs } from '../api/tas';
import { getGrid, updateWeeklyAllocationCell } from '../api/weeklyAllocations';
import './TABoard.css';

const PLEVEL_ORDER = ['P1', 'P2', 'P3', 'P4', 'P5'];
const CARD_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const FLAG_META = {
  followUp:  { label: 'Follow up' },
  addOn:     { label: 'Add-on' },
  backup:    { label: 'Backup' },
  goingGood: { label: 'Going good' },
  reAssign:  { label: 'Re-assign' },
};
const ACTION_ORDER = Object.keys(FLAG_META);

// Used only by the Action Board, which is inherently flag-driven.
function flagChipStyle(flag) {
  if (!flag) return { background: 'var(--color-bg)', color: 'var(--color-text-muted)' };
  const c = `var(--flag-${flag.color})`;
  return { background: `color-mix(in srgb, ${c} 14%, white)`, color: c };
}

// Used by the weekly grid -- consistent color per job title, hashed deterministically.
const ROLE_PALETTE = ['--flag-red', '--flag-yellow', '--flag-green', '--flag-orange', '--flag-purple', '--role-blue', '--role-teal', '--role-neutral'];
function roleChipStyle(title) {
  if (!title) return { background: 'var(--color-bg)', color: 'var(--color-text-muted)' };
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  const varName = ROLE_PALETTE[hash % ROLE_PALETTE.length];
  const c = `var(${varName})`;
  return { background: `color-mix(in srgb, ${c} 16%, white)`, color: c };
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toISODate(date) { return date.toISOString().split('T')[0]; }

// All Mon-Sun weeks that touch the given month. Week 1 = the week containing the 1st,
// even if that week starts in the previous month.
function getMonthWeeks(year, monthIndex) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const lastOfMonth = new Date(year, monthIndex + 1, 0);
  let cursor = getMondayOfWeek(firstOfMonth);
  const weeks = [];
  while (cursor <= lastOfMonth) {
    const weekEnd = addDays(cursor, 6);
    weeks.push({ weekStart: toISODate(cursor), weekEnd: toISODate(weekEnd) });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function buildMonthOptions() {
  const now = new Date();
  const options = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push({
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + (i === 0 ? '  .  Current' : ''),
    });
  }
  return options;
}
const MONTH_OPTIONS = buildMonthOptions();
const CURRENT_MONTH_IDX = 6; // i = 0 above

const TODAY = new Date();
const TODAY_ISO = toISODate(TODAY);
const CURRENT_REAL_WEEK = {
  weekStart: toISODate(getMondayOfWeek(TODAY)),
  weekEnd: toISODate(addDays(getMondayOfWeek(TODAY), 6)),
};

/* ---------- Decorative corner accents (same visual language as Dashboard) ---------- */

function LeafCorner() {
  return (
    <svg viewBox="0 0 100 100" className="tb-stat-corner tb-stat-corner--leaf" fill="currentColor">
      <path d="M10 10c15 5 25 15 28 30-15-3-25-13-30-28-1-1 1-3 2-2z" />
      <path d="M14 55c20-2 35 8 42 25-20 2-35-8-42-25z" />
    </svg>
  );
}

function GoldCorner() {
  const squares = [];
  const size = 7;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) {
        squares.push(<rect key={`${row}-${col}`} x={col * size} y={row * size} width={size} height={size} />);
      }
    }
  }
  return (
    <svg viewBox="0 0 28 28" className="tb-stat-corner tb-stat-corner--gold" fill="currentColor">
      {squares}
    </svg>
  );
}

function StatCard({ label, value, accent, corner = 'leaf' }) {
  return (
    <div className={`tb-stat-card${accent ? ` tb-stat-card--${accent}` : ''} tb-stat-card--corner-${corner}`}>
      <div className="tb-stat-glow" />
      {corner === 'gold' ? <GoldCorner /> : <LeafCorner />}
      <span className="tb-stat-label">{label}</span>
      <span className="tb-stat-value">{value}</span>
    </div>
  );
}

/* ---------- Small checkmark icon used in the modern dropdown ---------- */
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Days elapsed since a given ISO date string. Used for the "Xd open" badge.
function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/* ---------- Portal-based popover -----------------------------------------
   Renders into document.body and positions itself against the trigger
   button's real screen coordinates. This escapes any ancestor's
   `overflow: auto/hidden` clipping -- which is what was squashing the
   dropdown down to a sliver inside the scrolling grid/action-board. ---------- */
function Popover({ anchorRef, isOpen, onClose, children, width = 290 }) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 320 && rect.top > 320;
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);

    setStyle({
      position: 'fixed',
      left,
      width,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, [isOpen, anchorRef, width]);

  if (!isOpen || !style) return null;

  return createPortal(
    <>
      <div className="cell-backdrop" onClick={onClose} />
      <div className="cell-popover" style={style} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </>,
    document.body
  );
}

function PositionPool({ positions, navigate }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = positions.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
  });

  const sorted = [...filtered].sort((a, b) => PLEVEL_ORDER.indexOf(a.pLevel) - PLEVEL_ORDER.indexOf(b.pLevel));

  return (
    <aside className="position-pool">
      <div className="pool-header">Position Pool</div>
      <div className="pool-search">
        <input
          type="text"
          placeholder="Search by title, client, or JO#"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="pool-cards">
        {sorted.length === 0 && <p className="pool-empty">No positions found</p>}
        {sorted.map(pos => {
          const isNew = (pos.allocationRounds?.length ?? 0) === 0;
          const flagList = pos.flags ? Object.values(pos.flags).filter(f => f !== null) : [];
          const openDays = daysSince(pos.createdAt);
          return (
            <div key={pos._id} className="pool-card" role="button" tabIndex={0}
              onClick={() => navigate(`/positions/${pos._id}`)}
              onKeyDown={e => e.key === 'Enter' && navigate(`/positions/${pos._id}`)}>
              <div className="pool-card-top">
                <span className="pool-completion">
                  <span className="pool-completion-value">{pos.completionPercent || 0}%</span>
                  <span className="pool-completion-bar">
                    <span
                      className="pool-completion-fill"
                      style={{ width: `${pos.completionPercent || 0}%` }}
                    />
                  </span>
                </span>
                <span className={`pool-plevel pool-plevel--${pos.pLevel}`}>{pos.pLevel}</span>
              </div>
              <div className="pool-card-client">{pos.client?.clientName || '—'}</div>
              <div className="pool-card-title">{pos.position}</div>
              <div className="pool-card-meta">
                <span>LS: {pos.lsCount ?? '-'}</span>
                <span>CV: {pos.cvCount ?? '-'}</span>
                {openDays !== null && (
                  <span className="pool-days-badge" title="Days since this position was created">
                    {openDays}d open
                  </span>
                )}
                <span className={`pool-badge pool-badge--${isNew ? 'new' : 'round'}`}>
                  {isNew ? 'New' : `Rd ${pos.allocationRounds.length}`}
                </span>
              </div>
              {flagList.length > 0 && (
                <div className="pool-card-flags">
                  {flagList.map((flag, idx) => (
                    <span
                      key={idx}
                      className="pool-flag-dot"
                      style={{ background: `var(--flag-${flag.color})` }}
                      title={flag.label}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ---------- Modern position-picker popover (used by the weekly grid "+ Assign" cell) ---------- */
function GridCell({ position, positions, isOpen, onToggle, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const triggerRef = useRef(null);

  const filtered = positions.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="grid-cell-wrap">
      {position ? (
        <button ref={triggerRef} className="grid-pill" style={roleChipStyle(position.position)} onClick={onToggle}>
          {position.client?.clientName || '—'} — {position.position}
        </button>
      ) : (
        <button ref={triggerRef} className="grid-pill grid-pill-empty" onClick={onToggle}>+ Assign</button>
      )}
      <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggle}>
        <div className="popover-search">
          <input
            type="text"
            placeholder="Search positions..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        </div>
        <button
          className={`cell-popover-option${!position ? ' cell-popover-option--selected' : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className="cpo-check">{!position && <CheckIcon />}</span>
          <span className="cpo-text cpo-text--muted">— None —</span>
        </button>
        {filtered.map(p => {
          const selected = position?._id === p._id;
          return (
            <button
              className={`cell-popover-option${selected ? ' cell-popover-option--selected' : ''}`}
              key={p._id}
              onClick={() => onSelect(p._id)}
            >
              <span className="cpo-check">{selected && <CheckIcon />}</span>
              <span className={`cpo-level cpo-level--${p.pLevel}`}>{p.pLevel}</span>
              <span className="cpo-text">
                <span className="cpo-client">{p.client?.clientName || '—'}</span>
                <span className="cpo-position">{p.position}</span>
              </span>
            </button>
          );
        })}
      </Popover>
    </div>
  );
}

function TACard({ ta, displayWeeks, activeColumnIndex, getCell, positions, openCellKey, onCellToggle, onSelectCell, navigate, workloadCount }) {
  const initials = ta.name?.[0]?.toUpperCase() || '?';
  return (
    <section className="ta-card">
      <header className="ta-card-header">
        <div className="ta-avatar">{initials}</div>
        <p className="ta-name">{ta.name}</p>
        <span className="ta-workload-badge" title="Currently assigned open positions">
          {workloadCount} active
        </span>
      </header>
      <div className="ta-grid-scroll">
        <div className="ta-grid" style={{ gridTemplateColumns: `62px repeat(${displayWeeks.length}, minmax(165px, 1fr))` }}>
          <div className="ta-grid-row ta-grid-header-row" style={{ gridTemplateColumns: `62px repeat(${displayWeeks.length}, minmax(165px, 1fr))` }}>
            <div className="ta-day-col" />
            {displayWeeks.map((w, idx) => (
              <div key={w.weekStart} className={`ta-week-label${idx === activeColumnIndex ? ' ta-week-label--active' : ''}`}>
                {`WEEK ${idx + 1}`}{idx === activeColumnIndex ? ' . NOW' : ''}
              </div>
            ))}
          </div>

          {CARD_DAYS.map(day => (
            <div className="ta-grid-row" key={day} style={{ gridTemplateColumns: `62px repeat(${displayWeeks.length}, minmax(165px, 1fr))` }}>
              <div className="ta-day-col">{DAY_LABELS[day].toUpperCase()}</div>
              {displayWeeks.map((w, idx) => {
                const position = getCell(ta._id, w.weekStart, day);
                const isActive = idx === activeColumnIndex;
                // FIX: use String(ta._id) to ensure consistent key
                const cellKey = `${String(ta._id)}|${w.weekStart}|${day}`;

                if (isActive) {
                  return (
                    <div key={cellKey} className="ta-grid-cell ta-grid-cell--active">
                      <GridCell
                        position={position}
                        positions={positions}
                        isOpen={openCellKey === cellKey}
                        onToggle={() => onCellToggle(cellKey)}
                        onSelect={(newId) => onSelectCell(ta._id, day, newId)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={cellKey} className="ta-grid-cell ta-grid-cell--readonly">
                    {position ? (
                      <button
                        className="grid-pill grid-pill-readonly"
                        style={roleChipStyle(position.position)}
                        onClick={() => navigate(`/positions/${position._id}`)}
                        title="View position (read-only here -- only the current week is editable)"
                      >
                        {position.client?.clientName || '—'} — {position.position}
                      </button>
                    ) : (
                      <div className="grid-pill-blank">-</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Action Board sub-pieces (each owns its own trigger ref for the portal popover) ---------- */

function ReassignChip({ p, flagKey, ta, tas, onReassign, onToggleFlag, isOpen, onToggleOpen }) {
  const triggerRef = useRef(null);
  return (
    <div className="ab-chip-wrap">
      <button ref={triggerRef} className="ab-chip ab-chip-btn" style={flagChipStyle(p.flags[flagKey])}
        onClick={onToggleOpen}>
        {p.client?.clientName || '—'} — {p.position}
        {p.flags[flagKey].manual && <span className="ab-manual-dot" title="Manually set" />}
      </button>
      <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggleOpen} width={220}>
        <p className="popover-heading">Reassign to</p>
        {tas.filter(t => t._id !== ta._id).map(t => (
          <button key={t._id} className="cell-popover-option cell-popover-option--simple"
            onClick={() => { onReassign(p._id, t._id); onToggleOpen(); }}>
            <span className="cpo-text">{t.name}</span>
          </button>
        ))}
        <div className="popover-divider" />
        <button className="cell-popover-option cell-popover-option--simple cell-popover-danger"
          onClick={() => { onToggleFlag(p._id, flagKey, 'off'); onToggleOpen(); }}>
          <span className="cpo-text">Remove flag (manual off)</span>
        </button>
      </Popover>
    </div>
  );
}

function AddPositionButton({ ta, flagKey, candidates, matchesCount, onReassign, onToggleFlag, isOpen, onToggleOpen, searchTerm, onSearchChange }) {
  const triggerRef = useRef(null);
  const filtered = candidates.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="ab-add-wrap">
      <button ref={triggerRef} className="ab-add-btn" onClick={onToggleOpen}>
        {matchesCount === 0 ? '-' : '+'}
      </button>
      <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggleOpen}>
        <p className="popover-heading">Add position to this flag/TA</p>
        <div className="popover-search">
          <input
            type="text"
            placeholder="Search positions..."
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        </div>
        {filtered.slice(0, 30).map(p => (
          <button key={p._id} className="cell-popover-option" onClick={() => {
            if (p.assignee?._id !== ta._id) onReassign(p._id, ta._id);
            onToggleFlag(p._id, flagKey, 'on');
            onToggleOpen();
          }}>
            <span className="cpo-check" />
            <span className={`cpo-level cpo-level--${p.pLevel}`}>{p.pLevel}</span>
            <span className="cpo-text">
              <span className="cpo-client">{p.client?.clientName || '—'}</span>
              <span className="cpo-position">{p.position}</span>
            </span>
          </button>
        ))}
        {filtered.length === 0 && <div className="popover-empty">No positions match</div>}
      </Popover>
    </div>
  );
}

function ActionBoard({ positions, tas, onToggleFlag, onReassign, workloadByTA }) {
  const [openKey, setOpenKey] = useState(null);
  const [searchTerms, setSearchTerms] = useState({});

  const handleSearchChange = (key, value) => {
    setSearchTerms(prev => ({ ...prev, [key]: value }));
  };

  // Only these labels represent an *actionable* state for a given flag key.
  // reAssign is special: it carries three sub-states (Reassign / Watch / Healthy)
  // under one key, and only the red "Reassign" state should surface here --
  // "Watch" and "Healthy" are informational, not action items.
  const isActionable = (flagKey, flag) => {
    if (!flag) return false;
    if (flagKey === 'reAssign') return flag.label === 'Reassign';
    return true;
  };

  return (
    <div className="action-board-wrap">
      <div className="action-board">
        <div className="ab-row ab-header-row" style={{ gridTemplateColumns: `140px repeat(${tas.length}, minmax(140px, 1fr))` }}>
          <div className="ab-label-col" />
          {tas.map(ta => (
            <div className="ab-col-header" key={ta._id}>
              {ta.name}
              <span className="ab-col-count">{workloadByTA[ta._id] ?? 0}</span>
            </div>
          ))}
        </div>

        {ACTION_ORDER.map(flagKey => (
          <div className="ab-row" key={flagKey} style={{ gridTemplateColumns: `140px repeat(${tas.length}, minmax(140px, 1fr))` }}>
            <div className="ab-label-col">{FLAG_META[flagKey].label}</div>
            {tas.map(ta => {
              const matches = positions.filter(p =>
                p.assignee?._id === ta._id && isActionable(flagKey, p.flags?.[flagKey])
              );
              const cellKey = `cell|${flagKey}|${ta._id}`;
              const candidates = positions.filter(p =>
                !(p.assignee?._id === ta._id && isActionable(flagKey, p.flags?.[flagKey]))
              );

              return (
                <div className="ab-cell" key={ta._id}>
                  {matches.map(p => {
                    const chipKey = `chip|${flagKey}|${p._id}`;
                    return (
                      <ReassignChip
                        key={p._id}
                        p={p}
                        flagKey={flagKey}
                        ta={ta}
                        tas={tas}
                        onReassign={onReassign}
                        onToggleFlag={onToggleFlag}
                        isOpen={openKey === chipKey}
                        onToggleOpen={() => setOpenKey(openKey === chipKey ? null : chipKey)}
                      />
                    );
                  })}

                  <AddPositionButton
                    ta={ta}
                    flagKey={flagKey}
                    candidates={candidates}
                    matchesCount={matches.length}
                    onReassign={onReassign}
                    onToggleFlag={onToggleFlag}
                    isOpen={openKey === cellKey}
                    onToggleOpen={() => setOpenKey(openKey === cellKey ? null : cellKey)}
                    searchTerm={searchTerms[cellKey] || ''}
                    onSearchChange={(v) => handleSearchChange(cellKey, v)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function TABoard() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('grid');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(CURRENT_MONTH_IDX);
  const [positions, setPositions] = useState([]);
  const [tas, setTAs] = useState([]);
  const [gridsByWeek, setGridsByWeek] = useState({});
  const [snapshots, setSnapshots] = useState([]);
  const [carriedForward, setCarriedForward] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openCellKey, setOpenCellKey] = useState(null);

  // Cache for grid data to avoid re-fetching same weeks
  const gridCache = useRef({});

  const selectedMonth = MONTH_OPTIONS[selectedMonthIdx];
  const displayWeeks = getMonthWeeks(selectedMonth.year, selectedMonth.monthIndex);
  const activeColumnIndex = displayWeeks.findIndex(w => TODAY_ISO >= w.weekStart && TODAY_ISO <= w.weekEnd);
  const isActiveVisible = activeColumnIndex !== -1;

  // --- ALL HOOKS MUST BE CALLED BEFORE CONDITIONAL RETURNS ---

  useEffect(() => {
    (async () => {
      try {
        const [posRes, snapRes, taRes] = await Promise.all([getPositions(), getArchiveSnapshots(), getActiveTAs()]);
        setPositions(posRes.data);
        setSnapshots(snapRes.data);
        setTAs(taRes.data);
      } catch (err) { setError(err.message); } finally { setLoading(false); }
    })();
  }, []);

  // Fetch weekly grids with caching
  useEffect(() => {
    if (loading) return;
    setGridLoading(true);

    const fetchWeeks = async () => {
      const promises = displayWeeks.map(async (w) => {
        if (gridCache.current[w.weekStart]) {
          return { weekStart: w.weekStart, data: gridCache.current[w.weekStart] };
        }
        const res = await getGrid(w.weekStart, w.weekEnd);
        gridCache.current[w.weekStart] = res.data;
        return { weekStart: w.weekStart, data: res.data };
      });

      const results = await Promise.all(promises);
      const newGrids = {};
      results.forEach(({ weekStart, data }) => {
        newGrids[weekStart] = data;
      });
      setGridsByWeek(prev => ({ ...prev, ...newGrids }));
      setGridLoading(false);
    };

    fetchWeeks().catch(err => {
      alert(err.response?.data?.error || 'Failed to load weekly grids');
      setGridLoading(false);
    });
  }, [selectedMonthIdx, loading]);

  useEffect(() => {
    if (loading || snapshots.length === 0 || positions.length === 0) { setCarriedForward(0); return; }
    (async () => {
      const selectedStart = new Date(displayWeeks[0].weekStart);
      const prev = snapshots.filter(s => new Date(s.weekStart) < selectedStart)
        .sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart))[0];
      if (!prev) { setCarriedForward(0); return; }
      try {
        const res = await getArchiveSnapshot(prev._id);
        const openIds = new Set(positions.filter(p => !['Placed', 'Lost'].includes(p.status)).map(p => String(p._id)));
        setCarriedForward(res.data.snapshot.filter(item =>
          !['Placed', 'Lost'].includes(item.status) && item.positionId && openIds.has(String(item.positionId))
        ).length);
      } catch { setCarriedForward(0); }
    })();
  }, [selectedMonthIdx, snapshots, positions, loading]);

  const byId = Object.fromEntries(positions.map(p => [p._id, p]));

  // How many currently-open positions each TA is assigned to right now.
  const workloadByTA = tas.reduce((acc, ta) => {
    acc[ta._id] = positions.filter(p =>
      p.assignee?._id === ta._id && !['Placed', 'Lost'].includes(p.status)
    ).length;
    return acc;
  }, {});

  const getCell = useCallback((taId, weekStart, day) => {
    const weekGrid = gridsByWeek[weekStart];
    if (!weekGrid) return null;
    const row = weekGrid.find(r => String(r.ta._id) === String(taId));
    return row?.days?.[day]?.position || null;
  }, [gridsByWeek]);

  const handleCellSelect = async (taId, day, newPositionId) => {
    const activeWeekStart = CURRENT_REAL_WEEK.weekStart;
    const prevGrids = gridsByWeek;
    const newPosObj = newPositionId ? byId[newPositionId] : null;

    setGridsByWeek(prev => {
      const weekGrid = prev[activeWeekStart];
      if (!weekGrid) return prev;
      const updated = weekGrid.map(row => String(row.ta._id) !== String(taId) ? row :
        { ...row, days: { ...row.days, [day]: { ...row.days[day], position: newPosObj } } });
      return { ...prev, [activeWeekStart]: updated };
    });
    setOpenCellKey(null);

    try {
      await updateWeeklyAllocationCell(taId, activeWeekStart, { day, positionId: newPositionId || null });
    } catch (err) {
      setGridsByWeek(prevGrids);
      alert(err.response?.data?.error || 'Failed to update cell');
    }
  };

  const handleToggleFlag = async (positionId, flagKey, mode) => {
    try {
      await setFlagOverride(positionId, flagKey, mode);
      const res = await getPositions();
      setPositions(res.data);
    } catch (err) { alert(err.response?.data?.error || 'Failed to update flag'); }
  };

  const handleReassign = async (positionId, newTaId) => {
    try {
      await assignPosition(positionId, newTaId, 'Reassigned from Action Board');
      const res = await getPositions();
      setPositions(res.data);
    } catch (err) { alert(err.response?.data?.error || 'Failed to reassign'); }
  };

  // --- Memoized `taList` MUST be declared BEFORE the conditional returns ---
  const taList = useMemo(() => {
    const source = displayWeeks.map(w => gridsByWeek[w.weekStart]).find(g => g && g.length > 0) || [];
    return source.map(row => row.ta);
  }, [displayWeeks, gridsByWeek]);

  // --- CONDITIONAL RETURNS (AFTER all hooks) ---
  if (loading) return <div className="taboard-loading">Loading TA Board...</div>;
  if (error) return <div className="taboard-error">Error: {error}</div>;

  // --- Remaining logic & render ---
  const openPositions = positions.filter(p => !['Placed', 'Lost'].includes(p.status));
  const activeTACount = taList.length;
  const bandwidth = activeTACount === 0 ? '-' : (openPositions.length / activeTACount).toFixed(1);
  const active = positions.filter(p => p.status === 'A&P').length;
  const yetToActivate = positions.filter(p => p.status === 'Yet to Activate').length;
  const fence = positions.filter(p => p.status === 'Fence').length;
  const reassign = positions.filter(p => p.flags?.reAssign?.label === 'Reassign').length;

  return (
    <div className="taboard-page">
      <div className="taboard-header">
        <h1>TA Board</h1>
        <div className="taboard-controls">
          <div className="view-toggle">
            <button className={activeView === 'grid' ? 'toggle-btn toggle-btn-active' : 'toggle-btn'} onClick={() => setActiveView('grid')}>Weekly grid</button>
            <button className={activeView === 'action' ? 'toggle-btn toggle-btn-active' : 'toggle-btn'} onClick={() => setActiveView('action')}>Action board</button>
          </div>
          {activeView === 'grid' && (
            <select className="week-select" value={selectedMonthIdx} onChange={e => setSelectedMonthIdx(Number(e.target.value))}>
              {MONTH_OPTIONS.map((m, i) => <option key={`${m.year}-${m.monthIndex}`} value={i}>{m.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {activeView === 'grid' && !isActiveVisible && (
        <div className="taboard-notice">
          You're viewing a different month -- nothing here is editable right now.
          Switch the dropdown back to "Current" to make assignments.
        </div>
      )}

      <div className="tb-stats-row">
        <StatCard label="TA Bandwidth" value={`${bandwidth}x`} accent="primary" corner="leaf" />
        <StatCard label="Total Roles" value={openPositions.length} corner="gold" />
        <StatCard label="Carried Forward" value={carriedForward} corner="leaf" />
        <StatCard label="Active (A&P)" value={active} accent="green" corner="gold" />
        <StatCard label="Yet to Activate" value={yetToActivate} corner="leaf" />
        <StatCard label="Fence" value={fence} accent="purple" corner="gold" />
        <StatCard label="Re-assign" value={reassign} accent="red" corner="leaf" />
      </div>

      <div className="taboard-body">
        <PositionPool positions={positions} navigate={navigate} />

        {activeView === 'grid' ? (
          <main className="board-main">
            {gridLoading ? (
              <div className="grid-loading">Loading grid...</div>
            ) : taList.length === 0 ? (
              <div className="grid-no-data">No active TAs found</div>
            ) : (
              <div className="weekly-grid-list">
                {taList.map(ta => (
                  <TACard
                    key={String(ta._id)} // force string
                    ta={ta}
                    displayWeeks={displayWeeks}
                    activeColumnIndex={activeColumnIndex}
                    getCell={getCell}
                    positions={positions}
                    openCellKey={openCellKey}
                    onCellToggle={(cellKey) => setOpenCellKey(openCellKey === cellKey ? null : cellKey)}
                    onSelectCell={handleCellSelect}
                    navigate={navigate}
                    workloadCount={workloadByTA[ta._id] ?? 0}
                  />
                ))}
              </div>
            )}
          </main>
        ) : (
          <main className="board-main">
            <ActionBoard
              positions={positions}
              tas={tas}
              onToggleFlag={handleToggleFlag}
              onReassign={handleReassign}
              workloadByTA={workloadByTA}
            />
          </main>
        )}
      </div>
    </div>
  );
}

export default TABoard;