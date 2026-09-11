import { useState, useCallback, useRef, useLayoutEffect, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPositions, assignPosition, setFlagOverride, updatePosition } from '../api/positions';
import { getArchiveSnapshots, getArchiveSnapshot } from '../api/archive';
import { getActiveTAs } from '../api/tas';
import { getWeeklyAllocationsBatch, updateWeeklyAllocationCell, setLeaveBulk } from '../api/weeklyAllocations';
import './TABoard.css';
import { useLiveRefresh } from '../hooks/useLiveRefresh';

// ---- CONSTANTS ----
const PLEVEL_ORDER = ['P1', 'P2', 'P3', 'P4', 'P5'];
const CARD_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const FLAG_META = {
  followUp: { label: 'Follow up' },
  addOn: { label: 'Add-on' },
  backup: { label: 'Backup' },
  goingGood: { label: 'Going good' },
  reAssign: { label: 'Re-assign' },
};
const ACTION_ORDER = Object.keys(FLAG_META);

// ---- HELPERS ----
function flagChipStyle(flag) {
  if (!flag) return { background: 'var(--color-bg)', color: 'var(--color-text-muted)' };
  const c = `var(--flag-${flag.color})`;
  return { background: `color-mix(in srgb, ${c} 14%, white)`, color: c };
}

const ROLE_PALETTE = ['--flag-red', '--flag-yellow', '--flag-green', '--flag-orange', '--flag-purple', '--role-blue', '--role-teal', '--role-neutral'];
function roleChipStyle(title) {
  if (!title) return { background: 'var(--color-bg)', color: 'var(--color-text-muted)' };
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  const varName = ROLE_PALETTE[hash % ROLE_PALETTE.length];
  const c = `var(${varName})`;
  return { background: `color-mix(in srgb, ${c} 16%, white)`, color: c };
}

// ===== UTC DATE HELPERS =====
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function getMonthWeeks(year, monthIndex) {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
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
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + (i === 0 ? ' . Current' : ''),
    });
  }
  return options;
}

const MONTH_OPTIONS = buildMonthOptions();
const CURRENT_MONTH_IDX = 6;

const TODAY = new Date();
const TODAY_ISO = toISODate(TODAY);
const CURRENT_REAL_WEEK = {
  weekStart: toISODate(getMondayOfWeek(TODAY)),
  weekEnd: toISODate(addDays(getMondayOfWeek(TODAY), 6)),
};

// ---- SUB-COMPONENTS ----

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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// ---- Popover (portal) ----
function Popover({ anchorRef, isOpen, onClose, children, width = 290 }) {
  const [style, setStyle] = useState(null);
  const popoverRef = useRef(null);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    const maxLeft = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    if (left > maxLeft) left = maxLeft;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDownward = true;
    let top = null;
    let bottom = null;
    let maxHeight = 320;

    if (openDownward) {
      top = rect.bottom + margin;
      const available = window.innerHeight - top - margin;
      maxHeight = Math.min(320, Math.max(180, available));
    } else {
      bottom = window.innerHeight - rect.top + margin;
      const available = rect.top - margin;
      maxHeight = Math.min(320, Math.max(180, available));
    }

    const newStyle = {
      position: 'fixed',
      left,
      width,
      minHeight: 180,
      maxHeight: maxHeight,
      overflowY: 'auto',
      ...(top !== null ? { top } : { bottom }),
    };
    setStyle(newStyle);
  }, [isOpen, anchorRef, width]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen || !style) return null;

  return createPortal(
    <div className="cell-popover" style={style} ref={popoverRef} onClick={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
}

// ---- Position Detail Modal (duplicated for now) ----
function PositionDetailModal({ position, onClose, onUpdate, tas }) {
  const [editData, setEditData] = useState({
    remarks: '',
    thisWeekFocus: '',
    allocationRounds: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (position) {
      setEditData({
        remarks: position.remarks || '',
        thisWeekFocus: position.thisWeekFocus || '',
        allocationRounds: position.allocationRounds || [],
      });
    }
  }, [position]);

  if (!position) return null;

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        remarks: editData.remarks || '',
        thisWeekFocus: editData.thisWeekFocus || '',
      };
      await updatePosition(position._id, payload);
      await onUpdate();
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const historyRounds = [...(editData.allocationRounds || [])]
    .sort((a, b) => new Date(b.dateAssigned) - new Date(a.dateAssigned))
    .slice(0, 5);

  const primaryName = position.assignee?.name || 'Unassigned';
  const parallelNames = (position.parallelAssignees || []).map(ta => ta.name).join(', ');
  const assigneeDisplay = parallelNames ? `${primaryName} (parallel: ${parallelNames})` : primaryName;

  const CloseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal modal-lg pos-detail-modal"
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      >
        <div className="modal-header">
          <h2>{position.jobOrderId}</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-summary">
            <div className="modal-summary-item">
              <span className="modal-summary-label">Position</span>
              <span className="modal-summary-value">{position.position}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Client</span>
              <span className="modal-summary-value">{position.client?.clientName || '—'}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Status</span>
              <span className="modal-summary-value">{position.status}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Assignee(s)</span>
              <span className="modal-summary-value">{assigneeDisplay}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Level</span>
              <span className="modal-summary-value">{position.pLevel}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Stage</span>
              <span className="modal-summary-value">{position.pipelineStage}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Shortlist (Int/Ext)</span>
              <span className="modal-summary-value">{position.lsCount ?? '—'} / {position.cvCount ?? '—'}</span>
            </div>
          </div>

          <div className="modal-editable">
            <div className="modal-field">
              <label>This Week Focus</label>
              <input
                type="text"
                value={editData.thisWeekFocus}
                onChange={e => handleChange('thisWeekFocus', e.target.value)}
                className="modal-input"
                placeholder="e.g., Schedule interviews, Review CVs..."
              />
            </div>
            <div className="modal-field">
              <label>Remarks</label>
              <textarea
                value={editData.remarks}
                onChange={e => handleChange('remarks', e.target.value)}
                className="modal-textarea"
                rows="4"
                placeholder="Add any notes or remarks about this position..."
              />
            </div>
          </div>

          <div className="modal-history">
            <h4>Allocation History</h4>
            {historyRounds.length === 0 ? (
              <p className="modal-history-empty">No allocation history yet</p>
            ) : (
              <table className="modal-history-table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Value</th>
                    <th>Date</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRounds.map((round, idx) => (
                    <tr key={idx}>
                      <td className="col-round">Round {round.roundNumber}</td>
                      <td className="col-value">{round.taAssigned?.name || '—'}</td>
                      <td className="col-date">
                        {round.dateAssigned ? new Date(round.dateAssigned).toLocaleDateString() : '—'}
                      </td>
                      <td className="col-notes">{round.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {historyRounds.length === 5 && (editData.allocationRounds?.length || 0) > 5 && (
              <p className="modal-history-more">
                + {(editData.allocationRounds?.length || 0) - 5} more rounds
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---- Leave / Holiday Modal ----
function LeaveModal({ tas, onClose, onSave, saving }) {
  const [selectedTAs, setSelectedTAs] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState('leave');

  const allSelected = selectedTAs.length === tas.length && tas.length > 0;
  const toggleTA = (id) =>
    setSelectedTAs(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const toggleAll = () => setSelectedTAs(allSelected ? [] : tas.map(t => t._id));

  const canSave = selectedTAs.length > 0 && startDate && endDate && startDate <= endDate;

  const CloseIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="modal"
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      >
        <div className="modal-header">
          <h2>Mark Leave / Holiday</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-field">
            <label>Type</label>
            <div className="leave-type-toggle">
              <button
                type="button"
                className={leaveType === 'leave' ? 'active' : ''}
                onClick={() => setLeaveType('leave')}
              >
                Leave
              </button>
              <button
                type="button"
                className={leaveType === 'holiday' ? 'active' : ''}
                onClick={() => setLeaveType('holiday')}
              >
                Holiday
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label>Team members {leaveType === 'holiday' ? '(use "Select all" for a common holiday)' : ''}</label>
            <button
              type="button"
              className="cell-popover-option cell-popover-option--simple"
              onClick={toggleAll}
            >
              <span className="cpo-check">{allSelected && <CheckIcon />}</span>
              <span className="cpo-text">Select all</span>
            </button>
            <div className="leave-ta-list">
              {tas.map(ta => (
                <button
                  type="button"
                  key={ta._id}
                  className="cell-popover-option cell-popover-option--simple"
                  onClick={() => toggleTA(ta._id)}
                >
                  <span className="cpo-check">{selectedTAs.includes(ta._id) && <CheckIcon />}</span>
                  <span className="cpo-text">{ta.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="modal-field-row">
            <div className="modal-field">
              <label>From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="modal-field">
              <label>To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!canSave || saving}
            onClick={() => onSave({ taIds: selectedTAs, startDate, endDate, leaveType })}
          >
            {saving ? 'Saving...' : 'Apply'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---- PositionPool (unchanged) ----
function PositionPool({ positions, navigate, onPositionClick }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = positions.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const clientA = (a.client?.clientName || '').toLowerCase();
    const clientB = (b.client?.clientName || '').toLowerCase();
    if (clientA !== clientB) return clientA.localeCompare(clientB);
    return (a.position || '').localeCompare(b.position || '');
  });

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
            <div
              key={pos._id}
              className="pool-card"
              role="button"
              tabIndex={0}
              onClick={() => onPositionClick(pos)}
              onKeyDown={e => e.key === 'Enter' && onPositionClick(pos)}
            >
              <div className="pool-card-top">
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

// ---- PackageTooltip (portal-based, hover + focus, auto-flip) ----
function PackageTooltip({ anchorRef, visible, packageRange }) {
  const [style, setStyle] = useState(null);
  const [placement, setPlacement] = useState('top');
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) { setStyle(null); return; }
    const rect = anchorRef.current.getBoundingClientRect();
    const TOOLTIP_HEIGHT = 44;
    const ARROW_SIZE = 7;
    const GAP = 6;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceAbove >= TOOLTIP_HEIGHT + ARROW_SIZE + GAP || spaceAbove > spaceBelow;

    // Horizontal centering, clamped to viewport
    const centreX = rect.left + rect.width / 2;
    const TOOLTIP_W = 200;
    let left = centreX - TOOLTIP_W / 2;
    const MARGIN = 8;
    if (left < MARGIN) left = MARGIN;
    if (left + TOOLTIP_W > window.innerWidth - MARGIN) left = window.innerWidth - TOOLTIP_W - MARGIN;

    // Arrow offset relative to tooltip
    const arrowLeft = Math.max(12, Math.min(centreX - left - 6, TOOLTIP_W - 24));

    setPlacement(placeAbove ? 'top' : 'bottom');
    setStyle({
      position: 'fixed',
      left,
      width: TOOLTIP_W,
      '--pkg-arrow-left': `${arrowLeft}px`,
      ...(placeAbove
        ? { top: rect.top - GAP - ARROW_SIZE }
        : { top: rect.bottom + GAP + ARROW_SIZE }),
    });
  }, [visible, anchorRef]);

  if (!visible || !style) return null;

  const label = packageRange && packageRange.trim() ? packageRange.trim() : 'Package: Not specified';

  return createPortal(
    <div
      ref={tooltipRef}
      className={`pkg-tooltip pkg-tooltip--${placement}`}
      style={style}
      role="tooltip"
    >
      <span className="pkg-tooltip-label">Package</span>
      <span className="pkg-tooltip-value">{label}</span>
    </div>,
    document.body
  );
}

// ---- GridCell (with hover state + leave/holiday support) ----
function GridCell({ dayCell, positions, isOpen, onToggle, onSelect, onSetLeave, weekStart, taId, day }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const triggerRef = useRef(null);
  const tooltipTimerRef = useRef(null);

  const position = dayCell?.position || null;
  const leave = dayCell?.leave?.type ? dayCell.leave : null;

  const showTooltip = useCallback(() => {
    clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => setTooltipVisible(true), 220);
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimeout(tooltipTimerRef.current);
    setTooltipVisible(false);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(tooltipTimerRef.current), []);

  const filtered = positions.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
  });

  const sorted = filtered.slice().sort((a, b) => {
    const clientA = (a.client?.clientName || '').toLowerCase();
    const clientB = (b.client?.clientName || '').toLowerCase();
    if (clientA !== clientB) return clientA.localeCompare(clientB);
    return (a.position || '').localeCompare(b.position || '');
  });

  // ---- On leave / holiday: show badge, no assignment allowed ----
  if (leave) {
    return (
      <div className="grid-cell-wrap">
        <button
          ref={triggerRef}
          className={`grid-pill grid-pill-leave grid-pill-leave--${leave.type}`}
          onClick={onToggle}
        >
          {leave.type === 'holiday' ? 'Holiday' : 'Leave'}
        </button>
        <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggle} width={200}>
          <p className="popover-heading">{leave.type === 'holiday' ? 'Holiday' : 'On leave'}</p>
          <button
            className="cell-popover-option cell-popover-option--simple cell-popover-danger"
            onClick={() => { onSetLeave(null); onToggle(); }}
          >
            <span className="cpo-text">Clear {leave.type === 'holiday' ? 'holiday' : 'leave'}</span>
          </button>
        </Popover>
      </div>
    );
  }

  return (
    <div className="grid-cell-wrap">
      {position ? (
        <>
          <button
            ref={triggerRef}
            className="grid-pill"
            style={roleChipStyle(position.position)}
            onClick={onToggle}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
            aria-describedby="pkg-tooltip"
          >
            {position.client?.clientName || '—'} — {position.position}
          </button>
          <PackageTooltip
            anchorRef={triggerRef}
            visible={tooltipVisible && !isOpen}
            packageRange={position.packageRange}
          />
        </>
      ) : (
        <button ref={triggerRef} className="grid-pill grid-pill-empty" onClick={() => { onToggle(); }}>
          + Assign
        </button>
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
        {sorted.map(p => {
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
        {sorted.length === 0 && (
          <div className="popover-empty">No positions available</div>
        )}
        <div className="popover-divider" />
        <button className="cell-popover-option cell-popover-option--simple" onClick={() => onSetLeave('leave')}>
          <span className="cpo-text">Mark as Leave</span>
        </button>
        <button className="cell-popover-option cell-popover-option--simple" onClick={() => onSetLeave('holiday')}>
          <span className="cpo-text">Mark as Holiday</span>
        </button>
      </Popover>
    </div>
  );
}

// ---- TACard (passes weekStart, dayCell, onSetLeave) ----
function TACard({ ta, displayWeeks, activeColumnIndex, getCell, positions, openCellKey, onCellToggle, onSelectCell, onSetCellLeave, navigate, workloadCount }) {
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
                const dayCell = getCell(ta._id, w.weekStart, day);
                const isCurrentWeek = idx === activeColumnIndex;
                const cellKey = `${String(ta._id)}|${w.weekStart}|${day}`;

                return (
                  <div key={cellKey} className={`ta-grid-cell ${isCurrentWeek ? 'ta-grid-cell--active' : ''}`}>
                    <GridCell
                      dayCell={dayCell}
                      positions={positions}
                      isOpen={openCellKey === cellKey}
                      onToggle={() => onCellToggle(cellKey)}
                      onSelect={(newId) => onSelectCell(ta._id, w.weekStart, day, newId)}
                      onSetLeave={(leaveType) => onSetCellLeave(ta._id, w.weekStart, day, leaveType)}
                      weekStart={w.weekStart}
                      taId={ta._id}
                      day={day}
                    />
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

// ---- Action Board subcomponents ----
function isOnPosition(position, taId) {
  return (
    position.assignee?._id === taId ||
    (position.parallelAssignees || []).some(pa => pa._id === taId)
  );
}

function ReassignChip({ p, flagKey, ta, tas, onReassign, onToggleFlag, isOpen, onToggleOpen }) {
  const triggerRef = useRef(null);
  return (
    <div className="ab-chip-wrap">
      <button
        ref={triggerRef}
        className="ab-chip ab-chip-btn"
        style={flagChipStyle(p.flags[flagKey])}
        onClick={onToggleOpen}
      >
        {p.client?.clientName || '—'} — {p.position}
        {p.flags[flagKey].manual && <span className="ab-manual-dot" title="Manually set" />}
      </button>
      <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggleOpen} width={220}>
        <p className="popover-heading">Reassign to</p>
        {tas.filter(t => t._id !== ta._id).map(t => (
          <button
            key={t._id}
            className="cell-popover-option cell-popover-option--simple"
            onClick={() => {
              onReassign(p._id, t._id);
              onToggleOpen();
            }}
          >
            <span className="cpo-text">{t.name}</span>
          </button>
        ))}
        <div className="popover-divider" />
        <button
          className="cell-popover-option cell-popover-option--simple cell-popover-danger"
          onClick={() => {
            onToggleFlag(p._id, flagKey, 'off');
            onToggleOpen();
          }}
        >
          <span className="cpo-text">Remove flag (manual off)</span>
        </button>
      </Popover>
    </div>
  );
}

function AddPositionButton({
  ta,
  flagKey,
  candidates,
  matchesCount,
  onReassign,
  onToggleFlag,
  isOpen,
  onToggleOpen,
  searchTerm,
  onSearchChange,
}) {
  const triggerRef = useRef(null);
  const filtered = candidates.filter(p => {
    const term = searchTerm.toLowerCase();
    return (
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
  });

  const sorted = filtered.slice().sort((a, b) => {
    const clientA = (a.client?.clientName || '').toLowerCase();
    const clientB = (b.client?.clientName || '').toLowerCase();
    if (clientA !== clientB) return clientA.localeCompare(clientB);
    return (a.position || '').localeCompare(b.position || '');
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
        {sorted.slice(0, 30).map(p => (
          <button
            key={p._id}
            className="cell-popover-option"
            onClick={() => {
              // If the position is not already assigned to this TA, reassign it (primary)
              if (!isOnPosition(p, ta._id)) {
                onReassign(p._id, ta._id);
              }
              // Then turn the flag on
              onToggleFlag(p._id, flagKey, 'on');
              onToggleOpen();
            }}
          >
            <span className="cpo-check" />
            <span className={`cpo-level cpo-level--${p.pLevel}`}>{p.pLevel}</span>
            <span className="cpo-text">
              <span className="cpo-client">{p.client?.clientName || '—'}</span>
              <span className="cpo-position">{p.position}</span>
            </span>
          </button>
        ))}
        {sorted.length === 0 && <div className="popover-empty">No positions match</div>}
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

  const isActionable = (flagKey, flag) => {
    if (!flag) return false;
    if (flagKey === 'reAssign') return flag.label === 'Reassign';
    return true;
  };

  return (
    <div className="action-board-wrap">
      <div className="action-board">
        <div
          className="ab-row ab-header-row"
          style={{ gridTemplateColumns: `140px repeat(${tas.length}, minmax(140px, 1fr))` }}
        >
          <div className="ab-label-col" />
          {tas.map(ta => (
            <div className="ab-col-header" key={ta._id}>
              {ta.name}
              <span className="ab-col-count">{workloadByTA[ta._id] ?? 0}</span>
            </div>
          ))}
        </div>

        {ACTION_ORDER.map(flagKey => (
          <div
            className="ab-row"
            key={flagKey}
            style={{ gridTemplateColumns: `140px repeat(${tas.length}, minmax(140px, 1fr))` }}
          >
            <div className="ab-label-col">{FLAG_META[flagKey].label}</div>
            {tas.map(ta => {
              // Matches: positions where this TA is on the position (primary or parallel) AND has the flag
              const matches = positions.filter(
                p => isOnPosition(p, ta._id) && isActionable(flagKey, p.flags?.[flagKey])
              );
              const cellKey = `cell|${flagKey}|${ta._id}`;
              // Candidates: positions not on this TA (so they can be assigned)
              const candidates = positions.filter(p => !isOnPosition(p, ta._id));

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

// ---- MAIN TABoard COMPONENT ----
function TABoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useLiveRefresh();

  const [activeView, setActiveView] = useState('grid');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(CURRENT_MONTH_IDX);
  const [openCellKey, setOpenCellKey] = useState(null);
  const [poolModalPosition, setPoolModalPosition] = useState(null);
  const [carriedForward, setCarriedForward] = useState(0);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);

  const selectedMonth = MONTH_OPTIONS[selectedMonthIdx];
  const displayWeeks = getMonthWeeks(selectedMonth.year, selectedMonth.monthIndex);
  const activeColumnIndex = displayWeeks.findIndex(w => TODAY_ISO >= w.weekStart && TODAY_ISO <= w.weekEnd);
  const isActiveVisible = activeColumnIndex !== -1;

  // ---- Queries ----
  const {
    data: positions = [],
    isLoading: positionsLoading,
    error: positionsError,
  } = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions().then(res => res.data),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: snapshots = [],
    isLoading: snapshotsLoading,
    error: snapshotsError,
  } = useQuery({
    queryKey: ['archiveSnapshots'],
    queryFn: () => getArchiveSnapshots().then(res => res.data),
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: tas = [],
    isLoading: tasLoading,
    error: tasError,
  } = useQuery({
    queryKey: ['activeTAs'],
    queryFn: () => getActiveTAs().then(res => res.data),
    staleTime: 2 * 60 * 1000,
  });

  const batchStart = displayWeeks.length > 0 ? displayWeeks[0].weekStart : null;
  const batchEnd = displayWeeks.length > 0 ? displayWeeks[displayWeeks.length - 1].weekEnd : null;

  const {
    data: batchGrids = [],
    isLoading: gridLoading,
    error: gridError,
  } = useQuery({
    queryKey: ['weeklyAllocations', selectedMonthIdx, batchStart, batchEnd],
    queryFn: () => getWeeklyAllocationsBatch(batchStart, batchEnd, Date.now()).then(res => res.data),
    enabled: !!positions.length && !!tas.length && displayWeeks.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const gridsByWeek = useMemo(() => {
    const map = {};
    batchGrids.forEach(({ weekStart, grid }) => {
      map[weekStart] = grid;
    });
    return map;
  }, [batchGrids]);

  // Carried Forward
  useQuery({
    queryKey: ['carriedForward', selectedMonthIdx, snapshots, positions],
    queryFn: async () => {
      if (!snapshots.length || !positions.length) return 0;
      const selectedStart = new Date(displayWeeks[0].weekStart);
      const prev = snapshots
        .filter(s => new Date(s.weekStart) < selectedStart)
        .sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart))[0];
      if (!prev) return 0;
      const res = await getArchiveSnapshot(prev._id);
      const openIds = new Set(
        positions.filter(p => !['Placed', 'Lost'].includes(p.status)).map(p => String(p._id))
      );
      const count = res.data.snapshot.filter(
        item =>
          !['Placed', 'Lost'].includes(item.status) &&
          item.positionId &&
          openIds.has(String(item.positionId))
      ).length;
      return count;
    },
    enabled: !!snapshots.length && !!positions.length && displayWeeks.length > 0,
    onSuccess: data => setCarriedForward(data),
  });

  // ---- Mutations ----
  const updateCellMutation = useMutation({
    mutationFn: ({ taId, weekStart, day, positionId, leaveType }) =>
      updateWeeklyAllocationCell(taId, weekStart, { day, positionId, leaveType }),
    onSuccess: () => {
      queryClient.invalidateQueries(['weeklyAllocations', selectedMonthIdx]);
    },
  });

  const toggleFlagMutation = useMutation({
    mutationFn: ({ positionId, flagKey, mode }) => setFlagOverride(positionId, flagKey, mode),
    onSuccess: () => {
      queryClient.invalidateQueries(['positions']);
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({ positionId, newTaId }) =>
      assignPosition(positionId, newTaId, 'Reassigned from Action Board'),
    onSuccess: () => {
      queryClient.invalidateQueries(['positions']);
    },
  });

  const leaveBulkMutation = useMutation({
    mutationFn: ({ taIds, startDate, endDate, leaveType }) =>
      setLeaveBulk(taIds, startDate, endDate, leaveType),
    onSuccess: () => {
      queryClient.invalidateQueries(['weeklyAllocations']);
      setLeaveModalOpen(false);
    },
  });

  // ---- Derived data ----
  const byId = useMemo(() => Object.fromEntries(positions.map(p => [p._id, p])), [positions]);

  // workloadByTA: count primary + parallel open positions
  const workloadByTA = useMemo(() => {
    const acc = {};
    tas.forEach(ta => {
      const primary = positions.filter(
        p => p.assignee?._id === ta._id && !['Placed', 'Lost'].includes(p.status)
      ).length;
      const parallel = positions.filter(
        p =>
          p.parallelAssignees?.some(pa => pa._id === ta._id) &&
          !['Placed', 'Lost'].includes(p.status)
      ).length;
      acc[ta._id] = primary + parallel;
    });
    return acc;
  }, [tas, positions]);

  const getCell = useCallback(
    (taId, weekStart, day) => {
      const weekGrid = gridsByWeek[weekStart];
      if (!weekGrid) return null;
      const row = weekGrid.find(r => String(r.ta._id) === String(taId));
      return row?.days?.[day] || null;
    },
    [gridsByWeek]
  );

  // ---- Handlers ----
  const handleCellSelect = async (taId, weekStart, day, newPositionId) => {
    const newPosObj = newPositionId ? byId[newPositionId] : null;

    // Optimistic update – use the passed weekStart
    queryClient.setQueryData(['weeklyAllocations', selectedMonthIdx], old => {
      if (!old) return old;
      return old.map(week => {
        if (week.weekStart !== weekStart) return week;
        const updatedGrid = week.grid.map(row => {
          if (String(row.ta._id) !== String(taId)) return row;
          return {
            ...row,
            days: {
              ...row.days,
              [day]: { ...row.days[day], position: newPosObj },
            },
          };
        });
        return { ...week, grid: updatedGrid };
      });
    });

    setOpenCellKey(null);
    try {
      await updateCellMutation.mutateAsync({
        taId,
        weekStart,
        day,
        positionId: newPositionId || null,
      });
    } catch (err) {
      queryClient.invalidateQueries(['weeklyAllocations', selectedMonthIdx]);
      alert(err.response?.data?.error || 'Failed to update cell');
    }
  };

  const handleCellSetLeave = async (taId, weekStart, day, leaveType) => {
    // Optimistic update
    queryClient.setQueryData(['weeklyAllocations', selectedMonthIdx], old => {
      if (!old) return old;
      return old.map(week => {
        if (week.weekStart !== weekStart) return week;
        const updatedGrid = week.grid.map(row => {
          if (String(row.ta._id) !== String(taId)) return row;
          return {
            ...row,
            days: {
              ...row.days,
              [day]: {
                ...row.days[day],
                leave: leaveType ? { type: leaveType } : null,
                position: leaveType ? null : row.days[day].position,
              },
            },
          };
        });
        return { ...week, grid: updatedGrid };
      });
    });

    setOpenCellKey(null);
    try {
      await updateCellMutation.mutateAsync({ taId, weekStart, day, leaveType });
    } catch (err) {
      queryClient.invalidateQueries(['weeklyAllocations', selectedMonthIdx]);
      alert(err.response?.data?.error || 'Failed to update leave');
    }
  };

  const handleToggleFlag = (positionId, flagKey, mode) => {
    toggleFlagMutation.mutate({ positionId, flagKey, mode });
  };

  const handleReassign = (positionId, newTaId) => {
    reassignMutation.mutate({ positionId, newTaId });
  };

  const handleSaveLeave = (payload) => {
    leaveBulkMutation.mutate(payload);
  };

  const refreshPositions = () => {
    queryClient.invalidateQueries(['positions']);
  };

  const taList = useMemo(() => {
    const source =
      displayWeeks.map(w => gridsByWeek[w.weekStart]).find(g => g && g.length > 0) || [];
    return source.map(row => row.ta);
  }, [displayWeeks, gridsByWeek]);

  // ---- Loading / error ----
  const loading = positionsLoading || snapshotsLoading || tasLoading;
  const error = positionsError || snapshotsError || tasError || gridError;

  if (loading) return <div className="taboard-loading">Loading TA Board...</div>;
  if (error) return <div className="taboard-error">Error: {error.message}</div>;

  // ---- Stats ----
  const openPositions = positions.filter(p => !['Placed', 'Lost'].includes(p.status));
  const active = positions.filter(p => p.status === 'A&P').length;
  const yetToActivate = positions.filter(p => p.status === 'Yet to Activate').length;
  const fence = positions.filter(p => p.status === 'Fence').length;
  const reassign = positions.filter(p => p.flags?.reAssign?.label === 'Reassign').length;

  // ---- Render ----
  return (
    <div className="taboard-page">
      <div className="taboard-header">
        <h1>TA Board</h1>
        <div className="taboard-controls">
          <div className="view-toggle">
            <button
              className={activeView === 'grid' ? 'toggle-btn toggle-btn-active' : 'toggle-btn'}
              onClick={() => setActiveView('grid')}
            >
              Weekly grid
            </button>
            <button
              className={activeView === 'action' ? 'toggle-btn toggle-btn-active' : 'toggle-btn'}
              onClick={() => setActiveView('action')}
            >
              Action board
            </button>
          </div>
          <button className="toggle-btn" onClick={() => setLeaveModalOpen(true)}>
            Mark Leave / Holiday
          </button>
          {activeView === 'grid' && (
            <select
              className="week-select"
              value={selectedMonthIdx}
              onChange={e => setSelectedMonthIdx(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map((m, i) => (
                <option key={`${m.year}-${m.monthIndex}`} value={i}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {activeView === 'grid' && !isActiveVisible && (
        <div className="taboard-notice">
          You're viewing a different month -- nothing here is editable right now. Switch the
          dropdown back to "Current" to make assignments.
        </div>
      )}

      <div className="tb-stats-row">
        <StatCard label="Total Roles" value={openPositions.length} corner="gold" />
        <StatCard label="Carried Forward" value={carriedForward} corner="leaf" />
        <StatCard label="Active (A&P)" value={active} accent="green" corner="gold" />
        <StatCard label="Yet to Activate" value={yetToActivate} corner="leaf" />
        <StatCard label="Fence" value={fence} accent="purple" corner="gold" />
        <StatCard label="Re-assign" value={reassign} accent="red" corner="leaf" />
      </div>

      <div className="taboard-body">
        <PositionPool
          positions={positions}
          navigate={navigate}
          onPositionClick={setPoolModalPosition}
        />

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
                    key={String(ta._id)}
                    ta={ta}
                    displayWeeks={displayWeeks}
                    activeColumnIndex={activeColumnIndex}
                    getCell={getCell}
                    positions={positions}
                    openCellKey={openCellKey}
                    onCellToggle={cellKey =>
                      setOpenCellKey(openCellKey === cellKey ? null : cellKey)
                    }
                    onSelectCell={handleCellSelect}
                    onSetCellLeave={handleCellSetLeave}
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

      <AnimatePresence>
        {poolModalPosition && (
          <PositionDetailModal
            position={poolModalPosition}
            onClose={() => setPoolModalPosition(null)}
            onUpdate={refreshPositions}
            tas={tas}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {leaveModalOpen && (
          <LeaveModal
            tas={tas}
            onClose={() => setLeaveModalOpen(false)}
            onSave={handleSaveLeave}
            saving={leaveBulkMutation.isLoading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default TABoard;