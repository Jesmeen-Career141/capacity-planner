import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getDashboardSummary,
  getDailyActivitiesOverview,
  getTaProductivityOverview,
  getPositionActivityOverview,
  getPlannedVsActualOverview,
  getSubmissionSetsOverview,
  getTrendsOverview
} from '../api/taDashboard';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import { getClients } from '../api/clients';
import PositionActivityHistory from '../components/PositionActivityHistory';
import './TAActivityDashboard.css';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

export default function TAActivityDashboard() {
  // Global Filters State
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTa, setSelectedTa] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedWorkType, setSelectedWorkType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Active Tab: 'daily' | 'productivity' | 'positions' | 'plannedVsActual' | 'submissionSets' | 'analytics'
  const [activeTab, setActiveTab] = useState('daily');

  // Daily Activity Sorting
  const [sortField, setSortField] = useState('activityDate');
  const [sortOrder, setSortOrder] = useState('desc');

  // Modals state
  const [viewActivityModal, setViewActivityModal] = useState(null);
  const [viewPositionHistoryModal, setViewPositionHistoryModal] = useState(null);

  // Filter params object
  const filterParams = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    ta: selectedTa || undefined,
    client: selectedClient || undefined,
    position: selectedPosition || undefined,
    workType: selectedWorkType || undefined,
    status: selectedStatus || undefined
  }), [dateFrom, dateTo, selectedTa, selectedClient, selectedPosition, selectedWorkType, selectedStatus]);

  const hasActiveFilters = Boolean(
    dateFrom || dateTo || selectedTa || selectedClient || selectedPosition || selectedWorkType || selectedStatus
  );

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedTa('');
    setSelectedClient('');
    setSelectedPosition('');
    setSelectedWorkType('');
    setSelectedStatus('');
  };

  // 1. Reference Data: TAs, Clients, Positions
  const { data: tasRes } = useQuery({
    queryKey: ['tas', 'active'],
    queryFn: () => getActiveTAs(),
    staleTime: 5 * 60 * 1000
  });
  const tasList = Array.isArray(tasRes?.data) ? tasRes.data : [];

  const { data: clientsRes } = useQuery({
    queryKey: ['clients', 'list'],
    queryFn: () => getClients(),
    staleTime: 5 * 60 * 1000
  });
  const clientsList = Array.isArray(clientsRes?.data) ? clientsRes.data : [];

  const { data: positionsRes } = useQuery({
    queryKey: ['positions', 'list'],
    queryFn: () => getPositions({}),
    staleTime: 5 * 60 * 1000
  });
  const positionsList = Array.isArray(positionsRes?.data) ? positionsRes.data : [];

  // 2. Fetch Dashboard Summary
  const {
    data: summaryRes,
    isLoading: loadingSummary,
    refetch: refetchSummary
  } = useQuery({
    queryKey: ['ta-dashboard-summary', filterParams],
    queryFn: () => getDashboardSummary(filterParams)
  });
  const defaultSummary = {
    workload: { totalAssignments: 0, completedAssignments: 0, inProgressAssignments: 0, missedAssignments: 0, completionRate: 0 },
    sourcing: { profilesSearched: 0, additionalProfilesSourced: 0, followUpActivities: 0, responsesReceived: 0 },
    recruitmentOutput: { cvsShared: 0, candidateSubmissions: 0, uniqueCandidates: 0, internallyShortlisted: 0, goodCvs: 0, optionalCvs: 0, clientShortlisted: 0, withdrawn: 0 }
  };
  const summary = {
    workload: { ...defaultSummary.workload, ...(summaryRes?.data?.workload || {}) },
    sourcing: { ...defaultSummary.sourcing, ...(summaryRes?.data?.sourcing || {}) },
    recruitmentOutput: { ...defaultSummary.recruitmentOutput, ...(summaryRes?.data?.recruitmentOutput || {}) }
  };

  // 3. Fetch Tab Data depending on activeTab
  const {
    data: dailyActRes,
    isLoading: loadingDailyAct,
    refetch: refetchDailyAct
  } = useQuery({
    queryKey: ['ta-dashboard-daily', filterParams, sortField, sortOrder],
    queryFn: () => getDailyActivitiesOverview({
      ...filterParams,
      sortBy: sortField,
      sortOrder
    }),
    enabled: activeTab === 'daily'
  });
  const dailyActivities = Array.isArray(dailyActRes?.data?.activities) ? dailyActRes.data.activities : [];

  const {
    data: productivityRes,
    isLoading: loadingProductivity,
    refetch: refetchProductivity
  } = useQuery({
    queryKey: ['ta-dashboard-productivity', filterParams],
    queryFn: () => getTaProductivityOverview(filterParams),
    enabled: activeTab === 'productivity' || activeTab === 'analytics'
  });
  const productivityList = Array.isArray(productivityRes?.data) ? productivityRes.data : [];

  const {
    data: posOverviewRes,
    isLoading: loadingPosOverview,
    refetch: refetchPosOverview
  } = useQuery({
    queryKey: ['ta-dashboard-positions', filterParams],
    queryFn: () => getPositionActivityOverview(filterParams),
    enabled: activeTab === 'positions'
  });
  const positionOverview = Array.isArray(posOverviewRes?.data) ? posOverviewRes.data : [];

  const {
    data: plannedVsActualRes,
    isLoading: loadingPlannedVsActual,
    refetch: refetchPlannedVsActual
  } = useQuery({
    queryKey: ['ta-dashboard-planned-vs-actual', filterParams],
    queryFn: () => getPlannedVsActualOverview(filterParams),
    enabled: activeTab === 'plannedVsActual'
  });
  const plannedVsActualList = Array.isArray(plannedVsActualRes?.data) ? plannedVsActualRes.data : [];

  const {
    data: setsOverviewRes,
    isLoading: loadingSetsOverview,
    refetch: refetchSetsOverview
  } = useQuery({
    queryKey: ['ta-dashboard-sets', filterParams],
    queryFn: () => getSubmissionSetsOverview(filterParams),
    enabled: activeTab === 'submissionSets'
  });
  const submissionSetsList = Array.isArray(setsOverviewRes?.data) ? setsOverviewRes.data : [];

  const {
    data: trendsRes,
    isLoading: loadingTrends,
    refetch: refetchTrends
  } = useQuery({
    queryKey: ['ta-dashboard-trends', filterParams],
    queryFn: () => getTrendsOverview(filterParams),
    enabled: activeTab === 'analytics'
  });
  const trends = {
    dailyActivityTrend: Array.isArray(trendsRes?.data?.dailyActivityTrend) ? trendsRes.data.dailyActivityTrend : [],
    workTypeDist: Array.isArray(trendsRes?.data?.workTypeDist) ? trendsRes.data.workTypeDist : [],
    workloadByTa: Array.isArray(trendsRes?.data?.workloadByTa) ? trendsRes.data.workloadByTa : [],
    funnel: trendsRes?.data?.funnel || {}
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleRefreshAll = () => {
    refetchSummary();
    if (activeTab === 'daily') refetchDailyAct();
    if (activeTab === 'productivity') refetchProductivity();
    if (activeTab === 'positions') refetchPosOverview();
    if (activeTab === 'plannedVsActual') refetchPlannedVsActual();
    if (activeTab === 'submissionSets') refetchSetsOverview();
    if (activeTab === 'analytics') refetchTrends();
  };

  return (
    <div className="tad-page">
      {/* Top Header */}
      <div className="tad-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="tad-title">
              <LayoutDashboard className="text-forest-700" size={24} />
              TA Activity Dashboard
            </h1>
            <span className="tad-readonly-badge" title="Read-only leadership overview. Does not modify records.">
              <ShieldCheck size={13} />
              Read-Only
            </span>
          </div>
          <p className="tad-subtitle">
            Consolidated operational analytics for TA Leadership: daily LinkedIn sourcing, Add-on searches,
            Follow-up reach, workload allocation, CV submission sets, and candidate pipeline quality.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={handleRefreshAll}
            title="Refresh dashboard data"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="tad-filter-bar">
        <div className="tad-filter-row">
          {/* Date Range */}
          <div className="tad-filter-item">
            <span className="tad-filter-label">From Date:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="tad-filter-input"
            />
          </div>

          <div className="tad-filter-item">
            <span className="tad-filter-label">To Date:</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="tad-filter-input"
            />
          </div>

          {/* TA Selector */}
          <div className="tad-filter-item">
            <span className="tad-filter-label">TA:</span>
            <select
              value={selectedTa}
              onChange={e => setSelectedTa(e.target.value)}
              className="tad-filter-select"
            >
              <option value="">All TAs</option>
              {tasList.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Client Selector */}
          <div className="tad-filter-item">
            <span className="tad-filter-label">Client:</span>
            <select
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
              className="tad-filter-select"
            >
              <option value="">All Clients</option>
              {clientsList.map(c => (
                <option key={c._id} value={c._id}>{c.clientName}</option>
              ))}
            </select>
          </div>

          {/* Position Selector */}
          <div className="tad-filter-item">
            <span className="tad-filter-label">Position:</span>
            <select
              value={selectedPosition}
              onChange={e => setSelectedPosition(e.target.value)}
              className="tad-filter-select"
            >
              <option value="">All Positions</option>
              {positionsList.map(p => (
                <option key={p._id} value={p._id}>
                  {p.jobOrderId} — {p.position}
                </option>
              ))}
            </select>
          </div>

          {/* Work Type Selector */}
          <div className="tad-filter-item">
            <span className="tad-filter-label">Work Type:</span>
            <select
              value={selectedWorkType}
              onChange={e => setSelectedWorkType(e.target.value)}
              className="tad-filter-select"
            >
              <option value="">All Work Types</option>
              <option value="100% Work">100% Work</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Add-on">Add-on</option>
            </select>
          </div>

          {/* Assignment Status Selector */}
          <div className="tad-filter-item">
            <span className="tad-filter-label">Status:</span>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="tad-filter-select"
            >
              <option value="">All Statuses</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Missed">Missed</option>
            </select>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="tad-reset-btn"
              onClick={resetFilters}
              title="Clear all active filters"
            >
              <X size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* 3 Summary Cards Groups */}
      <div className="tad-summary-grid">
        {/* Card 1: Workload */}
        <div className="tad-summary-card">
          <div className="tad-summary-header">
            <span className="tad-summary-category">Workload Allocation</span>
            <span className="tad-summary-rate">{summary.workload.completionRate}% Done</span>
          </div>
          <div className="tad-summary-main">
            <span className="tad-summary-total">{summary.workload.totalAssignments}</span>
            <span className="tad-summary-total-label">Total Assignments</span>
          </div>
          {/* Progress bar */}
          <div className="tad-progress-track">
            <div
              className="tad-progress-bar bg-emerald-500"
              style={{ width: `${Math.min(100, summary.workload.completionRate)}%` }}
            />
          </div>
          <div className="tad-submetrics-grid">
            <div className="tad-submetric">
              <span className="tad-submetric-val text-emerald-700">{summary.workload.completedAssignments}</span>
              <span className="tad-submetric-label">Completed</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-blue-700">{summary.workload.inProgressAssignments}</span>
              <span className="tad-submetric-label">In Progress</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-red-600">{summary.workload.missedAssignments}</span>
              <span className="tad-submetric-label">Missed</span>
            </div>
          </div>
        </div>

        {/* Card 2: Sourcing Activity */}
        <div className="tad-summary-card">
          <div className="tad-summary-header">
            <span className="tad-summary-category">Sourcing Activity</span>
            <span className="tad-summary-tag">New vs Add-on vs Follow-up</span>
          </div>
          <div className="tad-summary-main">
            <span className="tad-summary-total">
              {summary.sourcing.profilesSearched + summary.sourcing.additionalProfilesSourced}
            </span>
            <span className="tad-summary-total-label">Total Profiles Sourced</span>
          </div>
          <div className="tad-submetrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-blue-700">{summary.sourcing.profilesSearched}</span>
              <span className="tad-submetric-label" title="From 100% Work primary LinkedIn searches">100% Sourced</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-purple-700">{summary.sourcing.additionalProfilesSourced}</span>
              <span className="tad-submetric-label" title="Additional new sourcing beyond primary search">Add-on</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-amber-700">{summary.sourcing.followUpActivities}</span>
              <span className="tad-submetric-label" title="Follow-up contacts on previously sourced pool">Follow-ups</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-emerald-700">{summary.sourcing.responsesReceived}</span>
              <span className="tad-submetric-label" title="Candidate responses received">Replies</span>
            </div>
          </div>
        </div>

        {/* Card 3: Recruitment Output */}
        <div className="tad-summary-card">
          <div className="tad-summary-header">
            <span className="tad-summary-category">Recruitment Output & Quality</span>
            <span className="tad-summary-tag">Submissions & Shortlists</span>
          </div>
          <div className="tad-summary-main">
            <span className="tad-summary-total text-emerald-800">{summary.recruitmentOutput.candidateSubmissions}</span>
            <span className="tad-summary-total-label">Candidate Submissions</span>
          </div>
          <div className="tad-submetrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-slate-800">{summary.recruitmentOutput.uniqueCandidates}</span>
              <span className="tad-submetric-label" title="Deduplicated distinct candidate profiles">Unique Cand.</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-indigo-700">{summary.recruitmentOutput.goodCvs}</span>
              <span className="tad-submetric-label" title="Rated Good CVs">Good CVs</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-emerald-700">{summary.recruitmentOutput.clientShortlisted}</span>
              <span className="tad-submetric-label" title="Shortlisted by client">Client Short.</span>
            </div>
            <div className="tad-submetric">
              <span className="tad-submetric-val text-red-600">{summary.recruitmentOutput.withdrawn}</span>
              <span className="tad-submetric-label" title="Withdrawn candidates">Withdrawn</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="tad-tab-bar">
        <button
          type="button"
          className={`tad-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveTab('daily')}
        >
          Daily TA Activity Overview
        </button>
        <button
          type="button"
          className={`tad-tab-btn ${activeTab === 'productivity' ? 'active' : ''}`}
          onClick={() => setActiveTab('productivity')}
        >
          TA Productivity Overview
        </button>
        <button
          type="button"
          className={`tad-tab-btn ${activeTab === 'positions' ? 'active' : ''}`}
          onClick={() => setActiveTab('positions')}
        >
          Position-Level Overview
        </button>
        <button
          type="button"
          className={`tad-tab-btn ${activeTab === 'plannedVsActual' ? 'active' : ''}`}
          onClick={() => setActiveTab('plannedVsActual')}
        >
          Planned vs Actual Work
        </button>
        <button
          type="button"
          className={`tad-tab-btn ${activeTab === 'submissionSets' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissionSets')}
        >
          Submission Set Overview
        </button>
        <button
          type="button"
          className={`tad-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Visual Analytics & Trends
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* 1. Daily Activity Overview */}
      {activeTab === 'daily' && (
        <div className="tad-section-card">
          <div className="tad-section-header">
            <div>
              <h3 className="tad-section-title">Daily Activity Records ({dailyActivities.length})</h3>
              <p className="tad-section-subtitle">Individual daily work entries logged by TAs with target vs actual comparison</p>
            </div>
          </div>

          <div className="tad-table-wrap">
            {loadingDailyAct ? (
              <div className="tad-loading">Loading daily activities...</div>
            ) : dailyActivities.length === 0 ? (
              <div className="tad-empty">No daily activities found matching selected filters.</div>
            ) : (
              <table className="tad-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('activityDate')} className="cursor-pointer select-none">
                      <div className="flex items-center gap-1">
                        Date <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('ta')} className="cursor-pointer select-none">
                      <div className="flex items-center gap-1">
                        TA <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th>Position / Client</th>
                    <th onClick={() => handleSort('workType')} className="cursor-pointer select-none">
                      <div className="flex items-center gap-1">
                        Work Type <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'right' }}>Planned Target</th>
                    <th style={{ textAlign: 'right' }}>Actual Searches</th>
                    <th style={{ textAlign: 'right' }}>Follow-ups</th>
                    <th style={{ textAlign: 'right' }}>Responses</th>
                    <th style={{ textAlign: 'right' }}>CVs Shared</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyActivities.map(act => {
                    const asg = act.assignment;
                    return (
                      <tr key={act._id}>
                        <td>
                          <strong>{act.activityDateStr}</strong>
                        </td>
                        <td>
                          <span className="tad-ta-pill">{act.ta?.name || '—'}</span>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-900">{act.position?.jobOrderId}</span>
                            <span className="text-xs text-gray-500">
                              {act.position?.position} ({act.position?.client?.clientName})
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`tad-worktype-badge tad-worktype--${(act.workType || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`}>
                            {act.workType}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {asg?.plannedTarget?.targetProfiles
                            ? `${asg.plannedTarget.targetProfiles} profiles`
                            : (asg?.plannedTarget?.summary || '—')}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <strong>
                            {act.workType === '100% Work' ? act.profilesSearched : (act.workType === 'Add-on' ? act.additionalProfilesSourced : 0)}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {act.candidatesFollowedUp || '0'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {act.responsesReceived || '0'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="tad-count-pill">{act.cvsShared || 0}</span>
                        </td>
                        <td>
                          <span className={`tad-status-pill tad-status--${(act.completionStatus || 'completed').replace(/\s+/g, '').toLowerCase()}`}>
                            {act.completionStatus || 'Completed'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setViewActivityModal(act)}
                            title="View activity details"
                          >
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 2. TA Productivity Overview */}
      {activeTab === 'productivity' && (
        <div className="tad-section-card">
          <div className="tad-section-header">
            <div>
              <h3 className="tad-section-title">TA Performance Comparison</h3>
              <p className="tad-section-subtitle">
                Individual productivity benchmarks considering assigned workload, searches, follow-ups, and shortlisted CVs.
              </p>
            </div>
          </div>

          <div className="tad-table-wrap">
            {loadingProductivity ? (
              <div className="tad-loading">Loading TA productivity...</div>
            ) : productivityList.length === 0 ? (
              <div className="tad-empty">No TA productivity data available for selected filters.</div>
            ) : (
              <table className="tad-table">
                <thead>
                  <tr>
                    <th>TA Name</th>
                    <th style={{ textAlign: 'right' }}>Assigned</th>
                    <th style={{ textAlign: 'right' }}>Completed</th>
                    <th style={{ textAlign: 'right' }}>Missed</th>
                    <th style={{ textAlign: 'right' }}>Completion %</th>
                    <th style={{ textAlign: 'right' }}>100% Searches</th>
                    <th style={{ textAlign: 'right' }}>Add-on Profiles</th>
                    <th style={{ textAlign: 'right' }}>Follow-ups</th>
                    <th style={{ textAlign: 'right' }}>Replies</th>
                    <th style={{ textAlign: 'right' }}>CVs Shared</th>
                    <th style={{ textAlign: 'right' }}>Good CVs</th>
                    <th style={{ textAlign: 'right' }}>Client Shortlisted</th>
                  </tr>
                </thead>
                <tbody>
                  {productivityList.map(item => (
                    <tr key={item._id}>
                      <td>
                        <strong className="text-gray-900">{item.name}</strong>
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.workload.totalAssigned}</td>
                      <td style={{ textAlign: 'right' }} className="text-emerald-700 font-semibold">{item.workload.completed}</td>
                      <td style={{ textAlign: 'right' }} className="text-red-600">{item.workload.missed}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="tad-completion-badge">{item.workload.completionRate}%</span>
                      </td>
                      <td style={{ textAlign: 'right' }}><strong>{item.sourcing.profilesSearched}</strong></td>
                      <td style={{ textAlign: 'right' }}>{item.sourcing.additionalProfiles}</td>
                      <td style={{ textAlign: 'right' }}>{item.sourcing.followUps}</td>
                      <td style={{ textAlign: 'right' }}>{item.sourcing.responsesReceived}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="tad-count-pill">{item.recruitment.cvsShared}</span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="text-indigo-700 font-semibold">{item.recruitment.goodCvs}</td>
                      <td style={{ textAlign: 'right' }} className="text-emerald-700 font-bold">{item.recruitment.clientShortlisted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 3. Position-Level Activity Overview */}
      {activeTab === 'positions' && (
        <div className="tad-section-card">
          <div className="tad-section-header">
            <div>
              <h3 className="tad-section-title">Position-Level Performance Overview</h3>
              <p className="tad-section-subtitle">
                Consolidated activity metrics by requirement across all assigned TAs and recruitment rounds.
              </p>
            </div>
          </div>

          <div className="tad-table-wrap">
            {loadingPosOverview ? (
              <div className="tad-loading">Loading position overview...</div>
            ) : positionOverview.length === 0 ? (
              <div className="tad-empty">No positions found matching selected filters.</div>
            ) : (
              <table className="tad-table">
                <thead>
                  <tr>
                    <th>Position / Job Order</th>
                    <th>Client</th>
                    <th>Assigned TAs</th>
                    <th style={{ textAlign: 'right' }}>Assignments</th>
                    <th style={{ textAlign: 'right' }}>Searches</th>
                    <th style={{ textAlign: 'right' }}>Add-on</th>
                    <th style={{ textAlign: 'right' }}>Follow-ups</th>
                    <th style={{ textAlign: 'right' }}>CVs Shared</th>
                    <th style={{ textAlign: 'right' }}>Unique Cand.</th>
                    <th style={{ textAlign: 'right' }}>Good CVs</th>
                    <th style={{ textAlign: 'right' }}>Client Short.</th>
                    <th>Latest Activity</th>
                    <th style={{ textAlign: 'center' }}>History</th>
                  </tr>
                </thead>
                <tbody>
                  {positionOverview.map(pos => (
                    <tr key={pos._id}>
                      <td>
                        <Link to={`/positions/${pos._id}`} className="font-semibold text-forest-700 hover:underline">
                          {pos.jobOrderId}
                        </Link>
                        <div className="text-xs text-gray-500">{pos.position}</div>
                      </td>
                      <td>
                        <span className="text-sm text-gray-700">{pos.client}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
                          {pos.assignedTAs.length === 0 ? (
                            <span className="text-xs text-gray-400">Unassigned</span>
                          ) : (
                            pos.assignedTAs.map(t => (
                              <span key={t._id} className="tad-ta-pill text-xs">
                                {t.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{pos.totalAssignments}</td>
                      <td style={{ textAlign: 'right' }}>{pos.profilesSearched}</td>
                      <td style={{ textAlign: 'right' }}>{pos.additionalProfiles}</td>
                      <td style={{ textAlign: 'right' }}>{pos.followUps}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="tad-count-pill">{pos.cvsShared}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}><strong>{pos.uniqueCandidates}</strong></td>
                      <td style={{ textAlign: 'right' }} className="text-indigo-700 font-semibold">{pos.goodCvs}</td>
                      <td style={{ textAlign: 'right' }} className="text-emerald-700 font-bold">{pos.clientShortlisted}</td>
                      <td>
                        <span className="text-xs text-gray-500">{formatShortDate(pos.latestActivityDate)}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setViewPositionHistoryModal({ positionId: pos._id, jobOrderId: pos.jobOrderId })}
                          title="View complete historical work & daily activity"
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 4. Planned vs Actual Work */}
      {activeTab === 'plannedVsActual' && (
        <div className="tad-section-card">
          <div className="tad-section-header">
            <div>
              <h3 className="tad-section-title">Planned vs Actual Work Matrix</h3>
              <p className="tad-section-subtitle">
                Target vs completed output per assignment. Assignments remain separate from daily activity and are not auto-completed.
              </p>
            </div>
          </div>

          <div className="tad-table-wrap">
            {loadingPlannedVsActual ? (
              <div className="tad-loading">Loading planned vs actual matrix...</div>
            ) : plannedVsActualList.length === 0 ? (
              <div className="tad-empty">No planned assignments found.</div>
            ) : (
              <table className="tad-table">
                <thead>
                  <tr>
                    <th>Assignment ID</th>
                    <th>Date</th>
                    <th>TA</th>
                    <th>Position</th>
                    <th>Work Type</th>
                    <th>Planned Target</th>
                    <th>Actual Completed</th>
                    <th>Remaining Target</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plannedVsActualList.map(item => (
                    <tr key={item._id}>
                      <td>
                        <span className="tad-code-pill">{item.assignmentId}</span>
                      </td>
                      <td>{item.assignedDateStr}</td>
                      <td>
                        <span className="tad-ta-pill">{item.ta?.name || '—'}</span>
                      </td>
                      <td>
                        <span className="font-semibold">{item.jobOrderId}</span>
                        <div className="text-xs text-gray-500">{item.clientName}</div>
                      </td>
                      <td>
                        <span className={`tad-worktype-badge tad-worktype--${(item.workType || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`}>
                          {item.workType}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs">
                          {item.planned.targetProfiles > 0 && <div>{item.planned.targetProfiles} Profiles</div>}
                          {item.planned.targetCvsShared > 0 && <div>{item.planned.targetCvsShared} CVs Shared</div>}
                          {item.planned.targetFollowUps > 0 && <div>{item.planned.targetFollowUps} Follow-ups</div>}
                          {item.planned.summary && <div className="text-gray-400 italic">{item.planned.summary}</div>}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs font-semibold text-emerald-800">
                          {item.actual.profilesSearched > 0 && <div>{item.actual.profilesSearched} Profiles Searched</div>}
                          {item.actual.additionalProfiles > 0 && <div>{item.actual.additionalProfiles} Add-on Profiles</div>}
                          {item.actual.cvsShared > 0 && <div>{item.actual.cvsShared} CVs Shared</div>}
                          {item.actual.followUps > 0 && <div>{item.actual.followUps} Follow-ups</div>}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs text-amber-800 font-medium">
                          {item.remaining.profiles > 0 && <div>{item.remaining.profiles} Profiles left</div>}
                          {item.remaining.cvs > 0 && <div>{item.remaining.cvs} CVs left</div>}
                          {item.remaining.followUps > 0 && <div>{item.remaining.followUps} Follow-ups left</div>}
                          {item.remaining.profiles === 0 && item.remaining.cvs === 0 && item.remaining.followUps === 0 && (
                            <span className="text-emerald-600 font-bold">✓ Target Reached</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`tad-status-pill tad-status--${(item.status || 'assigned').replace(/\s+/g, '').toLowerCase()}`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 5. Submission Sets Overview */}
      {activeTab === 'submissionSets' && (
        <div className="tad-section-card">
          <div className="tad-section-header">
            <div>
              <h3 className="tad-section-title">Submission Sets Overview ({submissionSetsList.length})</h3>
              <p className="tad-section-subtitle">
                CV batches transmitted to clients with independent transmission dates and quality results.
              </p>
            </div>
          </div>

          <div className="tad-table-wrap">
            {loadingSetsOverview ? (
              <div className="tad-loading">Loading submission sets...</div>
            ) : submissionSetsList.length === 0 ? (
              <div className="tad-empty">No submission sets found matching selected filters.</div>
            ) : (
              <table className="tad-table">
                <thead>
                  <tr>
                    <th>Set Number</th>
                    <th>Position / Client</th>
                    <th>Date Sent to Client</th>
                    <th>System Uploaded At</th>
                    <th>Uploaded By</th>
                    <th style={{ textAlign: 'right' }}>Total CVs</th>
                    <th style={{ textAlign: 'right' }}>Unique Candidates</th>
                    <th style={{ textAlign: 'right' }}>Good CVs</th>
                    <th style={{ textAlign: 'right' }}>Client Shortlisted</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionSetsList.map(set => (
                    <tr key={set._id}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="tad-set-badge">{set.setNumber}</span>
                          <span className="tad-code-pill text-xs">{set.submissionSetId}</span>
                        </div>
                      </td>
                      <td>
                        <span className="font-semibold text-gray-900">{set.jobOrderId}</span>
                        <div className="text-xs text-gray-500">
                          {set.position?.position} ({set.position?.client?.clientName})
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1 text-xs font-semibold text-forest-700">
                          <Calendar size={12} />
                          {formatDate(set.sentToClientAt)}
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-gray-500">{formatDate(set.uploadedAt)}</span>
                      </td>
                      <td>
                        <span className="tad-ta-pill">{set.uploadedBy?.name || '—'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="tad-count-pill">{set.cvCount}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}><strong>{set.uniqueCandidateCount}</strong></td>
                      <td style={{ textAlign: 'right' }} className="text-indigo-700 font-semibold">{set.goodCvs}</td>
                      <td style={{ textAlign: 'right' }} className="text-emerald-700 font-bold">{set.clientShortlisted}</td>
                      <td style={{ textAlign: 'center' }}>
                        <Link
                          to={`/submission-sets?position=${set.position?._id || ''}`}
                          className="btn-secondary btn-sm inline-flex items-center gap-1"
                        >
                          View <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 6. Visual Analytics & Charts */}
      {activeTab === 'analytics' && (
        <div className="tad-charts-grid">
          {/* Chart 1: Daily Sourcing Trend */}
          <div className="tad-chart-card">
            <h4 className="tad-chart-title">Daily Sourcing Trend (Profiles Searched Over Time)</h4>
            <div className="tad-chart-box">
              {trends.dailyActivityTrend.length === 0 ? (
                <div className="tad-chart-empty">No trend data for selected range</div>
              ) : (
                <SimpleBarChart
                  data={trends.dailyActivityTrend.map(d => ({
                    label: d._id,
                    value: d.profilesSearched + d.additionalProfiles,
                    secondary: d.profilesSearched,
                    tertiary: d.additionalProfiles
                  }))}
                  valueLabel="Profiles"
                  color="#2563eb"
                />
              )}
            </div>
            <div className="tad-chart-legend">
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Total Profiles (100% + Add-on)
              </span>
            </div>
          </div>

          {/* Chart 2: Daily CV Sharing Trend */}
          <div className="tad-chart-card">
            <h4 className="tad-chart-title">Daily CVs Shared Trend</h4>
            <div className="tad-chart-box">
              {trends.dailyActivityTrend.length === 0 ? (
                <div className="tad-chart-empty">No CV sharing data for selected range</div>
              ) : (
                <SimpleBarChart
                  data={trends.dailyActivityTrend.map(d => ({
                    label: d._id,
                    value: d.cvsShared
                  }))}
                  valueLabel="CVs Shared"
                  color="#16a34a"
                />
              )}
            </div>
            <div className="tad-chart-legend">
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> Daily CVs Shared
              </span>
            </div>
          </div>

          {/* Chart 3: TA Workload Distribution */}
          <div className="tad-chart-card">
            <h4 className="tad-chart-title">TA Workload Distribution (Assignments per TA)</h4>
            <div className="tad-chart-box">
              {trends.workloadByTa.length === 0 ? (
                <div className="tad-chart-empty">No workload data</div>
              ) : (
                <SimpleBarChart
                  data={trends.workloadByTa.map(t => ({
                    label: t.name,
                    value: t.total,
                    secondary: t.completed
                  }))}
                  valueLabel="Assignments"
                  color="#8b5cf6"
                />
              )}
            </div>
            <div className="tad-chart-legend">
              <span className="flex items-center gap-1 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" /> Total Assigned Work
              </span>
            </div>
          </div>

          {/* Chart 4: Candidate Shortlist Conversion Funnel */}
          <div className="tad-chart-card">
            <h4 className="tad-chart-title">Candidate Shortlist Conversion Funnel</h4>
            <div className="tad-funnel-box">
              <FunnelStep
                label="Candidate Submissions"
                count={trends.funnel?.totalSubmissions || 0}
                total={trends.funnel?.totalSubmissions || 1}
                color="#3b82f6"
              />
              <FunnelStep
                label="Internally Shortlisted"
                count={trends.funnel?.internallyShortlisted || 0}
                total={trends.funnel?.totalSubmissions || 1}
                color="#6366f1"
              />
              <FunnelStep
                label="Good CVs Rated"
                count={trends.funnel?.goodCvs || 0}
                total={trends.funnel?.totalSubmissions || 1}
                color="#8b5cf6"
              />
              <FunnelStep
                label="Client Shortlisted"
                count={trends.funnel?.clientShortlisted || 0}
                total={trends.funnel?.totalSubmissions || 1}
                color="#10b981"
              />
              <FunnelStep
                label="Withdrawn Post-Shortlist"
                count={trends.funnel?.withdrawn || 0}
                total={trends.funnel?.totalSubmissions || 1}
                color="#ef4444"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Activity Details */}
      {viewActivityModal && (
        <div className="modal-overlay" onClick={() => setViewActivityModal(null)}>
          <div className="modal tad-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-bold text-gray-900">Activity Details — {viewActivityModal.activityId}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setViewActivityModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-200">
                <div>
                  <span className="text-gray-500 text-xs">Date:</span>
                  <div className="font-semibold">{viewActivityModal.activityDateStr}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">TA:</span>
                  <div className="font-semibold">{viewActivityModal.ta?.name}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Position:</span>
                  <div className="font-semibold">{viewActivityModal.position?.jobOrderId} ({viewActivityModal.position?.position})</div>
                </div>
                <div>
                  <span className="text-gray-500 text-xs">Work Type:</span>
                  <div className="font-semibold">{viewActivityModal.workType}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2">
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Searches</div>
                  <div className="text-lg font-bold">{viewActivityModal.profilesSearched || viewActivityModal.additionalProfilesSourced || 0}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Follow-ups</div>
                  <div className="text-lg font-bold">{viewActivityModal.candidatesFollowedUp || 0}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">CVs Shared</div>
                  <div className="text-lg font-bold text-emerald-700">{viewActivityModal.cvsShared || 0}</div>
                </div>
              </div>

              {viewActivityModal.notes && (
                <div className="mt-2">
                  <span className="text-xs text-gray-500">Notes:</span>
                  <p className="text-gray-700 bg-gray-50 p-2 rounded text-xs">{viewActivityModal.notes}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setViewActivityModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Position Historical Activity (across all dates & TAs) */}
      {viewPositionHistoryModal && (
        <div className="modal-overlay" onClick={() => setViewPositionHistoryModal(null)}>
          <div className="modal tad-modal tad-modal--lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="font-bold text-gray-900">
                Complete Historical Work & Daily Activity — {viewPositionHistoryModal.jobOrderId}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => setViewPositionHistoryModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[75vh]">
              <PositionActivityHistory
                positionId={viewPositionHistoryModal.positionId}
                jobOrderId={viewPositionHistoryModal.jobOrderId}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setViewPositionHistoryModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Lightweight, zero-dependency SVG Bar Chart for trend timelines
 */
function SimpleBarChart({ data = [], valueLabel = '', color = '#2563eb' }) {
  if (data.length === 0) return null;

  const maxVal = Math.max(1, ...data.map(d => d.value));

  return (
    <div className="tad-svg-chart-container">
      <div className="tad-bars-wrapper">
        {data.map((item, i) => {
          const heightPercent = Math.min(100, Math.round((item.value / maxVal) * 100));
          return (
            <div key={i} className="tad-bar-col" title={`${item.label}: ${item.value} ${valueLabel}`}>
              <div className="tad-bar-value">{item.value > 0 ? item.value : ''}</div>
              <div className="tad-bar-track">
                <div
                  className="tad-bar-fill"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: color
                  }}
                />
              </div>
              <div className="tad-bar-label">{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Funnel Step Component
 */
function FunnelStep({ label, count, total, color }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="tad-funnel-step">
      <div className="flex justify-between items-center mb-1 text-xs">
        <span className="font-semibold text-gray-800">{label}</span>
        <span className="text-gray-500 font-mono">
          <strong>{count}</strong> ({percent}%)
        </span>
      </div>
      <div className="tad-funnel-track">
        <div
          className="tad-funnel-fill"
          style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
