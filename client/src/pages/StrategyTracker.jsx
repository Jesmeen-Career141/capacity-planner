import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import { getStrategies, getEntries, getPositionEntries, updateEntry } from '../api/strategyTracker';
import './StrategyTracker.css';

// ---- TA colour palette (same as Positions.jsx) ----
const TA_COLORS = {
  blue:       { bg: '#3b82f6', text: '#ffffff' },
  yellow:     { bg: '#fde047', text: '#78350f' },
  purple:     { bg: '#8b5cf6', text: '#ffffff' },
  darkGreen:  { bg: '#166534', text: '#ffffff' },
  lightGreen: { bg: '#4ade80', text: '#14532d' },
  lightBlue:  { bg: '#7dd3fc', text: '#0c4a6e' },
  turquoise:  { bg: '#14b8a6', text: '#ffffff' },
  pink:       { bg: '#ec4899', text: '#ffffff' },
  slate:      { bg: '#64748b', text: '#ffffff' },
  maroon:     { bg: '#991b1b', text: '#ffffff' },
};

// ---- Icons ----
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ---- Multi-select assignee picker (inline dropdown with checkboxes) ----
function AssigneePicker({ values, options, onChange, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('down');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDirection(spaceBelow >= 180 ? 'down' : 'up');
    }
    setIsOpen(!isOpen);
  };

  const toggleOption = (val) => {
    if (values.includes(val)) {
      onChange(values.filter(v => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  return (
    <div className="st-assignee-picker" ref={containerRef}>
      <button type="button" className="st-add-btn" onClick={toggle} disabled={disabled}>
        + Add
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`st-assignee-list st-assignee-list--${direction}`}>
            {options.map(opt => (
              <label key={opt.value} className="st-assignee-option">
                <input
                  type="checkbox"
                  checked={values.includes(opt.value)}
                  onChange={() => toggleOption(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Strategy row in the expanded checklist ----
function StrategyRow({ entry, allTAs, onUpdate }) {
  const isNA = entry.status === 'na';
  const isDone = entry.status === 'done';
  const isDisabled = isNA;

  const [noteValue, setNoteValue] = useState(entry.note || '');

  // Keep note in sync if the entry is replaced (e.g. after optimistic rollback)
  useEffect(() => {
    setNoteValue(entry.note || '');
  }, [entry.note]);

  const taOptions = allTAs.map(t => ({ value: t._id, label: t.name }));
  const assigneeIds = (entry.assignees || []).map(a => typeof a === 'object' ? a._id : a);

  const handleCheck = () => {
    if (isNA) return;
    const newStatus = isDone ? 'not_started' : 'done';
    onUpdate(entry._id, { status: newStatus });
  };

  const handleNA = () => {
    const newStatus = isNA ? 'not_started' : 'na';
    onUpdate(entry._id, { status: newStatus });
  };

  const handleAssigneesChange = (newIds) => {
    onUpdate(entry._id, { assignees: newIds });
  };

  const handleRemoveAssignee = (id) => {
    const newIds = assigneeIds.filter(a => a !== id);
    onUpdate(entry._id, { assignees: newIds });
  };

  const handleAssignedDateChange = (e) => {
    onUpdate(entry._id, { assignedDate: e.target.value || null });
  };

  const handleDoneDateChange = (e) => {
    onUpdate(entry._id, { doneDate: e.target.value || null });
  };

  const handleNoteBlur = () => {
    if (noteValue !== (entry.note || '')) {
      onUpdate(entry._id, { note: noteValue });
    }
  };

  const handleNoteKey = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const rowClass = [
    'st-strategy-row',
    isDone ? 'st-strategy-row--done' : '',
    isNA ? 'st-strategy-row--na' : '',
  ].filter(Boolean).join(' ');

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toISOString().split('T')[0];
  };

  return (
    <tr className={rowClass}>
      <td className="st-col-check">
        <button
          type="button"
          className={`st-checkbox ${isDone ? 'st-checkbox--checked' : ''}`}
          onClick={handleCheck}
          disabled={isDisabled}
          title={isDone ? 'Mark not started' : 'Mark done'}
        >
          {isDone && <CheckIcon />}
        </button>
      </td>
      <td className="st-col-name">
        <span className={isNA ? 'st-name-na' : ''}>{entry.strategy?.name || '—'}</span>
      </td>
      <td className="st-col-assignees">
        <div className="st-chips-row">
          {assigneeIds.map(id => {
            const ta = allTAs.find(t => t._id === id);
            if (!ta) return null;
            const chipStyle = ta.color
              ? { backgroundColor: TA_COLORS[ta.color]?.bg, color: TA_COLORS[ta.color]?.text }
              : undefined;
            return (
              <span key={id} className="st-chip" style={chipStyle}>
                {ta.name}
                <button
                  type="button"
                  className="st-chip-remove"
                  onClick={() => handleRemoveAssignee(id)}
                  title="Remove"
                >×</button>
              </span>
            );
          })}
          {!isNA && (
            <AssigneePicker
              values={assigneeIds}
              options={taOptions}
              onChange={handleAssigneesChange}
            />
          )}
        </div>
      </td>
      <td className="st-col-date">
        <input
          type="date"
          className="st-date-input"
          value={fmtDate(entry.assignedDate)}
          onChange={handleAssignedDateChange}
          disabled={isNA}
        />
      </td>
      <td className="st-col-date">
        <input
          type="date"
          className="st-date-input"
          value={fmtDate(entry.doneDate)}
          onChange={handleDoneDateChange}
          disabled={isNA}
        />
      </td>
      <td className="st-col-note">
        <input
          type="text"
          className="st-note-input"
          value={noteValue}
          onChange={e => setNoteValue(e.target.value)}
          onBlur={handleNoteBlur}
          onKeyDown={handleNoteKey}
          disabled={isNA}
          placeholder="Note…"
        />
      </td>
      <td className="st-col-na">
        <button
          type="button"
          className={`st-na-btn ${isNA ? 'st-na-btn--active' : ''}`}
          onClick={handleNA}
          title={isNA ? 'Un-mark N/A' : 'Mark N/A'}
        >
          N/A
        </button>
      </td>
    </tr>
  );
}

// ---- Expanded checklist panel ----
function PositionChecklist({ positionId, allTAs, strategies, queryClient }) {
  const {
    data: entries = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['strategyPositionEntries', positionId],
    queryFn: () => getPositionEntries(positionId).then(r => r.data),
  });

  const handleUpdate = async (entryId, body) => {
    // Optimistic update
    queryClient.setQueryData(['strategyPositionEntries', positionId], (prev = []) =>
      prev.map(e => {
        if (e._id !== entryId) return e;
        const updated = { ...e };

        if (body.status !== undefined) {
          const prevStatus = e.status;
          updated.status = body.status;

          if (body.status === 'done' && body.doneDate === undefined && !e.doneDate) {
            updated.doneDate = new Date().toISOString();
          }
          if (prevStatus === 'done' && body.status !== 'done' && body.doneDate === undefined) {
            updated.doneDate = null;
          }
        }

        if (body.assignees !== undefined) {
          updated.assignees = body.assignees.map(id => allTAs.find(t => t._id === id) || id);
          if (body.assignees.length > 0 && !e.assignedDate && body.assignedDate === undefined) {
            updated.assignedDate = new Date().toISOString();
          }
        }

        if (body.assignedDate !== undefined) updated.assignedDate = body.assignedDate;
        if (body.doneDate !== undefined) updated.doneDate = body.doneDate;
        if (body.note !== undefined) updated.note = body.note;

        return updated;
      })
    );

    try {
      const res = await updateEntry(entryId, body);
      queryClient.setQueryData(['strategyPositionEntries', positionId], (prev = []) =>
        prev.map(e => e._id === entryId ? res.data : e)
      );
      // Keep the list-level entries cache fresh
      queryClient.invalidateQueries(['strategyEntries']);
    } catch (err) {
      // Rollback
      queryClient.invalidateQueries(['strategyPositionEntries', positionId]);
      alert(err.response?.data?.error || 'Failed to save');
    }
  };

  if (isLoading) return <tr className="st-checklist-row"><td colSpan="7"><div className="st-loading">Loading…</div></td></tr>;
  if (isError) return <tr className="st-checklist-row"><td colSpan="7"><div className="st-error">Error: {error?.message}</div></td></tr>;

  return (
    <tr className="st-checklist-row">
      <td colSpan="7" className="st-checklist-td">
        <div className="st-checklist-inner">
          <table className="st-checklist-table">
            <thead>
              <tr>
                <th className="st-col-check"></th>
                <th className="st-col-name">Strategy</th>
                <th className="st-col-assignees">Done by</th>
                <th className="st-col-date">Date Assigned</th>
                <th className="st-col-date">Date Done</th>
                <th className="st-col-note">Note</th>
                <th className="st-col-na"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <StrategyRow
                  key={entry._id}
                  entry={entry}
                  allTAs={allTAs}
                  onUpdate={handleUpdate}
                />
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ---- Filter dropdown ----
function FilterDropdown({ value, options, onChange, placeholder }) {
  return (
    <select
      className="st-filter-select"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ---- Main StrategyTracker component ----
function StrategyTracker() {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [strategyStatusFilter, setStrategyStatusFilter] = useState(''); // '' | 'not_done' | 'done'
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [showPlacedLost, setShowPlacedLost] = useState(false);

  // Expanded row
  const [expandedPositionId, setExpandedPositionId] = useState(null);

  // Data fetching
  const { data: positions = [], isLoading: posLoading, isError: posError } = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions().then(r => r.data),
  });

  const { data: allTAs = [], isLoading: taLoading } = useQuery({
    queryKey: ['activeTAs'],
    queryFn: () => getActiveTAs().then(r => r.data),
  });

  const { data: strategies = [], isLoading: stratLoading } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => getStrategies().then(r => r.data),
  });

  const { data: allEntries = [] } = useQuery({
    queryKey: ['strategyEntries'],
    queryFn: () => getEntries().then(r => r.data),
  });

  const isLoading = posLoading || taLoading || stratLoading;

  // Build a lookup: positionId -> { done, applicable }
  const progressMap = {};
  if (strategies.length > 0 && allEntries.length > 0) {
    for (const entry of allEntries) {
      const posId = typeof entry.position === 'object' ? entry.position._id : entry.position;
      if (!progressMap[posId]) progressMap[posId] = { done: 0, applicable: 0, entriesByStrategy: {} };
      const stratId = typeof entry.strategy === 'object' ? entry.strategy._id : entry.strategy;
      progressMap[posId].entriesByStrategy[stratId] = entry;
    }
    // Calculate done/applicable for each position
    for (const posId of Object.keys(progressMap)) {
      let done = 0;
      let applicable = 0;
      for (const strat of strategies) {
        const entry = progressMap[posId].entriesByStrategy[strat._id];
        if (!entry || entry.status !== 'na') {
          applicable++;
          if (entry && entry.status === 'done') done++;
        }
      }
      progressMap[posId].done = done;
      progressMap[posId].applicable = applicable;
    }
  }

  // For positions with no entries at all
  const getProgress = (posId) => {
    if (progressMap[posId]) return progressMap[posId];
    return { done: 0, applicable: strategies.length };
  };

  // Sorted positions (client then position)
  const sortedPositions = [...positions].sort((a, b) => {
    const ca = (a.client?.clientName || '').toLowerCase();
    const cb = (b.client?.clientName || '').toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb);
    return (a.position || '').localeCompare(b.position || '');
  });

  // Filtered positions
  const filteredPositions = sortedPositions.filter(pos => {
    // Placed/Lost filter
    if (!showPlacedLost && (pos.status === 'Placed' || pos.status === 'Lost')) return false;

    // Word-based search (client / position / JO id)
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const matchesSearch = words.length === 0 || words.every(w =>
      (pos.jobOrderId || '').toLowerCase().includes(w) ||
      (pos.position || '').toLowerCase().includes(w) ||
      (pos.client?.clientName || '').toLowerCase().includes(w)
    );
    if (!matchesSearch) return false;

    // Person filter: in position's assignee OR parallelAssignees OR in any strategy entry's assignees
    if (personFilter) {
      const inPrimary = pos.assignee?._id === personFilter || pos.assignee === personFilter;
      const inParallel = (pos.parallelAssignees || []).some(p =>
        (typeof p === 'object' ? p._id : p) === personFilter
      );
      const posId = pos._id;
      const inStrategy = (allEntries || []).some(e => {
        const ePos = typeof e.position === 'object' ? e.position._id : e.position;
        if (ePos !== posId) return false;
        return (e.assignees || []).some(a =>
          (typeof a === 'object' ? a._id : a) === personFilter
        );
      });
      if (!inPrimary && !inParallel && !inStrategy) return false;
    }

    // Strategy + status filter
    if (strategyFilter) {
      const posId = pos._id;
      const entry = (allEntries || []).find(e => {
        const ePos = typeof e.position === 'object' ? e.position._id : e.position;
        const eStrat = typeof e.strategy === 'object' ? e.strategy._id : e.strategy;
        return ePos === posId && eStrat === strategyFilter;
      });
      if (strategyStatusFilter === 'done') {
        if (!entry || entry.status !== 'done') return false;
      } else if (strategyStatusFilter === 'not_done') {
        // not_started or in_progress
        if (entry && entry.status === 'done') return false;
        if (entry && entry.status === 'na') return false;
      }
      // strategyStatusFilter === '' means "any status for this strategy" – still show row
    }

    // Incomplete only
    if (incompleteOnly) {
      const { done, applicable } = getProgress(pos._id);
      if (done >= applicable) return false;
    }

    return true;
  });

  const taOptions = allTAs.map(t => ({ value: t._id, label: t.name }));
  const strategyOptions = strategies.map(s => ({ value: s._id, label: s.name }));

  const hasFilters = search || personFilter || strategyFilter || strategyStatusFilter || incompleteOnly;

  const clearFilters = () => {
    setSearch('');
    setPersonFilter('');
    setStrategyFilter('');
    setStrategyStatusFilter('');
    setIncompleteOnly(false);
  };

  const toggleExpand = (posId) => {
    setExpandedPositionId(prev => (prev === posId ? null : posId));
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString();
  };

  if (isLoading) return <div className="st-page-loading">Loading strategies…</div>;
  if (posError) return <div className="st-page-error">Error loading positions</div>;

  return (
    <div className="st-page">
      <div className="st-header">
        <h1>Strategies</h1>
        <div className="st-header-right">
          <label className="st-checkbox-label">
            <input
              type="checkbox"
              checked={showPlacedLost}
              onChange={e => setShowPlacedLost(e.target.checked)}
            />
            Show Placed / Lost
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="st-filters-bar">
        <input
          type="text"
          className="st-filter-search"
          placeholder="Search by JO ID, position, client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="st-filters-group">
          <FilterDropdown
            value={personFilter}
            options={taOptions}
            onChange={setPersonFilter}
            placeholder="Person: All"
          />
          <FilterDropdown
            value={strategyFilter}
            options={strategyOptions}
            onChange={setStrategyFilter}
            placeholder="Strategy: All"
          />
          {strategyFilter && (
            <FilterDropdown
              value={strategyStatusFilter}
              options={[
                { value: 'not_done', label: 'Not done' },
                { value: 'done', label: 'Done' },
              ]}
              onChange={setStrategyStatusFilter}
              placeholder="Status: Any"
            />
          )}
          <label className="st-checkbox-label">
            <input
              type="checkbox"
              checked={incompleteOnly}
              onChange={e => setIncompleteOnly(e.target.checked)}
            />
            Incomplete only
          </label>
          {hasFilters && (
            <button type="button" className="clear-filters-btn" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="st-table-wrapper">
        <table className="st-table">
          <thead>
            <tr>
              <th className="st-th-expand"></th>
              <th>Client</th>
              <th>Position</th>
              <th>Date Assigned</th>
              <th>Assignee</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.length === 0 ? (
              <tr>
                <td colSpan="6" className="st-empty">No positions found</td>
              </tr>
            ) : (
              filteredPositions.map(pos => {
                const isExpanded = expandedPositionId === pos._id;
                const { done, applicable } = getProgress(pos._id);
                const pct = applicable > 0 ? Math.round((done / applicable) * 100) : 0;
                const assigneeName = pos.assignee?.name || '—';

                return [
                  <tr
                    key={pos._id}
                    className={`st-row ${isExpanded ? 'st-row--expanded' : ''}`}
                    onClick={() => toggleExpand(pos._id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="st-td-expand">
                      <ChevronIcon open={isExpanded} />
                    </td>
                    <td className="st-td-client">
                      <span className="st-uppercase">{pos.client?.clientName || '—'}</span>
                    </td>
                    <td className="st-td-position">
                      <span className="st-uppercase">{pos.position}</span>
                    </td>
                    <td className="st-td-date">{fmtDate(pos.dateAssigned)}</td>
                    <td className="st-td-assignee">{assigneeName}</td>
                    <td className="st-td-progress">
                      <div className="st-progress-wrap">
                        <span className="st-progress-text">{done} / {applicable}</span>
                        <div className="st-progress-bar-track">
                          <div
                            className="st-progress-bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>,
                  isExpanded && (
                    <PositionChecklist
                      key={`cl-${pos._id}`}
                      positionId={pos._id}
                      allTAs={allTAs}
                      strategies={strategies}
                      queryClient={queryClient}
                    />
                  )
                ];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StrategyTracker;
