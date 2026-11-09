import React, { useState, useEffect, useCallback } from 'react';
import {
  getPositionAttemptsSummary,
  getAttemptDetails,
  createAttempt,
  updateAttempt
} from '../api/attempts';
import { createPlacement } from '../api/placements';
import { getEligibleCandidates } from '../api/interviews';
import {
  Layers,
  Users,
  Award,
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Eye,
  Briefcase,
  FileText,
  UserCheck,
  UserX,
  X,
  TrendingUp,
  DollarSign
} from 'lucide-react';

const ATTEMPT_STATUS_BADGES = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-blue-50 text-blue-700 border-blue-200',
  'On Hold': 'bg-amber-50 text-amber-700 border-amber-200',
  Cancelled: 'bg-gray-100 text-gray-700 border-gray-300',
  Reopened: 'bg-purple-50 text-purple-700 border-purple-200',
  Abandoned: 'bg-red-50 text-red-700 border-red-200'
};

export default function PositionAttemptHistorySection({ positionId, tas = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [showNewAttemptModal, setShowNewAttemptModal] = useState(false);
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [selectedAttemptForPlacement, setSelectedAttemptForPlacement] = useState(null);
  const [selectedAttemptForDrillDown, setSelectedAttemptForDrillDown] = useState(null);
  const [drillDownData, setDrillDownData] = useState(null);
  const [loadingDrillDown, setLoadingDrillDown] = useState(false);

  // Eligible candidates for placement
  const [eligibleCandidates, setEligibleCandidates] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(false);

  // New attempt form
  const [attemptForm, setAttemptForm] = useState({
    primaryTA: '',
    supportingTAs: [],
    requiredGoodCvTarget: 5,
    reason: '',
    reopenReason: '',
    closeActiveAttemptFirst: true
  });

  // Placement form
  const [placementForm, setPlacementForm] = useState({
    candidateSubmissionId: '',
    placementDate: new Date().toISOString().split('T')[0],
    status: 'Joined',
    salary: '',
    packageDetails: '',
    billingAmount: '',
    notes: '',
    closeAttempt: false,
    closePosition: false
  });

  const loadData = useCallback(() => {
    if (!positionId) return;
    setLoading(true);
    getPositionAttemptsSummary(positionId)
      .then(res => {
        setData(res);
        setError('');
      })
      .catch(err => {
        console.error('Failed to load position attempts summary:', err);
        setError(err.response?.data?.error || 'Failed to load recruitment attempts');
      })
      .finally(() => setLoading(false));
  }, [positionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open New Attempt Modal
  const handleOpenNewAttempt = () => {
    const defaultPrimary = data?.position?.assignee?._id || '';
    setAttemptForm({
      primaryTA: defaultPrimary,
      supportingTAs: [],
      requiredGoodCvTarget: 5,
      reason: '',
      reopenReason: '',
      closeActiveAttemptFirst: true
    });
    setShowNewAttemptModal(true);
  };

  // Submit New Attempt
  const handleCreateAttemptSubmit = async (e) => {
    e.preventDefault();
    try {
      // If there is an existing active attempt and user opted to close it
      const activeAtt = data?.attempts?.find(a => a.status === 'Active');
      if (activeAtt && attemptForm.closeActiveAttemptFirst) {
        await updateAttempt(activeAtt._id, {
          status: 'Completed',
          outcome: 'Reopened',
          notes: `Concluded for new cycle: ${attemptForm.reason || 'New client demand'}`
        });
      }

      await createAttempt({
        positionId,
        primaryTA: attemptForm.primaryTA || null,
        supportingTAs: attemptForm.supportingTAs,
        requiredGoodCvTarget: Number(attemptForm.requiredGoodCvTarget) || 0,
        reason: attemptForm.reason,
        reopenReason: attemptForm.reason
      });

      setShowNewAttemptModal(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create recruitment attempt');
    }
  };

  // Open Placement Modal
  const handleOpenPlacement = (attempt) => {
    setSelectedAttemptForPlacement(attempt);
    setLoadingEligible(true);
    getEligibleCandidates({ positionId })
      .then(res => {
        setEligibleCandidates(res || []);
        setPlacementForm({
          candidateSubmissionId: '',
          placementDate: new Date().toISOString().split('T')[0],
          status: 'Joined',
          salary: '',
          packageDetails: '',
          billingAmount: '',
          notes: '',
          closeAttempt: false,
          closePosition: false
        });
        setShowPlacementModal(true);
      })
      .catch(err => console.error('Error fetching candidates for placement:', err))
      .finally(() => setLoadingEligible(false));
  };

  // Submit Placement
  const handlePlacementSubmit = async (e) => {
    e.preventDefault();
    if (!placementForm.candidateSubmissionId) return alert('Select a candidate to place');

    try {
      await createPlacement({
        candidateSubmissionId: placementForm.candidateSubmissionId,
        positionId,
        attemptId: selectedAttemptForPlacement?._id,
        placementDate: placementForm.placementDate,
        status: placementForm.status,
        salary: Number(placementForm.salary) || 0,
        packageDetails: placementForm.packageDetails,
        billingAmount: Number(placementForm.billingAmount) || 0,
        notes: placementForm.notes,
        closeAttempt: placementForm.closeAttempt,
        closePosition: placementForm.closePosition
      });

      setShowPlacementModal(false);
      setSelectedAttemptForPlacement(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to record placement');
    }
  };

  // Open Drill-down Modal
  const handleOpenDrillDown = (attempt) => {
    setSelectedAttemptForDrillDown(attempt);
    setLoadingDrillDown(true);
    getAttemptDetails(attempt._id)
      .then(res => setDrillDownData(res))
      .catch(err => {
        console.error('Failed to load attempt drilldown:', err);
        alert('Failed to load attempt details');
      })
      .finally(() => setLoadingDrillDown(false));
  };

  if (loading) {
    return <div className="py-4 text-xs text-gray-500">Loading recruitment attempts & placement history...</div>;
  }

  if (error) {
    return <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>;
  }

  if (!data) return null;

  const { cumulative, attempts } = data;
  const activeAttempt = attempts.find(a => a.status === 'Active');

  return (
    <div className="space-y-6">
      {/* Cumulative Position Metrics Bar */}
      <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-forest-100 px-2.5 py-0.5 text-xs font-bold text-forest-800 uppercase tracking-wide">
                Cumulative Position Totals
              </span>
              <span className="text-xs text-gray-500">Across All Recruitment Cycles</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Unique candidates deduplicated across all attempts to prevent double-counting.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenNewAttempt}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-forest-700 transition-colors"
          >
            <Plus size={14} />
            <span>Start New Recruitment Attempt</span>
          </button>
        </div>

        {/* 6 High-Level Cumulative Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Attempts</span>
            <div className="mt-1 text-xl font-extrabold text-gray-900">{cumulative.totalAttempts || 0}</div>
            <div className="text-[10px] text-gray-400">
              {activeAttempt ? `Attempt #${activeAttempt.attemptNumber} Active` : 'No active cycle'}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Unique Candidates</span>
            <div className="mt-1 text-xl font-extrabold text-forest-700">{cumulative.uniqueCandidates || 0}</div>
            <div className="text-[10px] text-gray-400">
              From {cumulative.totalCandidateSubmissions || 0} total submissions
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Submission Sets</span>
            <div className="mt-1 text-xl font-extrabold text-blue-700">{cumulative.totalSubmissionSets || 0}</div>
            <div className="text-[10px] text-gray-400">Batches sent to client</div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Unique Interviewed</span>
            <div className="mt-1 text-xl font-extrabold text-purple-700">{cumulative.uniqueCandidatesInterviewed || 0}</div>
            <div className="text-[10px] text-gray-400">
              Across {cumulative.totalInterviewEvents || 0} interview events
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Placements Made</span>
            <div className="mt-1 text-xl font-extrabold text-emerald-700">{cumulative.totalPlacements || 0}</div>
            <div className="text-[10px] text-gray-400">Successful hires</div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-xs">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Position Status</span>
            <div className="mt-1 text-sm font-bold text-gray-800">{data.position?.status}</div>
            <div className="text-[10px] text-gray-400">Overall JO State</div>
          </div>
        </div>
      </div>

      {/* Recruitment Attempts Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/50">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Recruitment Attempt Cycles</h4>
            <p className="text-xs text-gray-500">
              {attempts.length} cycle{attempts.length > 1 ? 's' : ''} recorded for {data.position?.jobOrderId}
            </p>
          </div>
        </div>

        {attempts.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">
            No recruitment attempts recorded. Start Attempt 01 to begin tracking.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-4">Attempt # & ID</th>
                  <th className="py-2.5 px-4">Period</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Assigned TAs</th>
                  <th className="py-2.5 px-4 text-center">Submissions</th>
                  <th className="py-2.5 px-4 text-center">Unique Cand.</th>
                  <th className="py-2.5 px-4 text-center">Sets</th>
                  <th className="py-2.5 px-4 text-center">Shortlisted</th>
                  <th className="py-2.5 px-4 text-center">Interviews</th>
                  <th className="py-2.5 px-4 text-center">Placements</th>
                  <th className="py-2.5 px-4">Latest Activity</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {attempts.map(att => {
                  const statusClass = ATTEMPT_STATUS_BADGES[att.status] || ATTEMPT_STATUS_BADGES.Active;
                  const startDateStr = att.startDate ? new Date(att.startDate).toLocaleDateString() : '—';
                  const endDateStr = att.endDate ? new Date(att.endDate).toLocaleDateString() : 'Active Now';

                  return (
                    <tr key={att._id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-900">
                          {att.attemptNumberFormatted || `Attempt #${att.attemptNumber}`}
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">
                          {att.attemptId || 'ATT-LEGACY'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        <div>{startDateStr}</div>
                        <div className="text-[11px] text-gray-400">to {endDateStr}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                          {att.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-800">
                          {att.primaryTA?.name || 'Unassigned TA'}
                        </div>
                        {att.supportingTAs?.length > 0 && (
                          <div className="text-[10px] text-gray-500">
                            + {att.supportingTAs.map(s => s.name).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-gray-800">
                        {att.candidateSubmissionsCount || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-forest-700">
                        {att.uniqueCandidatesCount || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-blue-700">
                        {att.submissionSetsCount || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-emerald-700">
                        {att.clientShortlistedCount || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-purple-700">
                        {att.interviewEventsCount || 0}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                          <Award size={11} />
                          {att.placementCount || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-gray-500">
                        {att.latestActivity ? new Date(att.latestActivity).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDrillDown(att)}
                            className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                            title="View attempt details and candidate records"
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPlacement(att)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            title="Record candidate placement for this attempt"
                          >
                            <Award size={12} />
                            <span>Place</span>
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

      {/* ========================================================= */}
      {/* MODAL 1: START NEW RECRUITMENT ATTEMPT */}
      {/* ========================================================= */}
      {showNewAttemptModal && (
        <div className="modal-overlay" onClick={() => setShowNewAttemptModal(false)}>
          <div className="modal max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Start New Recruitment Attempt: {data.position?.jobOrderId}</h3>
              <button className="modal-close-btn" onClick={() => setShowNewAttemptModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateAttemptSubmit} className="space-y-4 p-5">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                <p className="font-semibold">Position: {data.position?.position}</p>
                <p className="mt-0.5 text-blue-700">
                  Creating an attempt represents a distinct recruitment cycle under the same Job Order without overwriting past attempts.
                </p>
              </div>

              {activeAttempt && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
                    <AlertTriangle size={14} /> Active Attempt Detected
                  </div>
                  <p>
                    {activeAttempt.attemptNumberFormatted || `Attempt #${activeAttempt.attemptNumber}`} is currently marked Active.
                  </p>
                  <label className="mt-2 flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attemptForm.closeActiveAttemptFirst}
                      onChange={e => setAttemptForm({ ...attemptForm, closeActiveAttemptFirst: e.target.checked })}
                    />
                    <span>Conclude active attempt first and mark as Reopened cycle</span>
                  </label>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700">Primary Assigned TA *</label>
                <select
                  required
                  value={attemptForm.primaryTA}
                  onChange={e => setAttemptForm({ ...attemptForm, primaryTA: e.target.value })}
                  className="it-input mt-1"
                >
                  <option value="">-- Select Primary TA --</option>
                  {tas.map(ta => (
                    <option key={ta._id} value={ta._id}>{ta.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Supporting TAs</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {tas.filter(t => t._id !== attemptForm.primaryTA).map(ta => {
                    const isSelected = attemptForm.supportingTAs.includes(ta._id);
                    return (
                      <button
                        type="button"
                        key={ta._id}
                        onClick={() => {
                          if (isSelected) {
                            setAttemptForm(prev => ({
                              ...prev,
                              supportingTAs: prev.supportingTAs.filter(id => id !== ta._id)
                            }));
                          } else {
                            setAttemptForm(prev => ({
                              ...prev,
                              supportingTAs: [...prev.supportingTAs, ta._id]
                            }));
                          }
                        }}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'border-forest-600 bg-forest-50 text-forest-800 font-semibold'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{ta.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Good CV Target</label>
                  <input
                    type="number"
                    min="0"
                    value={attemptForm.requiredGoodCvTarget}
                    onChange={e => setAttemptForm({ ...attemptForm, requiredGoodCvTarget: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Reason for Opening Cycle *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Client requested 2nd batch, previous candidate dropped"
                    value={attemptForm.reason}
                    onChange={e => setAttemptForm({ ...attemptForm, reason: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowNewAttemptModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Start Attempt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: RECORD PLACEMENT */}
      {/* ========================================================= */}
      {showPlacementModal && selectedAttemptForPlacement && (
        <div className="modal-overlay" onClick={() => setShowPlacementModal(false)}>
          <div className="modal max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Record Placement: {selectedAttemptForPlacement.attemptNumberFormatted || 'Attempt #' + selectedAttemptForPlacement.attemptNumber}</h3>
              <button className="modal-close-btn" onClick={() => setShowPlacementModal(false)}>×</button>
            </div>

            <form onSubmit={handlePlacementSubmit} className="space-y-4 p-5">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
                <div className="flex items-center gap-1.5 font-bold">
                  <Award size={15} /> Candidate Placement
                </div>
                <p className="mt-0.5 text-emerald-700">
                  Associates the hired candidate with this recruitment attempt. Position and previous attempts remain intact.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Select Hired Candidate *</label>
                {loadingEligible ? (
                  <div className="text-xs text-gray-400">Loading candidates...</div>
                ) : (
                  <select
                    required
                    value={placementForm.candidateSubmissionId}
                    onChange={e => setPlacementForm({ ...placementForm, candidateSubmissionId: e.target.value })}
                    className="it-input mt-1"
                  >
                    <option value="">-- Choose Candidate --</option>
                    {eligibleCandidates.map(c => (
                      <option key={c._id} value={c._id}>
                        {c.candidateName} ({c.originalFileName})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Placement Date *</label>
                  <input
                    type="date"
                    required
                    value={placementForm.placementDate}
                    onChange={e => setPlacementForm({ ...placementForm, placementDate: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Status</label>
                  <select
                    value={placementForm.status}
                    onChange={e => setPlacementForm({ ...placementForm, status: e.target.value })}
                    className="it-input mt-1"
                  >
                    <option value="Joined">Joined</option>
                    <option value="Offer Accepted">Offer Accepted</option>
                    <option value="Probation Passed">Probation Passed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Package / Annual Salary</label>
                  <input
                    type="number"
                    placeholder="e.g. 1800000"
                    value={placementForm.salary}
                    onChange={e => setPlacementForm({ ...placementForm, salary: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Billing Amount (if applicable)</label>
                  <input
                    type="number"
                    placeholder="e.g. 150000"
                    value={placementForm.billingAmount}
                    onChange={e => setPlacementForm({ ...placementForm, billingAmount: e.target.value })}
                    className="it-input mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Package / Offer Details</label>
                <input
                  type="text"
                  placeholder="e.g. Fixed 18L + 2L Variable + Joining Bonus"
                  value={placementForm.packageDetails}
                  onChange={e => setPlacementForm({ ...placementForm, packageDetails: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">Placement Notes</label>
                <textarea
                  rows="2"
                  placeholder="Joining date notes, probation terms, etc."
                  value={placementForm.notes}
                  onChange={e => setPlacementForm({ ...placementForm, notes: e.target.value })}
                  className="it-input mt-1"
                />
              </div>

              <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={placementForm.closeAttempt}
                    onChange={e => setPlacementForm({ ...placementForm, closeAttempt: e.target.checked })}
                  />
                  <span>Mark this recruitment attempt as Completed (Placed)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={placementForm.closePosition}
                    onChange={e => setPlacementForm({ ...placementForm, closePosition: e.target.checked })}
                  />
                  <span>Also update Position Status to 'Placed' (leaves open if unchecked)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowPlacementModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary bg-emerald-600 hover:bg-emerald-700">
                  Confirm Placement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: ATTEMPT DRILL-DOWN */}
      {/* ========================================================= */}
      {selectedAttemptForDrillDown && (
        <div className="modal-overlay" onClick={() => setSelectedAttemptForDrillDown(null)}>
          <div className="modal max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {selectedAttemptForDrillDown.attemptNumberFormatted || `Attempt #${selectedAttemptForDrillDown.attemptNumber}`} ({selectedAttemptForDrillDown.attemptId || 'ATT-LEGACY'})
                </h3>
                <p className="text-xs text-gray-500">
                  Position {data.position?.jobOrderId} • Primary TA: {selectedAttemptForDrillDown.primaryTA?.name || 'Unassigned'}
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedAttemptForDrillDown(null)}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingDrillDown ? (
                <div className="py-12 text-center text-xs text-gray-500">Loading attempt details...</div>
              ) : drillDownData ? (
                <>
                  {/* Summary row */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                      <span className="text-[11px] text-gray-500 uppercase font-semibold">Submissions</span>
                      <div className="text-lg font-bold text-gray-900">{drillDownData.metrics?.totalSubmissions || 0}</div>
                      <div className="text-[10px] text-gray-400">{drillDownData.metrics?.uniqueCandidates || 0} unique</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                      <span className="text-[11px] text-gray-500 uppercase font-semibold">Submission Sets</span>
                      <div className="text-lg font-bold text-blue-700">{drillDownData.metrics?.totalSets || 0}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                      <span className="text-[11px] text-gray-500 uppercase font-semibold">Interviews</span>
                      <div className="text-lg font-bold text-purple-700">{drillDownData.metrics?.totalInterviews || 0}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                      <span className="text-[11px] text-gray-500 uppercase font-semibold">Placements</span>
                      <div className="text-lg font-bold text-emerald-700">{drillDownData.metrics?.totalPlacements || 0}</div>
                    </div>
                  </div>

                  {/* Placements section */}
                  {drillDownData.placements?.length > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-900 mb-2">
                        Placements in this Cycle ({drillDownData.placements.length})
                      </h4>
                      <div className="space-y-2">
                        {drillDownData.placements.map(plc => (
                          <div key={plc._id} className="flex items-center justify-between rounded border border-emerald-200 bg-white p-2.5 text-xs">
                            <div>
                              <span className="font-bold text-gray-900">{plc.candidateName}</span>
                              <div className="text-[11px] text-gray-500">
                                {plc.placementId} • {plc.packageDetails || 'Standard package'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                                {plc.status}
                              </span>
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                {new Date(plc.placementDate).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submission Sets section */}
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">
                      CV Submission Sets ({drillDownData.submissionSets?.length || 0})
                    </h4>
                    {drillDownData.submissionSets?.length === 0 ? (
                      <div className="text-xs text-gray-400 italic">No submission sets uploaded under this cycle.</div>
                    ) : (
                      <div className="space-y-2">
                        {drillDownData.submissionSets.map(set => (
                          <div key={set._id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2.5 text-xs">
                            <div>
                              <span className="font-bold text-gray-900">{set.setNumber}</span>
                              <span className="font-mono text-[11px] text-gray-400 ml-2">({set.submissionSetId})</span>
                              <div className="text-[11px] text-gray-500">
                                Uploaded by: {set.uploadedBy?.name || '—'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold text-forest-700">{set.cvCount} CVs</span>
                              <div className="text-[11px] text-gray-400">
                                Sent: {new Date(set.sentToClientAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Candidates section */}
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">
                      Candidate Submissions ({drillDownData.submissions?.length || 0})
                    </h4>
                    {drillDownData.submissions?.length === 0 ? (
                      <div className="text-xs text-gray-400 italic">No candidates submitted in this cycle.</div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {drillDownData.submissions.map(cand => (
                          <div key={cand._id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2.5 text-xs">
                            <div>
                              <span className="font-bold text-gray-900">
                                {cand.unverifiedLabel || cand.originalFileName}
                              </span>
                              <div className="text-[11px] text-gray-500">
                                Quality: <strong>{cand.qualityRating}</strong> • Sourced: {cand.sourcedBy?.name || '—'}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`rounded px-2 py-0.5 font-semibold text-[11px] ${
                                cand.clientShortlistStatus === 'Shortlisted' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {cand.clientShortlistStatus}
                              </span>
                              {cand.isPlaced && (
                                <span className="ml-1.5 rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                                  Placed
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="modal-footer flex justify-end p-4 border-t border-gray-100">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedAttemptForDrillDown(null)}
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
