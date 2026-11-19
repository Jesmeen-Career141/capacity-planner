import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getInterviews,
  createInterview,
  rescheduleInterview,
  updateFeedbackAndDecision,
  updateInterviewStatus,
  getInterviewCalendar,
  getEligibleCandidates
} from '../api/interviews';
import { getClients } from '../api/clients';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import CandidateInterviewHistoryModal from '../components/CandidateInterviewHistoryModal';
import {
  Calendar,
  Clock,
  Search,
  RotateCcw,
  Plus,
  CheckCircle2,
  History,
  FileText,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ListFilter,
  BarChart3,
  X
} from 'lucide-react';
import './InterviewTracker.css';

const ROUNDS = ['First Round', 'Second Round', 'Third Round', 'Final Round'];
const STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'No Show', 'Rescheduled', 'Withdrew'];
const DECISIONS = ['Reschedule', 'Pending', 'Shortlisted', 'Rejected', 'Dropped'];
const MODES = ['Online', 'Onsite', 'Physical', 'Telephone'];

const STATUS_BADGES = {
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-gray-100 text-gray-700 border-gray-300',
  'No Show': 'bg-red-50 text-red-700 border-red-200',
  Rescheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  Withdrew: 'bg-rose-50 text-rose-700 border-rose-200'
};

const DECISION_BADGES = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Shortlisted: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Dropped: 'bg-rose-50 text-rose-700 border-rose-200',
  Reschedule: 'bg-purple-50 text-purple-700 border-purple-200'
};

export default function InterviewTracker() {
  const [searchParams] = useSearchParams();

  // Navigation tabs: 'dashboard' | 'master' | 'calendar'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Unified Dashboard Search state
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  const [dashboardInterviews, setDashboardInterviews] = useState([]);
  const [loadingDashboardResults, setLoadingDashboardResults] = useState(false);
  const [hasExecutedDashboardSearch, setHasExecutedDashboardSearch] = useState(false);
  const [showDashboardSuggestions, setShowDashboardSuggestions] = useState(false);

  // Filters state (Master List)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedTA, setSelectedTA] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedDecision, setSelectedDecision] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination & Sorting state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [sortBy, setSortBy] = useState('interviewDate');
  const [sortOrder, setSortOrder] = useState('desc');

  // Data states
  const [interviews, setInterviews] = useState([]);
  const [totalInterviews, setTotalInterviews] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(false);

  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarViewMode, setCalendarViewMode] = useState('month'); // 'day' | 'week' | 'month'

  // Dropdown reference options
  const [clients, setClients] = useState([]);
  const [positions, setPositions] = useState([]);
  const [tas, setTAs] = useState([]);

  // Modals state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [historyCandidateId, setHistoryCandidateId] = useState(null);
  const [selectedInterview, setSelectedInterview] = useState(null);

  // Eligible candidates for scheduling
  const [eligibleCandidates, setEligibleCandidates] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(false);

  // Forms state
  const [scheduleForm, setScheduleForm] = useState({
    positionId: '',
    candidateSubmissionId: '',
    candidateName: '',
    contactNumber: '',
    email: '',
    round: 'First Round',
    interviewDate: '',
    interviewTime: '10:00 AM',
    interviewMode: 'Online',
    meetingLinkOrLocation: '',
    interviewerName: '',
    interviewerDesignation: '',
    schedulingNotes: '',
    interviewCoordinatorId: ''
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    newDate: '',
    newTime: '',
    reason: '',
    meetingLinkOrLocation: '',
    rescheduledBy: 'Coordinator'
  });

  const [feedbackForm, setFeedbackForm] = useState({
    feedback: '',
    interviewerComments: '',
    candidatePerformanceNotes: '',
    decision: 'Pending',
    decisionDate: new Date().toISOString().split('T')[0],
    nextAction: '',
    nextInterviewRound: '',
    nextInterviewDate: ''
  });

  const [statusForm, setStatusForm] = useState({
    status: 'Scheduled',
    note: ''
  });

  // Load dropdown lists on mount
  useEffect(() => {
    getClients().then(res => setClients(res.data || [])).catch(() => {});
    getPositions({ limit: 500 }).then(res => setPositions(res.data?.positions || res.data || [])).catch(() => {});
    getActiveTAs().then(res => setTAs(res.data || [])).catch(() => {});
  }, []);

  // Execute dashboard search
  const executeDashboardSearch = useCallback((term) => {
    const q = term !== undefined ? term : dashboardSearchTerm;
    if (!q || !q.trim()) {
      setDashboardInterviews([]);
      setHasExecutedDashboardSearch(false);
      return;
    }
    setHasExecutedDashboardSearch(true);
    setLoadingDashboardResults(true);
    getInterviews({ search: q.trim(), limit: 500 })
      .then(res => {
        setDashboardInterviews(Array.isArray(res?.interviews) ? res.interviews : []);
      })
      .catch(err => {
        console.error('Failed to search dashboard interviews:', err);
        setDashboardInterviews([]);
      })
      .finally(() => setLoadingDashboardResults(false));
  }, [dashboardSearchTerm]);

  // Read URL query parameters on initial load
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlClient = searchParams.get('client') || '';
    const urlPos = searchParams.get('position') || '';
    const target = urlSearch || urlPos || urlClient;
    if (target) {
      setDashboardSearchTerm(target);
      setSearchTerm(target);
      executeDashboardSearch(target);
    }
  }, [searchParams, executeDashboardSearch]);

  // Dashboard Autocomplete Suggestions
  const dashboardSuggestions = useMemo(() => {
    const term = dashboardSearchTerm.trim().toLowerCase();
    if (!term || term.length < 1) return { matchedClients: [], matchedPositions: [] };
    const matchedClients = (clients || [])
      .filter(c => (c.clientName || '').toLowerCase().includes(term))
      .slice(0, 5);
    const matchedPositions = (positions || [])
      .filter(p =>
        (p.position || '').toLowerCase().includes(term) ||
        (p.jobOrderId || '').toLowerCase().includes(term) ||
        (p.clientName || '').toLowerCase().includes(term)
      )
      .slice(0, 5);
    return { matchedClients, matchedPositions };
  }, [dashboardSearchTerm, clients, positions]);

  // Segregate searched interviews Position-wise and consolidate each Candidate into ONE timeline card
  const {
    completedPositionGroups,
    upcomingPositionGroups,
    totalCompletedCandidates,
    totalUpcomingCandidates
  } = useMemo(() => {
    const ROUND_ORDER_MAP = {
      'First Round': 1,
      'Second Round': 2,
      'Third Round': 3,
      'Final Round': 4
    };

    const posMap = new Map();

    dashboardInterviews.forEach(inv => {
      const clientName = (inv.clientName || inv.client?.clientName || 'Unknown Client').trim();
      const positionName = (inv.positionName || inv.position?.position || inv.jobOrderId || 'Unknown Position').trim();
      const jobOrderId = (inv.jobOrderId || inv.position?.jobOrderId || '').trim();
      const posId = inv.position?._id || inv.position || '';

      const posKey = posId ? String(posId) : `${clientName.toUpperCase()}::${positionName.toUpperCase()}`;

      if (!posMap.has(posKey)) {
        posMap.set(posKey, {
          posKey,
          clientName,
          positionName,
          jobOrderId,
          candidatesMap: new Map()
        });
      }

      const posGroup = posMap.get(posKey);
      const candName = (inv.candidateName || 'Candidate').trim();
      const candKey = candName.toUpperCase();

      if (!posGroup.candidatesMap.has(candKey)) {
        posGroup.candidatesMap.set(candKey, {
          candKey,
          candidateName: candName,
          candidateSubId: inv.candidateSubmission?._id || inv.candidateSubmission || null,
          taName: inv.sourcingTA?.name || inv.taName || inv.candidateSubmission?.sourcedBy?.name || inv.interviewCoordinator?.name || '—',
          rounds: []
        });
      }

      const candEntry = posGroup.candidatesMap.get(candKey);
      if (!candEntry.candidateSubId && (inv.candidateSubmission?._id || inv.candidateSubmission)) {
        candEntry.candidateSubId = inv.candidateSubmission?._id || inv.candidateSubmission;
      }
      if (candEntry.taName === '—') {
        const resolvedTa = inv.sourcingTA?.name || inv.taName || inv.candidateSubmission?.sourcedBy?.name || inv.interviewCoordinator?.name;
        if (resolvedTa) candEntry.taName = resolvedTa;
      }

      candEntry.rounds.push(inv);
    });

    const completedGroups = [];
    const upcomingGroups = [];
    let completedCount = 0;
    let upcomingCount = 0;

    posMap.forEach(posGroup => {
      const completedCands = [];
      const upcomingCands = [];

      posGroup.candidatesMap.forEach(cand => {
        // Sort rounds chronologically: First Round -> Second Round -> Third Round -> Final Round, then by date
        cand.rounds.sort((a, b) => {
          const rA = ROUND_ORDER_MAP[a.round] || a.roundSequence || 1;
          const rB = ROUND_ORDER_MAP[b.round] || b.roundSequence || 1;
          if (rA !== rB) return rA - rB;
          return new Date(a.interviewDate || 0) - new Date(b.interviewDate || 0);
        });

        cand.latestRound = cand.rounds[cand.rounds.length - 1];

        const hasUpcoming = cand.rounds.some(r => r.status === 'Scheduled' || r.status === 'Rescheduled');
        if (hasUpcoming) {
          upcomingCands.push(cand);
          upcomingCount++;
        } else {
          completedCands.push(cand);
          completedCount++;
        }
      });

      if (completedCands.length > 0) {
        completedGroups.push({
          posKey: posGroup.posKey,
          clientName: posGroup.clientName,
          positionName: posGroup.positionName,
          jobOrderId: posGroup.jobOrderId,
          candidates: completedCands
        });
      }

      if (upcomingCands.length > 0) {
        upcomingGroups.push({
          posKey: posGroup.posKey,
          clientName: posGroup.clientName,
          positionName: posGroup.positionName,
          jobOrderId: posGroup.jobOrderId,
          candidates: upcomingCands
        });
      }
    });

    return {
      completedPositionGroups: completedGroups,
      upcomingPositionGroups: upcomingGroups,
      totalCompletedCandidates: completedCount,
      totalUpcomingCandidates: upcomingCount
    };
  }, [dashboardInterviews]);

  // Overall Card Badge resolver (from candidate's latest round)
  const getCompletedBadge = (inv) => {
    if (!inv) return { text: 'Completed', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (inv.decision === 'Shortlisted') {
      return { text: 'Shortlisted for Next Round', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    if (inv.decision === 'Rejected') {
      return { text: 'Rejected', class: 'bg-red-50 text-red-700 border-red-200' };
    }
    if (inv.status === 'Withdrew') {
      return { text: 'Withdrawn', class: 'bg-slate-100 text-slate-700 border-slate-300' };
    }
    if (inv.decision === 'Dropped') {
      return { text: 'Dropped', class: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
    if (inv.status === 'Cancelled') {
      return { text: 'Cancelled', class: 'bg-gray-100 text-gray-700 border-gray-300' };
    }
    if (inv.status === 'No Show') {
      return { text: 'No Show', class: 'bg-red-50 text-red-700 border-red-200' };
    }
    if (inv.decision === 'Pending' || inv.status === 'Completed') {
      return { text: 'Pending Decision', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    return { text: inv.decision || 'Completed', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  // Upcoming Section Badge resolver
  const getUpcomingBadge = (inv) => {
    if (inv?.status === 'Rescheduled') {
      return { text: 'Rescheduled', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    return { text: 'Scheduled', class: 'bg-blue-50 text-blue-700 border-blue-200' };
  };

  // Per-Round Timeline Step Badge & Dot Color
  const getRoundStepMeta = (inv) => {
    if (inv.status === 'Scheduled') {
      return { label: 'Scheduled', pillClass: 'bg-blue-50 text-blue-700 border-blue-200', dotColor: '#3b82f6' };
    }
    if (inv.status === 'Rescheduled') {
      return { label: 'Rescheduled', pillClass: 'bg-amber-50 text-amber-700 border-amber-200', dotColor: '#f59e0b' };
    }
    if (inv.status === 'Cancelled') {
      return { label: 'Cancelled', pillClass: 'bg-gray-100 text-gray-700 border-gray-300', dotColor: '#94a3b8' };
    }
    if (inv.status === 'No Show') {
      return { label: 'No Show', pillClass: 'bg-red-50 text-red-700 border-red-200', dotColor: '#ef4444' };
    }
    if (inv.status === 'Withdrew') {
      return { label: 'Withdrawn', pillClass: 'bg-slate-100 text-slate-700 border-slate-300', dotColor: '#64748b' };
    }
    if (inv.decision === 'Shortlisted') {
      return { label: 'Shortlisted', pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotColor: '#10b981' };
    }
    if (inv.decision === 'Rejected') {
      return { label: 'Rejected', pillClass: 'bg-red-50 text-red-700 border-red-200', dotColor: '#ef4444' };
    }
    if (inv.decision === 'Dropped') {
      return { label: 'Dropped', pillClass: 'bg-rose-50 text-rose-700 border-rose-200', dotColor: '#f43f5e' };
    }
    return { label: 'Pending', pillClass: 'bg-amber-50 text-amber-700 border-amber-200', dotColor: '#f59e0b' };
  };

  // Filter params helper
  const filterParams = useMemo(() => {
    const p = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    if (selectedClient) p.client = selectedClient;
    if (selectedPosition) p.position = selectedPosition;
    if (selectedTA) p.ta = selectedTA;
    if (selectedRound) p.round = selectedRound;
    if (selectedStatus) p.status = selectedStatus;
    if (selectedDecision) p.decision = selectedDecision;
    if (searchTerm.trim()) p.search = searchTerm.trim();
    return p;
  }, [
    dateFrom,
    dateTo,
    selectedClient,
    selectedPosition,
    selectedTA,
    selectedRound,
    selectedStatus,
    selectedDecision,
    searchTerm
  ]);

  // Load interviews master list
  const loadInterviews = useCallback(() => {
    setLoadingList(true);
    getInterviews({
      ...filterParams,
      page,
      limit,
      sortBy,
      sortOrder
    })
      .then(res => {
        setInterviews(Array.isArray(res?.interviews) ? res.interviews : []);
        setTotalInterviews(res?.total || 0);
        setTotalPages(res?.totalPages || 1);
      })
      .catch(err => {
        console.error('Failed to load interviews:', err);
      })
      .finally(() => setLoadingList(false));
  }, [filterParams, page, limit, sortBy, sortOrder]);

  // Load calendar
  const loadCalendar = useCallback(() => {
    setLoadingCalendar(true);
    getInterviewCalendar(filterParams)
      .then(res => setCalendarEvents(Array.isArray(res) ? res : []))
      .catch(err => console.error('Failed to load calendar events:', err))
      .finally(() => setLoadingCalendar(false));
  }, [filterParams]);

  // Load data according to active tab or filters
  useEffect(() => {
    if (activeTab === 'master') loadInterviews();
    else if (activeTab === 'calendar') loadCalendar();
  }, [activeTab, loadInterviews, loadCalendar]);

  // Reset filters
  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedClient('');
    setSelectedPosition('');
    setSelectedTA('');
    setSelectedRound('');
    setSelectedStatus('');
    setSelectedDecision('');
    setSearchTerm('');
    setPage(1);
  };

  // Open Schedule Modal & load eligible candidates
  const handleOpenScheduleModal = (posId = '') => {
    setLoadingEligible(true);
    const targetPos = posId || selectedPosition;
    getEligibleCandidates({ positionId: targetPos })
      .then(res => {
        setEligibleCandidates(res || []);
        setScheduleForm({
          positionId: targetPos,
          candidateSubmissionId: '',
          candidateName: '',
          contactNumber: '',
          email: '',
          round: 'First Round',
          interviewDate: new Date().toISOString().split('T')[0],
          interviewTime: '10:00 AM',
          interviewMode: 'Online',
          meetingLinkOrLocation: '',
          interviewerName: '',
          interviewerDesignation: '',
          schedulingNotes: '',
          interviewCoordinatorId: ''
        });
        setShowScheduleModal(true);
      })
      .catch(err => console.error('Error fetching eligible candidates:', err))
      .finally(() => setLoadingEligible(false));
  };

  // When candidate selection changes in Schedule modal
  const handleCandidateSelect = (cId) => {
    const candidate = eligibleCandidates.find(c => String(c._id) === String(cId));
    if (candidate) {
      const suggested = candidate.nextSuggestedRound !== 'Completed All Rounds'
        ? candidate.nextSuggestedRound
        : 'Final Round';

      setScheduleForm(prev => ({
        ...prev,
        candidateSubmissionId: candidate._id,
        candidateName: candidate.candidateName,
        contactNumber: candidate.contactNumber || candidate.phone || prev.contactNumber || '',
        email: candidate.email || prev.email || '',
        positionId: candidate.position?._id || prev.positionId,
        round: suggested,
        interviewCoordinatorId: candidate.sourcingTA?._id || prev.interviewCoordinatorId
      }));
    }
  };

  // Submit new interview
  const handleCreateInterviewSubmit = async (e) => {
    e.preventDefault();
    if (!scheduleForm.candidateSubmissionId) return alert('Select an eligible candidate');
    if (!scheduleForm.interviewDate) return alert('Select an interview date');
    if (!scheduleForm.interviewTime.trim()) return alert('Enter an interview time');

    try {
      await createInterview(scheduleForm);
      setShowScheduleModal(false);
      if (activeTab === 'dashboard' && dashboardSearchTerm.trim()) executeDashboardSearch(dashboardSearchTerm);
      if (activeTab === 'master') loadInterviews();
      if (activeTab === 'calendar') loadCalendar();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to schedule interview');
    }
  };

  // Open Reschedule Modal
  const handleOpenReschedule = (interview) => {
    setSelectedInterview(interview);
    setRescheduleForm({
      newDate: interview.interviewDateStr,
      newTime: interview.interviewTime,
      reason: '',
      meetingLinkOrLocation: interview.meetingLinkOrLocation || '',
      rescheduledBy: 'Coordinator'
    });
    setShowRescheduleModal(true);
  };

  // Submit Reschedule
  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    if (!rescheduleForm.newDate) return alert('Select a new interview date');
    if (!rescheduleForm.newTime.trim()) return alert('Enter a new interview time');
    if (!rescheduleForm.reason.trim()) return alert('Please enter the reason for rescheduling');

    try {
      await rescheduleInterview(selectedInterview._id, rescheduleForm);
      setShowRescheduleModal(false);
      setSelectedInterview(null);
      if (activeTab === 'dashboard' && dashboardSearchTerm.trim()) executeDashboardSearch(dashboardSearchTerm);
      if (activeTab === 'master') loadInterviews();
      if (activeTab === 'calendar') loadCalendar();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reschedule interview');
    }
  };

  // Open Feedback Modal
  const handleOpenFeedback = (interview) => {
    setSelectedInterview(interview);
    setFeedbackForm({
      feedback: interview.feedback || '',
      interviewerComments: interview.interviewerComments || '',
      candidatePerformanceNotes: interview.candidatePerformanceNotes || '',
      decision: interview.decision || 'Pending',
      decisionDate: interview.decisionDate ? new Date(interview.decisionDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      nextAction: interview.nextAction || '',
      nextInterviewRound: interview.nextInterviewRound || '',
      nextInterviewDate: interview.nextInterviewDateStr || ''
    });
    setShowFeedbackModal(true);
  };

  // Submit Feedback & Decision
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateFeedbackAndDecision(selectedInterview._id, feedbackForm);
      setShowFeedbackModal(false);
      setSelectedInterview(null);
      if (activeTab === 'dashboard' && dashboardSearchTerm.trim()) executeDashboardSearch(dashboardSearchTerm);
      if (activeTab === 'master') loadInterviews();
      if (activeTab === 'calendar') loadCalendar();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update feedback');
    }
  };

  // Open Status Modal
  const handleOpenStatus = (interview) => {
    setSelectedInterview(interview);
    setStatusForm({
      status: interview.status || 'Scheduled',
      note: ''
    });
    setShowStatusModal(true);
  };

  // Submit Status Update
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateInterviewStatus(selectedInterview._id, statusForm);
      setShowStatusModal(false);
      setSelectedInterview(null);
      if (activeTab === 'dashboard' && dashboardSearchTerm.trim()) executeDashboardSearch(dashboardSearchTerm);
      if (activeTab === 'master') loadInterviews();
      if (activeTab === 'calendar') loadCalendar();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <div className="interview-tracker-container">
      {/* Top Header */}
      <div className="it-header">
        <div className="it-header-left">
          <div className="it-badge">Phase 5 — Interview Tracking</div>
          <h1 className="it-title">Candidate Interview Tracker</h1>
          <p className="it-subtitle">
            Consolidated lifecycle tracking from client shortlisting through all interview rounds to final decision.
          </p>
        </div>
        <div className="it-header-actions">
          <button
            type="button"
            className="btn-primary it-schedule-btn"
            onClick={() => handleOpenScheduleModal()}
          >
            <Plus size={15} />
            <span>Schedule Interview</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="it-tabs-header">
        <button
          type="button"
          className={`it-tab-btn ${activeTab === 'dashboard' ? 'it-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <BarChart3 size={15} />
          <span>Dashboard & Pipeline</span>
        </button>
        <button
          type="button"
          className={`it-tab-btn ${activeTab === 'master' ? 'it-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('master')}
        >
          <ListFilter size={15} />
          <span>Interview Schedule & Master List</span>
        </button>
        <button
          type="button"
          className={`it-tab-btn ${activeTab === 'calendar' ? 'it-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <CalendarDays size={15} />
          <span>Interview Calendar</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: DASHBOARD & PIPELINE (UNIFIED SEARCH & DUAL SECTIONS) */}
      {/* ========================================================= */}
      {activeTab === 'dashboard' && (
        <div className="it-tab-content space-y-6">
          {/* Single Unified Search Bar */}
          <div className="it-unified-search-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowDashboardSuggestions(false);
                executeDashboardSearch();
              }}
              className="it-unified-search-wrap"
            >
              <Search size={18} className="it-unified-search-icon" />
              <input
                type="text"
                className="it-unified-search-input"
                placeholder="Search by Client Name or Position Name (e.g. Browns, DELTASPIKE, Head of Sales)..."
                value={dashboardSearchTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  setDashboardSearchTerm(val);
                  setShowDashboardSuggestions(true);
                  if (!val.trim()) {
                    setDashboardInterviews([]);
                    setHasExecutedDashboardSearch(false);
                  }
                }}
                onFocus={() => setShowDashboardSuggestions(true)}
                autoComplete="off"
                data-lpignore="true"
              />
              {dashboardSearchTerm && (
                <button
                  type="button"
                  className="it-unified-clear-btn"
                  onClick={() => {
                    setDashboardSearchTerm('');
                    setDashboardInterviews([]);
                    setHasExecutedDashboardSearch(false);
                    setShowDashboardSuggestions(false);
                  }}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}

              {/* Autocomplete Suggestions Popup */}
              {showDashboardSuggestions && dashboardSearchTerm.trim() && (
                <div className="it-search-autocomplete">
                  {dashboardSuggestions.matchedClients.length > 0 && (
                    <div>
                      <div className="it-autocomplete-group-title">Clients</div>
                      {dashboardSuggestions.matchedClients.map(c => (
                        <div
                          key={c._id}
                          className="it-autocomplete-item"
                          onClick={() => {
                            setDashboardSearchTerm(c.clientName);
                            setShowDashboardSuggestions(false);
                            executeDashboardSearch(c.clientName);
                          }}
                        >
                          <span className="font-semibold">{c.clientName}</span>
                          <span className="text-[11px] text-gray-400">Client</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {dashboardSuggestions.matchedPositions.length > 0 && (
                    <div>
                      <div className="it-autocomplete-group-title">Positions</div>
                      {dashboardSuggestions.matchedPositions.map(p => (
                        <div
                          key={p._id}
                          className="it-autocomplete-item"
                          onClick={() => {
                            const term = p.position || p.jobOrderId;
                            setDashboardSearchTerm(term);
                            setShowDashboardSuggestions(false);
                            executeDashboardSearch(term);
                          }}
                        >
                          <div>
                            <span className="font-semibold">{p.position}</span>
                            <span className="text-[11px] text-gray-500 ml-2 font-mono">({p.jobOrderId})</span>
                          </div>
                          <span className="text-[11px] text-forest-700 font-medium">{p.clientName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {dashboardSuggestions.matchedClients.length === 0 && dashboardSuggestions.matchedPositions.length === 0 && (
                    <div className="p-3 text-xs text-gray-400 italic">Press Enter to search for "{dashboardSearchTerm}"</div>
                  )}
                </div>
              )}
            </form>
          </div>

          {loadingDashboardResults ? (
            <div className="it-loading">Searching candidate interviews...</div>
          ) : !hasExecutedDashboardSearch || !dashboardSearchTerm.trim() ? (
            /* Empty Initial State: Zero KPI cards or breakdowns */
            <div className="it-dashboard-empty">
              <Search size={40} className="text-gray-300 mb-3" />
              <h3 className="text-sm font-semibold text-gray-700">
                Search for a client or position to view interview activity.
              </h3>
              <p className="text-xs text-gray-400 mt-1 max-w-md text-center">
                Type any client or position name in the search box above to view completed and upcoming interview activity.
              </p>
            </div>
          ) : (
            /* Exactly Two Main Sections After Search (Segregated Position-Wise, 1 Timeline Card per Candidate) */
            <div className="space-y-6">
              {/* SECTION 1: INTERVIEW COMPLETED */}
              <div className="it-section-block">
                <div className="it-section-header">
                  <div className="it-section-title">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    <span>Section 1: Interview Completed</span>
                  </div>
                  <span className="it-section-count it-section-count--completed">
                    {totalCompletedCandidates}
                  </span>
                </div>

                {completedPositionGroups.length === 0 ? (
                  <div className="it-empty py-6">No completed interviews found for this search.</div>
                ) : (
                  <div>
                    {completedPositionGroups.map(posGroup => (
                      <div key={posGroup.posKey} className="it-position-group">
                        {/* Position Group Header */}
                        <div className="it-position-group-header">
                          <div className="it-position-group-title-wrap">
                            <span className="it-position-client-pill">{posGroup.clientName}</span>
                            <span className="it-position-title-text">{posGroup.positionName}</span>
                            {posGroup.jobOrderId && (
                              <span className="it-position-jo-pill">{posGroup.jobOrderId}</span>
                            )}
                          </div>
                          <span className="it-position-cand-count">
                            {posGroup.candidates.length} {posGroup.candidates.length === 1 ? 'Candidate' : 'Candidates'}
                          </span>
                        </div>

                        {/* One Timeline Card per Candidate */}
                        <div className="it-candidate-grid">
                          {posGroup.candidates.map(cand => {
                            const latestBadge = getCompletedBadge(cand.latestRound);
                            return (
                              <div key={cand.candKey} className="it-candidate-card">
                                {/* Candidate Header */}
                                <div className="it-card-top">
                                  <div>
                                    <h4 className="it-candidate-name">{cand.candidateName}</h4>
                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                      TA: <span className="font-medium text-gray-700">{cand.taName}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${latestBadge.class}`}>
                                      {latestBadge.text}
                                    </span>
                                    {cand.candidateSubId && (
                                      <button
                                        type="button"
                                        onClick={() => setHistoryCandidateId(cand.candidateSubId)}
                                        className="it-btn-icon text-forest-700 hover:bg-forest-50"
                                        title="View Full Candidate Journey Modal"
                                      >
                                        <History size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Chronological Round-by-Round Candidate Timeline */}
                                <div className="it-timeline">
                                  {cand.rounds.map(r => {
                                    const stepMeta = getRoundStepMeta(r);
                                    const noteText = r.feedback || r.interviewerComments || r.candidatePerformanceNotes || '';
                                    return (
                                      <div key={r._id} className="it-timeline-step">
                                        <span
                                          className="it-timeline-dot"
                                          style={{ backgroundColor: stepMeta.dotColor }}
                                        />
                                        <div className="it-timeline-step-head">
                                          <div className="it-timeline-round-info">
                                            <span className="it-timeline-round-name">{r.round}</span>
                                            <span className="it-timeline-round-date">• {r.interviewDateStr}</span>
                                          </div>
                                          <div className="it-timeline-step-right">
                                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${stepMeta.pillClass}`}>
                                              {stepMeta.label}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handleOpenFeedback(r)}
                                              className="it-btn-icon text-emerald-700 hover:bg-emerald-50"
                                              style={{ width: '1.4rem', height: '1.4rem' }}
                                              title={`Edit ${r.round} Feedback & Decision`}
                                            >
                                              <FileText size={11} />
                                            </button>
                                          </div>
                                        </div>
                                        {noteText && (
                                          <div className="it-timeline-feedback">
                                            "{noteText}"
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: UPCOMING INTERVIEWS */}
              <div className="it-section-block">
                <div className="it-section-header">
                  <div className="it-section-title">
                    <Clock size={18} className="text-blue-600" />
                    <span>Section 2: Upcoming Interviews</span>
                  </div>
                  <span className="it-section-count it-section-count--upcoming">
                    {totalUpcomingCandidates}
                  </span>
                </div>

                {upcomingPositionGroups.length === 0 ? (
                  <div className="it-empty py-6">No upcoming interviews found for this search.</div>
                ) : (
                  <div>
                    {upcomingPositionGroups.map(posGroup => (
                      <div key={posGroup.posKey} className="it-position-group">
                        {/* Position Group Header */}
                        <div className="it-position-group-header">
                          <div className="it-position-group-title-wrap">
                            <span className="it-position-client-pill">{posGroup.clientName}</span>
                            <span className="it-position-title-text">{posGroup.positionName}</span>
                            {posGroup.jobOrderId && (
                              <span className="it-position-jo-pill">{posGroup.jobOrderId}</span>
                            )}
                          </div>
                          <span className="it-position-cand-count">
                            {posGroup.candidates.length} {posGroup.candidates.length === 1 ? 'Candidate' : 'Candidates'}
                          </span>
                        </div>

                        {/* One Timeline Card per Candidate */}
                        <div className="it-candidate-grid">
                          {posGroup.candidates.map(cand => {
                            const latestBadge = getUpcomingBadge(cand.latestRound);
                            return (
                              <div key={cand.candKey} className="it-candidate-card">
                                {/* Candidate Header */}
                                <div className="it-card-top">
                                  <div>
                                    <h4 className="it-candidate-name">{cand.candidateName}</h4>
                                    <div className="text-[11px] text-gray-500 mt-0.5">
                                      TA: <span className="font-medium text-gray-700">{cand.taName}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${latestBadge.class}`}>
                                      {latestBadge.text}
                                    </span>
                                    {cand.candidateSubId && (
                                      <button
                                        type="button"
                                        onClick={() => setHistoryCandidateId(cand.candidateSubId)}
                                        className="it-btn-icon text-forest-700 hover:bg-forest-50"
                                        title="View Full Candidate Journey Modal"
                                      >
                                        <History size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Chronological Round-by-Round Candidate Timeline */}
                                <div className="it-timeline">
                                  {cand.rounds.map(r => {
                                    const stepMeta = getRoundStepMeta(r);
                                    const isUpcomingRound = r.status === 'Scheduled' || r.status === 'Rescheduled';
                                    const noteText = r.feedback || r.interviewerComments || r.schedulingNotes || '';
                                    return (
                                      <div key={r._id} className="it-timeline-step">
                                        <span
                                          className="it-timeline-dot"
                                          style={{ backgroundColor: stepMeta.dotColor }}
                                        />
                                        <div className="it-timeline-step-head">
                                          <div className="it-timeline-round-info">
                                            <span className="it-timeline-round-name">{r.round}</span>
                                            <span className="it-timeline-round-date">
                                              • {r.interviewDateStr}
                                              {isUpcomingRound && r.interviewTime ? ` at ${r.interviewTime}` : ''}
                                              {isUpcomingRound && r.interviewMode ? ` (${r.interviewMode})` : ''}
                                            </span>
                                          </div>
                                          <div className="it-timeline-step-right">
                                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${stepMeta.pillClass}`}>
                                              {stepMeta.label}
                                            </span>
                                            {isUpcomingRound && (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenReschedule(r)}
                                                  className="it-btn-icon text-amber-700 hover:bg-amber-50"
                                                  style={{ width: '1.4rem', height: '1.4rem' }}
                                                  title={`Reschedule ${r.round}`}
                                                >
                                                  <Clock size={11} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenStatus(r)}
                                                  className="it-btn-icon text-blue-700 hover:bg-blue-50"
                                                  style={{ width: '1.4rem', height: '1.4rem' }}
                                                  title={`Change ${r.round} Status`}
                                                >
                                                  <CheckCircle2 size={11} />
                                                </button>
                                              </>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => handleOpenFeedback(r)}
                                              className="it-btn-icon text-emerald-700 hover:bg-emerald-50"
                                              style={{ width: '1.4rem', height: '1.4rem' }}
                                              title={`Record ${r.round} Feedback & Decision`}
                                            >
                                              <FileText size={11} />
                                            </button>
                                          </div>
                                        </div>
                                        {r.meetingLinkOrLocation && isUpcomingRound && (
                                          <div className="text-[10px] text-blue-600 truncate mt-1 font-mono">
                                            {r.meetingLinkOrLocation}
                                          </div>
                                        )}
                                        {noteText && (
                                          <div className="it-timeline-feedback">
                                            "{noteText}"
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: INTERVIEW SCHEDULE & MASTER TABLE (12 EXACT COLUMNS) */}
      {/* ========================================================= */}
      {activeTab === 'master' && (
        <div className="it-tab-content">
          {/* Master Table Filter Bar */}
          <div className="it-filter-card">
            <div className="it-filter-grid">
              <div className="it-filter-item">
                <label>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                />
              </div>

              <div className="it-filter-item">
                <label>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setPage(1); }}
                />
              </div>

              <div className="it-filter-item">
                <label>Client</label>
                <select
                  value={selectedClient}
                  onChange={e => { setSelectedClient(e.target.value); setPage(1); }}
                >
                  <option value="">All Clients</option>
                  {clients.map(c => (
                    <option key={c._id} value={c._id}>{c.clientName}</option>
                  ))}
                </select>
              </div>

              <div className="it-filter-item">
                <label>Position / JO ID</label>
                <select
                  value={selectedPosition}
                  onChange={e => { setSelectedPosition(e.target.value); setPage(1); }}
                >
                  <option value="">All Positions</option>
                  {positions.map(p => (
                    <option key={p._id} value={p._id}>
                      {p.jobOrderId} — {p.position}
                    </option>
                  ))}
                </select>
              </div>

              <div className="it-filter-item">
                <label>TA</label>
                <select
                  value={selectedTA}
                  onChange={e => { setSelectedTA(e.target.value); setPage(1); }}
                >
                  <option value="">All TAs</option>
                  {tas.map(ta => (
                    <option key={ta._id} value={ta._id}>{ta.name}</option>
                  ))}
                </select>
              </div>

              <div className="it-filter-item">
                <label>Round</label>
                <select
                  value={selectedRound}
                  onChange={e => { setSelectedRound(e.target.value); setPage(1); }}
                >
                  <option value="">All Rounds</option>
                  {ROUNDS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="it-filter-item">
                <label>Status</label>
                <select
                  value={selectedStatus}
                  onChange={e => { setSelectedStatus(e.target.value); setPage(1); }}
                >
                  <option value="">All Statuses</option>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="it-filter-item">
                <label>Decision</label>
                <select
                  value={selectedDecision}
                  onChange={e => { setSelectedDecision(e.target.value); setPage(1); }}
                >
                  <option value="">All Decisions</option>
                  {DECISIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="it-filter-item it-filter-search">
                <label>Search</label>
                <div className="it-search-wrap">
                  <Search size={14} className="it-search-icon" />
                  <input
                    type="text"
                    placeholder="Candidate, client, contact, email, JO ID..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                  />
                </div>
              </div>
            </div>

            <div className="it-filter-actions">
              <button
                type="button"
                className="it-reset-btn"
                onClick={handleResetFilters}
                title="Clear all filters"
              >
                <RotateCcw size={13} />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>

          <div className="it-table-card">
            <div className="it-table-header">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Interview Schedule & Master List</h3>
                <p className="text-xs text-gray-500">
                  Showing {interviews.length} of {totalInterviews} recorded interviews
                </p>
              </div>
            </div>

            {loadingList ? (
              <div className="it-loading">Loading interview records...</div>
            ) : interviews.length === 0 ? (
              <div className="it-empty">No interviews match the current filters.</div>
            ) : (
              <div className="it-excel-table-container">
                <table className="it-excel-table">
                  <thead>
                    <tr>
                      {/* EXACT 12 COLUMNS IN REQUESTED ORDER */}
                      <th onClick={() => { setSortBy('clientName'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        CLIENT
                      </th>
                      <th onClick={() => { setSortBy('positionName'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        POSITION
                      </th>
                      <th onClick={() => { setSortBy('candidateName'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        CANDIDATE NAME
                      </th>
                      <th>CONTACT NUMBER</th>
                      <th>EMAIL</th>
                      <th onClick={() => { setSortBy('interviewDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        INTERVIEW DATE
                      </th>
                      <th>INTERVIEW TIME</th>
                      <th>INTERVIEW MODE</th>
                      <th>INTERVIEW STATUS</th>
                      <th>INTERVIEW ROUND</th>
                      <th>DECISION</th>
                      <th>TA</th>
                      <th className="text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map(inv => {
                      const statusStyle = STATUS_BADGES[inv.status] || STATUS_BADGES.Scheduled;
                      const decisionStyle = DECISION_BADGES[inv.decision] || DECISION_BADGES.Pending;
                      const candidateSubId = inv.candidateSubmission?._id || inv.candidateSubmission;

                      return (
                        <tr key={inv._id}>
                          {/* 1. CLIENT */}
                          <td className="font-semibold text-gray-900">
                            {inv.clientName || inv.client?.clientName || '—'}
                          </td>

                          {/* 2. POSITION */}
                          <td>
                            <div className="font-medium text-gray-800">
                              {inv.positionName || inv.position?.position || inv.jobOrderId || '—'}
                            </div>
                            {inv.jobOrderId && (
                              <div className="text-[10px] text-gray-400 font-mono">
                                {inv.jobOrderId}
                              </div>
                            )}
                          </td>

                          {/* 3. CANDIDATE NAME */}
                          <td className="font-semibold text-gray-900">
                            {inv.candidateName || '—'}
                          </td>

                          {/* 4. CONTACT NUMBER */}
                          <td className="font-mono text-xs text-gray-600">
                            {inv.contactNumber || inv.candidateSubmission?.contactNumber || '—'}
                          </td>

                          {/* 5. EMAIL */}
                          <td className="text-xs text-blue-600">
                            {inv.email || inv.candidateSubmission?.email || '—'}
                          </td>

                          {/* 6. INTERVIEW DATE */}
                          <td className="font-medium text-gray-800">
                            {inv.interviewDateStr || (inv.interviewDate ? new Date(inv.interviewDate).toLocaleDateString() : '—')}
                          </td>

                          {/* 7. INTERVIEW TIME */}
                          <td className="font-medium text-gray-700">
                            {inv.interviewTime || '—'}
                          </td>

                          {/* 8. INTERVIEW MODE */}
                          <td>
                            <span className="text-xs text-gray-600">{inv.interviewMode || 'Online'}</span>
                          </td>

                          {/* 9. INTERVIEW STATUS */}
                          <td>
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle}`}>
                              {inv.status}
                            </span>
                          </td>

                          {/* 10. INTERVIEW ROUND */}
                          <td>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {inv.round}
                            </span>
                          </td>

                          {/* 11. DECISION */}
                          <td>
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${decisionStyle}`}>
                              {inv.decision}
                            </span>
                          </td>

                          {/* 12. TA */}
                          <td>
                            <span className="text-xs font-medium text-gray-700">
                              {inv.sourcingTA?.name || inv.taName || inv.candidateSubmission?.sourcedBy?.name || inv.interviewCoordinator?.name || '—'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenFeedback(inv)}
                                className="it-btn-icon text-emerald-700 hover:bg-emerald-50"
                                title="Feedback & Decision"
                              >
                                <FileText size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReschedule(inv)}
                                className="it-btn-icon text-amber-700 hover:bg-amber-50"
                                title="Reschedule Interview"
                              >
                                <Clock size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenStatus(inv)}
                                className="it-btn-icon text-blue-700 hover:bg-blue-50"
                                title="Change Status"
                              >
                                <CheckCircle2 size={13} />
                              </button>
                              {candidateSubId && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryCandidateId(candidateSubId)}
                                  className="it-btn-icon text-forest-700 hover:bg-forest-50"
                                  title="View Candidate Interview Journey"
                                >
                                  <History size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination footer */}
            <div className="it-pagination-footer">
              <div className="text-xs text-gray-500">
                Page {page} of {totalPages} ({totalInterviews} records)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="it-page-btn"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="it-page-btn"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: CALENDAR VIEW */}
      {/* ========================================================= */}
      {activeTab === 'calendar' && (
        <div className="it-tab-content">
          <div className="it-calendar-card">
            <div className="it-calendar-header">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Scheduled Interviews Calendar</h3>
                <p className="text-xs text-gray-500">
                  {calendarEvents.length} interview sessions scheduled across selected period
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`it-cal-toggle-btn ${calendarViewMode === 'day' ? 'it-cal-toggle-btn--active' : ''}`}
                  onClick={() => setCalendarViewMode('day')}
                >
                  Day
                </button>
                <button
                  type="button"
                  className={`it-cal-toggle-btn ${calendarViewMode === 'week' ? 'it-cal-toggle-btn--active' : ''}`}
                  onClick={() => setCalendarViewMode('week')}
                >
                  Week
                </button>
                <button
                  type="button"
                  className={`it-cal-toggle-btn ${calendarViewMode === 'month' ? 'it-cal-toggle-btn--active' : ''}`}
                  onClick={() => setCalendarViewMode('month')}
                >
                  Month
                </button>
              </div>
            </div>

            {loadingCalendar ? (
              <div className="it-loading">Loading calendar events...</div>
            ) : calendarEvents.length === 0 ? (
              <div className="it-empty">No interviews scheduled for this date range.</div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Group events by date */}
                {Object.entries(
                  calendarEvents.reduce((acc, ev) => {
                    const d = ev.date || 'Undated';
                    if (!acc[d]) acc[d] = [];
                    acc[d].push(ev);
                    return acc;
                  }, {})
                ).map(([dateStr, events]) => (
                  <div key={dateStr} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2 mb-3">
                      <Calendar size={15} className="text-forest-600" />
                      <span className="font-bold text-xs text-gray-800">{dateStr}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        {events.length} session{events.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {events.map(ev => {
                        const statusClass = STATUS_BADGES[ev.status] || STATUS_BADGES.Scheduled;
                        return (
                          <div key={ev.id} className="rounded-lg border border-gray-100 bg-gray-50/70 p-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-mono text-[10px] text-gray-400">{ev.interviewId}</span>
                                <h4 className="text-xs font-bold text-gray-900">{ev.candidateName}</h4>
                                <p className="text-[11px] text-gray-500">{ev.jobOrderId} — {ev.round}</p>
                              </div>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                                {ev.status}
                              </span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between text-[11px] text-gray-600">
                              <span className="flex items-center gap-1 font-medium text-gray-700">
                                <Clock size={12} className="text-gray-400" />
                                {ev.time}
                              </span>
                              <span>Mode: <strong>{ev.mode}</strong></span>
                            </div>

                            {ev.interviewer && (
                              <div className="mt-1 text-[11px] text-gray-500">
                                Interviewer: <span className="text-gray-700 font-medium">{ev.interviewer}</span>
                              </div>
                            )}

                            {ev.meetingLink && (
                              <div className="mt-1 text-[11px] text-blue-600 truncate font-mono">
                                {ev.meetingLink}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: SCHEDULE NEW INTERVIEW */}
      {/* ========================================================= */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal it-modal max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Schedule Candidate Interview</h3>
              <button className="modal-close-btn" onClick={() => setShowScheduleModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateInterviewSubmit} className="space-y-4 p-5">
              {/* Select Eligible Candidate */}
              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Select Eligible Candidate (Client Shortlisted) *
                </label>
                {loadingEligible ? (
                  <div className="text-xs text-gray-400">Loading eligible candidates...</div>
                ) : (
                  <select
                    value={scheduleForm.candidateSubmissionId}
                    onChange={e => handleCandidateSelect(e.target.value)}
                    required
                    className="it-input mt-1"
                  >
                    <option value="">-- Choose Candidate --</option>
                    {eligibleCandidates.map(c => (
                      <option key={c._id} value={c._id}>
                        {c.candidateName} — {c.position?.jobOrderId} ({c.nextSuggestedRound})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Position and Candidate Name Confirmation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Candidate Name *</label>
                  <input
                    type="text"
                    required
                    value={scheduleForm.candidateName}
                    onChange={e => setScheduleForm({ ...scheduleForm, candidateName: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interview Round *</label>
                  <select
                    value={scheduleForm.round}
                    onChange={e => setScheduleForm({ ...scheduleForm, round: e.target.value })}
                    className="it-input mt-1"
                  >
                    {ROUNDS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Contact Number & Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Contact Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 077 123 4567"
                    value={scheduleForm.contactNumber || ''}
                    onChange={e => setScheduleForm({ ...scheduleForm, contactNumber: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. candidate@example.com"
                    value={scheduleForm.email || ''}
                    onChange={e => setScheduleForm({ ...scheduleForm, email: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interview Date *</label>
                  <input
                    type="date"
                    required
                    value={scheduleForm.interviewDate}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewDate: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interview Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10:30 AM or 14:30"
                    value={scheduleForm.interviewTime}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewTime: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
              </div>

              {/* Mode & Link/Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interview Mode</label>
                  <select
                    value={scheduleForm.interviewMode}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewMode: e.target.value })}
                    className="it-input mt-1"
                  >
                    {MODES.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interview Coordinator (TA)</label>
                  <select
                    value={scheduleForm.interviewCoordinatorId}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewCoordinatorId: e.target.value })}
                    className="it-input mt-1"
                  >
                    <option value="">Unassigned</option>
                    {tas.map(ta => (
                      <option key={ta._id} value={ta._id}>{ta.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Meeting Link or Location</label>
                <input
                  type="text"
                  placeholder="e.g. Google Meet / MS Teams link or Client Office address"
                  value={scheduleForm.meetingLinkOrLocation}
                  onChange={e => setScheduleForm({ ...scheduleForm, meetingLinkOrLocation: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              {/* Interviewer details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interviewer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Smith"
                    value={scheduleForm.interviewerName}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewerName: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Interviewer Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. VP of Engineering"
                    value={scheduleForm.interviewerDesignation}
                    onChange={e => setScheduleForm({ ...scheduleForm, interviewerDesignation: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Scheduling Notes</label>
                <textarea
                  rows="2"
                  placeholder="Candidate preparation instructions, resume focus, etc."
                  value={scheduleForm.schedulingNotes}
                  onChange={e => setScheduleForm({ ...scheduleForm, schedulingNotes: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowScheduleModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm & Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: RESCHEDULE INTERVIEW */}
      {/* ========================================================= */}
      {showRescheduleModal && selectedInterview && (
        <div className="modal-overlay" onClick={() => setShowRescheduleModal(false)}>
          <div className="modal it-modal max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reschedule Interview: {selectedInterview.interviewId}</h3>
              <button className="modal-close-btn" onClick={() => setShowRescheduleModal(false)}>×</button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4 p-5">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                <p className="font-semibold">Current Schedule:</p>
                <p>{selectedInterview.candidateName} — {selectedInterview.round}</p>
                <p>{selectedInterview.interviewDateStr} at {selectedInterview.interviewTime}</p>
                <p className="mt-1 text-[11px] text-amber-700">
                  Note: The previous schedule will be permanently preserved in the interview history.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">New Date *</label>
                  <input
                    type="date"
                    required
                    value={rescheduleForm.newDate}
                    onChange={e => setRescheduleForm({ ...rescheduleForm, newDate: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">New Time *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 11:30 AM"
                    value={rescheduleForm.newTime}
                    onChange={e => setRescheduleForm({ ...rescheduleForm, newTime: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Rescheduling Reason *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Candidate requested slot change, client panel unavailable"
                  value={rescheduleForm.reason}
                  onChange={e => setRescheduleForm({ ...rescheduleForm, reason: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Updated Meeting Link / Location</label>
                <input
                  type="text"
                  placeholder="Leave as is or update link"
                  value={rescheduleForm.meetingLinkOrLocation}
                  onChange={e => setRescheduleForm({ ...rescheduleForm, meetingLinkOrLocation: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowRescheduleModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary bg-amber-600 hover:bg-amber-700">
                  Save Reschedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: FEEDBACK & DECISION */}
      {/* ========================================================= */}
      {showFeedbackModal && selectedInterview && (
        <div className="modal-overlay" onClick={() => setShowFeedbackModal(false)}>
          <div className="modal it-modal max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Interview Feedback & Decision: {selectedInterview.interviewId}</h3>
              <button className="modal-close-btn" onClick={() => setShowFeedbackModal(false)}>×</button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="space-y-4 p-5">
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                <span className="font-bold text-gray-900">{selectedInterview.candidateName}</span> —{' '}
                <span>{selectedInterview.round} ({selectedInterview.jobOrderId})</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Recruitment Decision *</label>
                <select
                  value={feedbackForm.decision}
                  onChange={e => setFeedbackForm({ ...feedbackForm, decision: e.target.value })}
                  className="it-input mt-1 font-semibold"
                >
                  {DECISIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-400">
                  Selecting 'Shortlisted' records the candidate's qualification for the next round without automatically progressing them.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Overall Feedback</label>
                <textarea
                  rows="2"
                  placeholder="Summary of interview outcome and overall impression..."
                  value={feedbackForm.feedback}
                  onChange={e => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Interviewer's Comments</label>
                <textarea
                  rows="2"
                  placeholder="Direct quotes or evaluation comments from the client interviewer..."
                  value={feedbackForm.interviewerComments}
                  onChange={e => setFeedbackForm({ ...feedbackForm, interviewerComments: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Candidate Performance Notes</label>
                <textarea
                  rows="2"
                  placeholder="Technical assessment, communication, problem-solving notes..."
                  value={feedbackForm.candidatePerformanceNotes}
                  onChange={e => setFeedbackForm({ ...feedbackForm, candidatePerformanceNotes: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Next Action</label>
                  <input
                    type="text"
                    placeholder="e.g. Schedule Round 2, Request offer documents"
                    value={feedbackForm.nextAction}
                    onChange={e => setFeedbackForm({ ...feedbackForm, nextAction: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Target Next Round (if applicable)</label>
                  <select
                    value={feedbackForm.nextInterviewRound}
                    onChange={e => setFeedbackForm({ ...feedbackForm, nextInterviewRound: e.target.value })}
                    className="it-input mt-1"
                  >
                    <option value="">None / Not Applicable</option>
                    {ROUNDS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFeedbackModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Feedback & Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: OPERATIONAL STATUS */}
      {/* ========================================================= */}
      {showStatusModal && selectedInterview && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal it-modal max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Update Operational Status</h3>
              <button className="modal-close-btn" onClick={() => setShowStatusModal(false)}>×</button>
            </div>

            <form onSubmit={handleStatusSubmit} className="space-y-4 p-5">
              <div>
                <label className="text-xs font-semibold text-gray-700">Status *</label>
                <select
                  value={statusForm.status}
                  onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}
                  className="it-input mt-1 font-semibold"
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Status Change Note</label>
                <input
                  type="text"
                  placeholder="e.g. Candidate confirmed attendance"
                  value={statusForm.note}
                  onChange={e => setStatusForm({ ...statusForm, note: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowStatusModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Update Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: CANDIDATE INTERVIEW JOURNEY TIMELINE */}
      {/* ========================================================= */}
      {historyCandidateId && (
        <CandidateInterviewHistoryModal
          candidateSubmissionId={historyCandidateId}
          onClose={() => setHistoryCandidateId(null)}
          onScheduleNext={(candidate) => {
            setHistoryCandidateId(null);
            handleOpenScheduleModal(candidate?.position?._id);
          }}
        />
      )}
    </div>
  );
}
