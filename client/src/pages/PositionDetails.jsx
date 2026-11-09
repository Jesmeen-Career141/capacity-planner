import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPosition, updatePosition, assignPosition, deletePosition } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import { getPositionHistory } from '../api/positionHistory';
import { getAssignments, createAssignment, updateAssignment, deleteAssignment } from '../api/actionBoard';
import { getPositionInterviewTracking } from '../api/interviews';
import FlagBadge from '../components/FlagBadge';
import SalaryPackagePicker from '../components/SalaryPackagePicker';
import PositionActivityHistory from '../components/PositionActivityHistory';
import PositionInterviewTrackingSection from '../components/PositionInterviewTrackingSection';
import PositionAttemptHistorySection from '../components/PositionAttemptHistorySection';
import CandidateCvSection from '../components/CandidateCvSection';
import { formatSalary } from '../utils/salaryFormatter';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertTriangle
} from 'lucide-react';
import './Positions.css';
import './PositionDetails.css';

// ---- Shared constants (mirrors Positions.jsx) ----
const STATUS_OPTIONS = ['Yet to Activate', 'A&P', 'Fence', 'Hold', 'Paused', 'Placed', 'Lost', 'Focus', 'Client Decision'];
const ALL_STATUS_OPTIONS = [...STATUS_OPTIONS, 'Reactivated'];
const PLEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const COLOR_KEYS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

const FLAG_OPTIONS = [
  { value: 'followUp', label: 'Follow Up' },
  { value: 'addOn', label: 'Add-On' },
  { value: 'backup', label: 'Backup' },
  { value: 'goingGood', label: 'Going Good' },
  { value: 'reAssign', label: 'Reassign' },
];

const ALL_WORK_TYPES = [
  '100% Work',
  'Follow-up',
  'Add-On',
  'Backup',
  'Re-assign',
  'Going Good'
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
  P6: { bg: '#cbd5e1', text: '#334155' },
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
  'Reactivated': { bg: '#ccfbf1', text: '#0f766e' },
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

function getWorkTypeClass(type) {
  if (!type) return 'dab-wt-100';
  const t = type.toLowerCase();
  if (t.includes('100')) return 'dab-wt-100';
  if (t.includes('follow')) return 'dab-wt-followup';
  if (t.includes('add')) return 'dab-wt-addon';
  if (t.includes('backup')) return 'dab-wt-backup';
  if (t.includes('re-assign') || t.includes('reassign')) return 'dab-wt-reassign';
  if (t.includes('going') || t.includes('good')) return 'dab-wt-goinggood';
  return 'dab-wt-100';
}

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

// ---- SingleInlineDropdown ----
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

  // 5 Tabs State
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'cvs' | 'activityHistory' | 'interviews' | 'assignments'

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [position, setPosition] = useState(null);
  const [tas, setTAs] = useState([]);
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

  // Tab 4 (Interviews) data summary
  const [interviewTracking, setInterviewTracking] = useState(null);

  // Tab 5 (Assignments) state
  const [assignments, setAssignments] = useState([]);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editFormData, setEditFormData] = useState({ ta: '', assignedDateStr: '', workType: '100% Work', notes: '' });
  const [editFormError, setEditFormError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(null);
  const [deletingAsg, setDeletingAsg] = useState(false);

  // Schedule new assignment modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState({
    ta: '',
    assignedDateStr: new Date().toISOString().split('T')[0],
    workType: '100% Work',
    notes: ''
  });
  const [schedulingAsg, setSchedulingAsg] = useState(false);
  const [scheduleFormError, setScheduleFormError] = useState('');

  // Initial Data Fetch
  const fetchData = async () => {
    try {
      const [posRes, taRes, intRes, asgRes] = await Promise.all([
        getPosition(id),
        getActiveTAs(),
        getPositionInterviewTracking(id).catch(() => null),
        getAssignments({ position: id }).catch(() => ({ data: [] }))
      ]);
      setPosition(posRes.data);
      setFormData(posRes.data);
      const sortedTAs = taRes.data.slice().sort((a, b) => a.name.localeCompare(b.name));
      setTAs(sortedTAs);
      setInterviewTracking(intRes);
      setAssignments(Array.isArray(asgRes.data) ? asgRes.data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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
        packageRange: formData.packageRange !== undefined ? formData.packageRange : (position.packageRange || ''),
        salary: formData.salary !== undefined ? formData.salary : (position.salary || null),
        extShortlistCount: formData.extShortlistCount,
        lsCount: formData.lsCount,
        cvCount: formData.cvCount,
        receivedDate: formData.receivedDate || position.receivedDate || position.createdAt,
        expectedCloseDate: formData.expectedCloseDate,
        thisWeekFocus: formData.thisWeekFocus || '',
        remarks: formData.remarks || '',
      };
      const res = await updatePosition(id, payload);
      setPosition(res.data);
      setFormData(res.data);
      setIsEditing(false);
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
      parallelAssignees: newIds.map(taId => tas.find(t => t._id === taId)).filter(Boolean),
    }));
    try {
      const res = await updatePosition(id, { parallelAssignees: newIds });
      setPosition(res.data);
      setFormData(res.data);
    } catch (err) {
      setPosition(prev => ({
        ...prev,
        parallelAssignees: oldParallel.map(taId => tas.find(t => t._id === taId)).filter(Boolean),
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

  // ---- Tab 5 Assignment Handlers ----
  const refreshAssignmentsList = async () => {
    try {
      const res = await getAssignments({ position: id });
      setAssignments(res.data || []);
    } catch (_) {}
  };

  const handleStatusChangeOnAssignment = async (asgId, newStatus) => {
    try {
      await updateAssignment(asgId, { status: newStatus });
      refreshAssignmentsList();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleStartEditAssignment = (asg) => {
    setEditingAssignment(asg);
    setEditFormData({
      ta: asg.ta?._id || asg.ta || '',
      assignedDateStr: asg.assignedDateStr || '',
      workType: asg.workType || '100% Work',
      notes: asg.notes || ''
    });
    setEditFormError('');
  };

  const handleSaveEditAssignment = async (e) => {
    e.preventDefault();
    if (!editFormData.ta) {
      setEditFormError('Please select a TA.');
      return;
    }
    if (!editFormData.assignedDateStr) {
      setEditFormError('Please select an assignment date.');
      return;
    }
    setSavingEdit(true);
    setEditFormError('');
    try {
      await updateAssignment(editingAssignment._id, {
        ta: editFormData.ta,
        assignedDateStr: editFormData.assignedDateStr,
        workType: editFormData.workType,
        notes: editFormData.notes
      });
      refreshAssignmentsList();
      setEditingAssignment(null);
    } catch (err) {
      setEditFormError(err.response?.data?.error || err.message || 'Failed to update assignment');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDeleteAssignment = async () => {
    if (!deletingAssignment) return;
    setDeletingAsg(true);
    try {
      await deleteAssignment(deletingAssignment._id);
      refreshAssignmentsList();
      setDeletingAssignment(null);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to delete assignment');
    } finally {
      setDeletingAsg(false);
    }
  };

  const handleSaveNewAssignment = async (e) => {
    e.preventDefault();
    if (!scheduleFormData.ta) {
      setScheduleFormError('Please select a TA.');
      return;
    }
    if (!scheduleFormData.assignedDateStr) {
      setScheduleFormError('Please select a date.');
      return;
    }
    setSchedulingAsg(true);
    setScheduleFormError('');
    try {
      await createAssignment({
        position: position._id,
        ta: scheduleFormData.ta,
        assignedDateStr: scheduleFormData.assignedDateStr,
        workType: scheduleFormData.workType,
        notes: scheduleFormData.notes
      });
      refreshAssignmentsList();
      setShowScheduleModal(false);
      setScheduleFormData({
        ta: '',
        assignedDateStr: new Date().toISOString().split('T')[0],
        workType: '100% Work',
        notes: ''
      });
    } catch (err) {
      setScheduleFormError(err.response?.data?.error || err.message || 'Failed to schedule assignment');
    } finally {
      setSchedulingAsg(false);
    }
  };

  if (loading) return <div className="pos-detail-loading" style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>Loading position details...</div>;
  if (error) return <div className="pos-detail-error" style={{ color: '#b91c1c', padding: '2rem' }}>Error: {error}</div>;
  if (!position) return <div style={{ padding: '2rem' }}>Position not found</div>;

  const statusOptions = ALL_STATUS_OPTIONS.map(s => {
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

  const formatDateWithTime = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return `${dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  };

  const formatDateShort = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Active TA assignments with per-TA assignedAt timestamps
  const activeTaAssignmentRows = (() => {
    if (Array.isArray(position.taAssignments) && position.taAssignments.length > 0) {
      return position.taAssignments.map(entry => ({
        taName: entry.ta?.name || tas.find(t => String(t._id) === String(entry.ta?._id || entry.ta))?.name || 'TA',
        role: entry.role || 'Primary',
        assignedAt: entry.assignedAt
      }));
    }
    const fallback = [];
    if (position.assignee) {
      fallback.push({
        taName: position.assignee.name,
        role: 'Primary',
        assignedAt: position.dateAssigned || position.createdAt
      });
    }
    if (Array.isArray(position.parallelAssignees)) {
      for (const pa of position.parallelAssignees) {
        fallback.push({
          taName: pa.name,
          role: 'Parallel',
          assignedAt: position.dateAssigned || position.createdAt
        });
      }
    }
    return fallback;
  })();

  // Displayed flags count
  const flagEntries = position.flags ? Object.entries(position.flags).filter(([, f]) => f !== null) : [];
  const activeFlagsCount = flagEntries.length;

  // Interviews count
  const interviewsCount = interviewTracking?.summary?.totalScheduledRounds ?? interviewTracking?.interviews?.length ?? 0;

  // Location display
  const locationDisplay = position.location || position.client?.location || 'Not specified';
  const salaryDisplay = formatSalary(position.salary, position.packageRange) || position.packageRange || 'Open to discuss';

  return (
    <div className="pd-redesign-container">
      {/* Breadcrumb */}
      <div className="pd-crumb">POSITIONS / POSITION DETAILS</div>

      {/* Header (Mockup Compliant) */}
      <div className="pd-head">
        <div className="pd-head-title-wrap">
          <h1>
            {position.position}
            <span className="pd-pill pd-pill-jo">{position.jobOrderId}</span>
            <span className={`pd-pill pd-pill-${position.pLevel?.toLowerCase() || 'p1'}`}>{position.pLevel}</span>
            <span
              className="pd-pill pd-pill-status"
              style={{
                backgroundColor: STATUS_COLORS[position.status]?.bg || '#d1fae5',
                color: STATUS_COLORS[position.status]?.text || '#065f46'
              }}
            >
              {position.status}
            </span>
            {(position.isReactivated || position.status === 'Reactivated') && (
              <span className="reactivated-tag" style={{ fontSize: '12px' }} title="Reactivated Requirement">
                ↻ Reactivated
              </span>
            )}
          </h1>
          <div className="pd-sub">
            <span>Client: <strong>{position.client?.clientName || 'N/A'}</strong></span>
            <span>•</span>
            <span>Location: <strong>{locationDisplay}</strong></span>
            <span>•</span>
            <span>Package: <strong>{salaryDisplay}</strong></span>
          </div>
        </div>

        <div className="pd-head-actions">
          <button className="btn-secondary" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancel Edit' : 'Edit Position'}
          </button>
          {isEditing && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowAssignModal(true)}>Assign TA</button>
          <button className="btn-danger" onClick={() => setShowDeleteModal(true)}>Delete</button>
        </div>
      </div>

      {/* Quick Metrics Banner (Mockup Compliant) */}
      <section className="pd-metrics">
        <div className="pd-metric-card">
          <small>Internal CVs</small>
          <strong>{position.cvCount ?? position.lsCount ?? 0}</strong>
        </div>
        <div className="pd-metric-card">
          <small>External Shortlist</small>
          <strong>{position.extShortlistCount ?? 0}</strong>
        </div>
        <div className="pd-metric-card">
          <small>Interviews</small>
          <strong>{interviewsCount}</strong>
        </div>
        <div className="pd-metric-card">
          <small>Active Flags</small>
          <strong>{activeFlagsCount}</strong>
        </div>
      </section>

      {/* 5 Main Tabs (Mockup Compliant) */}
      <div className="pd-tabs-bar">
        <button
          type="button"
          className={`pd-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`pd-tab-btn ${activeTab === 'cvs' ? 'active' : ''}`}
          onClick={() => setActiveTab('cvs')}
        >
          CVs & Shortlist
        </button>
        <button
          type="button"
          className={`pd-tab-btn ${activeTab === 'activityHistory' ? 'active' : ''}`}
          onClick={() => setActiveTab('activityHistory')}
        >
          Activity History
        </button>
        <button
          type="button"
          className={`pd-tab-btn ${activeTab === 'interviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('interviews')}
        >
          Interviews {interviewsCount > 0 && <span className="pd-tab-count">{interviewsCount}</span>}
        </button>
        <button
          type="button"
          className={`pd-tab-btn ${activeTab === 'assignments' ? 'active' : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          Assignments {assignments.length > 0 && <span className="pd-tab-count">{assignments.length}</span>}
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: OVERVIEW                                                */}
      {/* ============================================================== */}
      {activeTab === 'overview' && (
        <div className="pd-tab-content">
          {/* Flags Bar */}
          <div className="pd-flags-bar" style={{ marginBottom: '16px' }}>
            {flagEntries.map(([flagKey, flag]) => {
              const currentMode = position.flagOverrides?.[flagKey] || 'auto';
              const isOpen = flagPopoverId === flagKey;
              const dir = flagPopoverDirection[flagKey] || 'up';
              return (
                <div className="pd-flag-wrap" key={flagKey}>
                  <button
                    type="button"
                    className="flag-badge-btn-pd"
                    onClick={(e) => {
                      if (flagPopoverId === flagKey) setFlagPopoverId(null);
                      else {
                        setFlagPopoverDirection(prev => ({ ...prev, [flagKey]: computeFlagPopoverDirection(e.currentTarget) }));
                        setFlagPopoverId(flagKey);
                      }
                    }}
                    title={`${flag.label} — click to change`}
                  >
                    <FlagBadge flag={flag} />
                  </button>
                  {isOpen && (
                    <>
                      <div className="popover-backdrop" onClick={() => setFlagPopoverId(null)} />
                      <div className={`pd-flag-popover pd-flag-popover--${dir}`}>
                        <div className="pd-flag-popover-title">{flag.label}</div>
                        {['auto', 'on', 'off'].map(mode => (
                          <button
                            key={mode}
                            className={`pd-flag-option ${currentMode === mode ? 'selected' : ''}`}
                            onClick={() => handleFlagOverride(flagKey, mode)}
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

            {/* Manage all flags */}
            <div className="pd-flag-wrap">
              <button
                type="button"
                className="pd-flag-add-btn"
                onClick={(e) => {
                  const key = '__manage__';
                  if (flagPopoverId === key) setFlagPopoverId(null);
                  else {
                    setFlagPopoverDirection(prev => ({ ...prev, [key]: computeFlagPopoverDirection(e.currentTarget) }));
                    setFlagPopoverId(key);
                  }
                }}
                title="Manage all flags"
              >
                +
              </button>
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
                              <button
                                key={mode}
                                className={`pd-flag-mode-btn ${currentMode === mode ? 'active' : ''}`}
                                onClick={() => handleFlagOverride(fk, mode)}
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

          <div className="detail-grid">
            {/* Left: Position Details */}
            <div className="detail-section">
              <h3>Position Details</h3>
              {isEditing ? (
                <form className="edit-form" onSubmit={e => e.preventDefault()}>
                  <label>Job Order ID</label>
                  <input name="jobOrderId" value={formData.jobOrderId || ''} disabled />

                  <label>Position</label>
                  <input name="position" value={formData.position || ''} onChange={handleFormChange} />

                  <label>P Level</label>
                  <select name="pLevel" value={formData.pLevel || ''} onChange={handleFormChange}>
                    {PLEVEL_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>

                  <label>Status</label>
                  <select name="status" value={formData.status || ''} onChange={handleFormChange}>
                    {ALL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <label>Salary Package</label>
                  <SalaryPackagePicker
                    value={formData.salary !== undefined ? formData.salary : position.salary}
                    legacyText={formData.packageRange !== undefined ? formData.packageRange : position.packageRange}
                    onChange={(updatedSalary, formattedString) => {
                      setFormData(prev => ({
                        ...prev,
                        salary: updatedSalary,
                        packageRange: formattedString
                      }));
                    }}
                  />

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

                  <label>Received Date</label>
                  <input
                    name="receivedDate"
                    type="date"
                    value={(formData.receivedDate || position.receivedDate || position.createdAt || '').split('T')[0]}
                    onChange={handleFormChange}
                  />

                  <label>Expected Close Date</label>
                  <input name="expectedCloseDate" type="date" value={formData.expectedCloseDate?.split('T')[0] || ''} onChange={handleFormChange} />

                  <label>This Week Focus</label>
                  <input name="thisWeekFocus" value={formData.thisWeekFocus || ''} onChange={handleFormChange} />

                  <label>Remarks</label>
                  <textarea name="remarks" value={formData.remarks || ''} onChange={handleFormChange} rows="3" />
                </form>
              ) : (
                <div className="detail-view">
                  <div className="detail-row detail-row--inline">
                    <span>Priority Level</span>
                    <InlineDropdown value={position.pLevel} options={levelOptions} onChange={v => handleDirectUpdate('pLevel', v)} shape="circle" />
                  </div>
                  <div className="detail-row detail-row--inline">
                    <span>Status</span>
                    <InlineDropdown value={position.status} options={statusOptions} onChange={v => handleDirectUpdate('status', v)} />
                  </div>
                  <div className="detail-row">
                    <span>Package Range</span>
                    <span>{formatSalary(position.salary, position.packageRange) || '—'}</span>
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
                  <div className="detail-row detail-row--inline">
                    <span>Received Date</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <strong>{formatDateShort(position.receivedDate || position.createdAt)}</strong>
                      <input
                        type="date"
                        value={(position.receivedDate || position.createdAt || '').split('T')[0]}
                        onChange={e => {
                          if (e.target.value) handleDirectUpdate('receivedDate', e.target.value);
                        }}
                        style={{
                          padding: '2px 6px',
                          fontSize: '12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          color: '#334155'
                        }}
                        title="Edit Received Date"
                      />
                    </span>
                  </div>
                  <div className="detail-row" style={{ alignItems: 'flex-start' }}>
                    <span>Assigned Date (per TA)</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'right' }}>
                      {activeTaAssignmentRows.length > 0 ? (
                        activeTaAssignmentRows.map((row, idx) => (
                          <div key={idx} style={{ fontSize: '12.5px', color: '#1e293b' }}>
                            <strong>{row.taName}</strong>{' '}
                            <span style={{ fontSize: '11px', color: '#64748b' }}>({row.role})</span>:{' '}
                            <span>{formatDateWithTime(row.assignedAt)}</span>
                          </div>
                        ))
                      ) : (
                        <span>Unassigned</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-row">
                    <span>Activation Date (TA Board)</span>
                    <span>
                      {position.activatedAt ? (
                        <strong style={{ color: '#065f46' }}>{formatDateShort(position.activatedAt)}</strong>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>Not yet activated on TA Board</span>
                      )}
                    </span>
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

            {/* Right: TA Assignment History + Allocation Rounds + Attempts Summary */}
            <div className="detail-section">
              <h3>TA Assignment History</h3>
              {Array.isArray(position.assignmentHistory) && position.assignmentHistory.length > 0 ? (
                <table className="history-table" style={{ marginBottom: '20px' }}>
                  <thead>
                    <tr>
                      <th>TA</th>
                      <th>Role</th>
                      <th>Assigned At</th>
                      <th>Unassigned At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.assignmentHistory.map((h, idx) => {
                      const tName = h.ta?.name || tas.find(t => String(t._id) === String(h.ta?._id || h.ta))?.name || '—';
                      return (
                        <tr key={idx}>
                          <td><strong>{tName}</strong></td>
                          <td>{h.role || 'Primary'}</td>
                          <td>{formatDateWithTime(h.assignedAt)}</td>
                          <td>{h.unassignedAt ? formatDateWithTime(h.unassignedAt) : <span style={{ color: '#059669', fontWeight: 600 }}>Active</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}

              <h3>Allocation Rounds</h3>
              {position.allocationRounds?.length ? (
                <table className="history-table">
                  <thead>
                    <tr><th>Round</th><th>TA</th><th>Date</th><th>Reason</th><th>CVs</th></tr>
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
                <p style={{ color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>No historical allocation rounds.</p>
              )}

              <div style={{ marginTop: '28px' }}>
                <h3 style={{ marginBottom: '12px' }}>Recruitment Attempts</h3>
                <PositionAttemptHistorySection positionId={position._id} tas={tas} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: CVS & SHORTLIST                                         */}
      {/* ============================================================== */}
      {activeTab === 'cvs' && (
        <div className="pd-tab-content">
          <CandidateCvSection position={position} tas={tas} />
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ACTIVITY HISTORY (APPROVED CHRONOLOGICAL TIMELINE)      */}
      {/* ============================================================== */}
      {activeTab === 'activityHistory' && (
        <div className="pd-tab-content">
          <PositionActivityHistory positionId={position._id} jobOrderId={position.jobOrderId} />
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: INTERVIEWS                                              */}
      {/* ============================================================== */}
      {activeTab === 'interviews' && (
        <div className="pd-tab-content">
          <PositionInterviewTrackingSection positionId={position._id} />
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: ASSIGNMENTS (DAILY ACTION BOARD INTEGRATION)           */}
      {/* ============================================================== */}
      {activeTab === 'assignments' && (
        <div className="pd-tab-content">
          <div className="pd-assignments-panel">
            <div className="pd-assignments-header">
              <div>
                <h2>Work Board Assignments for {position.jobOrderId}</h2>
                <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                  Daily Action Board work schedules and TA allocations for this position.
                </div>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowScheduleModal(true)}
              >
                <Plus size={14} style={{ display: 'inline', marginRight: '4px' }} /> Schedule Work
              </button>
            </div>

            {assignments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                No Daily Action Board assignments have been created for this position yet.
              </div>
            ) : (
              <div className="pd-assignments-table-wrap">
                <table className="pd-assignments-table">
                  <thead>
                    <tr>
                      <th>Assignment ID</th>
                      <th>Date</th>
                      <th>Assigned TA</th>
                      <th>Work Type</th>
                      <th>Status</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(asg => {
                      const stLower = (asg.status || 'Pending').toLowerCase();
                      return (
                        <tr key={asg._id}>
                          <td>
                            <strong style={{ fontFamily: 'ui-monospace, monospace', color: '#0f3d24' }}>
                              {asg.assignmentId}
                            </strong>
                          </td>
                          <td>{asg.assignedDateStr}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#334155' }}>
                              {asg.ta?.name || 'Unassigned'}
                            </span>
                          </td>
                          <td>
                            <span className={`dab-wt-badge ${getWorkTypeClass(asg.workType)}`}>
                              {asg.workType}
                            </span>
                          </td>
                          <td>
                            <div className="dab-status-selector" style={{ margin: 0 }}>
                              <button
                                type="button"
                                className={`dab-status-btn ${asg.status === 'Completed' ? 'active completed' : ''}`}
                                onClick={() => handleStatusChangeOnAssignment(asg._id, 'Completed')}
                                title="Mark Completed"
                              >
                                <CheckCircle2 size={11} />
                                <span>Completed</span>
                              </button>
                              <button
                                type="button"
                                className={`dab-status-btn ${asg.status === 'Pending' ? 'active pending' : ''}`}
                                onClick={() => handleStatusChangeOnAssignment(asg._id, 'Pending')}
                                title="Mark Pending"
                              >
                                <Clock size={11} />
                                <span>Pending</span>
                              </button>
                              <button
                                type="button"
                                className={`dab-status-btn ${asg.status === 'Missed' ? 'active missed' : ''}`}
                                onClick={() => handleStatusChangeOnAssignment(asg._id, 'Missed')}
                                title="Mark Missed"
                              >
                                <AlertCircle size={11} />
                                <span>Missed</span>
                              </button>
                            </div>
                          </td>
                          <td style={{ color: '#475569', fontSize: '12.5px', maxWidth: '240px' }}>
                            {asg.notes || '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="pd-asg-actions" style={{ justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="pd-asg-btn-sm"
                                onClick={() => handleStartEditAssignment(asg)}
                                title="Edit Assignment"
                              >
                                <Edit2 size={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="pd-asg-btn-sm danger"
                                onClick={() => setDeletingAssignment(asg)}
                                title="Delete Assignment"
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* ---- Delete Position Modal ---- */}
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

      {/* ---- Edit Assignment Modal (Tab 5) ---- */}
      {editingAssignment && (
        <div className="dab-modal-overlay" onClick={() => setEditingAssignment(null)}>
          <div className="dab-modal dab-modal-edit" onClick={e => e.stopPropagation()}>
            <div className="dab-modal-header">
              <div>
                <h3>Edit Assignment — {editingAssignment.assignmentId}</h3>
                <p className="dab-modal-subtitle" style={{ color: '#4b5563', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                  <strong>{position.jobOrderId}</strong> · {position.position} ({position.client?.clientName || 'Client N/A'})
                </p>
              </div>
              <button
                type="button"
                className="dab-modal-close-btn"
                onClick={() => setEditingAssignment(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditAssignment}>
              <div className="dab-modal-body">
                {editFormError && (
                  <div className="dab-form-error" style={{ marginBottom: '1rem', background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} />
                    <span>{editFormError}</span>
                  </div>
                )}

                <div className="dab-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Position (Read-only)
                    </label>
                    <input
                      type="text"
                      value={`${position.jobOrderId} - ${position.position}`}
                      disabled
                      style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
                    />
                  </div>

                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Work Type
                    </label>
                    <select
                      value={editFormData.workType}
                      onChange={e => setEditFormData(prev => ({ ...prev, workType: e.target.value }))}
                      required
                    >
                      {ALL_WORK_TYPES.map(wt => (
                        <option key={wt} value={wt}>{wt}</option>
                      ))}
                    </select>
                  </div>

                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Assigned TA
                    </label>
                    <select
                      value={editFormData.ta}
                      onChange={e => setEditFormData(prev => ({ ...prev, ta: e.target.value }))}
                      required
                    >
                      <option value="">Select TA...</option>
                      {tas.map(ta => (
                        <option key={ta._id} value={ta._id}>{ta.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Assignment Date
                    </label>
                    <input
                      type="date"
                      value={editFormData.assignedDateStr}
                      onChange={e => setEditFormData(prev => ({ ...prev, assignedDateStr: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="dab-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Allocation Notes (Optional)
                    </label>
                    <textarea
                      value={editFormData.notes}
                      onChange={e => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      placeholder="Specific instructions or notes for this assignment..."
                    />
                  </div>
                </div>
              </div>

              <div className="dab-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <button
                  type="button"
                  className="dab-btn-secondary"
                  onClick={() => setEditingAssignment(null)}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dab-btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- Delete Assignment Confirmation Modal (Tab 5) ---- */}
      {deletingAssignment && (
        <div className="dab-modal-overlay" onClick={() => setDeletingAssignment(null)}>
          <div className="dab-modal dab-modal-confirm" onClick={e => e.stopPropagation()}>
            <div className="dab-modal-header dab-modal-header--danger">
              <div className="dab-modal-title-wrap">
                <AlertTriangle size={20} className="dab-danger-icon" />
                <h3>Delete Assignment?</h3>
              </div>
              <button
                type="button"
                className="dab-modal-close-btn"
                onClick={() => setDeletingAssignment(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="dab-modal-body">
              <p style={{ margin: '0.5rem 0 1rem 0', color: '#374151', fontSize: '0.925rem', lineHeight: 1.5 }}>
                Are you sure you want to delete this assignment for <strong>{position.jobOrderId} – {position.position}</strong>, assigned to <strong>{deletingAssignment.ta?.name || 'TA'}</strong> on <strong>{deletingAssignment.assignedDateStr}</strong>?
              </p>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                This will remove the assignment from the Daily Action Board. The underlying position and recruitment data will remain unaffected.
              </p>
            </div>
            <div className="dab-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                className="dab-btn-secondary"
                onClick={() => setDeletingAssignment(null)}
                disabled={deletingAsg}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dab-btn-danger"
                onClick={handleConfirmDeleteAssignment}
                disabled={deletingAsg}
              >
                {deletingAsg ? 'Deleting...' : 'Delete Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Schedule Assignment Modal (Tab 5) ---- */}
      {showScheduleModal && (
        <div className="dab-modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="dab-modal dab-modal-edit" onClick={e => e.stopPropagation()}>
            <div className="dab-modal-header">
              <div>
                <h3>Schedule Work for {position.jobOrderId}</h3>
                <p className="dab-modal-subtitle" style={{ color: '#4b5563', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                  {position.position} · {position.client?.clientName}
                </p>
              </div>
              <button
                type="button"
                className="dab-modal-close-btn"
                onClick={() => setShowScheduleModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNewAssignment}>
              <div className="dab-modal-body">
                {scheduleFormError && (
                  <div className="dab-form-error" style={{ marginBottom: '1rem', background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} />
                    <span>{scheduleFormError}</span>
                  </div>
                )}

                <div className="dab-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Work Type
                    </label>
                    <select
                      value={scheduleFormData.workType}
                      onChange={e => setScheduleFormData(prev => ({ ...prev, workType: e.target.value }))}
                      required
                    >
                      {ALL_WORK_TYPES.map(wt => (
                        <option key={wt} value={wt}>{wt}</option>
                      ))}
                    </select>
                  </div>

                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Assign to TA
                    </label>
                    <select
                      value={scheduleFormData.ta}
                      onChange={e => setScheduleFormData(prev => ({ ...prev, ta: e.target.value }))}
                      required
                    >
                      <option value="">Select TA...</option>
                      {tas.map(ta => (
                        <option key={ta._id} value={ta._id}>{ta.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="dab-form-field">
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Assignment Date
                    </label>
                    <input
                      type="date"
                      value={scheduleFormData.assignedDateStr}
                      onChange={e => setScheduleFormData(prev => ({ ...prev, assignedDateStr: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="dab-form-field" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.35rem' }}>
                      Allocation Notes (Optional)
                    </label>
                    <textarea
                      value={scheduleFormData.notes}
                      onChange={e => setScheduleFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      placeholder="Specific instructions or targets for this assignment..."
                    />
                  </div>
                </div>
              </div>

              <div className="dab-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <button
                  type="button"
                  className="dab-btn-secondary"
                  onClick={() => setShowScheduleModal(false)}
                  disabled={schedulingAsg}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dab-btn-primary"
                  disabled={schedulingAsg}
                >
                  {schedulingAsg ? 'Scheduling...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PositionDetails;