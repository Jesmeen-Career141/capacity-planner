import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowRightLeft,
  History,
  X
} from 'lucide-react';
import {
  getAssignments,
  createAssignment,
  updateAssignment,
  reassignAssignment,
  getAssignmentChain
} from '../api/workBoard';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import './TAWorkBoard.css';

function toISODate(d) {
  const date = d || new Date();
  return date.toISOString().split('T')[0];
}

export default function TAWorkBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(toISODate());
  const [filterTa, setFilterTa] = useState('');
  const [filterWorkType, setFilterWorkType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [showChainModal, setShowChainModal] = useState(false);
  const [chainTargetId, setChainTargetId] = useState(null);

  // New assignment form state
  const [newAssignment, setNewAssignment] = useState({
    ta: '',
    position: '',
    workType: '100% Work',
    plannedTarget: {
      targetProfiles: 25,
      targetCvsShared: 3,
      targetFollowUps: 0,
      summary: ''
    },
    notes: '',
    assignedDateStr: toISODate()
  });

  // Reassign form state
  const [reassignData, setReassignData] = useState({
    newTa: '',
    newDateStr: toISODate(),
    reason: '',
    originalStatusAfterReassign: 'Missed'
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

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['workAssignments', selectedDate],
    queryFn: async () => (await getAssignments({ date: selectedDate })).data
  });

  const { data: chainList = [] } = useQuery({
    queryKey: ['assignmentChain', chainTargetId],
    queryFn: async () => (await getAssignmentChain(chainTargetId)).data,
    enabled: Boolean(chainTargetId && showChainModal)
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries(['workAssignments']);
      setShowCreateModal(false);
    },
    onError: (err) => {
      alert(err.response?.data?.error || err.message || 'Failed to create assignment');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAssignment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['workAssignments']);
    },
    onError: (err) => {
      alert(err.response?.data?.error || err.message || 'Failed to update assignment');
    }
  });

  const reassignMutation = useMutation({
    mutationFn: ({ id, data }) => reassignAssignment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['workAssignments']);
      setShowReassignModal(false);
      setReassignTarget(null);
    },
    onError: (err) => {
      alert(err.response?.data?.error || err.message || 'Failed to reassign work');
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

  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safePositions = Array.isArray(positions) ? positions : [];
  const safeTas = Array.isArray(tas) ? tas : [];
  const safeChainList = Array.isArray(chainList) ? chainList : [];

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    return safeAssignments.filter((item) => {
      if (filterTa && String(item.ta?._id || item.ta) !== filterTa) return false;
      if (filterWorkType && item.workType !== filterWorkType) return false;
      if (filterStatus && item.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const jo = (item.jobOrderId || '').toLowerCase();
        const pos = (item.positionName || '').toLowerCase();
        const cli = (item.clientName || '').toLowerCase();
        const id = (item.assignmentId || '').toLowerCase();
        if (!jo.includes(q) && !pos.includes(q) && !cli.includes(q) && !id.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [safeAssignments, filterTa, filterWorkType, filterStatus, searchQuery]);

  // Daily statistics
  const stats = useMemo(() => {
    const total = safeAssignments.length;
    const work100 = safeAssignments.filter((a) => a.workType === '100% Work').length;
    const followUp = safeAssignments.filter((a) => a.workType === 'Follow-up').length;
    const addOn = safeAssignments.filter((a) => a.workType === 'Add-on').length;
    const completed = safeAssignments.filter((a) => a.status === 'Completed').length;
    const inProgress = safeAssignments.filter((a) => a.status === 'In Progress').length;
    const assigned = safeAssignments.filter((a) => a.status === 'Assigned').length;
    const missed = safeAssignments.filter((a) => a.status === 'Missed').length;
    return { total, work100, followUp, addOn, completed, inProgress, assigned, missed };
  }, [safeAssignments]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newAssignment.ta) return alert('Please select a TA');
    if (!newAssignment.position) return alert('Please select a Position');
    createMutation.mutate({
      ...newAssignment,
      assignedDateStr: selectedDate
    });
  };

  const openReassignModal = (assignment) => {
    setReassignTarget(assignment);
    setReassignData({
      newTa: assignment.ta?._id || assignment.ta || '',
      newDateStr: toISODate(new Date(Date.now() + 86400000)), // tomorrow by default
      reason: '',
      originalStatusAfterReassign: 'Missed'
    });
    setShowReassignModal(true);
  };

  const handleReassignSubmit = (e) => {
    e.preventDefault();
    if (!reassignTarget) return;
    reassignMutation.mutate({
      id: reassignTarget._id,
      data: reassignData
    });
  };

  const handleStatusChange = (assignment, newStatus) => {
    updateMutation.mutate({
      id: assignment._id,
      data: { status: newStatus }
    });
  };

  return (
    <div className="wb-container">
      {/* Header */}
      <div className="wb-header">
        <div className="wb-title-group">
          <h1>TA Work Board</h1>
          <p className="wb-subtitle">
            Manage daily assignments and target work types by position and TA
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
              setNewAssignment((prev) => ({
                ...prev,
                assignedDateStr: selectedDate
              }));
              setShowCreateModal(true);
            }}
          >
            <Plus size={16} />
            <span>Assign Work</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="wb-stats-grid">
        <div className="wb-stat-card">
          <span className="wb-stat-label">Total Assigned</span>
          <span className="wb-stat-value">{stats.total}</span>
        </div>
        <div className="wb-stat-card wb-stat-card--100">
          <span className="wb-stat-label">100% Work (Primary)</span>
          <span className="wb-stat-value">{stats.work100}</span>
        </div>
        <div className="wb-stat-card wb-stat-card--followup">
          <span className="wb-stat-label">Follow-up</span>
          <span className="wb-stat-value">{stats.followUp}</span>
        </div>
        <div className="wb-stat-card wb-stat-card--addon">
          <span className="wb-stat-label">Add-on</span>
          <span className="wb-stat-value">{stats.addOn}</span>
        </div>
        <div className="wb-stat-card wb-stat-card--completed">
          <span className="wb-stat-label">Completed / Active</span>
          <span className="wb-stat-value">
            {stats.completed} <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>/ {stats.inProgress + stats.assigned}</span>
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="wb-filters">
        <input
          type="text"
          className="wb-form-input"
          style={{ maxWidth: '240px' }}
          placeholder="Search JO ID, position, client..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="wb-filter-select"
          value={filterTa}
          onChange={(e) => setFilterTa(e.target.value)}
        >
          <option value="">All TAs</option>
          {safeTas.map((ta) => (
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
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Assigned">Assigned</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Missed">Missed</option>
        </select>

        <span style={{ fontSize: '0.8125rem', color: '#6b7280', marginLeft: 'auto' }}>
          Showing <strong>{filteredAssignments.length}</strong> of {safeAssignments.length} assignments
        </span>
      </div>

      {/* Board Table */}
      <div className="wb-table-wrapper">
        <table className="wb-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>TA</th>
              <th>Position & Client</th>
              <th>Work Type</th>
              <th>Planned Target</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                  Loading assignments...
                </td>
              </tr>
            ) : filteredAssignments.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#6b7280' }}>
                  No work assigned for {selectedDate}. Click <strong>+ Assign Work</strong> to assign positions.
                </td>
              </tr>
            ) : (
              filteredAssignments.map((asg) => {
                const workTypeClass =
                  asg.workType === '100% Work'
                    ? 'wb-worktype-badge--100'
                    : asg.workType === 'Follow-up'
                    ? 'wb-worktype-badge--followup'
                    : 'wb-worktype-badge--addon';

                const statusClass =
                  asg.status === 'Completed'
                    ? 'wb-status--completed'
                    : asg.status === 'In Progress'
                    ? 'wb-status--in-progress'
                    : asg.status === 'Missed'
                    ? 'wb-status--missed'
                    : 'wb-status--assigned';

                return (
                  <tr key={asg._id}>
                    <td>
                      <span style={{ fontWeight: 600, color: '#14532d' }}>
                        {asg.assignmentId}
                      </span>
                      {asg.reassignedTo && (
                        <div style={{ fontSize: '0.7rem', color: '#dc2626' }}>
                          ↳ Reassigned
                        </div>
                      )}
                    </td>

                    <td>
                      <span style={{ fontWeight: 600 }}>{asg.ta?.name || 'Unassigned'}</span>
                    </td>

                    <td>
                      <div>
                        <Link
                          to={`/positions/${asg.position?._id || asg.position}`}
                          style={{ fontWeight: 600, color: '#166534', textDecoration: 'none' }}
                        >
                          {asg.jobOrderId}: {asg.positionName}
                        </Link>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {asg.clientName || '—'}
                      </div>
                    </td>

                    <td>
                      <span className={`wb-worktype-badge ${workTypeClass}`}>
                        {asg.workType}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8125rem' }}>
                        {asg.workType === '100% Work' && (
                          <span>
                            Target: <strong>{asg.plannedTarget?.targetProfiles || 0}</strong> Profiles ·{' '}
                            <strong>{asg.plannedTarget?.targetCvsShared || 0}</strong> CVs
                          </span>
                        )}
                        {asg.workType === 'Follow-up' && (
                          <span>
                            Target: <strong>{asg.plannedTarget?.targetFollowUps || 0}</strong> Follow-ups
                          </span>
                        )}
                        {asg.workType === 'Add-on' && (
                          <span>
                            Target: <strong>{asg.plannedTarget?.targetProfiles || 0}</strong> Add-on Profiles
                          </span>
                        )}
                        {asg.plannedTarget?.summary && (
                          <div style={{ fontSize: '0.75rem', color: '#4b5563', marginTop: '2px' }}>
                            {asg.plannedTarget.summary}
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <select
                        className={`wb-status-badge ${statusClass}`}
                        value={asg.status}
                        onChange={(e) => handleStatusChange(asg, e.target.value)}
                        style={{ border: 'none', outline: 'none' }}
                      >
                        <option value="Assigned">Assigned</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="Missed">Missed</option>
                      </select>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="wb-btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => {
                            navigate(
                              `/daily-activity?ta=${asg.ta?._id || asg.ta}&position=${asg.position?._id || asg.position}&assignmentId=${asg._id}&workType=${encodeURIComponent(asg.workType)}&date=${asg.assignedDateStr}`
                            );
                          }}
                          title="Record Actual Daily Activity"
                        >
                          Log Activity
                        </button>

                        <button
                          type="button"
                          className="wb-btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => openReassignModal(asg)}
                          title="Reassign / Reschedule (preserves history)"
                        >
                          <ArrowRightLeft size={13} />
                        </button>

                        {(asg.reassignedTo || asg.reassignedFrom || asg.originalAssignment) && (
                          <button
                            type="button"
                            className="wb-btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#047857' }}
                            onClick={() => {
                              setChainTargetId(asg._id);
                              setShowChainModal(true);
                            }}
                            title="View Reassignment History Chain"
                          >
                            <History size={13} />
                          </button>
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

      {/* Create Assignment Modal */}
      {showCreateModal && (
        <div className="wb-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="wb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wb-modal-header">
              <h3>Assign Work for {selectedDate}</h3>
              <button
                type="button"
                className="wb-modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="wb-modal-body">
                <div className="wb-form-grid-2">
                  <div className="wb-form-group">
                    <label className="wb-form-label">TA *</label>
                    <select
                      className="wb-form-select"
                      required
                      value={newAssignment.ta}
                      onChange={(e) => setNewAssignment({ ...newAssignment, ta: e.target.value })}
                    >
                      <option value="">Select TA...</option>
                      {safeTas.map((t) => (
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
                      value={newAssignment.position}
                      onChange={(e) =>
                        setNewAssignment({ ...newAssignment, position: e.target.value })
                      }
                    >
                      <option value="">Select Position...</option>
                      {safePositions.map((p) => (
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
                    value={newAssignment.workType}
                    onChange={(e) =>
                      setNewAssignment({ ...newAssignment, workType: e.target.value })
                    }
                  >
                    <option value="100% Work">100% Work (Primary LinkedIn Sourcing)</option>
                    <option value="Follow-up">Follow-up (Contact & Revisit Profiles)</option>
                    <option value="Add-on">Add-on (Additional New Sourcing)</option>
                  </select>
                  <small style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
                    {newAssignment.workType === '100% Work' && 'Dedicated focus on primary LinkedIn candidate sourcing.'}
                    {newAssignment.workType === 'Follow-up' && 'Revisiting previous candidates. Follow-up is never counted as new LinkedIn sourcing.'}
                    {newAssignment.workType === 'Add-on' && 'Additional sourcing beyond original batch. Counted as additional sourcing.'}
                  </small>
                </div>

                <div className="wb-form-grid-2">
                  {newAssignment.workType !== 'Follow-up' && (
                    <div className="wb-form-group">
                      <label className="wb-form-label">Target Profiles</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={newAssignment.plannedTarget.targetProfiles}
                        onChange={(e) =>
                          setNewAssignment({
                            ...newAssignment,
                            plannedTarget: {
                              ...newAssignment.plannedTarget,
                              targetProfiles: e.target.value
                            }
                          })
                        }
                      />
                    </div>
                  )}

                  {newAssignment.workType === 'Follow-up' && (
                    <div className="wb-form-group">
                      <label className="wb-form-label">Target Follow-ups</label>
                      <input
                        type="number"
                        className="wb-form-input"
                        min="0"
                        value={newAssignment.plannedTarget.targetFollowUps}
                        onChange={(e) =>
                          setNewAssignment({
                            ...newAssignment,
                            plannedTarget: {
                              ...newAssignment.plannedTarget,
                              targetFollowUps: e.target.value
                            }
                          })
                        }
                      />
                    </div>
                  )}

                  <div className="wb-form-group">
                    <label className="wb-form-label">Target CVs Shared</label>
                    <input
                      type="number"
                      className="wb-form-input"
                      min="0"
                      value={newAssignment.plannedTarget.targetCvsShared}
                      onChange={(e) =>
                        setNewAssignment({
                          ...newAssignment,
                          plannedTarget: {
                            ...newAssignment.plannedTarget,
                            targetCvsShared: e.target.value
                          }
                        })
                      }
                    />
                  </div>
                </div>

                <div className="wb-form-group">
                  <label className="wb-form-label">Planned Work Summary</label>
                  <input
                    type="text"
                    className="wb-form-input"
                    placeholder="e.g., Focus on senior candidates in FinTech / target 5 CVs"
                    value={newAssignment.plannedTarget.summary}
                    onChange={(e) =>
                      setNewAssignment({
                        ...newAssignment,
                        plannedTarget: {
                          ...newAssignment.plannedTarget,
                          summary: e.target.value
                        }
                      })
                    }
                  />
                </div>

                <div className="wb-form-group">
                  <label className="wb-form-label">Notes</label>
                  <textarea
                    className="wb-form-textarea"
                    rows="2"
                    placeholder="Special instructions or context for the TA..."
                    value={newAssignment.notes}
                    onChange={(e) =>
                      setNewAssignment({ ...newAssignment, notes: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="wb-modal-footer">
                <button
                  type="button"
                  className="wb-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wb-btn-primary"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Assigning...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign / Reschedule Modal */}
      {showReassignModal && reassignTarget && (
        <div className="wb-modal-overlay" onClick={() => setShowReassignModal(false)}>
          <div className="wb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wb-modal-header">
              <h3>
                Reassign / Reschedule {reassignTarget.assignmentId}
              </h3>
              <button
                type="button"
                className="wb-modal-close"
                onClick={() => setShowReassignModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReassignSubmit}>
              <div className="wb-modal-body">
                <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '1rem' }}>
                  Preserves original assignment <strong>{reassignTarget.assignmentId}</strong> and creates a linked replacement assignment.
                </p>

                <div className="wb-form-grid-2">
                  <div className="wb-form-group">
                    <label className="wb-form-label">Assign To TA *</label>
                    <select
                      className="wb-form-select"
                      required
                      value={reassignData.newTa}
                      onChange={(e) =>
                        setReassignData({ ...reassignData, newTa: e.target.value })
                      }
                    >
                      {safeTas.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="wb-form-group">
                    <label className="wb-form-label">New Assigned Date *</label>
                    <input
                      type="date"
                      className="wb-form-input"
                      required
                      value={reassignData.newDateStr}
                      onChange={(e) =>
                        setReassignData({ ...reassignData, newDateStr: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="wb-form-group">
                  <label className="wb-form-label">Original Assignment Status</label>
                  <select
                    className="wb-form-select"
                    value={reassignData.originalStatusAfterReassign}
                    onChange={(e) =>
                      setReassignData({
                        ...reassignData,
                        originalStatusAfterReassign: e.target.value
                      })
                    }
                  >
                    <option value="Missed">Missed (Mark previous assignment as missed)</option>
                    <option value="Assigned">Assigned (Keep as assigned)</option>
                    <option value="In Progress">In Progress</option>
                  </select>
                </div>

                <div className="wb-form-group">
                  <label className="wb-form-label">Reason for Reassignment *</label>
                  <textarea
                    className="wb-form-textarea"
                    rows="2"
                    required
                    placeholder="e.g., Urgent priority shift, TA on leave, rescheduled to next day..."
                    value={reassignData.reason}
                    onChange={(e) =>
                      setReassignData({ ...reassignData, reason: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="wb-modal-footer">
                <button
                  type="button"
                  className="wb-btn-secondary"
                  onClick={() => setShowReassignModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wb-btn-primary"
                  disabled={reassignMutation.isPending}
                >
                  {reassignMutation.isPending ? 'Processing...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assignment Chain History Modal */}
      {showChainModal && (
        <div className="wb-modal-overlay" onClick={() => setShowChainModal(false)}>
          <div className="wb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wb-modal-header">
              <h3>Reassignment History Chain</h3>
              <button
                type="button"
                className="wb-modal-close"
                onClick={() => setShowChainModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="wb-modal-body">
              <div className="wb-history-chain">
                {safeChainList.map((node) => (
                  <div key={node._id} className="wb-history-node">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: '#166534' }}>{node.assignmentId}</strong>
                      <span className={`wb-status-badge wb-status--${node.status.toLowerCase().replace(' ', '-')}`}>
                        {node.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8125rem' }}>
                      Date: <strong>{node.assignedDateStr}</strong> · TA: <strong>{node.ta?.name}</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                      Work Type: {node.workType}
                    </div>
                    {node.reassignmentReason && (
                      <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '4px' }}>
                        Reason: {node.reassignmentReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="wb-modal-footer">
              <button
                type="button"
                className="wb-btn-secondary"
                onClick={() => setShowChainModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
