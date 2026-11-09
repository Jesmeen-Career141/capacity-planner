import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  Trash2,
  Filter,
  BarChart2,
  List,
  Link as LinkIcon,
  X
} from 'lucide-react';
import {
  getActivities,
  createActivity,
  deleteActivity,
  getPlannedVsActual,
  getSourcingOptions
} from '../api/dailyActivity';
import { getAssignments } from '../api/workBoard';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import './DailyActivity.css';

function toISODate(d) {
  const date = d || new Date();
  return date.toISOString().split('T')[0];
}

export default function DailyActivity() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'pva'
  const [selectedDate, setSelectedDate] = useState(
    searchParams.get('date') || toISODate()
  );
  const [filterTa, setFilterTa] = useState(searchParams.get('ta') || '');
  const [filterWorkType, setFilterWorkType] = useState(
    searchParams.get('workType') || ''
  );
  const [filterPosition, setFilterPosition] = useState(
    searchParams.get('position') || ''
  );

  // Modal State
  const [showLogModal, setShowLogModal] = useState(false);

  // Pre-fill modal if query params exist on mount
  useEffect(() => {
    if (searchParams.get('assignmentId') || searchParams.get('position')) {
      setShowLogModal(true);
    }
  }, [searchParams]);

  const [formData, setFormData] = useState({
    ta: searchParams.get('ta') || '',
    position: searchParams.get('position') || '',
    assignment: searchParams.get('assignmentId') || '',
    activityDateStr: searchParams.get('date') || toISODate(),
    workType: searchParams.get('workType') || '100% Work',
    // 100% Work
    profilesSearched: 25,
    // Follow-up
    candidatesFollowedUp: 5,
    responsesReceived: 2,
    // Add-on
    additionalProfilesSourced: 10,
    // Shared
    cvsShared: 3,
    internallyShortlisted: 2,
    goodCvs: 2,
    optionalCvs: 0,
    originalSourcingActivity: '',
    completionStatus: 'Completed',
    notes: '',
    // Discrepancy
    acknowledgeDiscrepancy: false,
    discrepancyNote: '',
    updateAssignmentStatus: ''
  });

  // Queries
  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await getPositions()).data
  });

  const { data: tas = [] } = useQuery({
    queryKey: ['tas'],
    queryFn: async () => (await getActiveTAs()).data
  });

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['dailyActivities', selectedDate],
    queryFn: async () => (await getActivities({ date: selectedDate })).data
  });

  const { data: pvaData = { comparison: [], totals: {} }, isLoading: loadingPva } = useQuery({
    queryKey: ['plannedVsActual', selectedDate],
    queryFn: async () => (await getPlannedVsActual({ date: selectedDate })).data,
    enabled: activeTab === 'pva'
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['workAssignmentsForDate', selectedDate, formData.ta],
    queryFn: async () =>
      (await getAssignments({ date: selectedDate, ta: formData.ta || undefined })).data,
    enabled: showLogModal
  });

  const { data: sourcingOptions = [] } = useQuery({
    queryKey: ['sourcingOptions', formData.position],
    queryFn: async () => (await getSourcingOptions(formData.position)).data,
    enabled: Boolean(
      formData.position && (formData.workType === 'Follow-up' || formData.workType === 'Add-on')
    )
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createActivity,
    onSuccess: () => {
      queryClient.invalidateQueries(['dailyActivities']);
      queryClient.invalidateQueries(['plannedVsActual']);
      setShowLogModal(false);
      // Reset form
      setFormData((prev) => ({
        ...prev,
        assignment: '',
        notes: '',
        acknowledgeDiscrepancy: false,
        discrepancyNote: ''
      }));
    },
    onError: (err) => {
      const data = err.response?.data;
      if (data?.code === 'FOLLOWUP_CV_MISMATCH') {
        alert(
          `Discrepancy Warning: Follow-up Count (${data.candidatesFollowedUp}) and CVs Shared (${data.cvsShared}) should match. Please review or check "Confirm Discrepancy" with an explanation.`
        );
      } else {
        alert(data?.error || err.message || 'Failed to record daily activity');
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteActivity,
    onSuccess: () => {
      queryClient.invalidateQueries(['dailyActivities']);
      queryClient.invalidateQueries(['plannedVsActual']);
    },
    onError: (err) => {
      alert(err.response?.data?.error || err.message || 'Failed to delete activity');
    }
  });

  // Date controls
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(toISODate(d));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(toISODate(d));
  };

  const handleToday = () => {
    setSelectedDate(toISODate());
  };

  // Check Follow-up discrepancy
  const followUpMismatch = useMemo(() => {
    if (formData.workType !== 'Follow-up') return false;
    const fu = Number(formData.candidatesFollowedUp) || 0;
    const cvs = Number(formData.cvsShared) || 0;
    return fu !== cvs;
  }, [formData.workType, formData.candidatesFollowedUp, formData.cvsShared]);

  // When assignment is selected in form, autofill position, TA, workType
  const handleSelectAssignment = (asgId) => {
    if (!asgId) {
      setFormData((prev) => ({ ...prev, assignment: '' }));
      return;
    }
    const asg = assignments.find((a) => a._id === asgId);
    if (asg) {
      setFormData((prev) => ({
        ...prev,
        assignment: asg._id,
        ta: asg.ta?._id || asg.ta,
        position: asg.position?._id || asg.position,
        workType: asg.workType,
        cvsShared: asg.plannedTarget?.targetCvsShared || prev.cvsShared
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.ta) return alert('Please select a TA');
    if (!formData.position) return alert('Please select a Position');

    if (formData.workType === 'Follow-up' && followUpMismatch && !formData.acknowledgeDiscrepancy) {
      alert(
        'For reporting process, Follow-up Count and CVs Shared should match. If this is intentional, please check "Confirm Discrepancy" and provide an explanation.'
      );
      return;
    }

    createMutation.mutate({
      ...formData,
      activityDateStr: selectedDate
    });
  };

  // Filtered Activity List
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (filterTa && String(act.ta?._id || act.ta) !== filterTa) return false;
      if (filterWorkType && act.workType !== filterWorkType) return false;
      if (filterPosition && String(act.position?._id || act.position) !== filterPosition) {
        return false;
      }
      return true;
    });
  }, [activities, filterTa, filterWorkType, filterPosition]);

  // Daily Totals from Activities
  const dailyTotals = useMemo(() => {
    return {
      totalProfilesSearched: activities.reduce((sum, a) => sum + (a.profilesSearched || 0), 0),
      totalAdditionalProfiles: activities.reduce((sum, a) => sum + (a.additionalProfilesSourced || 0), 0),
      totalFollowUps: activities.reduce((sum, a) => sum + (a.candidatesFollowedUp || 0), 0),
      totalResponses: activities.reduce((sum, a) => sum + (a.responsesReceived || 0), 0),
      totalCvsShared: activities.reduce((sum, a) => sum + (a.cvsShared || 0), 0),
      totalGoodCvs: activities.reduce((sum, a) => sum + (a.goodCvs || 0), 0)
    };
  }, [activities]);

  return (
    <div className="da-container">
      {/* Header */}
      <div className="da-header">
        <div className="da-title-group">
          <h1>Daily Activity Tracking</h1>
          <p className="da-subtitle">
            Record actual work completed, LinkedIn sourcing metrics, and planned vs. actual comparison
          </p>
        </div>

        <div className="wb-header-actions">
          {/* Quick Date Switcher */}
          <div className="wb-date-nav">
            <button
              type="button"
              className="wb-date-nav-btn"
              onClick={handlePrevDay}
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              className="wb-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              className="wb-date-nav-btn"
              onClick={handleNextDay}
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
            <button type="button" className="wb-today-btn" onClick={handleToday}>
              Today
            </button>
          </div>

          <button
            type="button"
            className="wb-btn-primary"
            onClick={() => {
              setFormData((prev) => ({
                ...prev,
                activityDateStr: selectedDate
              }));
              setShowLogModal(true);
            }}
          >
            <Plus size={16} />
            <span>Record Daily Activity</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="da-tabs">
        <button
          type="button"
          className={`da-tab-btn ${activeTab === 'log' ? 'da-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('log')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <List size={16} /> Activity Log ({activities.length})
          </span>
        </button>
        <button
          type="button"
          className={`da-tab-btn ${activeTab === 'pva' ? 'da-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('pva')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            <BarChart2 size={16} /> Planned vs. Actual Work
          </span>
        </button>
      </div>

      {/* Top Totals Bar */}
      <div className="da-totals-grid">
        <div className="da-total-card">
          <span className="da-total-label">New Profiles (100%)</span>
          <span className="da-total-value" style={{ color: '#2563eb' }}>
            {dailyTotals.totalProfilesSearched}
          </span>
        </div>
        <div className="da-total-card">
          <span className="da-total-label">Add-on Sourced</span>
          <span className="da-total-value" style={{ color: '#059669' }}>
            {dailyTotals.totalAdditionalProfiles}
          </span>
        </div>
        <div className="da-total-card">
          <span className="da-total-label">Follow-ups Contacted</span>
          <span className="da-total-value" style={{ color: '#d97706' }}>
            {dailyTotals.totalFollowUps}
          </span>
        </div>
        <div className="da-total-card">
          <span className="da-total-label">Responses Received</span>
          <span className="da-total-value">
            {dailyTotals.totalResponses}
          </span>
        </div>
        <div className="da-total-card">
          <span className="da-total-label">Total CVs Shared</span>
          <span className="da-total-value">
            {dailyTotals.totalCvsShared}
          </span>
        </div>
        <div className="da-total-card">
          <span className="da-total-label">Good CVs</span>
          <span className="da-total-value" style={{ color: '#16a34a' }}>
            {dailyTotals.totalGoodCvs}
          </span>
        </div>
      </div>

      {/* TAB 1: Activity Log */}
      {activeTab === 'log' && (
        <>
          {/* Filters */}
          <div className="wb-filters">
            <select
              className="wb-filter-select"
              value={filterTa}
              onChange={(e) => setFilterTa(e.target.value)}
            >
              <option value="">All TAs</option>
              {tas.map((ta) => (
                <option key={ta._id} value={ta._id}>
                  {ta.name}
                </option>
              ))}
            </select>

            <select
              className="wb-filter-select"
              value={filterWorkType}
              onChange={(e) => setFilterWorkType(e.target.value)}
            >
              <option value="">All Work Types</option>
              <option value="100% Work">100% Work</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Add-on">Add-on</option>
            </select>

            <select
              className="wb-filter-select"
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
            >
              <option value="">All Positions</option>
              {positions.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.jobOrderId}: {p.position}
                </option>
              ))}
            </select>

            <span style={{ fontSize: '0.8125rem', color: '#6b7280', marginLeft: 'auto' }}>
              Showing <strong>{filteredActivities.length}</strong> of {activities.length} activities
            </span>
          </div>

          <div className="wb-table-wrapper">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>Activity ID</th>
                  <th>TA</th>
                  <th>Position</th>
                  <th>Work Type</th>
                  <th>Key Metrics</th>
                  <th>CVs / Quality</th>
                  <th>Status & Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingActivities ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>
                      Loading daily activities...
                    </td>
                  </tr>
                ) : filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                      No activity records logged for {selectedDate}. Click <strong>+ Record Daily Activity</strong> to enter completed work.
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => {
                    const workTypeClass =
                      act.workType === '100% Work'
                        ? 'wb-worktype-badge--100'
                        : act.workType === 'Follow-up'
                        ? 'wb-worktype-badge--followup'
                        : 'wb-worktype-badge--addon';

                    return (
                      <tr key={act._id}>
                        <td>
                          <span style={{ fontWeight: 600, color: '#166534' }}>
                            {act.activityId}
                          </span>
                          {act.assignmentCode && (
                            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                              Linked: {act.assignmentCode}
                            </div>
                          )}
                        </td>

                        <td>
                          <strong>{act.ta?.name || 'Unassigned'}</strong>
                        </td>

                        <td>
                          <div>
                            <Link
                              to={`/positions/${act.position?._id || act.position}`}
                              style={{ fontWeight: 600, color: '#166534', textDecoration: 'none' }}
                            >
                              {act.jobOrderId}: {act.positionName}
                            </Link>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {act.clientName || '—'}
                          </div>
                        </td>

                        <td>
                          <span className={`wb-worktype-badge ${workTypeClass}`}>
                            {act.workType}
                          </span>
                        </td>

                        <td>
                          <div style={{ fontSize: '0.8125rem' }}>
                            {act.workType === '100% Work' && (
                              <span>
                                Profiles Searched: <strong>{act.profilesSearched}</strong>
                              </span>
                            )}
                            {act.workType === 'Follow-up' && (
                              <div>
                                <span>
                                  Followed up: <strong>{act.candidatesFollowedUp}</strong> · Responses:{' '}
                                  <strong>{act.responsesReceived}</strong>
                                </span>
                                {act.hasDiscrepancy && (
                                  <div style={{ color: '#d97706', fontSize: '0.7rem', fontWeight: 600, marginTop: '2px' }}>
                                    ⚠️ Discrepancy: {act.discrepancyNote}
                                  </div>
                                )}
                              </div>
                            )}
                            {act.workType === 'Add-on' && (
                              <span>
                                Additional Sourced: <strong>{act.additionalProfilesSourced}</strong>
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontSize: '0.8125rem' }}>
                            <span>
                              CVs Shared: <strong>{act.cvsShared}</strong>
                            </span>
                            {(act.goodCvs > 0 || act.optionalCvs > 0) && (
                              <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '2px' }}>
                                Good: {act.goodCvs} · Optional: {act.optionalCvs}
                              </div>
                            )}
                          </div>
                        </td>

                        <td>
                          <div>
                            <span
                              className={`wb-status-badge ${
                                act.completionStatus === 'Completed'
                                  ? 'wb-status--completed'
                                  : 'wb-status--in-progress'
                              }`}
                            >
                              {act.completionStatus}
                            </span>
                          </div>
                          {act.notes && (
                            <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '4px' }}>
                              {act.notes}
                            </div>
                          )}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="wb-btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', color: '#dc2626' }}
                            onClick={() => {
                              if (confirm(`Delete activity ${act.activityId}?`)) {
                                deleteMutation.mutate(act._id);
                              }
                            }}
                            title="Delete Activity Record"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 2: Planned vs. Actual Work Comparison */}
      {activeTab === 'pva' && (
        <div className="wb-table-wrapper">
          <table className="da-pva-table">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>TA</th>
                <th>Position</th>
                <th>Work Type</th>
                <th>Planned Target</th>
                <th>Actual Completed Work</th>
                <th>Assignment Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingPva ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    Loading planned vs actual comparison...
                  </td>
                </tr>
              ) : pvaData.comparison.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                    No work assignments found for {selectedDate} to compare against.
                  </td>
                </tr>
              ) : (
                pvaData.comparison.map((item) => {
                  const targetProfiles = item.planned?.targetProfiles || 0;
                  const actualProfiles =
                    item.workType === '100% Work'
                      ? item.actual?.profilesSearched || 0
                      : item.actual?.additionalProfilesSourced || 0;

                  return (
                    <tr key={item._id}>
                      <td>
                        <strong>{item.assignmentId}</strong>
                      </td>

                      <td>
                        <strong>{item.ta?.name || 'Unassigned'}</strong>
                      </td>

                      <td>
                        <div>
                          <strong>{item.jobOrderId}</strong>: {item.positionName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {item.clientName}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`wb-worktype-badge ${
                            item.workType === '100% Work'
                              ? 'wb-worktype-badge--100'
                              : item.workType === 'Follow-up'
                              ? 'wb-worktype-badge--followup'
                              : 'wb-worktype-badge--addon'
                          }`}
                        >
                          {item.workType}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>
                          {item.workType === '100% Work' && (
                            <div>
                              Profiles: <strong>{targetProfiles}</strong> · CVs:{' '}
                              <strong>{item.planned?.targetCvsShared || 0}</strong>
                            </div>
                          )}
                          {item.workType === 'Follow-up' && (
                            <div>
                              Follow-ups: <strong>{item.planned?.targetFollowUps || 0}</strong> · CVs:{' '}
                              <strong>{item.planned?.targetCvsShared || 0}</strong>
                            </div>
                          )}
                          {item.workType === 'Add-on' && (
                            <div>
                              Add-on Profiles: <strong>{targetProfiles}</strong>
                            </div>
                          )}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>
                          {item.workType === '100% Work' && (
                            <div>
                              Profiles Searched: <strong>{item.actual?.profilesSearched || 0}</strong> (
                              {targetProfiles > 0
                                ? `${Math.round(((item.actual?.profilesSearched || 0) / targetProfiles) * 100)}%`
                                : '—'}
                              ) · CVs: <strong>{item.actual?.cvsShared || 0}</strong>
                            </div>
                          )}
                          {item.workType === 'Follow-up' && (
                            <div>
                              Follow-ups Done: <strong>{item.actual?.candidatesFollowedUp || 0}</strong> · CVs:{' '}
                              <strong>{item.actual?.cvsShared || 0}</strong> · Responses:{' '}
                              <strong>{item.actual?.responsesReceived || 0}</strong>
                            </div>
                          )}
                          {item.workType === 'Add-on' && (
                            <div>
                              Add-on Sourced: <strong>{item.actual?.additionalProfilesSourced || 0}</strong> · CVs:{' '}
                              <strong>{item.actual?.cvsShared || 0}</strong>
                            </div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                            Logged across <strong>{item.actual?.activityCount || 0}</strong> activity record(s)
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`wb-status-badge ${
                            item.status === 'Completed'
                              ? 'wb-status--completed'
                              : item.status === 'In Progress'
                              ? 'wb-status--in-progress'
                              : item.status === 'Missed'
                              ? 'wb-status--missed'
                              : 'wb-status--assigned'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Daily Activity Modal */}
      {showLogModal && (
        <div className="wb-modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="wb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wb-modal-header">
              <h3>Record Daily Activity for {selectedDate}</h3>
              <button
                type="button"
                className="wb-modal-close"
                onClick={() => setShowLogModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="wb-modal-body">
                {/* Optional Link to Assignment */}
                {assignments.length > 0 && (
                  <div className="wb-form-group" style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #bbf7d0' }}>
                    <label className="wb-form-label" style={{ color: '#166534' }}>
                      <LinkIcon size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Link to Scheduled Assignment (Optional)
                    </label>
                    <select
                      className="wb-form-select"
                      value={formData.assignment}
                      onChange={(e) => handleSelectAssignment(e.target.value)}
                    >
                      <option value="">— Unlinked Activity —</option>
                      {assignments.map((asg) => (
                        <option key={asg._id} value={asg._id}>
                          {asg.assignmentId}: {asg.ta?.name} · {asg.jobOrderId} ({asg.workType})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="wb-form-grid-2">
                  <div className="wb-form-group">
                    <label className="wb-form-label">TA *</label>
                    <select
                      className="wb-form-select"
                      required
                      value={formData.ta}
                      onChange={(e) => setFormData({ ...formData, ta: e.target.value })}
                    >
                      <option value="">Select TA...</option>
                      {tas.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="wb-form-group">
                    <label className="wb-form-label">Position *</label>
                    <select
                      className="wb-form-select"
                      required
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    >
                      <option value="">Select Position...</option>
                      {positions.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.jobOrderId}: {p.position} ({p.client?.clientName || 'Client'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="wb-form-group">
                  <label className="wb-form-label">Work Type *</label>
                  <select
                    className="wb-form-select"
                    value={formData.workType}
                    onChange={(e) => setFormData({ ...formData, workType: e.target.value })}
                  >
                    <option value="100% Work">100% Work (Primary LinkedIn Sourcing)</option>
                    <option value="Follow-up">Follow-up (Revisit & Contact Candidates)</option>
                    <option value="Add-on">Add-on (Additional Sourcing)</option>
                  </select>
                </div>

                {/* WORK TYPE 1: 100% Work */}
                {formData.workType === '100% Work' && (
                  <div className="wb-form-grid-2">
                    <div className="wb-form-group">
                      <label className="wb-form-label">New LinkedIn Profiles Searched *</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        required
                        min="0"
                        value={formData.profilesSearched}
                        onChange={(e) =>
                          setFormData({ ...formData, profilesSearched: e.target.value })
                        }
                      />
                    </div>

                    <div className="wb-form-group">
                      <label className="wb-form-label">CVs Shared</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={formData.cvsShared}
                        onChange={(e) =>
                          setFormData({ ...formData, cvsShared: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                {/* WORK TYPE 2: Follow-up */}
                {formData.workType === 'Follow-up' && (
                  <div>
                    <div className="wb-form-grid-2">
                      <div className="wb-form-group">
                        <label className="wb-form-label">Candidates Followed Up *</label>
                        <input
                          type="number"
                          className="wb-form-input"
                          required
                          min="0"
                          value={formData.candidatesFollowedUp}
                          onChange={(e) =>
                            setFormData({ ...formData, candidatesFollowedUp: e.target.value })
                          }
                        />
                      </div>

                      <div className="wb-form-group">
                        <label className="wb-form-label">CVs Shared *</label>
                        <input
                          type="number"
                          className="wb-form-input"
                          required
                          min="0"
                          value={formData.cvsShared}
                          onChange={(e) =>
                            setFormData({ ...formData, cvsShared: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="wb-form-group">
                      <label className="wb-form-label">Responses Received</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={formData.responsesReceived}
                        onChange={(e) =>
                          setFormData({ ...formData, responsesReceived: e.target.value })
                        }
                      />
                    </div>

                    {/* Discrepancy Warning Alert */}
                    {followUpMismatch && (
                      <div className="da-alert-warning">
                        <div className="da-alert-title">
                          <AlertTriangle size={16} /> Follow-up Count & CVs Shared Mismatch
                        </div>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                          For reporting, Follow-up Count ({formData.candidatesFollowedUp}) and CVs Shared ({formData.cvsShared}) should match.
                        </p>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={formData.acknowledgeDiscrepancy}
                            onChange={(e) =>
                              setFormData({ ...formData, acknowledgeDiscrepancy: e.target.checked })
                            }
                          />
                          Confirm Discrepancy with Explanation
                        </label>
                        {formData.acknowledgeDiscrepancy && (
                          <input
                            type="text"
                            className="wb-form-input"
                            style={{ marginTop: '0.5rem' }}
                            placeholder="Reason for mismatch (e.g. 2 candidates dropped out, 1 wrong number)..."
                            value={formData.discrepancyNote}
                            onChange={(e) =>
                              setFormData({ ...formData, discrepancyNote: e.target.value })
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* WORK TYPE 3: Add-on */}
                {formData.workType === 'Add-on' && (
                  <div className="wb-form-grid-2">
                    <div className="wb-form-group">
                      <label className="wb-form-label">Additional Profiles Sourced *</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        required
                        min="0"
                        value={formData.additionalProfilesSourced}
                        onChange={(e) =>
                          setFormData({ ...formData, additionalProfilesSourced: e.target.value })
                        }
                      />
                      <small style={{ color: '#6b7280', fontSize: '0.7rem' }}>
                        Counted as additional sourcing, separate from follow-up.
                      </small>
                    </div>

                    <div className="wb-form-group">
                      <label className="wb-form-label">CVs Shared</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={formData.cvsShared}
                        onChange={(e) =>
                          setFormData({ ...formData, cvsShared: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Original Sourcing Link for Follow-up or Add-on */}
                {(formData.workType === 'Follow-up' || formData.workType === 'Add-on') &&
                  sourcingOptions.length > 0 && (
                    <div className="wb-form-group">
                      <label className="wb-form-label">Link to Original Sourcing Search</label>
                      <select
                        className="wb-form-select"
                        value={formData.originalSourcingActivity}
                        onChange={(e) =>
                          setFormData({ ...formData, originalSourcingActivity: e.target.value })
                        }
                      >
                        <option value="">— Select Previous Sourcing Date —</option>
                        {sourcingOptions.map((opt) => (
                          <option key={opt._id} value={opt._id}>
                            {opt.activityId}: {opt.activityDateStr} by {opt.ta?.name} ({opt.workType} · {opt.profilesSearched || opt.additionalProfilesSourced} profiles)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                {/* Shortlist Evaluation Breakdown (For 100% Work & Add-on) */}
                {formData.workType !== 'Follow-up' && (
                  <div className="wb-form-grid-2">
                    <div className="wb-form-group">
                      <label className="wb-form-label">Good CVs</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={formData.goodCvs}
                        onChange={(e) =>
                          setFormData({ ...formData, goodCvs: e.target.value })
                        }
                      />
                    </div>

                    <div className="wb-form-group">
                      <label className="wb-form-label">Optional CVs</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={formData.optionalCvs}
                        onChange={(e) =>
                          setFormData({ ...formData, optionalCvs: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="wb-form-group">
                  <label className="wb-form-label">Completion Status</label>
                  <select
                    className="wb-form-select"
                    value={formData.completionStatus}
                    onChange={(e) =>
                      setFormData({ ...formData, completionStatus: e.target.value })
                    }
                  >
                    <option value="Completed">Completed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>

                {formData.assignment && (
                  <div className="wb-form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: '#166534' }}>
                      <input
                        type="checkbox"
                        checked={formData.updateAssignmentStatus === 'Completed'}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            updateAssignmentStatus: e.target.checked ? 'Completed' : ''
                          })
                        }
                      />
                      Also mark linked assignment as Completed
                    </label>
                  </div>
                )}

                <div className="wb-form-group">
                  <label className="wb-form-label">Notes</label>
                  <textarea
                    className="wb-form-textarea"
                    rows="2"
                    placeholder="Details about searches, candidate responses, keywords..."
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="wb-modal-footer">
                <button
                  type="button"
                  className="wb-btn-secondary"
                  onClick={() => setShowLogModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wb-btn-primary"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Saving...' : 'Save Activity Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
