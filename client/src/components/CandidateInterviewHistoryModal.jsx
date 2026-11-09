import React, { useState, useEffect } from 'react';
import { getCandidateInterviewHistory } from '../api/interviews';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  History,
  X,
  Briefcase,
  ChevronRight
} from 'lucide-react';

const STATUS_BADGE_STYLES = {
  Scheduled: { bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  Completed: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Cancelled: { bg: 'bg-gray-100 text-gray-700 border-gray-300' },
  'No Show': { bg: 'bg-red-50 text-red-700 border-red-200' },
  Rescheduled: { bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  Withdrew: { bg: 'bg-rose-50 text-rose-700 border-rose-200' }
};

const DECISION_BADGE_STYLES = {
  Pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  Shortlisted: { bg: 'bg-green-50 text-green-700 border-green-200' },
  Rejected: { bg: 'bg-red-50 text-red-700 border-red-200' },
  Dropped: { bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  Reschedule: { bg: 'bg-purple-50 text-purple-700 border-purple-200' }
};

export default function CandidateInterviewHistoryModal({
  candidateSubmissionId,
  onClose,
  onScheduleNext = null
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRescheduleId, setExpandedRescheduleId] = useState(null);

  useEffect(() => {
    if (!candidateSubmissionId) return;
    setLoading(true);
    getCandidateInterviewHistory(candidateSubmissionId)
      .then(res => {
        setData(res);
        setError('');
      })
      .catch(err => {
        console.error('Error fetching interview history:', err);
        setError(err.response?.data?.error || 'Failed to load interview history');
      })
      .finally(() => setLoading(false));
  }, [candidateSubmissionId]);

  if (!candidateSubmissionId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-50 text-forest-700">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Candidate Interview Journey</h2>
              <p className="text-xs text-gray-500">Chronological history across all interview rounds</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex h-48 items-center justify-center text-sm text-gray-500">
              Loading interview history...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && data && (
            <div className="space-y-6">
              {/* Candidate Info Card */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      {data.candidate?.unverifiedLabel ||
                        data.candidate?.originalFileName?.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') ||
                        'Candidate'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      File: {data.candidate?.originalFileName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm border border-gray-200">
                      <Briefcase size={12} />
                      {data.candidate?.position?.jobOrderId} — {data.candidate?.position?.position}
                    </span>
                    <span className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      Client Shortlisted
                    </span>
                  </div>
                </div>
              </div>

              {/* Rounds Timeline */}
              <div>
                <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Interview Rounds ({data.interviews?.length || 0})
                </h4>

                {(!data.interviews || data.interviews.length === 0) ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                    No interviews have been scheduled for this candidate yet.
                  </div>
                ) : (
                  <div className="relative pl-6 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-200">
                    {data.interviews.map((inv, idx) => {
                      const isRescheduleOpen = expandedRescheduleId === inv._id;
                      const statusStyle = STATUS_BADGE_STYLES[inv.status] || STATUS_BADGE_STYLES.Scheduled;
                      const decisionStyle = DECISION_BADGE_STYLES[inv.decision] || DECISION_BADGE_STYLES.Pending;

                      return (
                        <div key={inv._id} className="relative mb-8 last:mb-0">
                          {/* Dot marker */}
                          <div className="absolute -left-[27px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-forest-600 shadow-sm" />

                          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                            {/* Round Title & Status */}
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-gray-400">
                                    {inv.interviewId}
                                  </span>
                                  <h5 className="text-base font-bold text-gray-900">{inv.round}</h5>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                                  <span className="inline-flex items-center gap-1 font-medium">
                                    <Calendar size={13} className="text-gray-400" />
                                    {inv.interviewDateStr}
                                  </span>
                                  <span className="inline-flex items-center gap-1 font-medium">
                                    <Clock size={13} className="text-gray-400" />
                                    {inv.interviewTime}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-gray-500">
                                    Mode: <strong className="text-gray-700">{inv.interviewMode}</strong>
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle.bg}`}>
                                  {inv.status}
                                </span>
                                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${decisionStyle.bg}`}>
                                  Decision: {inv.decision}
                                </span>
                              </div>
                            </div>

                            {/* Interviewer & Coordinator Details */}
                            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                              {inv.interviewerName && (
                                <div className="flex items-center gap-1 text-gray-600">
                                  <User size={13} className="text-gray-400" />
                                  <span>Interviewer: </span>
                                  <strong className="text-gray-800">
                                    {inv.interviewerName}
                                    {inv.interviewerDesignation ? ` (${inv.interviewerDesignation})` : ''}
                                  </strong>
                                </div>
                              )}
                              {inv.interviewCoordinator && (
                                <div className="flex items-center gap-1 text-gray-600">
                                  <span>Coordinator: </span>
                                  <strong className="text-gray-800">{inv.interviewCoordinator.name}</strong>
                                </div>
                              )}
                              {inv.meetingLinkOrLocation && (
                                <div className="col-span-full flex items-center gap-1 text-gray-600">
                                  <MapPin size={13} className="text-gray-400" />
                                  <span>Location / Link: </span>
                                  <span className="font-mono text-gray-800 break-all">{inv.meetingLinkOrLocation}</span>
                                </div>
                              )}
                            </div>

                            {/* Feedback & Decision Details */}
                            {(inv.feedback || inv.interviewerComments || inv.candidatePerformanceNotes) && (
                              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-700 space-y-1.5">
                                {inv.feedback && (
                                  <div>
                                    <span className="font-semibold text-gray-900">Feedback: </span>
                                    <span>{inv.feedback}</span>
                                  </div>
                                )}
                                {inv.interviewerComments && (
                                  <div>
                                    <span className="font-semibold text-gray-900">Interviewer Comments: </span>
                                    <span>{inv.interviewerComments}</span>
                                  </div>
                                )}
                                {inv.candidatePerformanceNotes && (
                                  <div>
                                    <span className="font-semibold text-gray-900">Performance Notes: </span>
                                    <span>{inv.candidatePerformanceNotes}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Rescheduling History */}
                            {inv.rescheduleHistory && inv.rescheduleHistory.length > 0 && (
                              <div className="mt-3 border-t border-gray-100 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRescheduleId(isRescheduleOpen ? null : inv._id)}
                                  className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800"
                                >
                                  <History size={12} />
                                  <span>
                                    {inv.rescheduleHistory.length} Reschedule Event{inv.rescheduleHistory.length > 1 ? 's' : ''} recorded
                                  </span>
                                  <ChevronRight
                                    size={13}
                                    className={`transition-transform ${isRescheduleOpen ? 'rotate-90' : ''}`}
                                  />
                                </button>

                                {isRescheduleOpen && (
                                  <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-xs text-gray-700">
                                    {inv.rescheduleHistory.map((rh, rhIdx) => (
                                      <div key={rhIdx} className="border-b border-amber-100 pb-2 last:border-b-0 last:pb-0">
                                        <div className="flex items-center justify-between text-gray-500">
                                          <span>Reschedule #{rhIdx + 1}</span>
                                          <span>{new Date(rh.rescheduledAt).toLocaleString()}</span>
                                        </div>
                                        <div className="mt-0.5">
                                          <span className="text-gray-500 line-through">
                                            {rh.previousDateStr} at {rh.previousTime}
                                          </span>
                                          {' → '}
                                          <span className="font-semibold text-gray-900">
                                            {rh.newDateStr} at {rh.newTime}
                                          </span>
                                        </div>
                                        <div className="mt-1 text-gray-600">
                                          <span className="font-medium text-gray-700">Reason: </span>
                                          {rh.reason}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <div className="text-xs text-gray-500">
            Records and scheduling history are preserved permanently.
          </div>
          <div className="flex items-center gap-3">
            {onScheduleNext && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onScheduleNext(data?.candidate);
                }}
                className="rounded-lg bg-forest-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-forest-700"
              >
                Schedule Next Round
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
