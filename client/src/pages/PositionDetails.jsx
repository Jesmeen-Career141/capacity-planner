import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPosition, updatePosition, assignPosition, deletePosition } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import { getPositionHistory } from '../api/positionHistory';
import FlagBadge from '../components/FlagBadge';
import './Positions.css';
import './PositionDetails.css';

// ---- Shared constants (mirrors Positions.jsx) ----
const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];
const PLEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5'];
const COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

const FLAG_OPTIONS = [
  { value: 'followUp', label: 'Follow Up' },
  { value: 'addOn', label: 'Add-On' },
  { value: 'backup', label: 'Backup' },
  { value: 'goingGood', label: 'Going Good' },
  { value: 'reAssign', label: 'Reassign' },
];

const COLOR_HEX = {
  red: '#ef4444', orange: '#f59e0b', yellow: '#fde047',
  green: '#22c55e', teal: '#14b8a6', blue: '#3b82f6',
  purple: '#8b5cf6', pink: '#ec4899',
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
  'Client Decision': { bg: '#fbcfe8', text: '#831843' },
};

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
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ---- InlineDropdown ----
function InlineDropdown({ value, options, onChange, disabled, shape = 'pill' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('down');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDirection(spaceBelow >= 240 ? 'down' : 'up');
    }
    setIsOpen(!isOpen);
  };

  const current = options.find(o => o.value === value);
  const triggerClass = shape === 'circle' ? 'inline-dropdown-circle' : 'inline-dropdown-pill';

  return (
    <div className="inline-dropdown-wrap" ref={containerRef}>
      <button
        type="button"
        className={triggerClass}
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

// ---- SingleInlineDropdown (for primary TA assignee) ----
function SingleInlineDropdown({ value, options, onChange, disabled = false, placeholder = 'Assign TA' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('down');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDirection(window.innerHeight - rect.bottom >= 200 ? 'down' : 'up');
    }
    setIsOpen(!isOpen);
  };

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  return (
    <div className="single-dropdown-wrap" ref={containerRef} style={{ minWidth: 160 }}>
      <button className="single-dropdown-trigger" onClick={toggle} disabled={disabled} type="button">
        {selectedLabel || placeholder}
        <span className="single-dropdown-arrow">▾</span>
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`single-dropdown-list single-dropdown-list--${direction}`}>
            <button className={`single-dropdown-option ${!value ? 'selected' : ''}`} onClick={() => { onChange(null); setIsOpen(false); }}>
              <span className="sdo-check">{!value && <CheckIcon />}</span>
              <span>— Unassigned —</span>
            </button>
            {options.map(opt => (
              <button key={opt.value} className={`single-dropdown-option ${value === opt.value ? 'selected' : ''}`} onClick={() => { onChange(opt.value); setIsOpen(false); }}>
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
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDirection(window.innerHeight - rect.bottom >= 200 ? 'down' : 'up');
    }
    setIsOpen(!isOpen);
  };

  const toggleOption = (val) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  return (
    <div className="parallel-picker-wrap" ref={containerRef}>
      <button className="parallel-picker-trigger" onClick={toggle} disabled={disabled} type="button">
        {values.length > 0 ? `+ ${values.length} parallel` : '+ Add parallel'}
        <span className="parallel-picker-arrow">▾</span>
      </button>
      {isOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsOpen(false)} />
          <div className={`parallel-picker-list parallel-picker-list--${direction}`}>
            {options.map(opt => (
              <label key={opt.value} className="parallel-picker-option">
                <input type="checkbox" checked={values.includes(opt.value)} onChange={() => toggleOption(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Main PositionDetails Component ----
function PositionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [position, setPosition] = useState(null);
  const [tas, setTAs] = useState([]);
  const [history, setHistory] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [assignData, setAssignData] = useState({ taId: '', reason: '' });
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [flagPopoverId, setFlagPopoverId] = useState(null);
  const [flagPopoverDirection, setFlagPopoverDirection] = useState({});
  const colorPickerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [posRes, taRes, histRes] = await Promise.all([
          getPosition(id),
          getActiveTAs(),
          getPositionHistory(id),
        ]);
        setPosition(posRes.data);
        setFormData(posRes.data);
        const sortedTAs = taRes.data.slice().sort((a, b) => a.name.localeCompare(b.name));
        setTAs(sortedTAs);
        setHistory(histRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Close color popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setColorPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        position: formData.position,
        pLevel: formData.pLevel,
        status: formData.status,
        packageRange: formData.packageRange || '',
        extShortlistCount: formData.extShortlistCount,
        lsCount: formData.lsCount,
        cvCount: formData.cvCount,
        expectedCloseDate: formData.expectedCloseDate,
        thisWeekFocus: formData.thisWeekFocus || '',
        remarks: formData.remarks || '',
        highlightColor: formData.highlightColor || null,
      };
      const res = await updatePosition(id, payload);
      setPosition(res.data);
      setFormData(res.data);
      setIsEditing(false);
      const histRes = await getPositionHistory(id);
      setHistory(histRes.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  // Direct field update (for dropdowns in view mode)
  const handleDirectUpdate = async (field, value) => {
    const prevValue = position[field];
    setPosition(prev => ({ ...prev, [field]: value }));
    setFormData(prev => ({ ...prev, [field]: value }));
    try {
      const res = await updatePosition(id, { [field]: value });
      setPosition(res.data);
      setFormData(res.data);
    } catch (err) {
      setPosition(prev => ({ ...prev, [field]: prevValue }));
      setFormData(prev => ({ ...prev, [field]: prevValue }));
      alert(err.response?.data?.error || `Failed to update ${field}`);
    }
  };

  // Parallel assignees update
  const handleParallelUpdate = async (newIds) => {
    const oldParallel = position.parallelAssignees?.map(a => a._id) || [];
    setPosition(prev => ({
      ...prev,
      parallelAssignees: newIds.map(id => tas.find(t => t._id === id)).filter(Boolean),
    }));
    try {
      const res = await updatePosition(id, { parallelAssignees: newIds });
      setPosition(res.data);
      setFormData(res.data);
    } catch (err) {
      setPosition(prev => ({
        ...prev,
        parallelAssignees: oldParallel.map(id => tas.find(t => t._id === id)).filter(Boolean),
      }));
      alert(err.response?.data?.error || 'Failed to update parallel assignees');
    }
  };

  // Primary assignee update
  const handlePrimaryAssign = async (newTaId) => {
    const oldAssignee = position.assignee?._id || null;
    if (oldAssignee === newTaId) return;
    setPosition(prev => ({ ...prev, assignee: newTaId ? tas.find(t => t._id === newTaId) : null }));
    try {
      const res = await assignPosition(id, newTaId, newTaId ? 'Primary assignment changed' : 'Unassigned', 'primary');
      setPosition(res.data);
      setFormData(res.data);
    } catch (err) {
      setPosition(prev => ({ ...prev, assignee: oldAssignee ? tas.find(t => t._id === oldAssignee) : null }));
      alert(err.response?.data?.error || 'Failed to assign TA');
    }
  };

  // Flag override update
  const handleFlagOverride = async (flagKey, mode) => {
    const prevOverrides = position.flagOverrides || {};
    if ((prevOverrides[flagKey] || 'auto') === mode) { setFlagPopoverId(null); return; }
    const nextOverrides = { ...prevOverrides, [flagKey]: mode };
    setFlagPopoverId(null);
    try {
      const res = await updatePosition(id, { flagOverrides: nextOverrides });
      setPosition(res.data);
      setFormData(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update flag');
    }
  };

  // Color change
  const handleColorChange = async (colorKey) => {
    setColorPopoverOpen(false);
    await handleDirectUpdate('highlightColor', colorKey || null);
  };

  const computeFlagPopoverDirection = (el) => {
    if (!el) return 'up';
    const rect = el.getBoundingClientRect();
    return window.innerHeight - rect.bottom >= 220 ? 'down' : 'up';
  };

  const handleAssign = async () => {
    if (!assignData.taId) return alert('Select a TA');
    if (!assignData.reason.trim()) return alert('Enter a reason');
    setSaving(true);
    try {
      const res = await assignPosition(id, assignData.taId, assignData.reason);
      setPosition(res.data);
      setFormData(res.data);
      setShowAssignModal(false);
      setAssignData({ taId: '', reason: '' });
      const histRes = await getPositionHistory(id);
      setHistory(histRes.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to assign');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePosition(id);
      navigate('/positions');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="pos-detail-loading">Loading position...</div>;
  if (error) return <div className="pos-detail-error">Error: {error}</div>;
  if (!position) return <div>Position not found</div>;

  const statusOptions = STATUS_OPTIONS.map(s => {
    const sc = STATUS_COLORS[s] || { bg: '#e5e7eb', text: '#374151' };
    return { value: s, label: s, bg: sc.bg, text: sc.text };
  });
  const levelOptions = PLEVEL_OPTIONS.map(p => {
    const lc = PLEVEL_COLORS[p];
    return { value: p, label: p, bg: lc.bg, text: lc.text };
  });
  const taOptions = tas.map(ta => ({ value: ta._id, label: ta.name }));
  const parallelOptions = tas.map(ta => ({ value: ta._id, label: ta.name }));
  const currentParallelIds = position.parallelAssignees?.map(a => a._id) || [];
  const currentAssigneeId = position.assignee?._id || null;

  const primaryTA = position.assignee;
  const triggerStyle = primaryTA?.color
    ? { backgroundColor: TA_COLORS[primaryTA.color]?.bg, color: TA_COLORS[primaryTA.color]?.text, borderColor: 'transparent' }
    : undefined;

  // Compute displayed flags
  const flagEntries = position.flags ? Object.entries(position.flags).filter(([, f]) => f !== null) : [];

  return (
    <div className="pos-detail">
      <div className="detail-header">
        <div>
          <h1>{position.jobOrderId}</h1>
          <p className="subtitle">{position.position} — {position.client?.clientName}</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancel' : 'Edit'}
          </button>
          {isEditing && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowAssignModal(true)}>Assign TA</button>
          <button className="btn-danger" onClick={() => setShowDeleteModal(true)}>Delete</button>
        </div>
      </div>

      {/* ---- Flags bar (editable via popovers) ---- */}
      <div className="pd-flags-bar">
        {flagEntries.map(([flagKey, flag]) => {
          const currentMode = position.flagOverrides?.[flagKey] || 'auto';
          const isOpen = flagPopoverId === flagKey;
          const dir = flagPopoverDirection[flagKey] || 'up';
          return (
            <div className="pd-flag-wrap" key={flagKey}>
              <button type="button" className="flag-badge-btn-pd" onClick={(e) => {
                if (flagPopoverId === flagKey) setFlagPopoverId(null);
                else {
                  setFlagPopoverDirection(prev => ({ ...prev, [flagKey]: computeFlagPopoverDirection(e.currentTarget) }));
                  setFlagPopoverId(flagKey);
                }
              }} title={`${flag.label} — click to change`}>
                <FlagBadge flag={flag} />
              </button>
              {isOpen && (
                <>
                  <div className="popover-backdrop" onClick={() => setFlagPopoverId(null)} />
                  <div className={`pd-flag-popover pd-flag-popover--${dir}`}>
                    <div className="pd-flag-popover-title">{flag.label}</div>
                    {['auto', 'on', 'off'].map(mode => (
                      <button key={mode} className={`pd-flag-option ${currentMode === mode ? 'selected' : ''}`} onClick={() => handleFlagOverride(flagKey, mode)}>
                        {mode === 'auto' ? 'Auto (default)' : mode === 'on' ? 'Force On' : 'Turn Off'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {/* Manage all flags */}
        <div className="pd-flag-wrap">
          <button type="button" className="pd-flag-add-btn" onClick={(e) => {
            const key = '__manage__';
            if (flagPopoverId === key) setFlagPopoverId(null);
            else {
              setFlagPopoverDirection(prev => ({ ...prev, [key]: computeFlagPopoverDirection(e.currentTarget) }));
              setFlagPopoverId(key);
            }
          }} title="Manage all flags">+</button>
          {flagPopoverId === '__manage__' && (
            <>
              <div className="popover-backdrop" onClick={() => setFlagPopoverId(null)} />
              <div className={`pd-flag-popover pd-flag-popover--manage pd-flag-popover--${flagPopoverDirection['__manage__'] || 'down'}`}>
                <div className="pd-flag-popover-title">Manage Flags</div>
                {FLAG_OPTIONS.map(({ value: fk, label }) => {
                  const currentMode = position.flagOverrides?.[fk] || 'auto';
                  return (
                    <div className="pd-flag-manage-row" key={fk}>
                      <span className="pd-flag-manage-label">{label}</span>
                      <div className="pd-flag-manage-btns">
                        {['auto', 'on', 'off'].map(mode => (
                          <button key={mode} className={`pd-flag-mode-btn ${currentMode === mode ? 'active' : ''}`} onClick={() => handleFlagOverride(fk, mode)}>
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

      <div className="detail-grid">
        {/* ---- Left: Details ---- */}
        <div className="detail-section">
          <h3>Details</h3>
          {isEditing ? (
            <form className="edit-form" onSubmit={e => e.preventDefault()}>
              <label>Job Order ID</label>
              <input name="jobOrderId" value={formData.jobOrderId || ''} onChange={handleFormChange} disabled />

              <label>Position</label>
              <input name="position" value={formData.position || ''} onChange={handleFormChange} />

              <label>P Level</label>
              <select name="pLevel" value={formData.pLevel || ''} onChange={handleFormChange}>
                {PLEVEL_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <label>Status</label>
              <select name="status" value={formData.status || ''} onChange={handleFormChange}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <label>Package Range</label>
              <input name="packageRange" value={formData.packageRange || ''} onChange={handleFormChange} placeholder="e.g. £40-50k" />

              <label>LS Count</label>
              <input name="lsCount" type="number" value={formData.lsCount || ''} onChange={handleFormChange} />

              <label>CV Count</label>
              <input name="cvCount" type="number" value={formData.cvCount || ''} onChange={handleFormChange} />

              <label>Ext Shortlist</label>
              <div className="pd-ext-shortlist-edit">
                <input
                  type="text"
                  inputMode="numeric"
                  className="pd-ext-input"
                  name="extShortlistCount"
                  value={formData.extShortlistCount === 'Client Review' ? '' : (formData.extShortlistCount ?? '')}
                  onChange={handleFormChange}
                  placeholder="Number"
                  disabled={formData.extShortlistCount === 'Client Review'}
                />
                <select
                  className="pd-ext-select"
                  value={formData.extShortlistCount === 'Client Review' ? 'clientReview' : ''}
                  onChange={(e) => {
                    if (e.target.value === 'clientReview') setFormData(prev => ({ ...prev, extShortlistCount: 'Client Review' }));
                    else setFormData(prev => ({ ...prev, extShortlistCount: '' }));
                  }}
                >
                  <option value="">#</option>
                  <option value="clientReview">Client Review</option>
                </select>
              </div>

              <label>Expected Close Date</label>
              <input name="expectedCloseDate" type="date" value={formData.expectedCloseDate?.split('T')[0] || ''} onChange={handleFormChange} />

              <label>This Week Focus</label>
              <input name="thisWeekFocus" value={formData.thisWeekFocus || ''} onChange={handleFormChange} />

              <label>Remarks</label>
              <textarea name="remarks" value={formData.remarks || ''} onChange={handleFormChange} rows="3" />

              {/* Highlight color picker */}
              <label>Highlight Color</label>
              <div className="pd-color-picker-wrap" ref={colorPickerRef}>
                <button
                  type="button"
                  className="pd-color-swatch-btn"
                  style={{
                    background: formData.highlightColor ? COLOR_HEX[formData.highlightColor] : '#e5e7eb',
                    border: formData.highlightColor ? '2px solid rgba(0,0,0,0.15)' : '2px dashed #d1d5db',
                  }}
                  onClick={() => setColorPopoverOpen(o => !o)}
                  title="Set highlight color"
                />
                {colorPopoverOpen && (
                  <>
                    <div className="popover-backdrop" onClick={() => setColorPopoverOpen(false)} />
                    <div className="pd-color-popover">
                      <button type="button" className="color-popover-option" onClick={() => { setFormData(prev => ({ ...prev, highlightColor: null })); setColorPopoverOpen(false); }}>
                        <span className="color-swatch-dot color-swatch-dot--none" /> None
                      </button>
                      {COLOR_KEYS.map(key => (
                        <button type="button" key={key} className="color-popover-option" onClick={() => { setFormData(prev => ({ ...prev, highlightColor: key })); setColorPopoverOpen(false); }}>
                          <span className="color-swatch-dot" style={{ background: COLOR_HEX[key] }} />{key}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </form>
          ) : (
            <div className="detail-view">
              {/* Inline colored dropdowns in view mode */}
              <div className="detail-row detail-row--inline">
                <span>Level</span>
                <InlineDropdown value={position.pLevel} options={levelOptions} onChange={v => handleDirectUpdate('pLevel', v)} shape="circle" />
              </div>
              <div className="detail-row detail-row--inline">
                <span>Status</span>
                <InlineDropdown value={position.status} options={statusOptions} onChange={v => handleDirectUpdate('status', v)} />
              </div>
              <div className="detail-row">
                <span>Package Range</span>
                <span>{position.packageRange || '—'}</span>
              </div>
              <div className="detail-row">
                <span>Assignee</span>
                <span>{position.assignee?.name || '—'}</span>
              </div>
              <div className="detail-row detail-row--inline">
                <span>Primary TA</span>
                <SingleInlineDropdown
                  value={currentAssigneeId}
                  options={taOptions.map(o => ({ ...o }))}
                  onChange={handlePrimaryAssign}
                  placeholder="Assign TA"
                />
              </div>
              <div className="detail-row detail-row--inline">
                <span>Parallel TAs</span>
                <div className="pd-assignee-group">
                  <ParallelAssigneesPicker
                    values={currentParallelIds}
                    options={parallelOptions}
                    onChange={handleParallelUpdate}
                  />
                  {currentParallelIds.length > 0 && (
                    <div className="pd-parallel-chips">
                      {currentParallelIds.map(pid => {
                        const ta = tas.find(t => t._id === pid);
                        const chipStyle = ta?.color
                          ? { backgroundColor: TA_COLORS[ta.color]?.bg, color: TA_COLORS[ta.color]?.text }
                          : undefined;
                        return ta ? (
                          <span key={pid} className="parallel-chip" style={chipStyle}>
                            {ta.name}
                            <button className="parallel-chip-remove" onClick={() => handleParallelUpdate(currentParallelIds.filter(i => i !== pid))}>×</button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="detail-row">
                <span>Date Assigned</span>
                <span>{position.dateAssigned ? new Date(position.dateAssigned).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-row">
                <span>Expected Close</span>
                <span>{position.expectedCloseDate ? new Date(position.expectedCloseDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="detail-row">
                <span>LS Count</span>
                <span>{position.lsCount ?? '—'}</span>
              </div>
              <div className="detail-row">
                <span>CV Count</span>
                <span>{position.cvCount ?? '—'}</span>
              </div>
              <div className="detail-row">
                <span>Ext Shortlist</span>
                <span>
                  {position.extShortlistCount === 'Client Review'
                    ? <span className="ext-shortlist-badge ext-shortlist-badge--review">Client Review</span>
                    : (position.extShortlistCount ?? '—')}
                </span>
              </div>
              <div className="detail-row detail-row--inline">
                <span>Highlight Color</span>
                <div className="pd-color-picker-wrap" ref={colorPickerRef}>
                  <button
                    type="button"
                    className="pd-color-swatch-btn"
                    style={{
                      background: position.highlightColor ? COLOR_HEX[position.highlightColor] : '#e5e7eb',
                      border: position.highlightColor ? '2px solid rgba(0,0,0,0.15)' : '2px dashed #d1d5db',
                    }}
                    onClick={() => setColorPopoverOpen(o => !o)}
                    title="Set highlight color"
                  />
                  {colorPopoverOpen && (
                    <>
                      <div className="popover-backdrop" onClick={() => setColorPopoverOpen(false)} />
                      <div className="pd-color-popover">
                        <button type="button" className="color-popover-option" onClick={() => handleColorChange(null)}>
                          <span className="color-swatch-dot color-swatch-dot--none" /> None
                        </button>
                        {COLOR_KEYS.map(key => (
                          <button type="button" key={key} className="color-popover-option" onClick={() => handleColorChange(key)}>
                            <span className="color-swatch-dot" style={{ background: COLOR_HEX[key] }} />{key}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="detail-row">
                <span>This Week Focus</span>
                <span>{position.thisWeekFocus || '—'}</span>
              </div>
              <div className="detail-row">
                <span>Remarks</span>
                <span>{position.remarks || '—'}</span>
              </div>
              <div className="detail-row">
                <span>Tags</span>
                <span>{position.tags?.join(', ') || '—'}</span>
              </div>
            </div>
          )}
        </div>

        {/* ---- Right: Allocation Rounds + Change History ---- */}
        <div className="detail-section">
          <h3>Allocation Rounds</h3>
          {position.allocationRounds?.length ? (
            <table className="history-table">
              <thead>
                <tr><th>Round</th><th>TA</th><th>Date</th><th>Reason</th><th>CV Count</th></tr>
              </thead>
              <tbody>
                {position.allocationRounds.map((round, idx) => (
                  <tr key={idx}>
                    <td>{round.roundNumber}</td>
                    <td>{round.taAssigned?.name || '—'}</td>
                    <td>{new Date(round.dateAssigned).toLocaleDateString()}</td>
                    <td>{round.reason || '—'}</td>
                    <td>{round.cvCountAtRound ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No allocation rounds</p>
          )}

          <h3 style={{ marginTop: '24px' }}>Change History</h3>
          {history.length ? (
            <table className="history-table">
              <thead>
                <tr><th>Field</th><th>Old</th><th>New</th><th>Changed At</th></tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={idx}>
                    <td>{h.field}</td>
                    <td>{h.oldValue || '—'}</td>
                    <td>{h.newValue || '—'}</td>
                    <td>{new Date(h.changedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No history yet</p>
          )}
        </div>
      </div>

      {/* ---- Assign TA Modal ---- */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Assign TA to {position.jobOrderId}</h3>
            <div className="assign-form">
              <label>Select TA</label>
              <select value={assignData.taId} onChange={e => setAssignData({ ...assignData, taId: e.target.value })}>
                <option value="">Choose...</option>
                {tas.map(ta => <option key={ta._id} value={ta._id}>{ta.name}</option>)}
              </select>
              <label>Reason for assignment</label>
              <input type="text" value={assignData.reason} onChange={e => setAssignData({ ...assignData, reason: e.target.value })} placeholder="e.g., New allocation, reassign, etc." />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleAssign} disabled={saving}>{saving ? 'Assigning...' : 'Assign'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Delete Modal ---- */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Position</h3>
            <p>Are you sure you want to delete <strong>{position.jobOrderId}</strong>?</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PositionDetails;