import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getInterviews,
  createInterview,
  rescheduleInterview,
  updateFeedbackAndDecision,
  updateInterviewStatus,
  getInterviewDashboard,
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
  User,
  Search,
  Filter,
  RotateCcw,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  FileText,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ListFilter,
  BarChart3,
  AlertCircle,
  UserCheck,
  UserX
} from 'lucide-react';
import './InterviewTracker.css';

const ROUNDS = ['First Round', 'Second Round', 'Third Round', 'Final Round'];
const STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'No Show', 'Rescheduled', 'Withdrew'];
const DECISIONS = ['Reschedule', 'Pending', 'Shortlisted', 'Rejected', 'Dropped'];
const MODES = ['Online', 'Physical', 'Telephone'];

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
  // Navigation tabs: 'dashboard' | 'master' | 'calendar'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Filters state
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

  const [dashboardData, setDashboardData] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

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

  // Load dashboard
  const loadDashboard = useCallback(() => {
    setLoadingDashboard(true);
    getInterviewDashboard(filterParams)
      .then(res => setDashboardData(res || {}))
      .catch(err => console.error('Failed to load interview dashboard:', err))
      .finally(() => setLoadingDashboard(false));
  }, [filterParams]);

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
    if (activeTab === 'dashboard') loadDashboard();
    else if (activeTab === 'master') loadInterviews();
    else if (activeTab === 'calendar') loadCalendar();
  }, [activeTab, loadDashboard, loadInterviews, loadCalendar]);

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
      if (activeTab === 'dashboard') loadDashboard();
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
      if (activeTab === 'dashboard') loadDashboard();
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
      if (activeTab === 'dashboard') loadDashboard();
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
      if (activeTab === 'dashboard') loadDashboard();
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

      {/* Global Filter Bar */}
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
                placeholder="Candidate, interviewer, JO ID..."
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
      {/* TAB 1: DASHBOARD & PIPELINE */}
      {/* ========================================================= */}
      {activeTab === 'dashboard' && (
        <div className="it-tab-content space-y-6">
          {loadingDashboard && (
            <div className="it-loading">Loading interview summary & pipeline...</div>
          )}

          {!loadingDashboard && dashboardData && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <div className="it-card">
                  <div className="it-card-head">
                    <span>Total Events</span>
                    <History size={16} className="text-gray-400" />
                  </div>
                  <div className="it-card-val text-gray-900">
                    {dashboardData.summaryCards?.totalInterviewEvents || 0}
                  </div>
                  <div className="it-card-sub">
                    {dashboardData.summaryCards?.uniqueCandidatesInterviewed || 0} unique candidates
                  </div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Scheduled</span>
                    <Clock size={16} className="text-blue-500" />
                  </div>
                  <div className="it-card-val text-blue-700">
                    {dashboardData.summaryCards?.scheduled || 0}
                  </div>
                  <div className="it-card-sub">Upcoming interview sessions</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Completed</span>
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  </div>
                  <div className="it-card-val text-emerald-700">
                    {dashboardData.summaryCards?.completed || 0}
                  </div>
                  <div className="it-card-sub">Interviews successfully conducted</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Pending Decisions</span>
                    <Clock size={16} className="text-amber-500" />
                  </div>
                  <div className="it-card-val text-amber-700">
                    {dashboardData.summaryCards?.pendingDecisions || 0}
                  </div>
                  <div className="it-card-sub">Awaiting client / hiring decision</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Next Round Yield</span>
                    <UserCheck size={16} className="text-emerald-600" />
                  </div>
                  <div className="it-card-val text-emerald-700">
                    {dashboardData.summaryCards?.candidatesShortlisted || 0}
                  </div>
                  <div className="it-card-sub">Candidates shortlisted for next round</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Rescheduled</span>
                    <AlertTriangle size={16} className="text-amber-500" />
                  </div>
                  <div className="it-card-val text-amber-700">
                    {dashboardData.summaryCards?.rescheduled || 0}
                  </div>
                  <div className="it-card-sub">Shifted slots (history kept)</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Cancelled</span>
                    <XCircle size={16} className="text-gray-400" />
                  </div>
                  <div className="it-card-val text-gray-700">
                    {dashboardData.summaryCards?.cancelled || 0}
                  </div>
                  <div className="it-card-sub">Cancelled appointments</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>No Shows</span>
                    <XCircle size={16} className="text-red-400" />
                  </div>
                  <div className="it-card-val text-red-700">
                    {dashboardData.summaryCards?.noShows || 0}
                  </div>
                  <div className="it-card-sub">Candidate did not attend</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Rejected</span>
                    <UserX size={16} className="text-red-500" />
                  </div>
                  <div className="it-card-val text-red-700">
                    {dashboardData.summaryCards?.candidatesRejected || 0}
                  </div>
                  <div className="it-card-sub">Not selected by client</div>
                </div>

                <div className="it-card">
                  <div className="it-card-head">
                    <span>Dropped / Withdrew</span>
                    <UserX size={16} className="text-rose-500" />
                  </div>
                  <div className="it-card-val text-rose-700">
                    {dashboardData.summaryCards?.candidatesDropped || 0}
                  </div>
                  <div className="it-card-sub">Candidate declined or dropped</div>
                </div>
              </div>

              {/* Actionable Visual Alerts */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="it-alert-box it-alert-box--upcoming">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                    <span className="font-bold text-xs uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <Clock size={14} /> Upcoming Interviews (7 Days)
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {dashboardData.actionableIndicators?.upcomingCount || 0}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {(dashboardData.actionableIndicators?.upcomingInterviews || []).length === 0 ? (
                      <div className="text-gray-400 italic">No upcoming interviews this week</div>
                    ) : (
                      dashboardData.actionableIndicators.upcomingInterviews.map(inv => (
                        <div key={inv._id} className="flex items-center justify-between bg-white/70 p-2 rounded border border-blue-100">
                          <div>
                            <div className="font-semibold text-gray-800">{inv.candidateName}</div>
                            <div className="text-[11px] text-gray-500">{inv.round} • {inv.jobOrderId}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-blue-700">{inv.interviewDateStr}</div>
                            <div className="text-[11px] text-gray-400">{inv.interviewTime}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="it-alert-box it-alert-box--pending">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-100">
                    <span className="font-bold text-xs uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                      <AlertCircle size={14} /> Awaiting Feedback / Decision
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {dashboardData.actionableIndicators?.awaitingFeedbackCount || 0}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {(dashboardData.actionableIndicators?.awaitingFeedback || []).length === 0 ? (
                      <div className="text-gray-400 italic">No pending interview feedback</div>
                    ) : (
                      dashboardData.actionableIndicators.awaitingFeedback.map(inv => (
                        <div key={inv._id} className="flex items-center justify-between bg-white/70 p-2 rounded border border-amber-100">
                          <div>
                            <div className="font-semibold text-gray-800">{inv.candidateName}</div>
                            <div className="text-[11px] text-gray-500">{inv.round} ({inv.interviewDateStr})</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenFeedback(inv)}
                            className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
                          >
                            Record Feedback
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="it-alert-box it-alert-box--next">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                    <span className="font-bold text-xs uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                      <UserCheck size={14} /> Ready for Next Round
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      {dashboardData.actionableIndicators?.requiringNextRoundCount || 0}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {(dashboardData.actionableIndicators?.requiringNextRound || []).length === 0 ? (
                      <div className="text-gray-400 italic">No shortlisted candidates awaiting next schedule</div>
                    ) : (
                      dashboardData.actionableIndicators.requiringNextRound.map((cand, cIdx) => (
                        <div key={cIdx} className="flex items-center justify-between bg-white/70 p-2 rounded border border-emerald-100">
                          <div>
                            <div className="font-semibold text-gray-800">{cand.candidateName}</div>
                            <div className="text-[11px] text-emerald-700 font-medium">
                              Passed {cand.lastCompletedRound} → Ready for {cand.suggestedNextRound}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenScheduleModal(cand.positionId)}
                            className="rounded bg-forest-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-forest-700"
                          >
                            Schedule
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Interview Pipeline Breakdown */}
              <div className="it-pipeline-card">
                <div className="it-pipeline-head">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Candidate Pipeline Across Interview Rounds</h3>
                    <p className="text-xs text-gray-500">Distribution of candidate volume and recruitment decisions by round</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 p-5">
                  {(dashboardData.pipeline || []).map((roundStats, rIdx) => (
                    <div key={roundStats.round} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                        <span className="font-bold text-xs text-gray-800 uppercase">
                          Round {rIdx + 1}: {roundStats.round}
                        </span>
                        <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[11px] font-bold text-forest-800">
                          {roundStats.uniqueCandidates} Cand.
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span>Scheduled:</span>
                          <span className="font-semibold text-blue-700">{roundStats.scheduled}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Completed:</span>
                          <span className="font-semibold text-emerald-700">{roundStats.completed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shortlisted for next:</span>
                          <span className="font-semibold text-emerald-700">{roundStats.shortlisted}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pending decision:</span>
                          <span className="font-semibold text-amber-700">{roundStats.pending}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rejected:</span>
                          <span className="font-semibold text-red-700">{roundStats.rejected}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Dropped:</span>
                          <span className="font-semibold text-gray-700">{roundStats.dropped}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: INTERVIEW SCHEDULE & MASTER TABLE */}
      {/* ========================================================= */}
      {activeTab === 'master' && (
        <div className="it-tab-content">
          <div className="it-table-card">
            <div className="it-table-header">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Interview Master List</h3>
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
              <div className="overflow-x-auto">
                <table className="it-master-table">
                  <thead>
                    <tr>
                      <th onClick={() => { setSortBy('interviewId'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        Interview ID
                      </th>
                      <th onClick={() => { setSortBy('candidateName'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        Candidate Name
                      </th>
                      <th>Position / JO ID</th>
                      <th>Client</th>
                      <th>Sourcing TA</th>
                      <th>Coordinator</th>
                      <th>Round</th>
                      <th onClick={() => { setSortBy('interviewDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                        Date & Time
                      </th>
                      <th>Mode</th>
                      <th>Status</th>
                      <th>Decision</th>
                      <th>Next Interview</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map(inv => {
                      const statusStyle = STATUS_BADGES[inv.status] || STATUS_BADGES.Scheduled;
                      const decisionStyle = DECISION_BADGES[inv.decision] || DECISION_BADGES.Pending;
                      const candidateSubId = inv.candidateSubmission?._id || inv.candidateSubmission;

                      return (
                        <tr key={inv._id}>
                          <td className="font-mono text-xs font-semibold text-gray-500">
                            {inv.interviewId}
                          </td>
                          <td className="font-semibold text-gray-900">
                            {inv.candidateName}
                          </td>
                          <td>
                            <div className="font-medium text-gray-800">{inv.jobOrderId}</div>
                            <div className="text-[11px] text-gray-400">{inv.positionName}</div>
                          </td>
                          <td>{inv.clientName}</td>
                          <td>
                            <span className="text-xs font-medium text-gray-700">
                              {inv.sourcingTA?.name || '—'}
                            </span>
                          </td>
                          <td>
                            <span className="text-xs font-medium text-gray-700">
                              {inv.interviewCoordinator?.name || '—'}
                            </span>
                          </td>
                          <td>
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {inv.round}
                            </span>
                          </td>
                          <td>
                            <div className="font-medium text-gray-800">{inv.interviewDateStr}</div>
                            <div className="text-[11px] text-gray-400">{inv.interviewTime}</div>
                          </td>
                          <td>
                            <span className="text-xs text-gray-600">{inv.interviewMode}</span>
                          </td>
                          <td>
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyle}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td>
                            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${decisionStyle}`}>
                              {inv.decision}
                            </span>
                          </td>
                          <td className="text-xs text-gray-600">
                            {inv.nextInterviewDateStr ? (
                              <div>
                                <span className="font-semibold text-emerald-700">{inv.nextInterviewRound || 'Next Round'}</span>
                                <div className="text-[11px] text-gray-400">{inv.nextInterviewDateStr}</div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
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
                              <button
                                type="button"
                                onClick={() => setHistoryCandidateId(candidateSubId)}
                                className="it-btn-icon text-forest-700 hover:bg-forest-50"
                                title="View Candidate Interview Journey"
                              >
                                <History size={13} />
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
