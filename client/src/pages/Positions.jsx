import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPositions, deletePosition, updatePosition, assignPosition } from '../api/positions';
import { getClients } from '../api/clients';
import { getActiveTAs } from '../api/tas';
import { getColorLegend, updateColorLegend } from '../api/colorLegend';
import FlagBadge from '../components/FlagBadge';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { formatSalary } from '../utils/salaryFormatter';
import SalaryPackagePicker from '../components/SalaryPackagePicker';
import CandidateCvSection from '../components/CandidateCvSection';
import './Positions.css';

// ---- Constants ----
const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];
const PLEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5'];
const COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

const normalizeStatusParam = (status) => {
  if (!status) return '';
  const trimmed = status.trim();
  if (trimmed.toLowerCase() === 'active' || trimmed === 'A&P' || trimmed === 'A & P') {
    return 'A&P';
  }
  const match = STATUS_OPTIONS.find(s => s.toLowerCase() === trimmed.toLowerCase());
  return match || trimmed;
};

const FLAG_OPTIONS = [
  { value: 'followUp', label: 'Follow Up' },
  { value: 'addOn', label: 'Add-On' },
  { value: 'backup', label: 'Backup' },
  { value: 'goingGood', label: 'Going Good' },
  { value: 'reAssign', label: 'Reassign' }
];

const COLOR_HEX = {
  red: '#ef4444',
  orange: '#f59e0b',
  yellow: '#fde047',
  green: '#22c55e',
  teal: '#14b8a6',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

const PLEVEL_COLORS = {
  P1: { bg: '#7f1d1d', text: '#ffffff' },
  P2: { bg: '#dd2121f0', text: '#ffffff' },
  P3: { bg: '#f97316', text: '#ffffff' },
  P4: { bg: '#fdba74', text: '#7c2d12' },
  P5: { bg: '#fde047', text: '#78350f' },
};

const STATUS_COLORS = {
  'Yet to Activate': { bg: '#e5e7eb', text: '#374151' },
  'A&P': { bg: '#d1fae5', text: '#065f46' },
  'Fence': { bg: '#fecaca', text: '#991b1b' },
  'Hold': { bg: '#fef3c7', text: '#92400e' },
  'Paused': { bg: '#fde68a', text: '#78350f' },
  'Placed': { bg: '#bfdbfe', text: '#1e40af' },
  'Lost': { bg: '#fca5a5', text: '#7f1d1d' },
  'Focus': { bg: '#d1fae5', text: '#065f46' },
  'Client Decision': { bg: '#fbcfe8', text: '#831843' }
};

// ---- Shared color palette (duplicated from TAs.jsx) ----
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
const EditIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const ViewIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ---- View toggle icons ----
const TableViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="20" />
  </svg>
);

const GridViewIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// ---- HeaderFilter ----
function HeaderFilter({ options, value, onChange, allLabel = 'All', label, showLabel = false, searchable = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const getDisplayLabel = () => {
    if (!value) return showLabel ? allLabel : '';
    const option = options.find(o => o.value === value);
    return option ? option.label : (showLabel ? allLabel : '');
  };

  const filteredOptions = searchable && searchTerm
    ? options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  return (
    <div className="header-filter-wrap" ref={containerRef}>
      <button
        type="button"
        className={`header-filter-btn ${value ? 'header-filter-btn--active' : ''} ${showLabel ? 'header-filter-btn--pill' : ''}`}
        onClick={() => { setIsOpen(!isOpen); setSearchTerm(''); }}
        title={`Filter by ${label}`}
      >
        <FilterIcon />
        {showLabel && <span className="header-filter-title">{label}:</span>}
        <span className="header-filter-badge">{getDisplayLabel()}</span>
        <span className="header-filter-arrow">▾</span>
      </button>
      {isOpen && (
        <div className="header-filter-dropdown">
          {searchable && (
            <div className="header-filter-search-wrap">
              <input
                type="text"
                className="header-filter-search-input"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="header-filter-options-list">
            <button
              className={`header-filter-option ${!value ? 'selected' : ''}`}
              onClick={() => { onChange(''); setIsOpen(false); }}
            >
              <span className="hfo-check">{!value && <CheckIcon />}</span>
              <span>{allLabel}</span>
            </button>
            {filteredOptions.map(opt => (
              <button
                key={opt.value}
                className={`header-filter-option ${value === opt.value ? 'selected' : ''}`}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
              >
                <span className="hfo-check">{value === opt.value && <CheckIcon />}</span>
                <span>{opt.label}</span>
              </button>
            ))}
            {searchable && filteredOptions.length === 0 && (
              <div className="header-filter-no-results">No {label.toLowerCase()} found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- InlineDropdown ----
function InlineDropdown({ value, options, onChange, disabled, shape = 'pill', minWidth, triggerClassName }) {
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

  const handleToggle = () => {
    if (disabled) return;
    const willOpen = !isOpen;
    if (willOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow >= dropdownHeight) {
        setDirection('down');
      } else if (spaceAbove >= dropdownHeight) {
        setDirection('up');
      } else {
        setDirection(spaceBelow >= spaceAbove ? 'down' : 'up');
      }
    }
    setIsOpen(!isOpen);
  };

  const current = options.find(o => o.value === value);
  const triggerClass = shape === 'circle' ? 'inline-dropdown-circle' : 'inline-dropdown-pill';

  return (
    <div className="inline-dropdown-wrap" ref={containerRef} style={minWidth ? { minWidth } : undefined}>
      <button
        type="button"
        className={`${triggerClass}${triggerClassName ? ` ${triggerClassName}` : ''}`}
        style={current ? { backgroundColor: current.bg, color: current.text } : undefined}
        onClick={handleToggle}
        disabled={disabled}
        title={current ? current.label : ''}
      >
        {current ? current.label : value}
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`inline-dropdown-list inline-dropdown-list--${direction}`}>
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`inline-dropdown-option ${opt.value === value ? 'selected' : ''}`}
                style={{ backgroundColor: opt.bg, color: opt.text }}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- SingleInlineDropdown (updated to accept triggerStyle) ----
function SingleInlineDropdown({ value, options, onChange, disabled = false, placeholder = 'Assign TA', triggerStyle }) {
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
      const popoverHeight = 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow >= popoverHeight) setDirection('down');
      else if (spaceAbove >= popoverHeight) setDirection('up');
      else setDirection(spaceBelow >= spaceAbove ? 'down' : 'up');
    }
    setIsOpen(!isOpen);
  };

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  return (
    <div className="single-dropdown-wrap" ref={containerRef}>
      <button
        className="single-dropdown-trigger"
        style={triggerStyle}   // <-- apply custom style
        onClick={toggle}
        disabled={disabled}
        type="button"
      >
        {selectedLabel || placeholder}
        <span className="single-dropdown-arrow">▾</span>
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`single-dropdown-list single-dropdown-list--${direction}`}>
            <button
              className={`single-dropdown-option ${!value ? 'selected' : ''}`}
              onClick={() => { onChange(null); setIsOpen(false); }}
            >
              <span className="sdo-check">{!value && <CheckIcon />}</span>
              <span>— Unassigned —</span>
            </button>
            {options.map(opt => (
              <button
                key={opt.value}
                className={`single-dropdown-option ${value === opt.value ? 'selected' : ''}`}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
              >
                <span className="sdo-check">{value === opt.value && <CheckIcon />}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- ParallelAssigneesPicker ----
function ParallelAssigneesPicker({ values, options, onChange, disabled = false }) {
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
      const popoverHeight = 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow >= popoverHeight) setDirection('down');
      else if (spaceAbove >= popoverHeight) setDirection('up');
      else setDirection(spaceBelow >= spaceAbove ? 'down' : 'up');
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

  const selectedLabels = values
    .map(id => options.find(o => o.value === id)?.label)
    .filter(Boolean);

  return (
    <div className="parallel-picker-wrap" ref={containerRef}>
      <button
        className="parallel-picker-trigger"
        onClick={toggle}
        disabled={disabled}
        type="button"
      >
        {selectedLabels.length > 0 ? `+ ${selectedLabels.length} parallel` : '+ Add parallel'}
        <span className="parallel-picker-arrow">▾</span>
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`parallel-picker-list parallel-picker-list--${direction}`}>
            {options.map(opt => (
              <label key={opt.value} className="parallel-picker-option">
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

// ---- PositionDetailModal ----
function PositionDetailModal({ position, onClose, onUpdate, tas }) {
  const [activeTab, setActiveTab] = useState('details');
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg pos-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{position.jobOrderId}</h2>
          <button className="modal-close-btn" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="pos-detail-tab-bar">
          <button
            type="button"
            className={`pos-detail-tab ${activeTab === 'details' ? 'pos-detail-tab--active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Position Details
          </button>
          <button
            type="button"
            className={`pos-detail-tab ${activeTab === 'cvTracking' ? 'pos-detail-tab--active' : ''}`}
            onClick={() => setActiveTab('cvTracking')}
          >
            CV Tracking
          </button>
        </div>
        <div className="modal-body">
          {activeTab === 'details' ? (
            <>
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
                  <input type="text" value={editData.thisWeekFocus} onChange={e => handleChange('thisWeekFocus', e.target.value)} className="modal-input" placeholder="e.g., Schedule interviews, Review CVs..." />
                </div>
                <div className="modal-field">
                  <label>Remarks</label>
                  <textarea value={editData.remarks} onChange={e => handleChange('remarks', e.target.value)} className="modal-textarea" rows="4" placeholder="Add any notes or remarks about this position..." />
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
                          <td className="col-date">{round.dateAssigned ? new Date(round.dateAssigned).toLocaleDateString() : '—'}</td>
                          <td className="col-notes">{round.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {historyRounds.length === 5 && (editData.allocationRounds?.length || 0) > 5 && (
                  <p className="modal-history-more">+ {(editData.allocationRounds?.length || 0) - 5} more rounds</p>
                )}
              </div>
            </>
          ) : (
            <CandidateCvSection position={position} tas={tas} />
          )}
        </div>
        <div className="modal-footer">
          {activeTab === 'details' ? (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </>
          ) : (
            <button className="btn-secondary" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- PositionCard (grid view — Azeem's view) ----
function PositionCard({ pos, onView, onDelete }) {
  const statusColor = STATUS_COLORS[pos.status] || { bg: '#e5e7eb', text: '#374151' };
  const levelColor = PLEVEL_COLORS[pos.pLevel] || { bg: '#e5e7eb', text: '#374151' };
  const primaryName = pos.assignee?.name || 'Unassigned';
  const parallelCount = pos.parallelAssignees?.length || 0;

  return (
    <div
      className="position-card"
      style={{ borderTopColor: pos.highlightColor ? COLOR_HEX[pos.highlightColor] : 'transparent' }}
      onClick={() => onView(pos)}
    >
      <button
        className="position-card-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(pos); }}
        title="Delete position"
      >
        <DeleteIcon />
      </button>

      {/* Top row: enlarged P-Level circle only */}
      <div className="position-card-top">
        <span
          className="position-card-level-circle"
          style={{ background: levelColor.bg, color: levelColor.text }}
        >
          {pos.pLevel}
        </span>
        <span className="position-card-status" style={{ background: statusColor.bg, color: statusColor.text }}>
          {pos.status}
        </span>
      </div>

      {/* Position title — large */}
      <h3 className="position-card-title" title={pos.position}>{pos.position}</h3>

      {/* Client name — distinct color/weight */}
      <div className="position-card-client" title={pos.client?.clientName}>
        {pos.client?.clientName || '—'}
      </div>

      {/* Assignee */}
      <div className="position-card-assignee">
        {primaryName}{parallelCount > 0 && <span className="position-card-parallel"> +{parallelCount}</span>}
      </div>
    </div>
  );
}

// ---- PositionGroup (grid view grouping by P-Level) ----
function PositionGroup({ pLevel, positions, onView, onDelete, labelOverride }) {
  if (positions.length === 0) return null;
  const label = labelOverride || pLevel;
  const swatch = PLEVEL_COLORS[pLevel] || STATUS_COLORS[pLevel] || { bg: '#e5e7eb', text: '#374151' };
  return (
    <div className="position-group">
      <div className="position-group-header">
        <span
          className="position-group-label"
          style={{ background: swatch.bg, color: swatch.text }}
        >
          {label}
        </span>
        <span className="position-group-count">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="positions-grid">
        {positions.map(pos => (
          <PositionCard key={pos._id} pos={pos} onView={onView} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

const STORAGE_KEY = 'positionsPageState';

// ---- Column Configuration for Excel-Style Table ----
const COLUMN_CONFIG = [
  { id: 'jobOrderId', label: 'JO ID', defaultWidth: 105, minWidth: 85, maxWidth: 160, mandatory: true },
  { id: 'client', label: 'Client', defaultWidth: 170, minWidth: 120, maxWidth: 280, mandatory: false },
  { id: 'position', label: 'Position', defaultWidth: 230, minWidth: 160, maxWidth: 380, mandatory: true },
  { id: 'packageRange', label: 'Package Range', defaultWidth: 160, minWidth: 130, maxWidth: 280, mandatory: false },
  { id: 'pLevel', label: 'Level', defaultWidth: 90, minWidth: 70, maxWidth: 130, mandatory: false },
  { id: 'status', label: 'Status', defaultWidth: 140, minWidth: 110, maxWidth: 200, mandatory: false },
  { id: 'assignee', label: 'Assignees', defaultWidth: 190, minWidth: 140, maxWidth: 300, mandatory: false },
  { id: 'flag', label: 'Flags', defaultWidth: 155, minWidth: 120, maxWidth: 260, mandatory: false },
  { id: 'cvCount', label: 'Int Shortlist', defaultWidth: 100, minWidth: 75, maxWidth: 140, mandatory: false },
  { id: 'extShortlistCount', label: 'Ext Shortlist', defaultWidth: 120, minWidth: 85, maxWidth: 160, mandatory: false },
  { id: 'actions', label: 'Actions', defaultWidth: 135, minWidth: 115, maxWidth: 180, mandatory: true }
];

const DEFAULT_COL_WIDTHS = Object.fromEntries(COLUMN_CONFIG.map(col => [col.id, col.defaultWidth]));
const DEFAULT_COL_VISIBILITY = Object.fromEntries(COLUMN_CONFIG.map(col => [col.id, true]));

function ColumnVisibilityDropdown({ columns, visibility, onToggleVisibility, onResetLayout }) {
  const [isOpen, setIsOpen] = useState(false);
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

  const visibleCount = columns.filter(col => visibility[col.id] !== false).length;

  return (
    <div className="col-visibility-wrap" ref={containerRef}>
      <button
        type="button"
        className="col-visibility-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Show or hide columns"
        aria-label="Customize columns"
      >
        <SlidersHorizontal size={13} />
        <span>Columns ({visibleCount}/{columns.length})</span>
        <span className="col-visibility-arrow">▾</span>
      </button>

      {isOpen && (
        <div className="col-visibility-dropdown">
          <div className="col-visibility-header">
            <span className="col-visibility-title">Toggle Columns</span>
            <button
              type="button"
              className="col-visibility-reset-btn"
              onClick={() => {
                onResetLayout();
                setIsOpen(false);
              }}
              title="Reset column widths and visibility to defaults"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          </div>
          <div className="col-visibility-list">
            {columns.map(col => {
              const isChecked = visibility[col.id] !== false;
              return (
                <label
                  key={col.id}
                  className={`col-visibility-item ${col.mandatory ? 'col-visibility-item--disabled' : ''}`}
                  title={col.mandatory ? `${col.label} is mandatory and cannot be hidden` : undefined}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={col.mandatory}
                    onChange={() => onToggleVisibility(col.id)}
                  />
                  <span className="col-visibility-label">{col.label}</span>
                  {col.mandatory && <span className="col-visibility-badge">Locked</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_FILTERS = {
  client: '',
  assignee: '',
  status: '',
  pLevel: '',
  highlightColor: '',
  flag: '',
  search: ''
};

const getStoredPositionsState = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    // ignore
  }
  return null;
};

// ---- Main Positions Component ----
function Positions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  useLiveRefresh();

  const rootRef = useRef(null);
  const tableWrapperRef = useRef(null);
  const isRestoredRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const lastScrollTimeRef = useRef(0);

  const [loading, setLoading] = useState(true); // covers clients/tas/legend fetch only
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [tas, setTAs] = useState([]);
  const [legend, setLegend] = useState(COLOR_KEYS.map(key => ({ key, label: '' })));
  const [filters, setFilters] = useState(() => {
    const stored = getStoredPositionsState();
    const initialFilters = {
      ...DEFAULT_FILTERS,
      ...(stored?.filters || {})
    };
    const statusParam = searchParams.get('status');
    if (statusParam !== null && statusParam !== '') {
      initialFilters.status = normalizeStatusParam(statusParam);
    }
    return initialFilters;
  });
  const [viewMode, setViewMode] = useState(() => {
    const stored = getStoredPositionsState();
    return stored?.viewMode === 'grid' || stored?.viewMode === 'table' ? stored.viewMode : 'table';
  });

  // Column width & visibility state for Excel-style table
  const [colWidths, setColWidths] = useState(() => {
    const stored = getStoredPositionsState();
    return {
      ...DEFAULT_COL_WIDTHS,
      ...(stored?.colWidths || {})
    };
  });

  const [colVisibility, setColVisibility] = useState(() => {
    const stored = getStoredPositionsState();
    return {
      ...DEFAULT_COL_VISIBILITY,
      ...(stored?.colVisibility || {})
    };
  });

  // Column resizing state ref
  const resizingColRef = useRef(null);

  const handleStartResize = (e, colId) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colId] || DEFAULT_COL_WIDTHS[colId] || 120;
    const colConfig = COLUMN_CONFIG.find(c => c.id === colId) || { minWidth: 70, maxWidth: 450 };

    resizingColRef.current = { colId, startX, startWidth, minWidth: colConfig.minWidth, maxWidth: colConfig.maxWidth };
    document.body.classList.add('table-resizing-active');

    const handleMouseMove = (moveEvent) => {
      if (!resizingColRef.current) return;
      const deltaX = moveEvent.clientX - resizingColRef.current.startX;
      const nextWidth = Math.max(
        resizingColRef.current.minWidth,
        Math.min(resizingColRef.current.maxWidth, resizingColRef.current.startWidth + deltaX)
      );
      setColWidths(prev => ({
        ...prev,
        [resizingColRef.current.colId]: nextWidth
      }));
    };

    const handleMouseUp = () => {
      resizingColRef.current = null;
      document.body.classList.remove('table-resizing-active');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleToggleColumnVisibility = (colId) => {
    const col = COLUMN_CONFIG.find(c => c.id === colId);
    if (col?.mandatory) return; // cannot hide mandatory columns

    setColVisibility(prev => ({
      ...prev,
      [colId]: prev[colId] === false ? true : false
    }));
  };

  const handleResetLayout = () => {
    setColWidths({ ...DEFAULT_COL_WIDTHS });
    setColVisibility({ ...DEFAULT_COL_VISIBILITY });
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [colorPopoverId, setColorPopoverId] = useState(null);
  const [flagPopoverId, setFlagPopoverId] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [flagPopoverDirection, setFlagPopoverDirection] = useState({});
  const [salaryModalPosition, setSalaryModalPosition] = useState(null);
  const [tempSalaryModalData, setTempSalaryModalData] = useState(null);
  const [savingSalaryModal, setSavingSalaryModal] = useState(false);

  // ---- Positions now live in the shared TanStack Query cache instead of
  // local state. This is what lets useLiveRefresh() (SSE-driven) and every
  // other page's invalidateQueries(['positions']) actually update what's
  // shown here, instead of sitting stale until a manual reload. ----
  const {
    data: positions = [],
    isLoading: positionsLoading,
    error: positionsError,
  } = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions().then(res => res.data),
  });

  // ---- Data fetch (clients / TAs / legend — unrelated to live updates) ----
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, taRes, legendRes] = await Promise.all([
          getClients(),
          getActiveTAs(),
          getColorLegend()
        ]);
        setClients(clientRes.data);
        setTAs(taRes.data);
        if (legendRes.data?.entries?.length) {
          setLegend(legendRes.data.entries);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Persist filters, viewMode, colWidths, and colVisibility to sessionStorage
  useEffect(() => {
    try {
      const existing = getStoredPositionsState() || {};
      const nextState = {
        ...existing,
        filters,
        viewMode,
        colWidths,
        colVisibility
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (e) {
      // ignore
    }
  }, [filters, viewMode, colWidths, colVisibility]);

  const saveScrollState = (patch) => {
    try {
      const existing = getStoredPositionsState() || {};
      const nextState = {
        ...existing,
        ...patch
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (e) {
      // ignore
    }
  };

  const throttledSaveScroll = (patch) => {
    const now = Date.now();
    const remaining = 150 - (now - lastScrollTimeRef.current);
    if (remaining <= 0) {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      lastScrollTimeRef.current = now;
      saveScrollState(patch);
    } else {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        lastScrollTimeRef.current = Date.now();
        saveScrollState(patch);
      }, remaining);
    }
  };

  // Track scroll on <main> container
  useEffect(() => {
    const mainEl = rootRef.current?.closest('main');
    if (!mainEl) return;

    const handleMainScroll = () => {
      throttledSaveScroll({
        mainScroll: { top: mainEl.scrollTop, left: mainEl.scrollLeft }
      });
    };

    mainEl.addEventListener('scroll', handleMainScroll, { passive: true });
    return () => {
      mainEl.removeEventListener('scroll', handleMainScroll);
    };
  }, [loading, positionsLoading]);

  // Restore scroll positions after data loads
  useLayoutEffect(() => {
    if (loading || positionsLoading) return;
    if (isRestoredRef.current) return;
    isRestoredRef.current = true;

    const stored = getStoredPositionsState();
    if (!stored) return;

    requestAnimationFrame(() => {
      const mainEl = rootRef.current?.closest('main');
      if (mainEl && stored.mainScroll !== undefined) {
        const top = typeof stored.mainScroll === 'object' ? stored.mainScroll.top : stored.mainScroll;
        const left = typeof stored.mainScroll === 'object' ? stored.mainScroll.left : 0;
        mainEl.scrollTop = top || 0;
        if (left) mainEl.scrollLeft = left;
      }

      if (tableWrapperRef.current && stored.tableScroll !== undefined) {
        const top = typeof stored.tableScroll === 'object' ? stored.tableScroll.top : stored.tableScroll;
        const left = typeof stored.tableScroll === 'object' ? stored.tableScroll.left : 0;
        tableWrapperRef.current.scrollTop = top || 0;
        if (left) tableWrapperRef.current.scrollLeft = left;
      }
    });
  }, [loading, positionsLoading]);

  const invalidatePositionsCache = () => {
    queryClient.invalidateQueries(['positions']);
    queryClient.invalidateQueries(['tas']);
  };

  const legendLabel = (key) => legend.find(e => e.key === key)?.label || '';

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam !== null) {
      const normalized = normalizeStatusParam(statusParam);
      setFilters(prev => {
        if (prev.status !== normalized) {
          return { ...prev, status: normalized };
        }
        return prev;
      });
    }
  }, [searchParams]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    if (field === 'status') {
      const nextParams = new URLSearchParams(searchParams);
      if (value) {
        nextParams.set('status', value);
      } else {
        nextParams.delete('status');
      }
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleClearFilters = () => {
    setFilters({ client: '', assignee: '', status: '', pLevel: '', highlightColor: '', flag: '', search: '' });
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('status');
    setSearchParams(nextParams, { replace: true });
  };

  const computeFlagPopoverDirection = (triggerElement) => {
    if (!triggerElement) return 'up';
    const rect = triggerElement.getBoundingClientRect();
    const popoverHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow >= popoverHeight) return 'down';
    else if (spaceAbove >= popoverHeight) return 'up';
    else return spaceBelow >= spaceAbove ? 'down' : 'up';
  };

  // ---- Filtering & Sorting ----
  const ARCHIVE_STATUSES = ['Placed', 'Lost', 'Hold'];

  const filteredPositions = useMemo(() => {
    let filtered = positions.filter(pos => {
      // Base exclusion: archived statuses never appear in main view unless explicitly selected in the status filter
      if (ARCHIVE_STATUSES.includes(pos.status) && filters.status !== pos.status) return false;

      const matchesClient = !filters.client || pos.client?._id === filters.client;

      let matchesAssignee = true;
      if (filters.assignee) {
        if (filters.assignee === 'unassigned') {
          matchesAssignee = !pos.assignee && (!pos.parallelAssignees || pos.parallelAssignees.length === 0);
        } else {
          matchesAssignee =
            pos.assignee?._id === filters.assignee ||
            (pos.parallelAssignees || []).some(pa => pa._id === filters.assignee);
        }
      }

      const matchesStatus = !filters.status || pos.status === filters.status;
      const matchesPLevel = !filters.pLevel || pos.pLevel === filters.pLevel;
      const matchesHighlight = !filters.highlightColor || pos.highlightColor === filters.highlightColor;
      let matchesFlag = true;
      if (filters.flag) {
        const flags = pos.flags || {};
        matchesFlag = flags[filters.flag] !== null && flags[filters.flag] !== undefined;
      }

      // Word-based matching: every word in the search box must appear
      // somewhere across JO ID / position / client, independent of order.
      // This is what lets "Head marketing" match "Head of Marketing".
      const searchWords = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
      const matchesSearch = searchWords.length === 0 || searchWords.every(word =>
        pos.jobOrderId.toLowerCase().includes(word) ||
        pos.position.toLowerCase().includes(word) ||
        (pos.client?.clientName || '').toLowerCase().includes(word)
      );

      return matchesClient && matchesAssignee && matchesStatus &&
             matchesPLevel && matchesHighlight && matchesFlag && matchesSearch;
    });

    const focus = filtered.filter(p => p.status === 'Focus');
    const clientDecision = filtered.filter(p => p.status === 'Client Decision');
    const others = filtered.filter(p => p.status !== 'Focus' && p.status !== 'Client Decision');

    const sortAlpha = (a, b) => {
      const clientA = (a.client?.clientName || '').toLowerCase();
      const clientB = (b.client?.clientName || '').toLowerCase();
      if (clientA !== clientB) return clientA.localeCompare(clientB);
      return (a.position || '').localeCompare(b.position || '');
    };

    focus.sort(sortAlpha);
    others.sort(sortAlpha);
    clientDecision.sort(sortAlpha);

    return [...focus, ...others, ...clientDecision];
  }, [positions, filters]);

  // ---- CRUD handlers ----

  const handlePrimaryAssign = async (pos, newTaId) => {
    const oldAssignee = pos.assignee?._id || null;
    if (oldAssignee === newTaId) return;

    setUpdatingId(pos._id);
    queryClient.setQueryData(['positions'], prev =>
      (prev || []).map(p =>
        p._id === pos._id
          ? { ...p, assignee: newTaId ? tas.find(t => t._id === newTaId) : null }
          : p
      )
    );

    try {
      const res = await assignPosition(pos._id, newTaId, newTaId ? 'Primary assignment changed' : 'Unassigned', 'primary');
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p => {
          if (p._id !== pos._id) return p;
          const merged = { ...p, ...res.data };
          merged.assignee = newTaId ? tas.find(t => t._id === newTaId) : null;
          return merged;
        })
      );
      invalidatePositionsCache();
    } catch (err) {
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p =>
          p._id === pos._id
            ? { ...p, assignee: oldAssignee ? tas.find(t => t._id === oldAssignee) : null }
            : p
        )
      );
      alert(err.response?.data?.error || 'Failed to assign TA');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleParallelAssign = async (pos, newParallelIds) => {
    const oldParallel = pos.parallelAssignees?.map(a => a._id) || [];
    const sortedOld = [...oldParallel].sort();
    const sortedNew = [...newParallelIds].sort();
    if (sortedOld.join(',') === sortedNew.join(',')) return;

    setUpdatingId(pos._id);
    queryClient.setQueryData(['positions'], prev =>
      (prev || []).map(p =>
        p._id === pos._id
          ? { ...p, parallelAssignees: newParallelIds.map(id => tas.find(t => t._id === id)).filter(Boolean) }
          : p
      )
    );

    try {
      const res = await updatePosition(pos._id, { parallelAssignees: newParallelIds });
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p => {
          if (p._id !== pos._id) return p;
          return { ...p, ...res.data };
        })
      );
      invalidatePositionsCache();
    } catch (err) {
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p =>
          p._id === pos._id
            ? { ...p, parallelAssignees: oldParallel.map(id => tas.find(t => t._id === id)).filter(Boolean) }
            : p
        )
      );
      alert(err.response?.data?.error || 'Failed to update parallel assignees');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDirectUpdate = async (pos, field, value) => {
    if (field === 'assignee') {
      await handlePrimaryAssign(pos, value);
      return;
    }
    const prevValue = pos[field];
    setUpdatingId(pos._id);
    queryClient.setQueryData(['positions'], prev =>
      (prev || []).map(p =>
        p._id === pos._id ? { ...p, [field]: value } : p
      )
    );
    try {
      const res = await updatePosition(pos._id, { [field]: value });
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p => {
          if (p._id !== pos._id) return p;
          return { ...p, ...res.data };
        })
      );
      invalidatePositionsCache();
    } catch (err) {
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p =>
          p._id === pos._id ? { ...p, [field]: prevValue } : p
        )
      );
      alert(err.response?.data?.error || `Failed to update ${field}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // ---- Color, Flag, Delete, Edit ----
  const handleColorChange = async (pos, colorKey) => {
    if (colorKey === pos.highlightColor) { setColorPopoverId(null); return; }
    const prevColor = pos.highlightColor;
    queryClient.setQueryData(['positions'], prev => (prev || []).map(p => p._id === pos._id ? { ...p, highlightColor: colorKey } : p));
    setColorPopoverId(null);
    try {
      await updatePosition(pos._id, { highlightColor: colorKey });
    } catch (err) {
      queryClient.setQueryData(['positions'], prev => (prev || []).map(p => p._id === pos._id ? { ...p, highlightColor: prevColor } : p));
      alert(err.response?.data?.error || 'Failed to set highlight color');
    }
  };

  const startEdit = (pos) => {
    setEditingId(pos._id);
    setEditForm({
      position: pos.position,
      client: pos.client?._id || '',
      packageRange: pos.packageRange || '',
      salary: pos.salary || null,
      cvCount: pos.cvCount ?? '',
      extShortlistCount: pos.extShortlistCount ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const saveEdit = async (pos) => {
    if (!editForm.position?.trim()) return alert('Position title is required');
    setSavingEdit(true);
    try {
      const payload = {
        position: editForm.position.trim(),
        client: editForm.client || null,
        packageRange: editForm.packageRange ? editForm.packageRange.trim() : '',
        salary: editForm.salary !== undefined ? editForm.salary : (pos.salary || null),
        cvCount: editForm.cvCount === '' ? null : Number(editForm.cvCount),
        extShortlistCount: editForm.extShortlistCount === ''
          ? null
          : editForm.extShortlistCount === 'Client Review'
            ? 'Client Review'
            : Number(editForm.extShortlistCount),
      };
      const res = await updatePosition(pos._id, payload);
      queryClient.setQueryData(['positions'], prev =>
        (prev || []).map(p => {
          if (p._id !== pos._id) return p;
          return { ...p, ...res.data };
        })
      );
      invalidatePositionsCache();
      setEditingId(null);
      setEditForm({});
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFlagOverrideChange = async (pos, flagKey, mode) => {
    const prevOverrides = pos.flagOverrides || {};
    if ((prevOverrides[flagKey] || 'auto') === mode) { setFlagPopoverId(null); return; }
    const nextOverrides = { ...prevOverrides, [flagKey]: mode };
    setFlagPopoverId(null);
    setUpdatingId(pos._id);
    try {
      const res = await updatePosition(pos._id, { flagOverrides: nextOverrides });
      queryClient.setQueryData(['positions'], prev => (prev || []).map(p => p._id === pos._id ? res.data : p));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update flag');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteClick = (pos) => {
    setDeleteTarget(pos);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePosition(deleteTarget._id);
      queryClient.setQueryData(['positions'], prev => (prev || []).filter(p => p._id !== deleteTarget._id));
      setShowDeleteModal(false);
      setDeleteTarget(null);
      invalidatePositionsCache();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete position');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const handleLegendLabelChange = (key, value) => {
    setLegend(prev => prev.map(e => e.key === key ? { ...e, label: value } : e));
  };

  const saveLegend = async () => {
    try {
      await updateColorLegend(legend);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save legend');
    }
  };

  const refreshList = async () => {
    queryClient.invalidateQueries(['positions']);
  };

  // ---- Options ----
  const clientOptions = clients.map(c => ({ value: c._id, label: c.clientName }));
  const assigneeOptions = [
    { value: 'unassigned', label: 'Unassigned' },
    ...tas.map(ta => ({ value: ta._id, label: ta.name }))
  ];
  const statusOptions = STATUS_OPTIONS.map(s => ({ value: s, label: s }));
  const levelOptions = PLEVEL_OPTIONS.map(p => ({ value: p, label: p }));
  const colorOptions = [
    { value: '', label: 'None' },
    ...COLOR_KEYS.map(key => ({ value: key, label: legendLabel(key) || key }))
  ];
  const flagOptions = FLAG_OPTIONS.map(f => ({ value: f.value, label: f.label }));

  // Filter dropdown excludes archived statuses (unless one is currently selected)
  const filterStatusOptions = (
    ARCHIVE_STATUSES.includes(filters.status)
      ? STATUS_OPTIONS
      : STATUS_OPTIONS.filter(s => !ARCHIVE_STATUSES.includes(s))
  ).map(s => ({ value: s, label: s }));

  // Inline row status dropdown keeps ALL statuses so users can archive from the row
  const rowStatusOptions = STATUS_OPTIONS.map(s => {
    const sc = STATUS_COLORS[s] || { bg: '#e5e7eb', text: '#374151' };
    return { value: s, label: s, bg: sc.bg, text: sc.text };
  });
  const rowLevelOptions = PLEVEL_OPTIONS.map(p => {
    const lc = PLEVEL_COLORS[p];
    return { value: p, label: p, bg: lc.bg, text: lc.text };
  });
  const parallelOptions = tas.map(ta => ({ value: ta._id, label: ta.name }));

  if (loading || positionsLoading) return <div className="positions-loading">Loading positions...</div>;
  if (error || positionsError) return <div className="positions-error">Error: {error || positionsError?.message}</div>;

  // ---- Grid view grouping: Fence positions pinned to the top regardless
  // of P-Level, everything else grouped by P-Level as before. ----
  const fencePositions = filteredPositions.filter(p => p.status === 'Fence');
  const nonFenceByLevel = (pl) => filteredPositions.filter(p => p.pLevel === pl && p.status !== 'Fence');

  return (
    <div ref={rootRef} className="positions">
      <div className="positions-header">
        <h1>Positions</h1>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <TableViewIcon /> Table
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <GridViewIcon /> Grid
            </button>
          </div>
          <button className="btn-primary" onClick={() => navigate('/positions/new')}>+ New Position</button>
        </div>
      </div>

      <div className="color-legend-bar">
        <span className="legend-bar-label">Highlight colors</span>
        <div className="legend-swatches">
          {COLOR_KEYS.map(key => (
            <div className="legend-swatch-item" key={key}>
              <span className="legend-swatch-dot" style={{ background: COLOR_HEX[key] }} />
              <input className="legend-label-input" value={legendLabel(key)} placeholder="Unlabeled" onChange={(e) => handleLegendLabelChange(key, e.target.value)} onBlur={saveLegend} />
            </div>
          ))}
        </div>
      </div>

      <div className="filters-bar">
        <input type="text" name="search" placeholder="Search by JO ID, position, client..." value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)} className="filter-search" />
        <div className="filters-group">
          <HeaderFilter options={clientOptions} value={filters.client} onChange={(v) => handleFilterChange('client', v)} allLabel="All" label="Client" showLabel searchable />
          <HeaderFilter options={filterStatusOptions} value={filters.status} onChange={(v) => handleFilterChange('status', v)} allLabel="All" label="Status" showLabel />
          <HeaderFilter options={assigneeOptions} value={filters.assignee} onChange={(v) => handleFilterChange('assignee', v)} allLabel="All" label="Assignee" showLabel searchable />
          <HeaderFilter options={flagOptions} value={filters.flag} onChange={(v) => handleFilterChange('flag', v)} allLabel="All" label="Flag" showLabel />
          {viewMode === 'table' && (
            <ColumnVisibilityDropdown
              columns={COLUMN_CONFIG}
              visibility={colVisibility}
              onToggleVisibility={handleToggleColumnVisibility}
              onResetLayout={handleResetLayout}
            />
          )}
          {(filters.client || filters.pLevel || filters.status || filters.assignee || filters.flag || filters.highlightColor || filters.search) && (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {viewMode === 'table' ? (
        <div
          ref={tableWrapperRef}
          className="table-wrapper"
          onScroll={(e) => {
            throttledSaveScroll({
              tableScroll: { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft }
            });
          }}
        >
          <table className="positions-table">
            <colgroup>
              {COLUMN_CONFIG.map(col => {
                if (colVisibility[col.id] === false) return null;
                const width = colWidths[col.id] || col.defaultWidth;
                return <col key={col.id} style={{ width: `${width}px` }} />;
              })}
            </colgroup>
            <thead>
              <tr>
                {colVisibility.jobOrderId !== false && (
                  <th className="th-sticky-1">
                    <span className="th-content">JO ID</span>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'jobOrderId')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.client !== false && (
                  <th className="th-with-filter">
                    <div className="th-content">
                      <span>Client</span>
                      <HeaderFilter options={clientOptions} value={filters.client} onChange={(v) => handleFilterChange('client', v)} allLabel="All" label="Client" />
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'client')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.position !== false && (
                  <th
                    className="th-sticky-2"
                    style={{ left: `${colVisibility.jobOrderId !== false ? (colWidths.jobOrderId || 105) : 0}px` }}
                  >
                    <span className="th-content">Position</span>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'position')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.packageRange !== false && (
                  <th>
                    <span className="th-content">Package Range</span>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'packageRange')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.pLevel !== false && (
                  <th className="th-with-filter">
                    <div className="th-content">
                      <span>Level</span>
                      <HeaderFilter options={levelOptions} value={filters.pLevel} onChange={(v) => handleFilterChange('pLevel', v)} allLabel="All" label="Level" />
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'pLevel')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.status !== false && (
                  <th className="th-with-filter">
                    <div className="th-content">
                      <span>Status</span>
                      <HeaderFilter options={filterStatusOptions} value={filters.status} onChange={(v) => handleFilterChange('status', v)} allLabel="All" label="Status" />
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'status')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.assignee !== false && (
                  <th className="th-with-filter">
                    <div className="th-content">
                      <span>Assignees</span>
                      <HeaderFilter options={assigneeOptions} value={filters.assignee} onChange={(v) => handleFilterChange('assignee', v)} allLabel="All" label="Assignee" />
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'assignee')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.flag !== false && (
                  <th className="th-with-filter">
                    <div className="th-content">
                      <span>Flags</span>
                      <HeaderFilter options={flagOptions} value={filters.flag} onChange={(v) => handleFilterChange('flag', v)} allLabel="All" label="Flag" />
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'flag')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.cvCount !== false && (
                  <th>
                    <span className="th-content">Int Shortlist</span>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'cvCount')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.extShortlistCount !== false && (
                  <th>
                    <span className="th-content">Ext Shortlist</span>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'extShortlistCount')}
                      title="Drag to resize"
                    />
                  </th>
                )}

                {colVisibility.actions !== false && (
                  <th className="th-with-filter">
                    <div className="th-content">
                      <span>Actions</span>
                      <HeaderFilter options={colorOptions} value={filters.highlightColor} onChange={(v) => handleFilterChange('highlightColor', v)} allLabel="All" label="Color" />
                    </div>
                    <div
                      className="col-resizer"
                      onMouseDown={(e) => handleStartResize(e, 'actions')}
                      title="Drag to resize"
                    />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredPositions.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_CONFIG.filter(c => colVisibility[c.id] !== false).length} className="no-rows">
                    No positions found
                  </td>
                </tr>
              ) : (
                filteredPositions.map(pos => {
                  const flagEntries = pos.flags ? Object.entries(pos.flags).filter(([, f]) => f !== null) : [];
                  const isEditing = editingId === pos._id;
                  const isUpdating = updatingId === pos._id;

                  let rowClassName = '';
                  if (pos.highlightColor === 'blue') rowClassName = 'row-tint-blue';
                  else if (pos.highlightColor === 'red') rowClassName = 'row-tint-red';

                  const currentAssigneeId = pos.assignee?._id || null;
                  const currentParallelIds = pos.parallelAssignees?.map(a => a._id) || [];

                  // Compute trigger style from primary assignee's color (if any)
                  const primaryTA = pos.assignee;
                  const triggerStyle = primaryTA?.color
                    ? { backgroundColor: TA_COLORS[primaryTA.color].bg, color: TA_COLORS[primaryTA.color].text, borderColor: 'transparent' }
                    : undefined;

                  const stickyCol1Width = colVisibility.jobOrderId !== false ? (colWidths.jobOrderId || 105) : 0;

                  return (
                    <tr key={pos._id} className={rowClassName}>
                      {colVisibility.jobOrderId !== false && (
                        <td className="td-sticky-1">
                          <Link to={`/positions/${pos._id}`} className="jo-link">{pos.jobOrderId}</Link>
                        </td>
                      )}

                      {colVisibility.client !== false && (
                        <td>
                          {isEditing ? (
                            <select className="inline-edit-input" name="client" value={editForm.client} onChange={handleEditFormChange}>
                              <option value="">— Select client —</option>
                              {clientOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-ellipsis">{pos.client?.clientName || '—'}</span>
                          )}
                        </td>
                      )}

                      {colVisibility.position !== false && (
                        <td className="td-sticky-2" style={{ left: `${stickyCol1Width}px` }}>
                          {isEditing ? (
                            <input className="inline-edit-input" name="position" value={editForm.position} onChange={handleEditFormChange} placeholder="Position title" />
                          ) : (
                            <span className="text-ellipsis" title={pos.position}>{pos.position}</span>
                          )}
                        </td>
                      )}

                      {colVisibility.packageRange !== false && (
                        <td className="td-dropdown">
                          {isEditing ? (
                            <div className="salary-inline-cell">
                              <button
                                type="button"
                                className="salary-inline-btn"
                                onClick={() => {
                                  setTempSalaryModalData({
                                    salary: editForm.salary !== undefined ? editForm.salary : pos.salary,
                                    packageRange: editForm.packageRange !== undefined ? editForm.packageRange : pos.packageRange
                                  });
                                  setSalaryModalPosition(pos);
                                }}
                                title="Click to configure structured salary package"
                              >
                                <span className="text-ellipsis">
                                  {formatSalary(editForm.salary, editForm.packageRange) || 'Configure'}
                                </span>
                                <span className="salary-inline-btn-badge">⚙️</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="salary-cell-view-btn"
                              onClick={() => {
                                setTempSalaryModalData({
                                  salary: pos.salary,
                                  packageRange: pos.packageRange
                                });
                                setSalaryModalPosition(pos);
                              }}
                              title="Click to view or edit salary package"
                            >
                              <span className="package-range-value">{formatSalary(pos.salary, pos.packageRange) || '—'}</span>
                              <span className="salary-cell-hover-icon">✏️</span>
                            </button>
                          )}
                        </td>
                      )}

                      {colVisibility.pLevel !== false && (
                        <td className="td-dropdown">
                          <InlineDropdown value={pos.pLevel} options={rowLevelOptions} onChange={(v) => handleDirectUpdate(pos, 'pLevel', v)} disabled={isUpdating} shape="circle" />
                        </td>
                      )}

                      {colVisibility.status !== false && (
                        <td className="td-dropdown">
                          <InlineDropdown value={pos.status} options={rowStatusOptions} onChange={(v) => handleDirectUpdate(pos, 'status', v)} disabled={isUpdating} shape="pill" />
                        </td>
                      )}

                      {colVisibility.assignee !== false && (
                        <td className="td-dropdown">
                          <div className="assignee-cell">
                            <SingleInlineDropdown
                              value={currentAssigneeId}
                              options={assigneeOptions.map(opt => ({ ...opt, value: opt.value === 'unassigned' ? null : opt.value }))}
                              onChange={(newId) => handleDirectUpdate(pos, 'assignee', newId)}
                              disabled={isUpdating}
                              placeholder="Assign TA"
                              triggerStyle={triggerStyle}
                            />
                            <ParallelAssigneesPicker
                              values={currentParallelIds}
                              options={parallelOptions}
                              onChange={(newIds) => handleParallelAssign(pos, newIds)}
                              disabled={isUpdating}
                            />
                            {currentParallelIds.length > 0 && (
                              <div className="parallel-chips">
                                {currentParallelIds.map(id => {
                                  const ta = tas.find(t => t._id === id);
                                  const chipStyle = ta?.color
                                    ? { backgroundColor: TA_COLORS[ta.color].bg, color: TA_COLORS[ta.color].text }
                                    : undefined;
                                  return ta ? (
                                    <span key={id} className="parallel-chip" style={chipStyle}>
                                      {ta.name}
                                      <button className="parallel-chip-remove" onClick={() => {
                                        const newIds = currentParallelIds.filter(i => i !== id);
                                        handleParallelAssign(pos, newIds);
                                      }} disabled={isUpdating}>×</button>
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {colVisibility.flag !== false && (
                        <td className="td-dropdown">
                          <div className="flags-cell">
                            {flagEntries.map(([flagKey, flag]) => {
                              const popoverKey = `${pos._id}:${flagKey}`;
                              const currentMode = pos.flagOverrides?.[flagKey] || 'auto';
                              const isOpen = flagPopoverId === popoverKey;
                              const direction = flagPopoverDirection[popoverKey] || 'up';
                              return (
                                <div className="flag-badge-wrap" key={flagKey}>
                                  <button type="button" className="flag-badge-btn" onClick={(e) => {
                                    if (flagPopoverId === popoverKey) setFlagPopoverId(null);
                                    else {
                                      const dir = computeFlagPopoverDirection(e.currentTarget);
                                      setFlagPopoverDirection(prev => ({ ...prev, [popoverKey]: dir }));
                                      setFlagPopoverId(popoverKey);
                                    }
                                  }} title={`${flag.label} — click to change`}>
                                    <FlagBadge flag={flag} />
                                  </button>
                                  {isOpen && (
                                    <>
                                      <div className="popover-backdrop" onClick={() => setFlagPopoverId(null)} />
                                      <div className={`flag-popover flag-popover--${direction}`}>
                                        <div className="flag-popover-title">{flag.label}</div>
                                        {['auto', 'on', 'off'].map(mode => (
                                          <button key={mode} className={`flag-popover-option ${currentMode === mode ? 'selected' : ''}`} onClick={() => handleFlagOverrideChange(pos, flagKey, mode)}>
                                            {mode === 'auto' ? 'Auto (default)' : mode === 'on' ? 'Force On' : 'Turn Off'}
                                          </button>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            <div className="flag-badge-wrap">
                              <button type="button" className="flag-add-btn" onClick={(e) => {
                                const manageKey = `${pos._id}:manage`;
                                if (flagPopoverId === manageKey) setFlagPopoverId(null);
                                else {
                                  const dir = computeFlagPopoverDirection(e.currentTarget);
                                  setFlagPopoverDirection(prev => ({ ...prev, [manageKey]: dir }));
                                  setFlagPopoverId(manageKey);
                                }
                              }} title="Manage all flags">+</button>
                              {flagPopoverId === `${pos._id}:manage` && (
                                <>
                                  <div className="popover-backdrop" onClick={() => setFlagPopoverId(null)} />
                                  <div className={`flag-popover flag-popover--manage flag-popover--${flagPopoverDirection[`${pos._id}:manage`] || 'up'}`}>
                                    <div className="flag-popover-title">Manage Flags</div>
                                    {FLAG_OPTIONS.map(({ value: flagKey, label }) => {
                                      const currentMode = pos.flagOverrides?.[flagKey] || 'auto';
                                      return (
                                        <div className="flag-manage-row" key={flagKey}>
                                          <span className="flag-manage-label">{label}</span>
                                          <div className="flag-manage-btns">
                                            {['auto', 'on', 'off'].map(mode => (
                                              <button key={mode} className={`flag-mode-btn ${currentMode === mode ? 'active' : ''}`} onClick={() => handleFlagOverrideChange(pos, flagKey, mode)}>
                                                {mode === 'auto' ? 'Auto' : mode === 'on' ? 'On' : 'Off'}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      )}

                      {colVisibility.cvCount !== false && (
                        <td>
                          {isEditing ? (
                            <input type="number" min="0" className="inline-edit-input inline-edit-input--num" name="cvCount" value={editForm.cvCount} onChange={handleEditFormChange} />
                          ) : (pos.cvCount ?? '—')}
                        </td>
                      )}

                      {colVisibility.extShortlistCount !== false && (
                        <td>
                          {isEditing ? (
                            <div className="ext-shortlist-edit">
                              <input type="text" inputMode="numeric" className="inline-edit-input inline-edit-input--num" name="extShortlistCount" value={editForm.extShortlistCount === 'Client Review' ? '' : editForm.extShortlistCount} onChange={handleEditFormChange} placeholder="Number" disabled={editForm.extShortlistCount === 'Client Review'} />
                              <select className="ext-shortlist-select" value={editForm.extShortlistCount === 'Client Review' ? 'clientReview' : ''} onChange={(e) => {
                                if (e.target.value === 'clientReview') setEditForm(prev => ({ ...prev, extShortlistCount: 'Client Review' }));
                                else setEditForm(prev => ({ ...prev, extShortlistCount: '' }));
                              }} title="Or mark as Client Review instead of a number">
                                <option value="">#</option>
                                <option value="clientReview">Client Review</option>
                              </select>
                            </div>
                          ) : pos.extShortlistCount === 'Client Review' ? (
                            <span className="ext-shortlist-badge ext-shortlist-badge--review">Client Review</span>
                          ) : (pos.extShortlistCount ?? '—')}
                        </td>
                      )}

                      {colVisibility.actions !== false && (
                        <td className="td-dropdown">
                          <div className="actions-cell">
                            <div className="color-picker-wrap">
                              <button className="color-swatch-btn" style={{ background: pos.highlightColor ? COLOR_HEX[pos.highlightColor] : '#e5e7eb', border: pos.highlightColor ? '2px solid rgba(0,0,0,0.15)' : '2px dashed #d1d5db' }} onClick={() => setColorPopoverId(colorPopoverId === pos._id ? null : pos._id)} title="Set highlight color" />
                              {colorPopoverId === pos._id && (
                                <>
                                  <div className="popover-backdrop" onClick={() => setColorPopoverId(null)} />
                                  <div className="color-popover">
                                    <button className="color-popover-option" onClick={() => handleColorChange(pos, null)}><span className="color-swatch-dot color-swatch-dot--none" />None</button>
                                    {COLOR_KEYS.map(key => (
                                      <button key={key} className="color-popover-option" onClick={() => handleColorChange(pos, key)}><span className="color-swatch-dot" style={{ background: COLOR_HEX[key] }} />{legendLabel(key) || key}</button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                            {isEditing ? (
                              <>
                                <button className="action-save" onClick={() => saveEdit(pos)} disabled={savingEdit}>Save</button>
                                <button className="action-cancel" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button className="action-edit" onClick={() => startEdit(pos)} title="Edit row"><EditIcon /></button>
                                <button className="action-link" onClick={() => setSelectedPosition(pos)} title="View details"><ViewIcon /></button>
                                <button className="action-delete" onClick={() => handleDeleteClick(pos)} title="Delete position"><DeleteIcon /></button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="positions-grouped">
          {filteredPositions.length === 0 ? (
            <div className="no-rows">No positions found</div>
          ) : (
            <>
              <PositionGroup
                pLevel="Fence"
                labelOverride="Fence"
                positions={fencePositions}
                onView={setSelectedPosition}
                onDelete={handleDeleteClick}
              />
              {PLEVEL_OPTIONS.map(pl => (
                <PositionGroup
                  key={pl}
                  pLevel={pl}
                  positions={nonFenceByLevel(pl)}
                  onView={setSelectedPosition}
                  onDelete={handleDeleteClick}
                />
              ))}
            </>
          )}
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete position <strong>{deleteTarget.jobOrderId}</strong>?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelDelete} disabled={deleting}>Cancel</button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {selectedPosition && (
        <PositionDetailModal position={selectedPosition} onClose={() => setSelectedPosition(null)} onUpdate={refreshList} tas={tas} />
      )}

      {salaryModalPosition && (
        <div className="modal-overlay" onClick={() => { setSalaryModalPosition(null); setTempSalaryModalData(null); }}>
          <div className="modal modal-md salary-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Salary Package — {salaryModalPosition.jobOrderId}</h2>
              <button className="modal-close-btn" onClick={() => { setSalaryModalPosition(null); setTempSalaryModalData(null); }}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <p className="salary-modal-subtitle">{salaryModalPosition.position} ({salaryModalPosition.client?.clientName || '—'})</p>
              <SalaryPackagePicker
                value={
                  editingId === salaryModalPosition._id
                    ? (editForm.salary !== undefined ? editForm.salary : salaryModalPosition.salary)
                    : (tempSalaryModalData?.salary !== undefined ? tempSalaryModalData.salary : salaryModalPosition.salary)
                }
                legacyText={
                  editingId === salaryModalPosition._id
                    ? (editForm.packageRange !== undefined ? editForm.packageRange : salaryModalPosition.packageRange)
                    : (tempSalaryModalData?.packageRange !== undefined ? tempSalaryModalData.packageRange : salaryModalPosition.packageRange)
                }
                onChange={(updatedSalary, formattedString) => {
                  if (editingId === salaryModalPosition._id) {
                    setEditForm(prev => ({
                      ...prev,
                      salary: updatedSalary,
                      packageRange: formattedString
                    }));
                  }
                  setTempSalaryModalData({
                    salary: updatedSalary,
                    packageRange: formattedString
                  });
                }}
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSalaryModalPosition(null);
                  setTempSalaryModalData(null);
                }}
              >
                {editingId === salaryModalPosition._id ? 'Done' : 'Cancel'}
              </button>
              {editingId !== salaryModalPosition._id && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={savingSalaryModal}
                  onClick={async () => {
                    if (tempSalaryModalData) {
                      setSavingSalaryModal(true);
                      try {
                        const payload = {
                          salary: tempSalaryModalData.salary || null,
                          packageRange: tempSalaryModalData.packageRange || ''
                        };
                        const res = await updatePosition(salaryModalPosition._id, payload);
                        queryClient.setQueryData(['positions'], prev =>
                          (prev || []).map(p => {
                            if (p._id !== salaryModalPosition._id) return p;
                            return { ...p, ...res.data };
                          })
                        );
                        invalidatePositionsCache();
                        setSalaryModalPosition(null);
                        setTempSalaryModalData(null);
                      } catch (err) {
                        alert(err.response?.data?.error || 'Failed to update salary');
                      } finally {
                        setSavingSalaryModal(false);
                      }
                    } else {
                      setSalaryModalPosition(null);
                    }
                  }}
                >
                  {savingSalaryModal ? 'Saving...' : 'Save Salary'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Positions;