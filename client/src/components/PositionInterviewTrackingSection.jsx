import React, { useState, useEffect } from 'react';
import { getPositionInterviewTracking } from '../api/interviews';
import CandidateInterviewHistoryModal from './CandidateInterviewHistoryModal';
import {
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  UserX,
  History,
  Users,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

const STATUS_BADGE = {
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-gray-100 text-gray-700 border-gray-300',
  'No Show': 'bg-red-50 text-red-700 border-red-200',
  Rescheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  Withdrew: 'bg-rose-50 text-rose-700 border-rose-200'
};

const DECISION_BADGE = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Shortlisted: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Dropped: 'bg-rose-50 text-rose-700 border-rose-200',
  Reschedule: 'bg-purple-50 text-purple-700 border-purple-200'
};

export default function PositionInterviewTrackingSection({ positionId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  useEffect(() => {
    if (!positionId) return;
    setLoading(true);
    getPositionInterviewTracking(positionId)
      .then(res => {
        setData(res);
        setError('');
      })
      .catch(err => {
        console.error('Failed to load position interview tracking:', err);
        setError(err.response?.data?.error || 'Failed to load interview metrics');
      })
      .finally(() => setLoading(false));
  }, [positionId]);

  if (loading) {
    return <div className="py-4 text-xs text-gray-500">Loading interview tracking metrics...</div>;
  }

  if (error) {
    return <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>;
  }

  if (!data) return null;

  const { summary, interviews } = data;

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Client Shortlisted</span>
            <Users size={15} className="text-forest-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-gray-900">
            {summary.totalCandidatesShortlistedByClient || 0}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">Total eligible candidates</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Unique Interviewed</span>
            <UserCheck size={15} className="text-blue-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-gray-900">
            {summary.uniqueCandidatesInterviewed || 0}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            Across {summary.totalInterviewEvents || 0} interview events
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Scheduled</span>
            <Clock size={15} className="text-blue-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-blue-700">{summary.scheduled || 0}</div>
          <div className="mt-1 text-[11px] text-gray-400">Upcoming interview rounds</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Completed</span>
            <CheckCircle size={15} className="text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-700">{summary.completed || 0}</div>
          <div className="mt-1 text-[11px] text-gray-400">Conducted rounds</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Next Round Yield</span>
            <UserCheck size={15} className="text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-700">
            {summary.candidatesShortlistedForNext || 0}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">Shortlisted candidates</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Awaiting Decision</span>
            <Clock size={15} className="text-amber-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-700">
            {summary.candidatesAwaitingDecision || 0}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">Completed without decision</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Rescheduled</span>
            <AlertTriangle size={15} className="text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-amber-700">{summary.rescheduled || 0}</div>
          <div className="mt-1 text-[11px] text-gray-400">Rescheduled events</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Cancelled / No-Show</span>
            <XCircle size={15} className="text-gray-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-gray-700">
            {(summary.cancelled || 0) + (summary.noShows || 0)}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            {summary.cancelled || 0} cancelled, {summary.noShows || 0} no-shows
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Rejected</span>
            <UserX size={15} className="text-red-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-red-700">{summary.candidatesRejected || 0}</div>
          <div className="mt-1 text-[11px] text-gray-400">Unique rejected</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Dropped / Withdrew</span>
            <UserX size={15} className="text-rose-500" />
          </div>
          <div className="mt-2 text-xl font-bold text-rose-700">{summary.candidatesDropped || 0}</div>
          <div className="mt-1 text-[11px] text-gray-400">Unique dropped</div>
        </div>
      </div>

      {/* Position Interviews Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/50">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Position Interview Events</h4>
            <p className="text-xs text-gray-500">
              Showing {interviews?.length || 0} total interview records for this position
            </p>
          </div>
        </div>

        {(!interviews || interviews.length === 0) ? (
          <div className="p-8 text-center text-xs text-gray-500">
            No interview records found for this position.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] font-semibold text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-4">Interview ID</th>
                  <th className="py-2.5 px-4">Candidate</th>
                  <th className="py-2.5 px-4">Round</th>
                  <th className="py-2.5 px-4">Date & Time</th>
                  <th className="py-2.5 px-4">Interviewer</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Decision</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {interviews.map(inv => {
                  const statusClass = STATUS_BADGE[inv.status] || STATUS_BADGE.Scheduled;
                  const decisionClass = DECISION_BADGE[inv.decision] || DECISION_BADGE.Pending;
                  const candidateSubId = inv.candidateSubmission?._id || inv.candidateSubmission;

                  return (
                    <tr key={inv._id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-gray-500">
                        {inv.interviewId}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {inv.candidateName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700 font-medium">
                          {inv.round}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        <div>{inv.interviewDateStr}</div>
                        <div className="text-[11px] text-gray-400">{inv.interviewTime}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {inv.interviewerName || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 font-semibold text-[11px] ${statusClass}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 font-semibold text-[11px] ${decisionClass}`}>
                          {inv.decision}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedCandidateId(candidateSubId)}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-[11px] font-semibold text-forest-700 hover:bg-forest-50 hover:border-forest-200"
                          title="View complete candidate interview journey"
                        >
                          <History size={12} />
                          <span>Journey</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Candidate History Modal */}
      {selectedCandidateId && (
        <CandidateInterviewHistoryModal
          candidateSubmissionId={selectedCandidateId}
          onClose={() => setSelectedCandidateId(null)}
        />
      )}
    </div>
  );
}
