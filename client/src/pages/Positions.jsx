import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPositions, deletePosition, updatePosition } from '../api/positions';
import { getClients } from '../api/clients';
import { getActiveTAs } from '../api/tas';
import { getColorLegend, updateColorLegend } from '../api/colorLegend';
import FlagBadge from '../components/FlagBadge';
import './Positions.css';

const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost'];
const PLEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5'];
const STAGE_OPTIONS = ['Hunting', 'Shortlisted', 'Client Review', 'Interview', 'Offer', 'Placed'];
const COMPLETION_OPTIONS = [0, 25, 50, 75, 100];
const COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
const COLOR_HEX = {
  red: '#fca5a5',
  orange: '#fdba74',
  yellow: '#fde68a',
  green: '#86efac',
  teal: '#5eead4',
  blue: '#93c5fd',
  purple: '#d8b4fe',
  pink: '#f9a8d4',
};

// P-level colors
const PLEVEL_COLORS = {
  P1: { bg: '#b91c1c', text: '#fff' },
  P2: { bg: '#dc2626', text: '#fff' },
  P3: { bg: '#f97316', text: '#fff' },
  P4: { bg: '#fb923c', text: '#1a1a1a' },
  P5: { bg: '#fdba74', text: '#1a1a1a' },
};

// Stage colors
const STAGE_COLORS = {
  Hunting: { bg: '#dbeafe', text: '#1e40af' },
  Shortlisted: { bg: '#e0e7ff', text: '#3730a3' },
  'Client Review': { bg: '#fef3c7', text: '#92400e' },
  Interview: { bg: '#fce7f3', text: '#9d174d' },
  Offer: { bg: '#dcfce7', text: '#166534' },
  Placed: { bg: '#d1fae5', text: '#065f46' },
};

// Status colors
const STATUS_COLORS = {
  'Yet to Activate': { bg: '#e5e7eb', text: '#374151' },
  'A&P': { bg: '#d1fae5', text: '#065f46' },
  'Fence': { bg: '#fecaca', text: '#991b1b' },
  'Hold': { bg: '#fef3c7', text: '#92400e' },
  'Paused': { bg: '#fde68a', text: '#78350f' },
  'Placed': { bg: '#bfdbfe', text: '#1e40af' },
  'Lost': { bg: '#fca5a5', text: '#7f1d1d' },
};

// Icons
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

// Filter icon (funnel)
const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 13 10 21 14 18 14 13 22 3" />
  </svg>
);

// Check icon for dropdown
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

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

// ---- Detail Modal Component ----
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
      onUpdate(); // refresh the list
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Get the last 5 allocation rounds (or fewer)
  const historyRounds = [...(editData.allocationRounds || [])]
    .sort((a, b) => new Date(b.dateAssigned) - new Date(a.dateAssigned))
    .slice(0, 5);

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
          {/* Position summary – read-only */}
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
              <span className="modal-summary-label">Assignee</span>
              <span className="modal-summary-value">{position.assignee?.name || 'Unassigned'}</span>
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
              <span className="modal-summary-label">Completion</span>
              <span className="modal-summary-value">{position.completionPercent}%</span>
            </div>
            <div className="modal-summary-item">
              <span className="modal-summary-label">LS / CV</span>
              <span className="modal-summary-value">{position.lsCount ?? '—'} / {position.cvCount ?? '—'}</span>
            </div>
          </div>

          {/* Editable fields – full width, stacked vertically */}
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

          {/* Allocation History */}
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
    assignee: '',
    status: '',
    pLevel: '',
    stage: '',
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

  // Detail modal state
  const [selectedPosition, setSelectedPosition] = useState(null);

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

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const filteredPositions = useMemo(() => {
    return positions.filter(pos => {
      const matchesClient = !filters.client || pos.client?._id === filters.client;
      const matchesAssignee = !filters.assignee
        ? true
        : filters.assignee === 'unassigned'
          ? pos.assignee === null
          : pos.assignee?._id === filters.assignee;
      const matchesStatus = !filters.status || pos.status === filters.status;
      const matchesPLevel = !filters.pLevel || pos.pLevel === filters.pLevel;
      const matchesStage = !filters.stage || pos.pipelineStage === filters.stage;
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = !filters.search ||
        pos.jobOrderId.toLowerCase().includes(searchLower) ||
        pos.position.toLowerCase().includes(searchLower) ||
        (pos.client?.clientName || '').toLowerCase().includes(searchLower);
      return matchesClient && matchesAssignee && matchesStatus && matchesPLevel && matchesStage && matchesSearch;
    });
  }, [positions, filters]);

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

  const handleDirectUpdate = async (pos, field, value) => {
    const prevValue = pos[field];
    setUpdatingId(pos._id);
    setPositions(prev => prev.map(p => p._id === pos._id ? { ...p, [field]: value } : p));

    try {
      await updatePosition(pos._id, { [field]: value });
    } catch (err) {
      setPositions(prev => prev.map(p => p._id === pos._id ? { ...p, [field]: prevValue } : p));
      alert(err.response?.data?.error || `Failed to update ${field}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const startEdit = (pos) => {
    setEditingId(pos._id);
    setEditForm({
      position: pos.position,
      lsCount: pos.lsCount ?? '',
      cvCount: pos.cvCount ?? '',
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
        lsCount: editForm.lsCount === '' ? null : Number(editForm.lsCount),
        cvCount: editForm.cvCount === '' ? null : Number(editForm.cvCount),
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

  // Build filter options
  const clientOptions = clients.map(c => ({ value: c._id, label: c.clientName }));
  const assigneeOptions = [
    { value: 'unassigned', label: 'Unassigned' },
    ...tas.map(ta => ({ value: ta._id, label: ta.name }))
  ];
  const statusOptions = STATUS_OPTIONS.map(s => ({ value: s, label: s }));
  const levelOptions = PLEVEL_OPTIONS.map(p => ({ value: p, label: p }));
  const stageOptions = STAGE_OPTIONS.map(s => ({ value: s, label: s }));

  const refreshList = async () => {
    const res = await getPositions();
    setPositions(res.data);
  };

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

      {/* Search bar */}
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
                <span className="th-label">Stage</span>
                <HeaderFilter
                  options={stageOptions}
                  value={filters.stage}
                  onChange={(v) => handleFilterChange('stage', v)}
                  allLabel="All"
                  label="Stage"
                />
              </th>
              <th className="th-with-filter">
                <span className="th-label">Assignee</span>
                <HeaderFilter
                  options={assigneeOptions}
                  value={filters.assignee}
                  onChange={(v) => handleFilterChange('assignee', v)}
                  allLabel="All"
                  label="Assignee"
                />
              </th>
              <th>Flags</th>
              <th>%</th>
              <th>LS</th>
              <th>CV</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPositions.length === 0 ? (
              <tr><td colSpan="12" className="no-rows">No positions found</td></tr>
            ) : (
              filteredPositions.map(pos => {
                const flagValues = pos.flags ? Object.values(pos.flags).filter(f => f !== null) : [];
                const isEditing = editingId === pos._id;
                const rowProps = pos.highlightColor
                  ? { 'data-highlighted': 'true', style: { '--row-color': COLOR_HEX[pos.highlightColor] } }
                  : {};
                const levelColor = PLEVEL_COLORS[pos.pLevel] || { bg: '#e5e7eb', text: '#1a1a1a' };
                const stageColor = STAGE_COLORS[pos.pipelineStage] || { bg: '#f3f4f6', text: '#374151' };
                const statusColor = STATUS_COLORS[pos.status] || { bg: '#e5e7eb', text: '#374151' };
                const isUpdating = updatingId === pos._id;

                return (
                  <tr key={pos._id} {...rowProps}>
                    <td><Link to={`/positions/${pos._id}`} className="jo-link">{pos.jobOrderId}</Link></td>
                    <td>{pos.client?.clientName || '—'}</td>

                    <td>
                      {isEditing ? (
                        <input
                          className="inline-edit-input"
                          name="position"
                          value={editForm.position}
                          onChange={handleEditFormChange}
                        />
                      ) : pos.position}
                    </td>

                    <td>
                      <select
                        className="p-level-select inline-edit-select inline-edit-select--level"
                        value={pos.pLevel}
                        onChange={(e) => handleDirectUpdate(pos, 'pLevel', e.target.value)}
                        disabled={isUpdating}
                        style={{ backgroundColor: PLEVEL_COLORS[pos.pLevel]?.bg, color: PLEVEL_COLORS[pos.pLevel]?.text }}
                      >
                        {PLEVEL_OPTIONS.map(p => (
                          <option key={p} value={p} style={{ backgroundColor: PLEVEL_COLORS[p].bg, color: PLEVEL_COLORS[p].text }}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        className="status-select"
                        value={pos.status}
                        onChange={(e) => handleDirectUpdate(pos, 'status', e.target.value)}
                        disabled={isUpdating}
                        style={{
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                          fontWeight: 500,
                        }}
                      >
                        {STATUS_OPTIONS.map(s => {
                          const sc = STATUS_COLORS[s] || { bg: '#e5e7eb', text: '#374151' };
                          return (
                            <option key={s} value={s} style={{ backgroundColor: sc.bg, color: sc.text }}>
                              {s}
                            </option>
                          );
                        })}
                      </select>
                    </td>

                    <td>
                      <select
                        className="stage-select inline-edit-select"
                        value={pos.pipelineStage}
                        onChange={(e) => handleDirectUpdate(pos, 'pipelineStage', e.target.value)}
                        disabled={isUpdating}
                        style={{ backgroundColor: stageColor.bg, color: stageColor.text }}
                      >
                        {STAGE_OPTIONS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        className="assignee-select inline-edit-select"
                        value={pos.assignee?._id || ''}
                        onChange={(e) => handleDirectUpdate(pos, 'assignee', e.target.value || null)}
                        disabled={isUpdating}
                      >
                        <option value="">Unassigned</option>
                        {tas.map(ta => (
                          <option key={ta._id} value={ta._id}>{ta.name}</option>
                        ))}
                      </select>
                    </td>

                    <td className="flags-cell">
                      {flagValues.map((flag, idx) => <FlagBadge key={idx} flag={flag} />)}
                    </td>

                    <td>
                      <div className="completion-dots">
                        {COMPLETION_OPTIONS.map((val) => (
                          <button
                            key={val}
                            className={`completion-dot ${pos.completionPercent >= val ? 'active' : ''}`}
                            onClick={() => handleDirectUpdate(pos, 'completionPercent', val)}
                            disabled={isUpdating}
                            title={`${val}%`}
                          />
                        ))}
                      </div>
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          className="inline-edit-input inline-edit-input--num"
                          name="lsCount"
                          value={editForm.lsCount}
                          onChange={handleEditFormChange}
                        />
                      ) : (pos.lsCount ?? '—')}
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

                    <td className="actions-cell">
                      <div className="color-picker-wrap">
                        <button
                          className="color-swatch-btn"
                          style={{
                            background: pos.highlightColor ? COLOR_HEX[pos.highlightColor] : '#e5e7eb',
                            border: pos.highlightColor ? `2px solid ${COLOR_HEX[pos.highlightColor]}` : '2px dashed #d1d5db'
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

      {/* Detail Modal */}
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