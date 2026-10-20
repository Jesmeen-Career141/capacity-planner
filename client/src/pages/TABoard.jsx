import { useState, useCallback, useRef, useLayoutEffect, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, GripVertical, Pencil } from 'lucide-react';
import { getPositions, assignPosition, setFlagOverride } from '../api/positions';
import { getArchiveSnapshots, getArchiveSnapshot } from '../api/archive';
import { getActiveTAs, reorderTAs } from '../api/tas';
import { getWeeklyAllocationsBatch, updateWeeklyAllocationCell, setLeaveBulk } from '../api/weeklyAllocations';
import './TABoard.css';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { formatSalary } from '../utils/salaryFormatter';
import PositionDetailModal from '../components/PositionDetailModal';
import CompactEditPopover from '../components/CompactEditPopover';

// ---- CONSTANTS ----
const CARD_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const FLAG_META = {
  followUp: { label: 'Follow up' },
  addOn: { label: 'Add-on' },
  backup: { label: 'Backup' },
  goingGood: { label: 'Going good' },
  reAssign: { label: 'Re-assign' },
};

// ---- HELPERS ----

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

function StatCard({ label, value, accent, corner = 'leaf', onClick }) {
  const isClickable = typeof onClick === 'function';
  return (
    <div
      className={`tb-stat-card${accent ? ` tb-stat-card--${accent}` : ''} tb-stat-card--corner-${corner}${isClickable ? ' tb-stat-card--clickable' : ''}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
    >
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

    const top = rect.bottom + margin;
    const available = window.innerHeight - top - margin;
    const maxHeight = Math.min(320, Math.max(180, available));

    const newStyle = {
      position: 'fixed',
      left,
      width,
      minHeight: 180,
      maxHeight,
      overflowY: 'auto',
      top,
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

// ---- PositionDetailModal is imported from ../components/PositionDetailModal ----

// ---- Leave / Holiday Modal ----
function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

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
function PositionPool({ positions, onPositionClick }) {
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
function PackageTooltip({ anchorRef, visible, salary, packageRange, clientName, positionTitle }) {
  const [style, setStyle] = useState(null);
  const [placement, setPlacement] = useState('top');
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    if (!visible || !anchorRef.current) { setStyle(null); return; }
    const rect = anchorRef.current.getBoundingClientRect();
    const TOOLTIP_HEIGHT = 120; // 3 rows, allows for some wrapping
    const ARROW_SIZE = 7;
    const GAP = 6;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceAbove >= TOOLTIP_HEIGHT + ARROW_SIZE + GAP || spaceAbove > spaceBelow;

    // Horizontal centering, clamped to viewport
    const centreX = rect.left + rect.width / 2;
    const TOOLTIP_W = 260;
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
        ? { top: rect.top - GAP - ARROW_SIZE }      // CSS translateY(-100%) lifts it above
        : { top: rect.bottom + GAP + ARROW_SIZE }),
    });
  }, [visible, anchorRef]);

  if (!visible || !style) return null;

  const formatted = formatSalary(salary, packageRange);
  const pkg = formatted && formatted.trim() ? formatted.trim() : 'Not specified';

  return createPortal(
    <div
      ref={tooltipRef}
      className={`pkg-tooltip pkg-tooltip--${placement}`}
      style={style}
      role="tooltip"
    >
      <div className="pkg-tooltip-row">
        <span className="pkg-tooltip-label">Client</span>
        <span className="pkg-tooltip-value">{clientName || '—'}</span>
      </div>
      <div className="pkg-tooltip-row">
        <span className="pkg-tooltip-label">Position</span>
        <span className="pkg-tooltip-value">{positionTitle || '—'}</span>
      </div>
      <div className="pkg-tooltip-row">
        <span className="pkg-tooltip-label">Package</span>
        <span className="pkg-tooltip-value">{pkg}</span>
      </div>
    </div>,
    document.body
  );
}

// ---- GridCell (with hover state + leave/holiday + dual position slot support) ----
function GridCell({ dayCell, positions, isOpen, onToggle, onSelect, onSetLeave }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSlot, setActiveSlot] = useState(1);
  const [tooltip1Visible, setTooltip1Visible] = useState(false);
  const [tooltip2Visible, setTooltip2Visible] = useState(false);
  const triggerRef = useRef(null);
  const half1Ref = useRef(null);
  const half2Ref = useRef(null);
  const tooltip1TimerRef = useRef(null);
  const tooltip2TimerRef = useRef(null);

  const position = dayCell?.position || null;
  const position2 = dayCell?.position2 || null;
  const leave = dayCell?.leave?.type ? dayCell.leave : null;

  // Reset activeSlot & search when popover closes or when position 1 becomes empty
  useEffect(() => {
    if (!isOpen) {
      setActiveSlot(1);
      setSearchTerm('');
    } else {
      if (!position) {
        setActiveSlot(1);
      }
    }
  }, [isOpen, position]);

  const showTooltip1 = useCallback(() => {
    clearTimeout(tooltip1TimerRef.current);
    tooltip1TimerRef.current = setTimeout(() => setTooltip1Visible(true), 220);
  }, []);

  const hideTooltip1 = useCallback(() => {
    clearTimeout(tooltip1TimerRef.current);
    setTooltip1Visible(false);
  }, []);

  const showTooltip2 = useCallback(() => {
    clearTimeout(tooltip2TimerRef.current);
    tooltip2TimerRef.current = setTimeout(() => setTooltip2Visible(true), 220);
  }, []);

  const hideTooltip2 = useCallback(() => {
    clearTimeout(tooltip2TimerRef.current);
    setTooltip2Visible(false);
  }, []);

  // Clean up timers on unmount
  useEffect(() => () => {
    clearTimeout(tooltip1TimerRef.current);
    clearTimeout(tooltip2TimerRef.current);
  }, []);

  const otherSlotPos = activeSlot === 1 ? position2 : position;
  const currentSlotPos = activeSlot === 1 ? position : position2;
  const otherSlotPosId = otherSlotPos?._id;

  const availablePositions = useMemo(() => {
    if (!isOpen) return [];
    return positions.filter(p => !otherSlotPosId || p._id !== otherSlotPosId);
  }, [isOpen, positions, otherSlotPosId]);

  const sorted = useMemo(() => {
    if (!isOpen) return [];
    const term = searchTerm.toLowerCase();
    const filtered = availablePositions.filter(p =>
      p.position?.toLowerCase().includes(term) ||
      p.client?.clientName?.toLowerCase().includes(term) ||
      p.jobOrderId?.toLowerCase().includes(term)
    );
    return filtered.slice().sort((a, b) => {
      const clientA = (a.client?.clientName || '').toLowerCase();
      const clientB = (b.client?.clientName || '').toLowerCase();
      if (clientA !== clientB) return clientA.localeCompare(clientB);
      return (a.position || '').localeCompare(b.position || '');
    });
  }, [isOpen, searchTerm, availablePositions]);

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
        {isOpen && (
          <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggle} width={200}>
            <p className="popover-heading">{leave.type === 'holiday' ? 'Holiday' : 'On leave'}</p>
            <button
              className="cell-popover-option cell-popover-option--simple cell-popover-danger"
              onClick={() => { onSetLeave(null); onToggle(); }}
            >
              <span className="cpo-text">Clear {leave.type === 'holiday' ? 'holiday' : 'leave'}</span>
            </button>
          </Popover>
        )}
      </div>
    );
  }

  return (
    <div className="grid-cell-wrap">
      {position && position2 ? (
        <div className="grid-pill-split" ref={triggerRef}>
          <button
            ref={half1Ref}
            className="grid-pill"
            style={roleChipStyle(position.position)}
            onClick={onToggle}
            onMouseEnter={showTooltip1}
            onMouseLeave={hideTooltip1}
            onFocus={showTooltip1}
            onBlur={hideTooltip1}
          >
            {position.client?.clientName || '—'} — {position.position}
          </button>
          <PackageTooltip
            anchorRef={half1Ref}
            visible={tooltip1Visible && !isOpen}
            salary={position.salary}
            packageRange={position.packageRange}
            clientName={position.client?.clientName}
            positionTitle={position.position}
          />
          <button
            ref={half2Ref}
            className="grid-pill"
            style={roleChipStyle(position2.position)}
            onClick={onToggle}
            onMouseEnter={showTooltip2}
            onMouseLeave={hideTooltip2}
            onFocus={showTooltip2}
            onBlur={hideTooltip2}
          >
            {position2.client?.clientName || '—'} — {position2.position}
          </button>
          <PackageTooltip
            anchorRef={half2Ref}
            visible={tooltip2Visible && !isOpen}
            salary={position2.salary}
            packageRange={position2.packageRange}
            clientName={position2.client?.clientName}
            positionTitle={position2.position}
          />
        </div>
      ) : position ? (
        <>
          <button
            ref={triggerRef}
            className="grid-pill"
            style={roleChipStyle(position.position)}
            onClick={onToggle}
            onMouseEnter={showTooltip1}
            onMouseLeave={hideTooltip1}
            onFocus={showTooltip1}
            onBlur={hideTooltip1}
            aria-describedby="pkg-tooltip"
          >
            {position.client?.clientName || '—'} — {position.position}
          </button>
          <PackageTooltip
            anchorRef={triggerRef}
            visible={tooltip1Visible && !isOpen}
            salary={position.salary}
            packageRange={position.packageRange}
            clientName={position.client?.clientName}
            positionTitle={position.position}
          />
        </>
      ) : (
        <button ref={triggerRef} className="grid-pill grid-pill-empty" onClick={() => { onToggle(); }}>
          + Assign
        </button>
      )}
      {isOpen && (
        <Popover anchorRef={triggerRef} isOpen={isOpen} onClose={onToggle}>
          <div className="slot-tabs">
            <button
              type="button"
              className={`slot-tab${activeSlot === 1 ? ' slot-tab--active' : ''}`}
              onClick={() => setActiveSlot(1)}
            >
              Position 1
            </button>
            <button
              type="button"
              className={`slot-tab${activeSlot === 2 ? ' slot-tab--active' : ''}`}
              onClick={() => setActiveSlot(2)}
              disabled={!position}
            >
              Position 2
            </button>
          </div>
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
            className={`cell-popover-option${!currentSlotPos ? ' cell-popover-option--selected' : ''}`}
            onClick={() => onSelect(null, activeSlot)}
          >
            <span className="cpo-check">{!currentSlotPos && <CheckIcon />}</span>
            <span className="cpo-text cpo-text--muted">— None —</span>
          </button>
          {sorted.map(p => {
            const selected = currentSlotPos?._id === p._id;
            return (
              <button
                className={`cell-popover-option${selected ? ' cell-popover-option--selected' : ''}`}
                key={p._id}
                onClick={() => onSelect(p._id, activeSlot)}
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
      )}
    </div>
  );
}

// ---- TACard (passes weekStart, dayCell, onSetLeave) ----
function TACard({
  ta,
  displayWeeks,
  activeColumnIndex,
  getCell,
  positions,
  openCellKey,
  onCellToggle,
  onSelectCell,
  onSetCellLeave,
  workloadCount,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  isReorderPending,
  isDragging,
  isDropTarget,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onTouchStart,
  cardRef
}) {
  const initials = ta.name?.[0]?.toUpperCase() || '?';
  const cardClassName = [
    'ta-card',
    isDragging ? 'ta-card--dragging' : '',
    isDropTarget && dropPosition === 'before' ? 'ta-card--drop-before' : '',
    isDropTarget && dropPosition === 'after' ? 'ta-card--drop-after' : '',
  ].filter(Boolean).join(' ');

  return (
    <section
      ref={cardRef}
      className={cardClassName}
      data-ta-id={String(ta._id)}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="ta-card-header">
        <div
          className={`ta-drag-handle ${isReorderPending ? 'ta-drag-handle--disabled' : ''}`}
          draggable={!isReorderPending}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onTouchStart={onTouchStart}
          title={isReorderPending ? 'Reordering in progress...' : `Drag to reorder ${ta.name}'s board`}
          aria-label={`Drag to reorder ${ta.name}'s board`}
          tabIndex={isReorderPending ? -1 : 0}
          role="button"
        >
          <GripVertical size={16} />
        </div>
        <div className="ta-card-reorder-actions" aria-label={`Reorder ${ta.name}'s board`}>
          <button
            type="button"
            className="ta-reorder-btn"
            onClick={onMoveUp}
            disabled={isFirst || isReorderPending}
            title={isFirst ? 'Already at the top' : `Move ${ta.name} up`}
            aria-label={`Move ${ta.name} up`}
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            className="ta-reorder-btn"
            onClick={onMoveDown}
            disabled={isLast || isReorderPending}
            title={isLast ? 'Already at the bottom' : `Move ${ta.name} down`}
            aria-label={`Move ${ta.name} down`}
          >
            <ChevronDown size={15} />
          </button>
        </div>
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
            <div
              className={`ta-grid-row${day === 'sat' || day === 'sun' ? ' ta-grid-row--weekend' : ''}`}
              key={day}
              style={{ gridTemplateColumns: `62px repeat(${displayWeeks.length}, minmax(165px, 1fr))` }}
            >
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
                      onSelect={(newId, slot) => onSelectCell(ta._id, w.weekStart, day, newId, slot)}
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


// ---- 4-Panel Action Board (Phase 3) ----
const ARCHIVE_STATUSES = ['Placed', 'Lost', 'Hold'];

const ACTION_FILTER_OPTIONS = [
  { key: 'followUp', label: 'Follow Up', pillClass: 'ab-filter-pill--followUp' },
  { key: 'addOn', label: 'Add-On', pillClass: 'ab-filter-pill--addOn' },
  { key: 'backup', label: 'Backup', pillClass: 'ab-filter-pill--backup' },
  { key: 'reAssign', label: 'Re-assign', pillClass: 'ab-filter-pill--reAssign' },
  { key: 'goingGood', label: 'Going Good', pillClass: 'ab-filter-pill--goingGood' },
];

function isActionableFlag(key, flag) {
  if (!flag) return false;
  if (key === 'reAssign') return flag.label === 'Reassign';
  return true;
}

function getPositionPriorityScore(pos) {
  let score = 0;
  if (pos.flags?.followUp) score = Math.max(score, 100);
  if (pos.flags?.addOn) score = Math.max(score, 100);
  if (pos.flags?.backup) score = Math.max(score, 70);
  if (pos.flags?.reAssign && pos.flags.reAssign.label === 'Reassign') score = Math.max(score, 50);
  if (pos.flags?.goingGood) score = Math.max(score, 30);
  return score;
}

function sortPositionsByPriority(positionsList) {
  return [...positionsList].sort((a, b) => {
    const scoreDiff = getPositionPriorityScore(b) - getPositionPriorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (a.jobOrderId || '').localeCompare(b.jobOrderId || '');
  });
}

function matchesFilters(pos, selectedFilterKeys) {
  if (!selectedFilterKeys || selectedFilterKeys.size === 0) return true;
  for (const key of selectedFilterKeys) {
    if (isActionableFlag(key, pos.flags?.[key])) {
      return true;
    }
  }
  return false;
}

function isOnPosition(position, taId) {
  return (
    position.assignee?._id === taId ||
    position.assignee === taId ||
    (position.parallelAssignees || []).some(pa => pa._id === taId || pa === taId)
  );
}

function ActionPositionCard({
  position,
  onCardClick,
  onCardDoubleClick,
  onEditButtonClick,
  onCardKeyDown,
}) {
  const cardRef = useRef(null);
  const flags = position.flags || {};
  const activeFlagKeys = ['followUp', 'addOn', 'backup', 'reAssign', 'goingGood'].filter(k =>
    isActionableFlag(k, flags[k])
  );

  return (
    <div
      ref={cardRef}
      className="ab-card"
      tabIndex={0}
      role="button"
      aria-label={`Position ${position.jobOrderId} ${position.position}`}
      onClick={(e) => onCardClick?.(e, position)}
      onDoubleClick={(e) => onCardDoubleClick?.(e, position, cardRef.current)}
      onKeyDown={(e) => onCardKeyDown?.(e, position)}
    >
      <div className="ab-card-top">
        <div className="ab-card-meta">
          <span className={`cpo-level cpo-level--${position.pLevel} ab-card-plevel`}>
            {position.pLevel}
          </span>
          <span className="ab-card-jobid">
            {position.jobOrderId}
            {(position.isReactivated || position.status === 'Reactivated') && (
              <span className="reactivated-tag" title="Reactivated Requirement">↻</span>
            )}
          </span>
        </div>
        <div className="ab-card-top-right">
          <span className="ab-card-status">{position.status}</span>
          <button
            type="button"
            className="ab-card-edit-btn"
            title="Quick edit TA and flags"
            aria-label={`Quick edit ${position.jobOrderId} ${position.position}`}
            onClick={(e) => onEditButtonClick?.(e, position, cardRef.current)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
          >
            <Pencil size={12} />
          </button>
        </div>
      </div>

      <h4 className="ab-card-title">{position.position}</h4>
      <p className="ab-card-client">{position.client?.clientName || '—'}</p>

      {activeFlagKeys.length > 0 && (
        <div className="ab-card-flags">
          {activeFlagKeys.map(k => (
            <span key={k} className={`ab-flag-pill ab-flag-pill--${k}`}>
              {flags[k].label}
              {flags[k].manual && <span className="ab-flag-manual-dot" title="Manually set" />}
            </span>
          ))}
        </div>
      )}

      <div className="ab-card-footer">
        <span>CVs: {position.cvCount ?? 0} · Ext: {position.extShortlistCount ?? 0}</span>
        {position.salary?.min ? (
          <span>{formatSalary(position.salary)}</span>
        ) : position.packageRange ? (
          <span>{position.packageRange}</span>
        ) : null}
      </div>
    </div>
  );
}

function TAPanel({
  ta,
  positions = [],
  isUnassigned = false,
  onCardClick,
  onCardDoubleClick,
  onEditButtonClick,
  onCardKeyDown,
}) {
  const [selectedFilterKeys, setSelectedFilterKeys] = useState(new Set());

  const handleToggleFilter = (key) => {
    setSelectedFilterKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleClearFilters = () => {
    setSelectedFilterKeys(new Set());
  };

  const filteredPositions = useMemo(() => {
    const matched = positions.filter(p => matchesFilters(p, selectedFilterKeys));
    return sortPositionsByPriority(matched);
  }, [positions, selectedFilterKeys]);

  const isAllActive = selectedFilterKeys.size === 0;

  return (
    <div className={`ab-ta-panel ${isUnassigned ? 'ab-ta-panel--unassigned' : ''}`}>
      <div className="ab-panel-header">
        <div className="ab-panel-title-row">
          <h3 className="ab-panel-title">{ta.name}</h3>
          <span className="ab-panel-count">
            {filteredPositions.length}
            {filteredPositions.length !== positions.length && ` / ${positions.length}`}
          </span>
        </div>

        <div className="ab-panel-filters" role="toolbar" aria-label={`Filter ${ta.name} roles`}>
          <button
            type="button"
            className={`ab-filter-pill ${isAllActive ? 'ab-filter-pill--active' : ''}`}
            onClick={handleClearFilters}
            aria-pressed={isAllActive}
          >
            All active
          </button>
          {ACTION_FILTER_OPTIONS.map(({ key, label, pillClass }) => {
            const isSelected = selectedFilterKeys.has(key);
            return (
              <button
                key={key}
                type="button"
                className={`ab-filter-pill ${isSelected ? `ab-filter-pill--active ${pillClass}` : ''}`}
                onClick={() => handleToggleFilter(key)}
                aria-pressed={isSelected}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ab-cards-stack">
        {filteredPositions.length === 0 ? (
          <div className="ab-cards-empty">
            {positions.length === 0 ? 'No active positions assigned' : 'No positions match selected filters'}
          </div>
        ) : (
          filteredPositions.map(pos => (
            <ActionPositionCard
              key={pos._id}
              position={pos}
              onCardClick={onCardClick}
              onCardDoubleClick={onCardDoubleClick}
              onEditButtonClick={onEditButtonClick}
              onCardKeyDown={onCardKeyDown}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ActionBoard({
  positions = [],
  tas = [],
  allTAs = [],
  onOpenPositionModal,
  onUpdatePosition,
  // eslint-disable-next-line no-unused-vars
  onToggleFlag,
  // eslint-disable-next-line no-unused-vars
  onReassign,
}) {
  const [editTarget, setEditTarget] = useState(null);
  const clickTimeoutRef = useRef(null);

  // Clear pending click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCardClick = useCallback((e, position) => {
    // If double-click in progress (detail > 1), abort single-click timeout
    if (e.detail > 1) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      setEditTarget(null);
      if (onOpenPositionModal) {
        onOpenPositionModal(position);
      }
    }, 230);
  }, [onOpenPositionModal]);

  const handleCardDoubleClick = useCallback((e, position, cardEl) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setEditTarget({ position, anchorEl: cardEl || e.currentTarget });
  }, []);

  const handleEditButtonClick = useCallback((e, position, cardEl) => {
    e.stopPropagation();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    setEditTarget(prev => {
      if (prev?.position?._id === position._id) {
        return null;
      }
      return { position, anchorEl: cardEl || e.currentTarget };
    });
  }, []);

  const handleCardKeyDown = useCallback((e, position) => {
    // Only trigger if the card itself received the key event, not child buttons
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      setEditTarget(null);
      if (onOpenPositionModal) {
        onOpenPositionModal(position);
      }
    }
  }, [onOpenPositionModal]);

  const activePositions = useMemo(() => {
    return positions.filter(p => !ARCHIVE_STATUSES.includes(p.status));
  }, [positions]);

  const activeTaIds = useMemo(() => new Set(tas.map(t => String(t._id))), [tas]);

  const unassignedPositions = useMemo(() => {
    return activePositions.filter(p => {
      if (!p.assignee) return true;
      const id = String(p.assignee?._id || p.assignee);
      if (p.assignee?.status === 'Left') return true;
      return !activeTaIds.has(id);
    });
  }, [activePositions, activeTaIds]);

  const currentEditPosition = useMemo(() => {
    if (!editTarget?.position?._id) return null;
    return positions.find(p => p._id === editTarget.position._id) || editTarget.position;
  }, [positions, editTarget]);

  return (
    <div className="action-board-wrap">
      <div className="ab-panels-container">
        {tas.map(ta => {
          const taPositions = activePositions.filter(p => isOnPosition(p, ta._id));
          return (
            <TAPanel
              key={ta._id}
              ta={ta}
              positions={taPositions}
              onCardClick={handleCardClick}
              onCardDoubleClick={handleCardDoubleClick}
              onEditButtonClick={handleEditButtonClick}
              onCardKeyDown={handleCardKeyDown}
            />
          );
        })}
      </div>

      {unassignedPositions.length > 0 && (
        <div className="ab-unassigned-section">
          <TAPanel
            key="unassigned"
            ta={{ _id: 'unassigned', name: 'Unassigned / Needs Reassignment' }}
            positions={unassignedPositions}
            isUnassigned
            onCardClick={handleCardClick}
            onCardDoubleClick={handleCardDoubleClick}
            onEditButtonClick={handleEditButtonClick}
            onCardKeyDown={handleCardKeyDown}
          />
        </div>
      )}

      {editTarget && currentEditPosition && (
        <CompactEditPopover
          position={currentEditPosition}
          anchorRef={editTarget.anchorEl}
          isOpen={Boolean(editTarget)}
          onClose={() => setEditTarget(null)}
          tas={allTAs.length > 0 ? allTAs : tas}
          onPositionUpdated={(updated) => {
            if (onUpdatePosition) onUpdatePosition(updated);
            setEditTarget(prev => prev ? { ...prev, position: updated } : null);
          }}
        />
      )}
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
    mutationFn: ({ taId, weekStart, day, positionId, slot, leaveType }) =>
      updateWeeklyAllocationCell(taId, weekStart, { day, positionId, slot, leaveType }),
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
  const handleCellSelect = async (taId, weekStart, day, newPositionId, slot = 1) => {
    const newPosObj = newPositionId ? byId[newPositionId] : null;

    // Optimistic update – use matching query key for instant UI update
    queryClient.setQueriesData({ queryKey: ['weeklyAllocations', selectedMonthIdx] }, old => {
      if (!old) return old;
      return old.map(week => {
        if (week.weekStart !== weekStart) return week;
        const updatedGrid = week.grid.map(row => {
          if (String(row.ta._id) !== String(taId)) return row;
          const currentDayCell = row.days?.[day] || {};
          let nextPosition = currentDayCell.position || null;
          let nextPosition2 = currentDayCell.position2 || null;

          if (slot === 2) {
            nextPosition2 = newPosObj;
          } else {
            // slot 1
            if (!newPosObj && nextPosition2) {
              // promotion rule: clearing slot 1 promotes slot 2
              nextPosition = nextPosition2;
              nextPosition2 = null;
            } else {
              nextPosition = newPosObj;
            }
          }

          return {
            ...row,
            days: {
              ...row.days,
              [day]: {
                ...currentDayCell,
                position: nextPosition,
                position2: nextPosition2,
              },
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
        slot,
      });
    } catch (err) {
      queryClient.invalidateQueries(['weeklyAllocations']);
      alert(err.response?.data?.error || 'Failed to update cell');
    }
  };

  const handleCellSetLeave = async (taId, weekStart, day, leaveType) => {
    // Optimistic update
    queryClient.setQueriesData({ queryKey: ['weeklyAllocations', selectedMonthIdx] }, old => {
      if (!old) return old;
      return old.map(week => {
        if (week.weekStart !== weekStart) return week;
        const updatedGrid = week.grid.map(row => {
          if (String(row.ta._id) !== String(taId)) return row;
          const currentDayCell = row.days?.[day] || {};
          return {
            ...row,
            days: {
              ...row.days,
              [day]: {
                ...currentDayCell,
                leave: leaveType ? { type: leaveType } : null,
                position: leaveType ? null : currentDayCell.position,
                position2: leaveType ? null : currentDayCell.position2,
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
      queryClient.invalidateQueries(['weeklyAllocations']);
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

  const reorderTAMutation = useMutation({
    mutationFn: (taIds) => reorderTAs(taIds),
    onSuccess: () => {
      queryClient.invalidateQueries(['weeklyAllocations']);
      queryClient.invalidateQueries(['tas']);
      queryClient.invalidateQueries(['activeTAs']);
    },
  });

  const taList = useMemo(() => {
    const source =
      displayWeeks.map(w => gridsByWeek[w.weekStart]).find(g => g && g.length > 0) || [];
    return source.map(row => row.ta);
  }, [displayWeeks, gridsByWeek]);

  // Drag and drop state for reordering
  const [draggedTaId, setDraggedTaId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropPosition, setDropPosition] = useState(null); // 'before' | 'after'
  const cardRefs = useRef(new Map());
  const boardPageRef = useRef(null);
  const scrollAnimRef = useRef(null);
  const scrollSpeedRef = useRef(0);

  // Helper to find the scrollable container (<main> from Layout)
  const getScrollContainer = useCallback(() => {
    return boardPageRef.current?.closest('main') || document.querySelector('main') || window;
  }, []);

  const stopAutoScroll = useCallback(() => {
    scrollSpeedRef.current = 0;
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    if (scrollAnimRef.current) return;

    const step = () => {
      const speed = scrollSpeedRef.current;
      if (speed !== 0) {
        const container = getScrollContainer();
        if (container === window) {
          window.scrollBy({ top: speed, behavior: 'auto' });
        } else if (container && typeof container.scrollBy === 'function') {
          container.scrollBy({ top: speed, behavior: 'auto' });
        }
        scrollAnimRef.current = requestAnimationFrame(step);
      } else {
        scrollAnimRef.current = null;
      }
    };

    scrollAnimRef.current = requestAnimationFrame(step);
  }, [getScrollContainer]);

  const updateAutoScrollSpeed = useCallback((clientY) => {
    const container = getScrollContainer();
    let top = 0;
    let bottom = window.innerHeight;

    if (container && container !== window && typeof container.getBoundingClientRect === 'function') {
      const rect = container.getBoundingClientRect();
      top = rect.top;
      bottom = rect.bottom;
    }

    const EDGE_THRESHOLD = 110; // Start scrolling within 110px of edge
    const MAX_SPEED = 22; // Maximum px per frame

    let speed = 0;

    if (clientY < top + EDGE_THRESHOLD) {
      // Near top edge: scroll up (negative speed)
      const distance = Math.max(0, clientY - top);
      const intensity = 1 - Math.min(1, distance / EDGE_THRESHOLD);
      speed = -Math.round(4 + intensity * (MAX_SPEED - 4));
    } else if (clientY > bottom - EDGE_THRESHOLD) {
      // Near bottom edge: scroll down (positive speed)
      const distance = Math.max(0, bottom - clientY);
      const intensity = 1 - Math.min(1, distance / EDGE_THRESHOLD);
      speed = Math.round(4 + intensity * (MAX_SPEED - 4));
    }

    scrollSpeedRef.current = speed;

    if (speed !== 0) {
      startAutoScroll();
    } else {
      stopAutoScroll();
    }
  }, [getScrollContainer, startAutoScroll, stopAutoScroll]);

  // Window-level dragover to ensure auto-scroll continues smoothly everywhere
  useEffect(() => {
    if (!draggedTaId) return;

    const handleWindowDragOver = (e) => {
      e.preventDefault();
      updateAutoScrollSpeed(e.clientY);
    };

    const handleWindowDragEnd = () => {
      stopAutoScroll();
      setDraggedTaId(null);
      setDropTargetId(null);
      setDropPosition(null);
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDragEnd);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDragEnd);
      stopAutoScroll();
    };
  }, [draggedTaId, updateAutoScrollSpeed, stopAutoScroll]);

  const persistReorder = async (reorderedIds) => {
    // Optimistic cache update across all weeklyAllocations queries so UI shifts instantly
    queryClient.setQueriesData({ queryKey: ['weeklyAllocations'] }, (old) => {
      if (!Array.isArray(old)) return old;
      return old.map(week => {
        if (!Array.isArray(week.grid)) return week;
        const gridMap = new Map();
        week.grid.forEach(row => {
          if (row?.ta?._id) gridMap.set(String(row.ta._id), row);
        });
        const sortedGrid = [];
        reorderedIds.forEach(id => {
          if (gridMap.has(id)) {
            sortedGrid.push(gridMap.get(id));
            gridMap.delete(id);
          }
        });
        // Append any remaining rows safely
        gridMap.forEach(row => sortedGrid.push(row));
        return { ...week, grid: sortedGrid };
      });
    });

    try {
      await reorderTAMutation.mutateAsync(reorderedIds);
    } catch (err) {
      queryClient.invalidateQueries(['weeklyAllocations']);
      alert(err.response?.data?.error || 'Failed to update board order');
    }
  };

  const handleMoveTA = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= taList.length) return;

    const reordered = [...taList];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const reorderedIds = reordered.map(t => String(t._id));
    await persistReorder(reorderedIds);
  };

  const handleDragStart = (e, taId) => {
    if (reorderTAMutation.isPending) {
      e.preventDefault();
      return;
    }
    setDraggedTaId(String(taId));
    setDropTargetId(null);
    setDropPosition(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(taId));
  };

  const handleDragOver = (e, targetTaId) => {
    e.preventDefault();
    if (!draggedTaId || draggedTaId === String(targetTaId)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.dataTransfer.dropEffect = 'move';

    // Update auto-scroll speed based on pointer Y
    updateAutoScrollSpeed(e.clientY);

    const cardEl = cardRefs.current.get(String(targetTaId));
    if (cardEl) {
      const rect = cardEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? 'before' : 'after';
      if (dropTargetId !== String(targetTaId) || dropPosition !== position) {
        setDropTargetId(String(targetTaId));
        setDropPosition(position);
      }
    }
  };

  const handleDragLeave = (e, targetTaId) => {
    // Only reset if leaving the actual card element
    const cardEl = cardRefs.current.get(String(targetTaId));
    if (cardEl && !cardEl.contains(e.relatedTarget)) {
      if (dropTargetId === String(targetTaId)) {
        setDropTargetId(null);
        setDropPosition(null);
      }
    }
  };

  const executeReorder = async (fromId, targetId, position) => {
    if (!fromId || !targetId || String(fromId) === String(targetId)) return;

    const fromIndex = taList.findIndex(t => String(t._id) === String(fromId));
    const targetIdx = taList.findIndex(t => String(t._id) === String(targetId));

    if (fromIndex === -1 || targetIdx === -1) return;

    const reordered = [...taList];
    const [moved] = reordered.splice(fromIndex, 1);

    let toIndex = reordered.findIndex(t => String(t._id) === String(targetId));
    if (position === 'after') {
      toIndex += 1;
    }
    reordered.splice(toIndex, 0, moved);

    const reorderedIds = reordered.map(t => String(t._id));
    await persistReorder(reorderedIds);
  };

  const handleDrop = async (e, targetTaId) => {
    e.preventDefault();
    e.stopPropagation();
    stopAutoScroll();

    const fromId = draggedTaId;
    const targetId = targetTaId;
    const pos = dropPosition;

    setDraggedTaId(null);
    setDropTargetId(null);
    setDropPosition(null);

    if (!fromId || !targetId || String(fromId) === String(targetId)) {
      return;
    }

    await executeReorder(fromId, targetId, pos);
  };

  const handleDragEnd = () => {
    stopAutoScroll();
    setDraggedTaId(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  // Touch drag-and-drop state & handlers for touch devices
  const [touchDraggingTaId, setTouchDraggingTaId] = useState(null);
  const touchStateRef = useRef({ targetId: null, position: null });

  const handleTouchStart = (e, taId) => {
    if (reorderTAMutation.isPending) return;
    touchStateRef.current = { targetId: null, position: null };
    setTouchDraggingTaId(String(taId));
    setDraggedTaId(String(taId));
    setDropTargetId(null);
    setDropPosition(null);
  };

  useEffect(() => {
    if (!touchDraggingTaId) return;

    const handleWindowTouchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (e.cancelable) e.preventDefault();

      updateAutoScrollSpeed(touch.clientY);

      let foundTargetId = null;
      let foundPosition = null;

      cardRefs.current.forEach((cardEl, id) => {
        if (cardEl) {
          const rect = cardEl.getBoundingClientRect();
          if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            foundTargetId = id;
            const midY = rect.top + rect.height / 2;
            foundPosition = touch.clientY < midY ? 'before' : 'after';
          }
        }
      });

      if (foundTargetId && foundTargetId !== touchDraggingTaId) {
        touchStateRef.current.targetId = foundTargetId;
        touchStateRef.current.position = foundPosition;
        setDropTargetId(foundTargetId);
        setDropPosition(foundPosition);
      } else {
        touchStateRef.current.targetId = null;
        touchStateRef.current.position = null;
        setDropTargetId(null);
        setDropPosition(null);
      }
    };

    const handleWindowTouchEnd = async () => {
      stopAutoScroll();
      const fromId = touchDraggingTaId;
      const targetId = touchStateRef.current.targetId;
      const pos = touchStateRef.current.position;

      setTouchDraggingTaId(null);
      setDraggedTaId(null);
      setDropTargetId(null);
      setDropPosition(null);

      if (fromId && targetId && fromId !== targetId) {
        await executeReorder(fromId, targetId, pos);
      }
    };

    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleWindowTouchEnd);
    window.addEventListener('touchcancel', handleWindowTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
      window.removeEventListener('touchcancel', handleWindowTouchEnd);
      stopAutoScroll();
    };
  }, [touchDraggingTaId, updateAutoScrollSpeed, stopAutoScroll, taList]);

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
    <div
      ref={boardPageRef}
      className="taboard-page"
      onDragOver={(e) => {
        if (draggedTaId) {
          e.preventDefault();
          updateAutoScrollSpeed(e.clientY);
        }
      }}
    >
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
        <StatCard
          label="Total Roles"
          value={openPositions.length}
          corner="gold"
          onClick={() => navigate('/positions')}
        />
        <StatCard label="Carried Forward" value={carriedForward} corner="leaf" />
        <StatCard
          label="Active (A&P)"
          value={active}
          accent="green"
          corner="gold"
          onClick={() => navigate('/positions?status=A%26P')}
        />
        <StatCard
          label="Yet to Activate"
          value={yetToActivate}
          corner="leaf"
          onClick={() => navigate('/positions?status=Yet%20to%20Activate')}
        />
        <StatCard
          label="Fence"
          value={fence}
          accent="purple"
          corner="gold"
          onClick={() => navigate('/positions?status=Fence')}
        />
        <StatCard
          label="Re-assign"
          value={reassign}
          accent="red"
          corner="leaf"
          onClick={() => navigate('/positions?flag=reAssign')}
        />
      </div>

      <div className="taboard-body">
        {activeView === 'grid' && (
          <PositionPool
            positions={positions}
            navigate={navigate}
            onPositionClick={setPoolModalPosition}
          />
        )}

        {activeView === 'grid' ? (
          <main className="board-main">
            {gridLoading ? (
              <div className="grid-loading">Loading grid...</div>
            ) : taList.length === 0 ? (
              <div className="grid-no-data">No active TAs found</div>
            ) : (
              <div className="weekly-grid-list">
                {taList.map((ta, index) => (
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
                    onMoveUp={() => handleMoveTA(index, -1)}
                    onMoveDown={() => handleMoveTA(index, 1)}
                    isFirst={index === 0}
                    isLast={index === taList.length - 1}
                    isReorderPending={reorderTAMutation.isPending}
                    isDragging={draggedTaId === String(ta._id)}
                    isDropTarget={dropTargetId === String(ta._id)}
                    dropPosition={dropTargetId === String(ta._id) ? dropPosition : null}
                    onDragStart={e => handleDragStart(e, ta._id)}
                    onDragOver={e => handleDragOver(e, ta._id)}
                    onDragLeave={e => handleDragLeave(e, ta._id)}
                    onDrop={e => handleDrop(e, ta._id)}
                    onDragEnd={handleDragEnd}
                    onTouchStart={e => handleTouchStart(e, ta._id)}
                    cardRef={el => {
                      if (el) cardRefs.current.set(String(ta._id), el);
                      else cardRefs.current.delete(String(ta._id));
                    }}
                  />
                ))}
              </div>
            )}
          </main>
        ) : (
          <main className="board-main">
            <ActionBoard
              positions={positions}
              tas={taList.length > 0 ? taList : tas}
              allTAs={tas}
              onOpenPositionModal={setPoolModalPosition}
              onUpdatePosition={refreshPositions}
              onToggleFlag={handleToggleFlag}
              onReassign={handleReassign}
            />
          </main>
        )}
      </div>

      <AnimatePresence>
        {poolModalPosition && (
          <PositionDetailModal
            position={positions.find(p => p._id === poolModalPosition._id) || poolModalPosition}
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