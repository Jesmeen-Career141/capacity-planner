import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
  CalendarDays,
  Filter,
  X,
  Info,
  Search,
  Zap,
  MoreVertical,
  Edit2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import {
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getOverview,
  getAvailableWork
} from '../api/actionBoard';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import './DailyActionBoard.css';

// Helper: formats a date into YYYY-MM-DD
function toISODate(d) {
  const date = d ? new Date(d) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: formats date nicely for headers
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Helper: date range presets
function getDateRangePreset(preset) {
  const now = new Date();
  const todayStr = toISODate(now);

  if (preset === 'daily') {
    return { startDate: todayStr, endDate: todayStr };
  }

  if (preset === 'weekly') {
    const current = new Date();
    // Monday as first day of week
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(current.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: toISODate(monday), endDate: toISODate(sunday) };
  }

  if (preset === 'monthly') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: toISODate(firstDay), endDate: toISODate(lastDay) };
  }

  return { startDate: todayStr, endDate: todayStr };
}

const ALL_WORK_TYPES = [
  '100% Work',
  'Follow-up',
  'Add-On',
  'Backup',
  'Re-assign',
  'Going Good'
];

const PLEVEL_COLORS = {
  P1: { bg: '#7f1d1d', text: '#ffffff' },
  P2: { bg: '#dd2121f0', text: '#ffffff' },
  P3: { bg: '#f97316', text: '#ffffff' },
  P4: { bg: '#fdba74', text: '#7c2d12' },
  P5: { bg: '#fde047', text: '#78350f' },
  P6: { bg: '#cbd5e1', text: '#334155' },
};

export default function DailyActionBoard() {
  const queryClient = useQueryClient();

  // Primary tab: 'day' or 'overview'
  const [activeTab, setActiveTab] = useState('day');

  // Day View State
  const [selectedDate, setSelectedDate] = useState(toISODate());
  const [dayTaFilter, setDayTaFilter] = useState('');
  const [dayWorkTypeFilter, setDayWorkTypeFilter] = useState('');
  const [dayStatusFilter, setDayStatusFilter] = useState('');

  // Overview State
  const [overviewPreset, setOverviewPreset] = useState('weekly');
  const [customRange, setCustomRange] = useState(() => getDateRangePreset('weekly'));
  const [overviewTaFilter, setOverviewTaFilter] = useState('');
  const [overviewWorkTypeFilter, setOverviewWorkTypeFilter] = useState('');
  const [overviewStatusFilter, setOverviewStatusFilter] = useState('');

  // Modals state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignMode, setAssignMode] = useState('flagged'); // 'flagged' (Mode A) or 'all' (Mode B)
  const [flaggedWorkTypeFilter, setFlaggedWorkTypeFilter] = useState('All');
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [selectedPositionForAssign, setSelectedPositionForAssign] = useState(null);

  const [selectedTaDetail, setSelectedTaDetail] = useState(null);
  const [detailStatusFilter, setDetailStatusFilter] = useState('All');

  // New assignment form state
  const [assignForm, setAssignForm] = useState({
    position: '',
    ta: '',
    assignedDateStr: selectedDate,
    workType: '100% Work',
    notes: ''
  });
  const [formError, setFormError] = useState('');

  // Assignment Management state (Edit & Delete)
  const [cardMenuOpenId, setCardMenuOpenId] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editFormData, setEditFormData] = useState({
    ta: '',
    assignedDateStr: selectedDate,
    workType: '100% Work',
    notes: ''
  });
  const [editFormError, setEditFormError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(null);

  // Close card 3-dot menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (cardMenuOpenId && !e.target.closest('.dab-card-menu-wrap')) {
        setCardMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [cardMenuOpenId]);

  // Queries
  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await getPositions()).data
  });

  const { data: tas = [] } = useQuery({
    queryKey: ['tas'],
    queryFn: async () => (await getActiveTAs()).data
  });

  // Available work query (for Assign Work window)
  const { data: availableWorkData, isLoading: isAvailableWorkLoading } = useQuery({
    queryKey: ['availableWork'],
    queryFn: async () => (await getAvailableWork()).data,
    enabled: showAssignModal
  });

  // Day View query
  const { data: dayAssignments = [], isLoading: isDayLoading } = useQuery({
    queryKey: ['actionAssignments', selectedDate],
    queryFn: async () => (await getAssignments({ date: selectedDate })).data
  });

  // Overview query
  const effectiveOverviewRange = useMemo(() => {
    if (overviewPreset === 'custom') {
      return customRange;
    }
    return getDateRangePreset(overviewPreset);
  }, [overviewPreset, customRange]);

  const { data: overviewData, isLoading: isOverviewLoading } = useQuery({
    queryKey: [
      'actionOverview',
      effectiveOverviewRange.startDate,
      effectiveOverviewRange.endDate,
      overviewTaFilter,
      overviewWorkTypeFilter,
      overviewStatusFilter
    ],
    queryFn: async () => {
      const res = await getOverview({
        startDate: effectiveOverviewRange.startDate,
        endDate: effectiveOverviewRange.endDate,
        ta: overviewTaFilter || undefined,
        workType: overviewWorkTypeFilter || undefined,
        status: overviewStatusFilter || undefined
      });
      return res.data;
    }
  });

  // Overview assignments query (for interactive TA drilldown)
  const { data: overviewAssignments = [] } = useQuery({
    queryKey: [
      'actionAssignmentsRange',
      effectiveOverviewRange.startDate,
      effectiveOverviewRange.endDate
    ],
    queryFn: async () => {
      const res = await getAssignments({
        startDate: effectiveOverviewRange.startDate,
        endDate: effectiveOverviewRange.endDate
      });
      return res.data;
    },
    enabled: activeTab === 'overview'
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries(['actionAssignments']);
      queryClient.invalidateQueries(['actionOverview']);
      queryClient.invalidateQueries(['actionAssignmentsRange']);
      queryClient.invalidateQueries(['availableWork']);
      setShowAssignModal(false);
      setSelectedPositionForAssign(null);
      setAssignForm({
        position: '',
        ta: '',
        assignedDateStr: selectedDate,
        workType: '100% Work',
        notes: ''
      });
      setFormError('');
    },
    onError: (err) => {
      setFormError(err.response?.data?.error || err.message || 'Failed to create assignment');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAssignment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['actionAssignments']);
      queryClient.invalidateQueries(['actionOverview']);
      queryClient.invalidateQueries(['actionAssignmentsRange']);
    },
    onError: (err) => {
      alert(err.response?.data?.error || err.message || 'Failed to update assignment');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['actionAssignments']);
      queryClient.invalidateQueries(['actionOverview']);
      queryClient.invalidateQueries(['actionAssignmentsRange']);
      queryClient.invalidateQueries(['availableWork']);
      setDeletingAssignment(null);
    },
    onError: (err) => {
      alert(err.response?.data?.error || err.message || 'Failed to delete assignment');
    }
  });

  // Assignment Management Handlers
  const handleOpenCardMenu = (e, asgId) => {
    e.stopPropagation();
    setCardMenuOpenId(prev => prev === asgId ? null : asgId);
  };

  const handleStartEdit = (asg) => {
    setCardMenuOpenId(null);
    setEditingAssignment(asg);
    setEditFormData({
      ta: asg.ta?._id || asg.ta || '',
      assignedDateStr: asg.assignedDateStr || selectedDate,
      workType: asg.workType || '100% Work',
      notes: asg.notes || ''
    });
    setEditFormError('');
  };

  const handleSaveEdit = async (e) => {
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
      queryClient.invalidateQueries(['actionAssignments']);
      queryClient.invalidateQueries(['actionOverview']);
      queryClient.invalidateQueries(['actionAssignmentsRange']);
      queryClient.invalidateQueries(['availableWork']);
      setEditingAssignment(null);
    } catch (err) {
      setEditFormError(err.response?.data?.error || err.message || 'Failed to update assignment');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStartDelete = (asg) => {
    setCardMenuOpenId(null);
    setDeletingAssignment(asg);
  };

  // Date Navigation Handlers
  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    setSelectedDate(toISODate(prev));
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    setSelectedDate(toISODate(next));
  };

  const handleToday = () => {
    setSelectedDate(toISODate(new Date()));
  };

  // Status Quick Update Handler
  const handleStatusChange = (assignmentId, newStatus) => {
    updateMutation.mutate({ id: assignmentId, data: { status: newStatus } });
  };

  // Open Assign Work Modal
  const handleOpenAssignModal = () => {
    setAssignMode('flagged');
    setFlaggedWorkTypeFilter('All');
    setAssignSearchQuery('');
    setSelectedPositionForAssign(null);
    setAssignForm({
      position: '',
      ta: '',
      assignedDateStr: selectedDate,
      workType: '100% Work',
      notes: ''
    });
    setFormError('');
    setShowAssignModal(true);
  };

  // Filtered lists for Assign Work window
  const availableFlaggedList = useMemo(() => {
    const list = availableWorkData?.flagged || [];
    return list.filter(p => {
      if (flaggedWorkTypeFilter !== 'All' && !p.availableWorkTypes?.includes(flaggedWorkTypeFilter)) {
        return false;
      }
      if (assignSearchQuery) {
        const q = assignSearchQuery.toLowerCase();
        const text = `${p.jobOrderId} ${p.position} ${p.clientName}`.toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [availableWorkData, flaggedWorkTypeFilter, assignSearchQuery]);

  const allEligibleList = useMemo(() => {
    const list = availableWorkData?.allEligible || [];
    if (!assignSearchQuery) return list;
    const q = assignSearchQuery.toLowerCase();
    return list.filter(p => {
      const text = `${p.jobOrderId} ${p.position} ${p.clientName}`.toLowerCase();
      return text.includes(q);
    });
  }, [availableWorkData, assignSearchQuery]);

  // Handle selecting a position from the list to schedule work
  const handleSelectPositionForAssign = (pos, preferredType) => {
    setSelectedPositionForAssign(pos);
    const available = pos.availableWorkTypes || ['100% Work'];
    let defaultType = '100% Work';

    if (preferredType && available.includes(preferredType)) {
      defaultType = preferredType;
    } else if (flaggedWorkTypeFilter !== 'All' && available.includes(flaggedWorkTypeFilter)) {
      defaultType = flaggedWorkTypeFilter;
    } else if (available.length > 1) {
      defaultType = available.find(t => t !== '100% Work') || '100% Work';
    }

    setAssignForm({
      position: pos._id,
      ta: pos.assignee?._id || '',
      assignedDateStr: selectedDate,
      workType: defaultType,
      notes: ''
    });
    setFormError('');
  };

  const handleCreateAssignmentSubmit = (e) => {
    e.preventDefault();
    if (!assignForm.position || !assignForm.ta || !assignForm.assignedDateStr || !assignForm.workType) {
      setFormError('Please fill in all required fields.');
      return;
    }
    createMutation.mutate(assignForm);
  };

  // Day View: Filtered Assignments
  const filteredDayAssignments = useMemo(() => {
    return dayAssignments.filter(a => {
      if (dayTaFilter && a.ta?._id !== dayTaFilter) return false;
      if (dayWorkTypeFilter && a.workType !== dayWorkTypeFilter) return false;
      if (dayStatusFilter && a.status !== dayStatusFilter) return false;
      return true;
    });
  }, [dayAssignments, dayTaFilter, dayWorkTypeFilter, dayStatusFilter]);

  // Day View Stats
  const dayStats = useMemo(() => {
    let completed = 0;
    let pending = 0;
    let missed = 0;
    dayAssignments.forEach(a => {
      if (a.status === 'Completed') completed++;
      else if (a.status === 'Missed') missed++;
      else pending++;
    });
    return {
      total: dayAssignments.length,
      completed,
      pending,
      missed
    };
  }, [dayAssignments]);

  // Day View: TA Grouping
  const taGroups = useMemo(() => {
    const map = new Map();

    filteredDayAssignments.forEach(a => {
      const taId = a.ta?._id || 'unassigned';
      const taName = a.ta?.name || 'Unassigned TA';
      const taColor = a.ta?.color || '#059669';

      if (!map.has(taId)) {
        map.set(taId, {
          taId,
          taName,
          taColor,
          assignments: []
        });
      }
      map.get(taId).assignments.push(a);
    });

    return Array.from(map.values()).sort((a, b) => a.taName.localeCompare(b.taName));
  }, [filteredDayAssignments]);

  // TA Details Modal: Filtered assignments for clicked TA
  const taDetailAssignments = useMemo(() => {
    if (!selectedTaDetail) return [];
    return overviewAssignments.filter(a => {
      if (a.ta?._id !== selectedTaDetail.taId) return false;
      if (detailStatusFilter !== 'All' && a.status !== detailStatusFilter) return false;
      return true;
    });
  }, [overviewAssignments, selectedTaDetail, detailStatusFilter]);

  // Work Type CSS class helper
  const getWorkTypeClass = (wt) => {
    switch (wt) {
      case '100% Work': return 'dab-wt-100';
      case 'Follow-up': return 'dab-wt-followup';
      case 'Add-On': return 'dab-wt-addon';
      case 'Backup': return 'dab-wt-backup';
      case 'Re-assign': return 'dab-wt-reassign';
      case 'Going Good': return 'dab-wt-goinggood';
      default: return 'dab-wt-100';
    }
  };

  return (
    <div className="dab-container">
      {/* Top Header */}
      <div className="dab-header">
        <div className="dab-title-group">
          <h1>Daily Action Board</h1>
          <p className="dab-subtitle">
            Single central workspace for assigning work, tracking daily assignments, and analyzing TA performance.
          </p>
        </div>

        <div className="dab-header-actions">
          {/* Tab Switcher */}
          <div className="dab-tabs">
            <button
              type="button"
              className={`dab-tab-btn ${activeTab === 'day' ? 'active' : ''}`}
              onClick={() => setActiveTab('day')}
            >
              <CalendarDays size={16} />
              <span>Day View</span>
            </button>
            <button
              type="button"
              className={`dab-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <BarChart3 size={16} />
              <span>Overview</span>
            </button>
          </div>

          {/* Assign Work Button */}
          <button
            type="button"
            className="dab-btn-primary"
            onClick={handleOpenAssignModal}
          >
            <Plus size={16} />
            <span>Assign Work</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: DAY VIEW                                                */}
      {/* ============================================================== */}
      {activeTab === 'day' && (
        <div className="dab-day-view">
          {/* Date Navigation & Summary Bar */}
          <div className="dab-date-bar">
            <div className="dab-date-controls">
              <button
                type="button"
                className="dab-nav-arrow-btn"
                onClick={handlePrevDay}
                title="Previous Day"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="dab-date-picker-wrap">
                <input
                  type="date"
                  className="dab-date-input"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="dab-nav-arrow-btn"
                onClick={handleNextDay}
                title="Next Day"
              >
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                className="dab-today-btn"
                onClick={handleToday}
              >
                Today
              </button>

              <span className="dab-formatted-date" style={{ marginLeft: '0.75rem' }}>
                {formatDisplayDate(selectedDate)}
              </span>
            </div>

            {/* Quick Status Stats for the Selected Day */}
            <div className="dab-day-stats">
              <span className="dab-stat-pill">
                Total: <strong>{dayStats.total}</strong>
              </span>
              <span className="dab-stat-pill completed">
                <CheckCircle2 size={13} /> Completed: <strong>{dayStats.completed}</strong>
              </span>
              <span className="dab-stat-pill pending">
                <Clock size={13} /> Pending: <strong>{dayStats.pending}</strong>
              </span>
              <span className="dab-stat-pill missed">
                <AlertCircle size={13} /> Missed: <strong>{dayStats.missed}</strong>
              </span>
            </div>
          </div>

          {/* Filters Bar for Day View */}
          <div className="dab-filters-bar">
            <span className="dab-filter-label">Filter:</span>

            <select
              className="dab-select"
              value={dayTaFilter}
              onChange={(e) => setDayTaFilter(e.target.value)}
            >
              <option value="">All TAs</option>
              {tas.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>

            <select
              className="dab-select"
              value={dayWorkTypeFilter}
              onChange={(e) => setDayWorkTypeFilter(e.target.value)}
            >
              <option value="">All Work Types</option>
              {ALL_WORK_TYPES.map(wt => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
            </select>

            <select
              className="dab-select"
              value={dayStatusFilter}
              onChange={(e) => setDayStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Pending">Pending</option>
              <option value="Missed">Missed</option>
            </select>

            {(dayTaFilter || dayWorkTypeFilter || dayStatusFilter) && (
              <button
                type="button"
                className="dab-btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.775rem' }}
                onClick={() => {
                  setDayTaFilter('');
                  setDayWorkTypeFilter('');
                  setDayStatusFilter('');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* TA-wise Assignment Groups */}
          {isDayLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
              Loading assignments...
            </div>
          ) : taGroups.length === 0 ? (
            <div className="dab-empty-state">
              <Calendar size={36} color="#9ca3af" />
              <h3>No assignments scheduled for {formatDisplayDate(selectedDate)}</h3>
              <p>Allocate work from active positions using the button below.</p>
              <button
                type="button"
                className="dab-btn-primary"
                onClick={handleOpenAssignModal}
              >
                <Plus size={16} />
                <span>Assign Work for this Date</span>
              </button>
            </div>
          ) : (
            <div className="dab-ta-groups">
              {taGroups.map(group => {
                const groupCompleted = group.assignments.filter(a => a.status === 'Completed').length;
                const groupPending = group.assignments.filter(a => a.status === 'Pending').length;
                const groupMissed = group.assignments.filter(a => a.status === 'Missed').length;

                return (
                  <div key={group.taId} className="dab-ta-section">
                    <div className="dab-ta-header">
                      <div className="dab-ta-info">
                        <div
                          className="dab-ta-avatar"
                          style={{ background: group.taColor }}
                        >
                          {group.taName.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="dab-ta-name">{group.taName}</span>
                      </div>

                      <div className="dab-ta-meta">
                        <span className="dab-ta-count-badge">
                          {group.assignments.length} assignment{group.assignments.length !== 1 ? 's' : ''}
                        </span>
                        {groupCompleted > 0 && (
                          <span className="dab-stat-pill completed" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                            {groupCompleted} Completed
                          </span>
                        )}
                        {groupPending > 0 && (
                          <span className="dab-stat-pill pending" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                            {groupPending} Pending
                          </span>
                        )}
                        {groupMissed > 0 && (
                          <span className="dab-stat-pill missed" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                            {groupMissed} Missed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cards Grid */}
                    <div className="dab-cards-grid">
                      {group.assignments.map(asg => {
                        const statusClass = asg.status.toLowerCase();
                        return (
                          <div
                            key={asg._id}
                            className={`dab-card status-${statusClass}`}
                          >
                            <div className="dab-card-top">
                              <Link
                                to={`/positions/${asg.position?._id || asg.position}`}
                                className="dab-jo-badge"
                                title="View position details"
                              >
                                {asg.jobOrderId}
                              </Link>

                              <div className="dab-card-top-right">
                                <span className={`dab-wt-badge ${getWorkTypeClass(asg.workType)}`}>
                                  {asg.workType}
                                </span>
                                <div className="dab-card-menu-wrap">
                                  <button
                                    type="button"
                                    className="dab-card-menu-btn"
                                    onClick={(e) => handleOpenCardMenu(e, asg._id)}
                                    title="Assignment actions"
                                  >
                                    <MoreVertical size={14} />
                                  </button>
                                  {cardMenuOpenId === asg._id && (
                                    <div className="dab-card-menu-popover">
                                      <button
                                        type="button"
                                        className="dab-card-menu-item"
                                        onClick={() => handleStartEdit(asg)}
                                      >
                                        <Edit2 size={13} />
                                        <span>Edit Assignment</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="dab-card-menu-item danger"
                                        onClick={() => handleStartDelete(asg)}
                                      >
                                        <Trash2 size={13} />
                                        <span>Delete Assignment</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="dab-card-main">
                              <span className="dab-card-position">{asg.positionName}</span>
                              <span className="dab-card-client">
                                {asg.clientName || asg.client?.clientName || 'Client N/A'}
                              </span>
                              {asg.notes && (
                                <div className="dab-card-notes" title={asg.notes}>
                                  "{asg.notes}"
                                </div>
                              )}
                            </div>

                            <div className="dab-card-bottom">
                              <div className="dab-status-selector">
                                <button
                                  type="button"
                                  className={`dab-status-btn ${asg.status === 'Completed' ? 'active completed' : ''}`}
                                  onClick={() => handleStatusChange(asg._id, 'Completed')}
                                  title="Completed: Obtained at least 1 CV"
                                >
                                  <CheckCircle2 size={12} />
                                  <span>Completed</span>
                                </button>

                                <button
                                  type="button"
                                  className={`dab-status-btn ${asg.status === 'Pending' ? 'active pending' : ''}`}
                                  onClick={() => handleStatusChange(asg._id, 'Pending')}
                                  title="Pending: No update yet recorded"
                                >
                                  <Clock size={12} />
                                  <span>Pending</span>
                                </button>

                                <button
                                  type="button"
                                  className={`dab-status-btn ${asg.status === 'Missed' ? 'active missed' : ''}`}
                                  onClick={() => handleStatusChange(asg._id, 'Missed')}
                                  title="Missed: No CVs obtained"
                                >
                                  <AlertCircle size={12} />
                                  <span>Missed</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: OVERVIEW & TA PERFORMANCE                               */}
      {/* ============================================================== */}
      {activeTab === 'overview' && (
        <div className="dab-overview-view">
          {/* Preset Buttons & Filters */}
          <div className="dab-filters-bar">
            <span className="dab-filter-label">Range:</span>

            <div className="dab-tabs" style={{ background: '#f3f4f6' }}>
              <button
                type="button"
                className={`dab-tab-btn ${overviewPreset === 'daily' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setOverviewPreset('daily')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`dab-tab-btn ${overviewPreset === 'weekly' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setOverviewPreset('weekly')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`dab-tab-btn ${overviewPreset === 'monthly' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setOverviewPreset('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`dab-tab-btn ${overviewPreset === 'custom' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setOverviewPreset('custom')}
              >
                Custom
              </button>
            </div>

            {overviewPreset === 'custom' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="date"
                  className="dab-date-input"
                  value={customRange.startDate}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
                <span style={{ color: '#9ca3af' }}>to</span>
                <input
                  type="date"
                  className="dab-date-input"
                  value={customRange.endDate}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            )}

            <div style={{ height: '1.25rem', width: '1px', background: '#e5e7eb', margin: '0 0.5rem' }} />

            <select
              className="dab-select"
              value={overviewTaFilter}
              onChange={(e) => setOverviewTaFilter(e.target.value)}
            >
              <option value="">All TAs</option>
              {tas.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>

            <select
              className="dab-select"
              value={overviewWorkTypeFilter}
              onChange={(e) => setOverviewWorkTypeFilter(e.target.value)}
            >
              <option value="">All Work Types</option>
              {ALL_WORK_TYPES.map(wt => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
            </select>

            <select
              className="dab-select"
              value={overviewStatusFilter}
              onChange={(e) => setOverviewStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Pending">Pending</option>
              <option value="Missed">Missed</option>
            </select>

            {(overviewTaFilter || overviewWorkTypeFilter || overviewStatusFilter) && (
              <button
                type="button"
                className="dab-btn-secondary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.775rem' }}
                onClick={() => {
                  setOverviewTaFilter('');
                  setOverviewWorkTypeFilter('');
                  setOverviewStatusFilter('');
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Overview Top KPI Summary Cards */}
          {isOverviewLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
              Calculating overview metrics...
            </div>
          ) : (
            <>
              <div className="dab-overview-kpis">
                <div className="dab-kpi-card">
                  <span className="dab-kpi-title">Total Assignments</span>
                  <span className="dab-kpi-val">{overviewData?.summary?.totalAssignments || 0}</span>
                  <span className="dab-kpi-sub">
                    {effectiveOverviewRange.startDate} to {effectiveOverviewRange.endDate}
                  </span>
                </div>

                <div className="dab-kpi-card">
                  <span className="dab-kpi-title" style={{ color: '#059669' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={14} /> Completed
                    </span>
                  </span>
                  <span className="dab-kpi-val" style={{ color: '#059669' }}>
                    {overviewData?.summary?.completed || 0}
                  </span>
                  <span className="dab-kpi-sub">
                    {overviewData?.summary?.totalAssignments > 0
                      ? `${((overviewData.summary.completed / overviewData.summary.totalAssignments) * 100).toFixed(1)}% of total`
                      : '0% of total'}
                  </span>
                </div>

                <div className="dab-kpi-card">
                  <span className="dab-kpi-title" style={{ color: '#d97706' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={14} /> Pending
                    </span>
                  </span>
                  <span className="dab-kpi-val" style={{ color: '#d97706' }}>
                    {overviewData?.summary?.pending || 0}
                  </span>
                  <span className="dab-kpi-sub">
                    {overviewData?.summary?.totalAssignments > 0
                      ? `${((overviewData.summary.pending / overviewData.summary.totalAssignments) * 100).toFixed(1)}% of total`
                      : '0% of total'}
                  </span>
                </div>

                <div className="dab-kpi-card">
                  <span className="dab-kpi-title" style={{ color: '#dc2626' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertCircle size={14} /> Missed
                    </span>
                  </span>
                  <span className="dab-kpi-val" style={{ color: '#dc2626' }}>
                    {overviewData?.summary?.missed || 0}
                  </span>
                  <span className="dab-kpi-sub">
                    {overviewData?.summary?.totalAssignments > 0
                      ? `${((overviewData.summary.missed / overviewData.summary.totalAssignments) * 100).toFixed(1)}% of total`
                      : '0% of total'}
                  </span>
                </div>

                <div className="dab-kpi-card rate">
                  <span className="dab-kpi-title">Completion Rate</span>
                  <span className="dab-kpi-val">{overviewData?.summary?.completionRate ?? 0}%</span>
                  <span className="dab-kpi-sub">
                    Completed / Total Assignments × 100
                  </span>
                </div>
              </div>

              {/* TA Performance Table */}
              <div className="dab-table-card">
                <div className="dab-table-header">
                  <h2>Talent Acquisition Performance</h2>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Click any TA row to inspect their detailed assignment list
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="dab-table">
                    <thead>
                      <tr>
                        <th>TA Name</th>
                        <th style={{ textAlign: 'center' }}>Total Assigned</th>
                        <th style={{ textAlign: 'center' }}>Completed</th>
                        <th style={{ textAlign: 'center' }}>Pending</th>
                        <th style={{ textAlign: 'center' }}>Missed</th>
                        <th style={{ minWidth: '180px' }}>Completion Rate</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overviewData?.taPerformance || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                            No TA performance records in this date range.
                          </td>
                        </tr>
                      ) : (
                        overviewData.taPerformance.map(row => (
                          <tr
                            key={row.taId}
                            onClick={() => {
                              setSelectedTaDetail(row);
                              setDetailStatusFilter('All');
                            }}
                          >
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div
                                  style={{
                                    width: '1.75rem',
                                    height: '1.75rem',
                                    borderRadius: '50%',
                                    background: row.taColor,
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 700
                                  }}
                                >
                                  {row.taName.slice(0, 2).toUpperCase()}
                                </div>
                                <span style={{ color: '#111827' }}>{row.taName}</span>
                              </div>
                            </td>

                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                              {row.total}
                            </td>

                            <td style={{ textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                              {row.completed}
                            </td>

                            <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 600 }}>
                              {row.pending}
                            </td>

                            <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>
                              {row.missed}
                            </td>

                            <td>
                              <div className="dab-rate-bar-wrap">
                                <div className="dab-rate-bar-bg">
                                  <div
                                    className="dab-rate-bar-fill"
                                    style={{
                                      width: `${Math.min(100, row.completionRate)}%`,
                                      background: row.completionRate >= 80 ? '#10b981' : (row.completionRate >= 50 ? '#f59e0b' : '#ef4444')
                                    }}
                                  />
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                  {row.completionRate}%
                                </span>
                              </div>
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="dab-btn-secondary"
                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTaDetail(row);
                                  setDetailStatusFilter('All');
                                }}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: ENHANCED ASSIGN WORK (FLAGGED WORK & ALL POSITIONS)   */}
      {/* ============================================================== */}
      {showAssignModal && (
        <div className="dab-modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="dab-modal dab-modal-assign" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="dab-assign-modal-header">
              <div className="dab-assign-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={20} color="#059669" />
                  <h3 style={{ margin: 0 }}>
                    {selectedPositionForAssign
                      ? `Schedule Work: ${selectedPositionForAssign.jobOrderId}`
                      : 'Schedule Work Assignment'}
                  </h3>
                </div>

                <button
                  type="button"
                  className="dab-modal-close-btn"
                  onClick={() => setShowAssignModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Two-Tab Navigation: Available Flagged Work vs All Eligible Positions */}
              {!selectedPositionForAssign && (
                <div className="dab-assign-nav-tabs">
                  <button
                    type="button"
                    className={`dab-assign-nav-btn ${assignMode === 'flagged' ? 'active' : ''}`}
                    onClick={() => {
                      setAssignMode('flagged');
                      setFormError('');
                    }}
                  >
                    <span>⚡ Available Flagged Work</span>
                    <span className="dab-assign-tab-count">
                      {availableWorkData?.summary?.totalFlagged ?? '...'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`dab-assign-nav-btn ${assignMode === 'all' ? 'active' : ''}`}
                    onClick={() => {
                      setAssignMode('all');
                      setFormError('');
                    }}
                  >
                    <span>📋 All Eligible Positions</span>
                    <span className="dab-assign-tab-count">
                      {availableWorkData?.summary?.totalEligible ?? '...'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Sub-Filter Row & Search (Only shown in Position Selection Mode) */}
            {!selectedPositionForAssign && (
              <div className="dab-assign-filter-row">
                {assignMode === 'flagged' ? (
                  <div className="dab-flag-pill-filters">
                    <button
                      type="button"
                      className={`dab-flag-filter-chip ${flaggedWorkTypeFilter === 'All' ? 'active' : ''}`}
                      onClick={() => setFlaggedWorkTypeFilter('All')}
                    >
                      All Flagged ({availableWorkData?.summary?.totalFlagged || 0})
                    </button>
                    <button
                      type="button"
                      className={`dab-flag-filter-chip ${flaggedWorkTypeFilter === 'Follow-up' ? 'active' : ''}`}
                      onClick={() => setFlaggedWorkTypeFilter('Follow-up')}
                    >
                      Follow-up ({availableWorkData?.summary?.countByFlag?.followUp || 0})
                    </button>
                    <button
                      type="button"
                      className={`dab-flag-filter-chip ${flaggedWorkTypeFilter === 'Add-On' ? 'active' : ''}`}
                      onClick={() => setFlaggedWorkTypeFilter('Add-On')}
                    >
                      Add-On ({availableWorkData?.summary?.countByFlag?.addOn || 0})
                    </button>
                    <button
                      type="button"
                      className={`dab-flag-filter-chip ${flaggedWorkTypeFilter === 'Backup' ? 'active' : ''}`}
                      onClick={() => setFlaggedWorkTypeFilter('Backup')}
                    >
                      Backup ({availableWorkData?.summary?.countByFlag?.backup || 0})
                    </button>
                    <button
                      type="button"
                      className={`dab-flag-filter-chip ${flaggedWorkTypeFilter === 'Re-assign' ? 'active' : ''}`}
                      onClick={() => setFlaggedWorkTypeFilter('Re-assign')}
                    >
                      Re-assign ({availableWorkData?.summary?.countByFlag?.reAssign || 0})
                    </button>
                    <button
                      type="button"
                      className={`dab-flag-filter-chip ${flaggedWorkTypeFilter === 'Going Good' ? 'active' : ''}`}
                      onClick={() => setFlaggedWorkTypeFilter('Going Good')}
                    >
                      Going Good ({availableWorkData?.summary?.countByFlag?.goingGood || 0})
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Select any active position to assign 100% Work or available flagged work.
                  </div>
                )}

                <div className="dab-assign-search-box">
                  <Search size={14} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="Search JO ID, title, client..."
                    value={assignSearchQuery}
                    onChange={(e) => setAssignSearchQuery(e.target.value)}
                  />
                  {assignSearchQuery && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8' }}
                      onClick={() => setAssignSearchQuery('')}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Modal Body: Position Table vs Assignment Form */}
            {!selectedPositionForAssign ? (
              <div className="dab-assign-table-wrap">
                {isAvailableWorkLoading ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    Loading available work...
                  </div>
                ) : (assignMode === 'flagged' ? availableFlaggedList : allEligibleList).length === 0 ? (
                  <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                    <Info size={32} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                      {assignMode === 'flagged'
                        ? 'No positions found with active work flags matching your filter.'
                        : 'No eligible positions found matching your search.'}
                    </div>
                    <div style={{ fontSize: '0.8rem' }}>
                      {assignMode === 'flagged'
                        ? 'Try switching filters or search terms, or view All Eligible Positions.'
                        : 'Try searching with a different keyword.'}
                    </div>
                  </div>
                ) : (
                  <table className="dab-flagged-table">
                    <thead>
                      <tr>
                        <th style={{ width: '90px' }}>JO ID</th>
                        <th>Position Designation</th>
                        <th>Client</th>
                        <th style={{ width: '65px', textAlign: 'center' }}>Level</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>CV Counts</th>
                        <th>Active Work Flags</th>
                        <th style={{ textAlign: 'right', width: '110px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(assignMode === 'flagged' ? availableFlaggedList : allEligibleList).map(pos => {
                        const plevelStyle = PLEVEL_COLORS[pos.pLevel] || { bg: '#e2e8f0', text: '#334155' };
                        return (
                          <tr
                            key={pos._id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleSelectPositionForAssign(pos)}
                          >
                            <td>
                              <span className="dab-jo-badge" style={{ fontWeight: 700 }}>
                                {pos.jobOrderId}
                              </span>
                            </td>

                            <td style={{ fontWeight: 600, color: '#1e293b' }}>
                              {pos.position}
                            </td>

                            <td style={{ color: '#475569' }}>
                              {pos.clientName || 'N/A'}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <span
                                className="dab-plevel-tag"
                                style={{ background: plevelStyle.bg, color: plevelStyle.text }}
                              >
                                {pos.pLevel}
                              </span>
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                                <span className="dab-cv-pill" title="Internal Shortlist">
                                  Int: {pos.cvCount ?? 0}
                                </span>
                                <span className="dab-cv-pill" title="External Shortlist">
                                  Ext: {pos.extShortlistCount ?? 0}
                                </span>
                              </div>
                            </td>

                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {pos.flags?.followUp && (
                                  <span className="dab-wt-badge dab-wt-followup">
                                    Follow-up
                                  </span>
                                )}
                                {pos.flags?.addOn && (
                                  <span className="dab-wt-badge dab-wt-addon">
                                    Add-On
                                  </span>
                                )}
                                {pos.flags?.backup && (
                                  <span className="dab-wt-badge dab-wt-backup">
                                    Backup
                                  </span>
                                )}
                                {pos.flags?.reAssign && (
                                  <span className="dab-wt-badge dab-wt-reassign">
                                    Re-assign
                                  </span>
                                )}
                                {pos.flags?.goingGood && (
                                  <span className="dab-wt-badge dab-wt-goinggood">
                                    Going Good
                                  </span>
                                )}
                                {!pos.hasActiveFlags && (
                                  <span className="dab-wt-badge dab-wt-100">
                                    100% Work
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="dab-btn-primary"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectPositionForAssign(pos);
                                }}
                              >
                                Assign →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              /* Assignment Form when position is chosen */
              <form onSubmit={handleCreateAssignmentSubmit}>
                <div className="dab-modal-body">
                  {formError && (
                    <div style={{
                      padding: '0.75rem 1rem',
                      background: '#fef2f2',
                      border: '1px solid #fee2e2',
                      borderRadius: '0.5rem',
                      color: '#991b1b',
                      fontSize: '0.85rem'
                    }}>
                      {formError}
                    </div>
                  )}

                  {/* Selected Position Banner */}
                  <div className="dab-selected-pos-banner">
                    <div className="dab-selected-pos-info">
                      <div className="dab-selected-pos-title">
                        <span className="dab-jo-badge">{selectedPositionForAssign.jobOrderId}</span>
                        <span>{selectedPositionForAssign.position}</span>
                        {selectedPositionForAssign.pLevel && (
                          <span
                            className="dab-plevel-tag"
                            style={{
                              background: PLEVEL_COLORS[selectedPositionForAssign.pLevel]?.bg || '#cbd5e1',
                              color: PLEVEL_COLORS[selectedPositionForAssign.pLevel]?.text || '#334155'
                            }}
                          >
                            {selectedPositionForAssign.pLevel}
                          </span>
                        )}
                      </div>
                      <div className="dab-selected-pos-sub">
                        Client: <strong>{selectedPositionForAssign.clientName || 'N/A'}</strong>
                        {' • '}
                        Int Shortlist: <strong>{selectedPositionForAssign.cvCount ?? 0}</strong>
                        {' • '}
                        Ext Shortlist: <strong>{selectedPositionForAssign.extShortlistCount ?? 0}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                        <span className="dab-flag-pill" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                          100% Work (Available)
                        </span>
                        {selectedPositionForAssign.flags?.followUp && (
                          <span className="dab-flag-pill" style={{ background: '#fff7ed', color: '#c2410c' }}>
                            Follow-up (Flag ON)
                          </span>
                        )}
                        {selectedPositionForAssign.flags?.addOn && (
                          <span className="dab-flag-pill" style={{ background: '#fefce8', color: '#a16207' }}>
                            Add-On (Flag ON)
                          </span>
                        )}
                        {selectedPositionForAssign.flags?.backup && (
                          <span className="dab-flag-pill" style={{ background: '#faf5ff', color: '#7e22ce' }}>
                            Backup (Flag ON)
                          </span>
                        )}
                        {selectedPositionForAssign.flags?.reAssign && (
                          <span className="dab-flag-pill" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                            Re-assign (Flag ON)
                          </span>
                        )}
                        {selectedPositionForAssign.flags?.goingGood && (
                          <span className="dab-flag-pill" style={{ background: '#f0fdf4', color: '#15803d' }}>
                            Going Good (Flag ON)
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="dab-change-pos-btn"
                      onClick={() => setSelectedPositionForAssign(null)}
                    >
                      ← Change Position
                    </button>
                  </div>

                  {/* 1. Work Type (Always available for manual selection: 100% Work, Follow-up, Add-On, Backup, Re-assign, Going Good) */}
                  <div className="dab-form-group">
                    <label>Work Type *</label>
                    <select
                      className="dab-form-select"
                      value={assignForm.workType}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, workType: e.target.value }))}
                      required
                    >
                      {ALL_WORK_TYPES.map(wt => {
                        const isFlagged = selectedPositionForAssign.availableWorkTypes?.includes(wt) && wt !== '100% Work';
                        return (
                          <option key={wt} value={wt}>
                            {wt}{isFlagged ? ' (Flagged in Positions)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <span className="dab-form-hint">
                      All supported work types are available for scheduling. Position flags serve as guidance.
                    </span>
                  </div>

                  {/* 2. Assign to TA */}
                  <div className="dab-form-group">
                    <label>Assign to Talent Acquisition Member *</label>
                    <select
                      className="dab-form-select"
                      value={assignForm.ta}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, ta: e.target.value }))}
                      required
                    >
                      <option value="">-- Select TA --</option>
                      {tas.map(t => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Assignment Date */}
                  <div className="dab-form-group">
                    <label>Assignment Date *</label>
                    <input
                      type="date"
                      className="dab-form-input"
                      value={assignForm.assignedDateStr}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, assignedDateStr: e.target.value }))}
                      required
                    />
                    <span className="dab-form-hint">
                      Assignments remain attached to their scheduled date. Pending work does not automatically carry forward.
                    </span>
                  </div>

                  {/* 4. Notes */}
                  <div className="dab-form-group">
                    <label>Allocation Notes (Optional)</label>
                    <textarea
                      className="dab-form-textarea"
                      rows={2}
                      value={assignForm.notes}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Specific targets, focus areas, or instructions for this assignment..."
                    />
                  </div>
                </div>

                <div className="dab-modal-footer">
                  <button
                    type="button"
                    className="dab-btn-secondary"
                    onClick={() => setSelectedPositionForAssign(null)}
                  >
                    Back to Positions
                  </button>
                  <button
                    type="submit"
                    className="dab-btn-primary"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Scheduling...' : 'Schedule Assignment'}
                  </button>
                </div>
              </form>
            )}

            {/* Footer when in position list mode */}
            {!selectedPositionForAssign && (
              <div className="dab-modal-footer">
                <button
                  type="button"
                  className="dab-btn-secondary"
                  onClick={() => setShowAssignModal(false)}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: INTERACTIVE TA DETAILS MODAL                           */}
      {/* ============================================================== */}
      {selectedTaDetail && (
        <div className="dab-modal-overlay" onClick={() => setSelectedTaDetail(null)}>
          <div className="dab-modal dab-modal-large" onClick={e => e.stopPropagation()}>
            <div className="dab-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  className="dab-ta-avatar"
                  style={{ background: selectedTaDetail.taColor }}
                >
                  {selectedTaDetail.taName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedTaDetail.taName} — Assignments</h3>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    {effectiveOverviewRange.startDate} to {effectiveOverviewRange.endDate}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="dab-modal-close-btn"
                onClick={() => setSelectedTaDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="dab-modal-body" style={{ gap: '1.25rem' }}>
              {/* Summary Metrics for this TA */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem'
              }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Assigned</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>{selectedTaDetail.total}</div>
                </div>

                <div style={{ background: '#ecfdf5', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #a7f3d0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 600 }}>Completed</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669' }}>{selectedTaDetail.completed}</div>
                </div>

                <div style={{ background: '#fffbeb', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600 }}>Pending</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#d97706' }}>{selectedTaDetail.pending}</div>
                </div>

                <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>Missed</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626' }}>{selectedTaDetail.missed}</div>
                </div>

                <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Completion Rate</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d' }}>{selectedTaDetail.completionRate}%</div>
                </div>
              </div>

              {/* Status Filter for TA Detail View */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151' }}>
                  Assignment Records ({taDetailAssignments.length})
                </span>

                <div className="dab-tabs" style={{ background: '#f1f5f9' }}>
                  {['All', 'Completed', 'Pending', 'Missed'].map(st => (
                    <button
                      key={st}
                      type="button"
                      className={`dab-tab-btn ${detailStatusFilter === st ? 'active' : ''}`}
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.775rem' }}
                      onClick={() => setDetailStatusFilter(st)}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignments Table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
                <table className="dab-table">
                  <thead>
                    <tr>
                      <th>JO ID</th>
                      <th>Client</th>
                      <th>Designation</th>
                      <th>Assigned Date</th>
                      <th>Work Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taDetailAssignments.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                          No assignments matching this filter.
                        </td>
                      </tr>
                    ) : (
                      taDetailAssignments.map(asg => (
                        <tr key={asg._id}>
                          <td>
                            <Link
                              to={`/positions/${asg.position?._id || asg.position}`}
                              className="dab-jo-badge"
                            >
                              {asg.jobOrderId}
                            </Link>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {asg.clientName || asg.client?.clientName || 'N/A'}
                          </td>
                          <td>{asg.positionName}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{asg.assignedDateStr}</td>
                          <td>
                            <span className={`dab-wt-badge ${getWorkTypeClass(asg.workType)}`}>
                              {asg.workType}
                            </span>
                          </td>
                          <td>
                            <div className="dab-status-selector">
                              <button
                                type="button"
                                className={`dab-status-btn ${asg.status === 'Completed' ? 'active completed' : ''}`}
                                onClick={() => handleStatusChange(asg._id, 'Completed')}
                                title="Completed"
                              >
                                <CheckCircle2 size={11} />
                                <span>Completed</span>
                              </button>
                              <button
                                type="button"
                                className={`dab-status-btn ${asg.status === 'Pending' ? 'active pending' : ''}`}
                                onClick={() => handleStatusChange(asg._id, 'Pending')}
                                title="Pending"
                              >
                                <Clock size={11} />
                                <span>Pending</span>
                              </button>
                              <button
                                type="button"
                                className={`dab-status-btn ${asg.status === 'Missed' ? 'active missed' : ''}`}
                                onClick={() => handleStatusChange(asg._id, 'Missed')}
                                title="Missed"
                              >
                                <AlertCircle size={11} />
                                <span>Missed</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="dab-modal-footer">
              <button
                type="button"
                className="dab-btn-secondary"
                onClick={() => setSelectedTaDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Assignment Modal */}
      {editingAssignment && (
        <div className="dab-modal-overlay" onClick={() => setEditingAssignment(null)}>
          <div className="dab-modal dab-modal-edit" onClick={e => e.stopPropagation()}>
            <div className="dab-modal-header">
              <div>
                <h3>Edit Assignment — {editingAssignment.assignmentId}</h3>
                <p className="dab-modal-subtitle" style={{ color: '#4b5563', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                  <strong>{editingAssignment.jobOrderId}</strong> · {editingAssignment.positionName} ({editingAssignment.clientName || editingAssignment.client?.clientName || 'Client N/A'})
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

            <form onSubmit={handleSaveEdit}>
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
                      value={`${editingAssignment.jobOrderId} - ${editingAssignment.positionName}`}
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

      {/* Delete Assignment Confirmation Modal */}
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
                Are you sure you want to delete this assignment for <strong>{deletingAssignment.jobOrderId} – {deletingAssignment.positionName}</strong>, assigned to <strong>{deletingAssignment.ta?.name || 'TA'}</strong> on <strong>{deletingAssignment.assignedDateStr}</strong>?
              </p>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                This will remove the assignment from the Daily Action Board. The underlying position, candidates, CVs, and recruitment records will remain unaffected.
              </p>
            </div>
            <div className="dab-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                className="dab-btn-secondary"
                onClick={() => setDeletingAssignment(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dab-btn-danger"
                onClick={() => deleteMutation.mutate(deletingAssignment._id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
