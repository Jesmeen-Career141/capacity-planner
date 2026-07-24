import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPositions, deletePosition, updatePosition } from '../api/positions';
import { getClients } from '../api/clients';
import { getActiveTAs } from '../api/tas';
import { getColorLegend, updateColorLegend } from '../api/colorLegend';
import FlagBadge from '../components/FlagBadge';
import './Positions.css';

// ---- Constants ----
const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];
const PLEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5'];
const COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

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

// ---- CUSTOMIZE YOUR LEVEL COLORS HERE ----
const PLEVEL_COLORS = {
  P1: { bg: '#b91c1c', text: '#ffffff' }, // deep red
  P2: { bg: '#d97706', text: '#ffffff' }, // amber
  P3: { bg: '#2563eb', text: '#ffffff' }, // blue
  P4: { bg: '#7c3aed', text: '#ffffff' }, // violet
  P5: { bg: '#059669', text: '#ffffff' }, // emerald
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

// ---- Icons (corrected) ----
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

// ---- HeaderFilter (unchanged) ----
function HeaderFilter({ options, value, onChange, allLabel = 'All', label }) {
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

  const getDisplayLabel = () => {
    if (!value) return allLabel;
    const option = options.find(o => o.value === value);
    return option ? option.label : allLabel;
  };

  return (
    <div className="header-filter-wrap" ref={containerRef}>
      <button
        className={`header-filter-btn ${value ? 'header-filter-btn--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`Filter by ${label}`}
      >
        <FilterIcon />
        <span className="header-filter-badge">{getDisplayLabel()}</span>
        <span className="header-filter-arrow">▾</span>
      </button>
      {isOpen && (
        <div className="header-filter-dropdown">
          <button
            className={`header-filter-option ${!value ? 'selected' : ''}`}
            onClick={() => { onChange(''); setIsOpen(false); }}
          >
            <span className="hfo-check">{!value && <CheckIcon />}</span>
            <span>{allLabel}</span>
          </button>
          {options.map(opt => (
            <button
              key={opt.value}
              className={`header-filter-option ${value === opt.value ? 'selected' : ''}`}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
            >
              <span className="hfo-check">{value === opt.value && <CheckIcon />}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- InlineDropdown (single select, unchanged) ----
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

// ---- MultiInlineDropdown (NEW) ----
function MultiInlineDropdown({ 
  values,          // array of selected IDs
  options,         // [{ value, label }]
  onChange,        // (newValues) => void
  disabled = false,
  placeholder = 'Assign TA(s)'
}) {
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
    <div className="multi-dropdown-wrap" ref={containerRef}>
      <button
        className="multi-dropdown-trigger"
        onClick={toggle}
        disabled={disabled}
        type="button"
      >
        {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
        <span className="multi-dropdown-arrow">▾</span>
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`multi-dropdown-list multi-dropdown-list--${direction}`}>
            {options.map(opt => (
              <label key={opt.value} className="multi-dropdown-option">
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

// ---- PositionDetailModal (updated for assignees) ----
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
      onUpdate();
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

  const assigneeNames = position.assignees?.map(a => a.name).join(', ') || 'Unassigned';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
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
              <span className="modal-summary-value">{assigneeNames}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Level</span>
              <span className="modal-summary-value">{position.pLevel}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Package Range</span>
              <span className="modal-summary-value package-range-value">{position.packageRange || '—'}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Int Shortlist</span>
              <span className="modal-summary-value">{position.cvCount ?? '—'}</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">Ext Shortlist</span>
              <span className="modal-summary-value">
                {position.extShortlistCount === 'Client Review' ? 'Client Review' : (position.extShortlistCount ?? '—')}
              </span>
            </div>
          </div>
          <div className="modal-editable">
            <div className="modal-field modal-field--full">
              <label>This Week Focus</label>
              <input
                type="text"
                value={editData.thisWeekFocus}
                onChange={e => handleChange('thisWeekFocus', e.target.value)}
                className="modal-input"
                placeholder="e.g., Schedule interviews, Review CVs..."
              />
            </div>
            <div className="modal-field modal-field--full">
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
              <div className="modal-history-list">
                {historyRounds.map((round, idx) => (
                  <div key={idx} className="modal-history-item">
                    <span className="modal-history-round">Round {round.roundNumber}</span>
                    <span className="modal-history-ta">{round.taAssigned?.name || '—'}</span>
                    <span className="modal-history-date">
                      {round.dateAssigned ? new Date(round.dateAssigned).toLocaleDateString() : '—'}
                    </span>
                    <span className="modal-history-reason">{round.reason || '—'}</span>
                  </div>
                ))}
              </div>
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
      </div>
    </div>
  );
}

// ---- Main Positions Component ----
function Positions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState([]);
  const [clients, setClients] = useState([]);
  const [tas, setTAs] = useState([]);
  const [legend, setLegend] = useState(COLOR_KEYS.map(key => ({ key, label: '' })));
  const [filters, setFilters] = useState({
    client: '',
    assignee: '',           // single value for filtering (OR logic)
    status: '',
    pLevel: '',
    highlightColor: '',
    flag: '',
    search: ''
  });
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

  // ---- Data fetch ----
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, clientRes, taRes, legendRes] = await Promise.all([
          getPositions(),
          getClients(),
          getActiveTAs(),
          getColorLegend()
        ]);
        setPositions(posRes.data);
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

  const legendLabel = (key) => legend.find(e => e.key === key)?.label || '';

  // ---- Handlers ----
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
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
  const filteredPositions = useMemo(() => {
    let filtered = positions.filter(pos => {
      const matchesClient = !filters.client || pos.client?._id === filters.client;
      let matchesAssignee = true;
      if (filters.assignee) {
        if (filters.assignee === 'unassigned') {
          matchesAssignee = !pos.assignees || pos.assignees.length === 0;
        } else {
          matchesAssignee = pos.assignees?.some(a => a._id === filters.assignee) || false;
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
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = !filters.search ||
        pos.jobOrderId.toLowerCase().includes(searchLower) ||
        pos.position.toLowerCase().includes(searchLower) ||
        (pos.client?.clientName || '').toLowerCase().includes(searchLower);
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
  const handleDeleteClick = (pos) => {
    setDeleteTarget(pos);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePosition(deleteTarget._id);
      setPositions(positions.filter(p => p._id !== deleteTarget._id));
      setShowDeleteModal(false);
      setDeleteTarget(null);
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

  // ---- Update handler (supports 'assignees' array) ----
  const handleDirectUpdate = async (pos, field, value) => {
    const prevValue = pos[field];
    let optimisticValue = value;

    if (field === 'assignees') {
      optimisticValue = value.map(id => tas.find(ta => ta._id === id)).filter(Boolean);
    }

    setUpdatingId(pos._id);
    setPositions(prev =>
      prev.map(p =>
        p._id === pos._id ? { ...p, [field]: optimisticValue } : p
      )
    );

    try {
      const res = await updatePosition(pos._id, { [field]: value });
      setPositions(prev =>
        prev.map(p => {
          if (p._id !== pos._id) return p;
          // The update endpoint may return `assignees` as raw IDs instead
          // of populated TA objects (unlike the initial getPositions()
          // fetch). If we blindly trust res.data here, the dropdown loses
          // its populated {_id, name} shape and appears to reset to
          // "unassigned" even though the save succeeded. Keep the
          // already-populated optimistic value for that one field.
          const merged = { ...p, ...res.data };
          if (field === 'assignees') {
            merged.assignees = optimisticValue;
          }
          return merged;
        })
      );
    } catch (err) {
      setPositions(prev =>
        prev.map(p =>
          p._id === pos._id ? { ...p, [field]: prevValue } : p
        )
      );
      alert(err.response?.data?.error || `Failed to update ${field}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleColorChange = async (pos, colorKey) => {
    if (colorKey === pos.highlightColor) { setColorPopoverId(null); return; }
    const prevColor = pos.highlightColor;
    setPositions(prev => prev.map(p => p._id === pos._id ? { ...p, highlightColor: colorKey } : p));
    setColorPopoverId(null);
    try {
      await updatePosition(pos._id, { highlightColor: colorKey });
    } catch (err) {
      setPositions(prev => prev.map(p => p._id === pos._id ? { ...p, highlightColor: prevColor } : p));
      alert(err.response?.data?.error || 'Failed to set highlight color');
    }
  };

  const startEdit = (pos) => {
    setEditingId(pos._id);
    setEditForm({
      position: pos.position,
      packageRange: pos.packageRange || '',
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
        packageRange: editForm.packageRange.trim(),
        cvCount: editForm.cvCount === '' ? null : Number(editForm.cvCount),
        extShortlistCount: editForm.extShortlistCount === ''
          ? null
          : editForm.extShortlistCount === 'Client Review'
            ? 'Client Review'
            : Number(editForm.extShortlistCount),
      };
      const res = await updatePosition(pos._id, payload);
      setPositions(prev => prev.map(p => p._id === pos._id ? res.data : p));
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
      setPositions(prev => prev.map(p => p._id === pos._id ? res.data : p));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update flag');
    } finally {
      setUpdatingId(null);
    }
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
    const res = await getPositions();
    setPositions(res.data);
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

  const rowStatusOptions = STATUS_OPTIONS.map(s => {
    const sc = STATUS_COLORS[s] || { bg: '#e5e7eb', text: '#374151' };
    return { value: s, label: s, bg: sc.bg, text: sc.text };
  });
  const rowLevelOptions = PLEVEL_OPTIONS.map(p => {
    const lc = PLEVEL_COLORS[p];
    return { value: p, label: p, bg: lc.bg, text: lc.text };
  });
  const multiAssigneeOptions = tas.map(ta => ({ value: ta._id, label: ta.name }));

  if (loading) return <div className="positions-loading">Loading positions...</div>;
  if (error) return <div className="positions-error">Error: {error}</div>;

  return (
    <div className="positions">
      <div className="positions-header">
        <h1>Positions</h1>
        <button className="btn-primary" onClick={() => navigate('/positions/new')}>
          + New Position
        </button>
      </div>

      <div className="color-legend-bar">
        <span className="legend-bar-label">Highlight colors</span>
        <div className="legend-swatches">
          {COLOR_KEYS.map(key => (
            <div className="legend-swatch-item" key={key}>
              <span className="legend-swatch-dot" style={{ background: COLOR_HEX[key] }} />
              <input
                className="legend-label-input"
                value={legendLabel(key)}
                placeholder="Unlabeled"
                onChange={(e) => handleLegendLabelChange(key, e.target.value)}
                onBlur={saveLegend}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          name="search"
          placeholder="Search by JO ID, position, client..."
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="filter-search"
        />
      </div>

      <div className="table-wrapper">
        <table className="positions-table">
          <colgroup>
            <col style={{ width: '7%' }} />   {/* JO ID */}
            <col style={{ width: '11%' }} />  {/* Client */}
            <col style={{ width: '21%' }} />  {/* Position (+ Package Range underneath) */}
            <col style={{ width: '6%' }} />   {/* Level */}
            <col style={{ width: '10%' }} />  {/* Status */}
            <col style={{ width: '14%' }} />  {/* Assignees */}
            <col style={{ width: '12%' }} />  {/* Flags */}
            <col style={{ width: '6%' }} />   {/* Int Shortlist */}
            <col style={{ width: '9%' }} />   {/* Ext Shortlist (widened) */}
            <col style={{ width: '10%' }} />  {/* Actions */}
          </colgroup>
          <thead>
            <tr>
              <th>JO ID</th>
              <th className="th-with-filter">
                <span className="th-label">Client</span>
                <HeaderFilter
                  options={clientOptions}
                  value={filters.client}
                  onChange={(v) => handleFilterChange('client', v)}
                  allLabel="All"
                  label="Client"
                />
              </th>
              <th>Position</th>
              <th className="th-with-filter">
                <span className="th-label">Level</span>
                <HeaderFilter
                  options={levelOptions}
                  value={filters.pLevel}
                  onChange={(v) => handleFilterChange('pLevel', v)}
                  allLabel="All"
                  label="Level"
                />
              </th>
              <th className="th-with-filter">
                <span className="th-label">Status</span>
                <HeaderFilter
                  options={statusOptions}
                  value={filters.status}
                  onChange={(v) => handleFilterChange('status', v)}
                  allLabel="All"
                  label="Status"
                />
              </th>
              <th className="th-with-filter">
                <span className="th-label">Assignees</span>
                <HeaderFilter
                  options={assigneeOptions}
                  value={filters.assignee}
                  onChange={(v) => handleFilterChange('assignee', v)}
                  allLabel="All"
                  label="Assignee"
                />
              </th>
              <th className="th-with-filter">
                <span className="th-label">Flags</span>
                <HeaderFilter
                  options={flagOptions}
                  value={filters.flag}
                  onChange={(v) => handleFilterChange('flag', v)}
                  allLabel="All"
                  label="Flag"
                />
              </th>
              <th>Int Shortlist</th>
              <th>Ext Shortlist</th>
              <th className="th-with-filter">
                <span className="th-label">Actions</span>
                <HeaderFilter
                  options={colorOptions}
                  value={filters.highlightColor}
                  onChange={(v) => handleFilterChange('highlightColor', v)}
                  allLabel="All"
                  label="Color"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.length === 0 ? (
              <tr><td colSpan="10" className="no-rows">No positions found</td></tr>
            ) : (
              filteredPositions.map(pos => {
                const flagEntries = pos.flags
                  ? Object.entries(pos.flags).filter(([, f]) => f !== null)
                  : [];
                const isEditing = editingId === pos._id;
                const isUpdating = updatingId === pos._id;

                let rowClassName = '';
                if (pos.highlightColor === 'blue') rowClassName = 'row-tint-blue';
                else if (pos.highlightColor === 'red') rowClassName = 'row-tint-red';

                const currentAssigneeIds = pos.assignees?.map(a => a._id) || [];

                return (
                  <tr key={pos._id} className={rowClassName}>
                    <td><Link to={`/positions/${pos._id}`} className="jo-link">{pos.jobOrderId}</Link></td>
                    <td><span className="text-ellipsis">{pos.client?.clientName || '—'}</span></td>
                    {/* Position + Package Range stacked */}
                    <td>
                      {isEditing ? (
                        <div className="position-edit-stack">
                          <input
                            className="inline-edit-input"
                            name="position"
                            value={editForm.position}
                            onChange={handleEditFormChange}
                            placeholder="Position title"
                          />
                          <input
                            className="inline-edit-input inline-edit-input--range"
                            name="packageRange"
                            value={editForm.packageRange}
                            onChange={handleEditFormChange}
                            placeholder="e.g., £40-50k"
                          />
                        </div>
                      ) : (
                        <div className="position-cell">
                          <span className="text-ellipsis position-title">{pos.position}</span>
                          {pos.packageRange && (
                            <span className="package-range-value">{pos.packageRange}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="td-dropdown">
                      <InlineDropdown
                        value={pos.pLevel}
                        options={rowLevelOptions}
                        onChange={(v) => handleDirectUpdate(pos, 'pLevel', v)}
                        disabled={isUpdating}
                        shape="circle"
                      />
                    </td>
                    <td className="td-dropdown">
                      <InlineDropdown
                        value={pos.status}
                        options={rowStatusOptions}
                        onChange={(v) => handleDirectUpdate(pos, 'status', v)}
                        disabled={isUpdating}
                        shape="pill"
                      />
                    </td>
                    {/* Multi-assignee cell */}
                    <td className="td-dropdown">
                      <MultiInlineDropdown
                        values={currentAssigneeIds}
                        options={multiAssigneeOptions}
                        onChange={(newIds) => handleDirectUpdate(pos, 'assignees', newIds)}
                        disabled={isUpdating}
                        placeholder="Assign TA(s)"
                      />
                    </td>
                    {/* Flags cell */}
                    <td className="td-dropdown">
                      <div className="flags-cell">
                        {flagEntries.map(([flagKey, flag]) => {
                          const popoverKey = `${pos._id}:${flagKey}`;
                          const currentMode = pos.flagOverrides?.[flagKey] || 'auto';
                          const isOpen = flagPopoverId === popoverKey;
                          const direction = flagPopoverDirection[popoverKey] || 'up';

                          return (
                            <div className="flag-badge-wrap" key={flagKey}>
                              <button
                                type="button"
                                className="flag-badge-btn"
                                ref={(el) => {
                                  if (el && isOpen) {
                                    const dir = computeFlagPopoverDirection(el);
                                    setFlagPopoverDirection(prev => ({ ...prev, [popoverKey]: dir }));
                                  }
                                }}
                                onClick={(e) => {
                                  if (flagPopoverId === popoverKey) {
                                    setFlagPopoverId(null);
                                  } else {
                                    const dir = computeFlagPopoverDirection(e.currentTarget);
                                    setFlagPopoverDirection(prev => ({ ...prev, [popoverKey]: dir }));
                                    setFlagPopoverId(popoverKey);
                                  }
                                }}
                                title={`${flag.label} — click to change`}
                              >
                                <FlagBadge flag={flag} />
                              </button>
                              {isOpen && (
                                <>
                                  <div className="popover-backdrop" onClick={() => setFlagPopoverId(null)} />
                                  <div className={`flag-popover flag-popover--${direction}`}>
                                    <div className="flag-popover-title">{flag.label}</div>
                                    {['auto', 'on', 'off'].map(mode => (
                                      <button
                                        key={mode}
                                        className={`flag-popover-option ${currentMode === mode ? 'selected' : ''}`}
                                        onClick={() => handleFlagOverrideChange(pos, flagKey, mode)}
                                      >
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
                          <button
                            type="button"
                            className="flag-add-btn"
                            onClick={(e) => {
                              const manageKey = `${pos._id}:manage`;
                              if (flagPopoverId === manageKey) {
                                setFlagPopoverId(null);
                              } else {
                                const dir = computeFlagPopoverDirection(e.currentTarget);
                                setFlagPopoverDirection(prev => ({ ...prev, [manageKey]: dir }));
                                setFlagPopoverId(manageKey);
                              }
                            }}
                            title="Manage all flags"
                          >
                            +
                          </button>
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
                                          <button
                                            key={mode}
                                            className={`flag-mode-btn ${currentMode === mode ? 'active' : ''}`}
                                            onClick={() => handleFlagOverrideChange(pos, flagKey, mode)}
                                          >
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
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          className="inline-edit-input inline-edit-input--num"
                          name="cvCount"
                          value={editForm.cvCount}
                          onChange={handleEditFormChange}
                        />
                      ) : (pos.cvCount ?? '—')}
                    </td>
                    <td>
                      {isEditing ? (
                        <div className="ext-shortlist-edit">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="inline-edit-input inline-edit-input--num"
                            name="extShortlistCount"
                            value={editForm.extShortlistCount === 'Client Review' ? '' : editForm.extShortlistCount}
                            onChange={handleEditFormChange}
                            placeholder="Number"
                            disabled={editForm.extShortlistCount === 'Client Review'}
                          />
                          <select
                            className="ext-shortlist-select"
                            value={editForm.extShortlistCount === 'Client Review' ? 'clientReview' : ''}
                            onChange={(e) => {
                              if (e.target.value === 'clientReview') {
                                setEditForm(prev => ({ ...prev, extShortlistCount: 'Client Review' }));
                              } else {
                                setEditForm(prev => ({ ...prev, extShortlistCount: '' }));
                              }
                            }}
                            title="Or mark as Client Review instead of a number"
                          >
                            <option value="">#</option>
                            <option value="clientReview">Client Review</option>
                          </select>
                        </div>
                      ) : pos.extShortlistCount === 'Client Review' ? (
                        <span className="ext-shortlist-badge ext-shortlist-badge--review">Client Review</span>
                      ) : (pos.extShortlistCount ?? '—')}
                    </td>
                    {/* Actions cell */}
                    <td className="td-dropdown">
                      <div className="actions-cell">
                        <div className="color-picker-wrap">
                          <button
                            className="color-swatch-btn"
                            style={{
                              background: pos.highlightColor ? COLOR_HEX[pos.highlightColor] : '#e5e7eb',
                              border: pos.highlightColor ? '2px solid rgba(0,0,0,0.15)' : '2px dashed #d1d5db',
                            }}
                            onClick={() => setColorPopoverId(colorPopoverId === pos._id ? null : pos._id)}
                            title="Set highlight color"
                          />
                          {colorPopoverId === pos._id && (
                            <>
                              <div className="popover-backdrop" onClick={() => setColorPopoverId(null)} />
                              <div className="color-popover">
                                <button className="color-popover-option" onClick={() => handleColorChange(pos, null)}>
                                  <span className="color-swatch-dot color-swatch-dot--none" />
                                  None
                                </button>
                                {COLOR_KEYS.map(key => (
                                  <button key={key} className="color-popover-option" onClick={() => handleColorChange(pos, key)}>
                                    <span className="color-swatch-dot" style={{ background: COLOR_HEX[key] }} />
                                    {legendLabel(key) || key}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {isEditing ? (
                          <>
                            <button className="action-save" onClick={() => saveEdit(pos)} disabled={savingEdit} title="Save changes">
                              {savingEdit ? 'Saving...' : 'Save'}
                            </button>
                            <button className="action-cancel" onClick={cancelEdit} disabled={savingEdit} title="Cancel editing">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="action-edit" onClick={() => startEdit(pos)} title="Edit row">
                              <EditIcon />
                            </button>
                            <button
                              className="action-link"
                              onClick={() => setSelectedPosition(pos)}
                              title="View details"
                            >
                              <ViewIcon />
                            </button>
                            <button className="action-delete" onClick={() => handleDeleteClick(pos)} title="Delete position">
                              <DeleteIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete position <strong>{deleteTarget.jobOrderId}</strong>?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelDelete} disabled={deleting}>Cancel</button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPosition && (
        <PositionDetailModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
          onUpdate={refreshList}
          tas={tas}
        />
      )}
    </div>
  );
}

export default Positions;