import React, { useState, useEffect, useMemo } from 'react';
import { getPositionHistory } from '../api/positionHistory';
import { getPositionActivityHistory } from '../api/dailyActivity';
import {
  Clock,
  ArrowUpDown,
  Search,
  Table as TableIcon,
  Download,
  AlertCircle
} from 'lucide-react';
import './PositionActivityHistory.css';

/**
 * Format helper for chronological timeline dates and times
 */
function formatTimelineDateTime(dateVal) {
  if (!dateVal) return { day: '—', time: '' };
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return { day: String(dateVal), time: '' };
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { day, time };
}

/**
 * Normalizes any legacy or modern history item into a rich timeline event
 */
function normalizeToTimelineEvent(item, type) {
  if (type === 'positionHistory') {
    const field = item.field || '';
    const rawOld = item.resolvedOldValue || item.oldValue;
    const rawNew = item.resolvedNewValue || item.newValue;
    const changedAt = item.changedAt || item.createdAt;
    const actor = item.changedBy || 'Lead';

    // 1. Status Changes
    if (field === 'status') {
      return {
        id: item._id,
        kind: 'status',
        typeLabel: 'Status Change',
        title: 'Position status updated',
        oldVal: rawOld || 'None',
        newVal: rawNew || 'None',
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `Position status was changed from "${rawOld || 'None'}" to "${rawNew}".`
      };
    }

    // 2. Priority Changes
    if (field === 'pLevel') {
      return {
        id: item._id,
        kind: 'priority',
        typeLabel: 'Priority Change',
        title: 'Priority level updated',
        oldVal: rawOld || 'None',
        newVal: rawNew || 'None',
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `Position priority changed from ${rawOld || 'None'} to ${rawNew}.`
      };
    }

    // 3. Flag Changes
    if (field.startsWith('flagOverrides')) {
      const flagName = field.includes('.') ? field.split('.')[1] : 'Flag';
      const cleanFlagName = flagName === 'followUp' ? 'Follow-up' :
        flagName === 'addOn' ? 'Add-On' :
        flagName === 'goingGood' ? 'Going Good' :
        flagName === 'reAssign' ? 'Re-assign' : flagName;
      return {
        id: item._id,
        kind: 'flag',
        typeLabel: 'Flag Change',
        title: `${cleanFlagName} flag changed`,
        oldVal: rawOld || 'Auto',
        newVal: rawNew || 'Auto',
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `${cleanFlagName} flag override was set to "${rawNew}".`
      };
    }

    // 4. CV & Shortlist Updates
    if (field === 'cvCount' || field === 'lsCount' || field === 'extShortlistCount') {
      const label = field === 'cvCount' ? 'CV count' :
        field === 'lsCount' ? 'Internal shortlist count' : 'External shortlist';
      return {
        id: item._id,
        kind: 'cv',
        typeLabel: 'CV & Shortlist Update',
        title: `${label} updated`,
        oldVal: rawOld ? `${rawOld} CVs` : '0 CVs',
        newVal: rawNew ? `${rawNew} CVs` : '0 CVs',
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `${label} changed from ${rawOld || '0'} to ${rawNew || '0'}.`
      };
    }

    // 5. Salary Changes
    if (field === 'salary' || field === 'packageRange') {
      return {
        id: item._id,
        kind: 'salary',
        typeLabel: 'Salary Change',
        title: 'Compensation package updated',
        oldVal: rawOld || '—',
        newVal: rawNew || '—',
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `Salary package details were revised from "${rawOld || '—'}" to "${rawNew || '—'}".`
      };
    }

    // 6. Remarks Updates
    if (field === 'remarks' || field === 'thisWeekFocus') {
      const isFocus = field === 'thisWeekFocus';
      return {
        id: item._id,
        kind: 'remark',
        typeLabel: 'Remarks Update',
        title: isFocus ? 'Weekly focus updated' : 'Recruitment remarks updated',
        oldVal: null,
        newVal: null,
        remarks: rawNew || 'No remarks text',
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: isFocus ? `Weekly focus changed to: ${rawNew}` : `Full remarks: ${rawNew}`
      };
    }

    // 7. Assignment changes recorded in PositionHistory
    if (field === 'assignment') {
      let parsed = null;
      try {
        parsed = typeof rawNew === 'string' && rawNew.startsWith('{') ? JSON.parse(rawNew) : null;
      } catch (_) {}

      let oldParsed = null;
      try {
        oldParsed = typeof rawOld === 'string' && rawOld.startsWith('{') ? JSON.parse(rawOld) : null;
      } catch (_) {}

      if (parsed) {
        if (parsed.action === 'created') {
          return {
            id: item._id,
            kind: 'assign',
            typeLabel: 'Assignment Activity',
            title: `${parsed.workType} assignment scheduled`,
            oldVal: null,
            newVal: `${parsed.taName} · ${parsed.assignedDateStr} · ${parsed.workType} · ${parsed.status}`,
            actor: `Assigned by ${actor}`,
            date: changedAt,
            details: `Assignment ${parsed.assignmentId} was created for TA ${parsed.taName} on ${parsed.assignedDateStr} (${parsed.workType}). ${parsed.notes ? `Notes: "${parsed.notes}"` : ''}`
          };
        }
        if (parsed.action === 'updated') {
          return {
            id: item._id,
            kind: 'assign',
            typeLabel: 'Assignment Activity',
            title: `Assignment details updated (${parsed.assignmentId})`,
            oldVal: oldParsed ? `${oldParsed.taName} · ${oldParsed.assignedDateStr} · ${oldParsed.workType}` : null,
            newVal: `${parsed.taName} · ${parsed.assignedDateStr} · ${parsed.workType}`,
            actor: `Updated by ${actor}`,
            date: changedAt,
            details: parsed.changes ? parsed.changes.join('; ') : `Assignment ${parsed.assignmentId} was modified.`
          };
        }
        if (parsed.action === 'status_changed') {
          return {
            id: item._id,
            kind: 'assign',
            typeLabel: 'Assignment Activity',
            title: `Assignment marked ${parsed.status}`,
            oldVal: oldParsed?.status ? `Status: ${oldParsed.status}` : null,
            newVal: `Status: ${parsed.status}`,
            actor: `Updated by ${actor}`,
            date: changedAt,
            details: `Assignment ${parsed.assignmentId} (${parsed.workType}) for ${parsed.taName} on ${parsed.assignedDateStr} was updated to ${parsed.status}.`
          };
        }
      }

      if (rawNew === 'Deleted' && oldParsed) {
        return {
          id: item._id,
          kind: 'assign',
          typeLabel: 'Assignment Activity',
          title: `Assignment deleted (${oldParsed.assignmentId || 'WA'})`,
          oldVal: `${oldParsed.taName} · ${oldParsed.assignedDateStr} · ${oldParsed.workType}`,
          newVal: 'Deleted',
          actor: `Deleted by ${actor}`,
          date: changedAt,
          details: `Assignment ${oldParsed.assignmentId} for ${oldParsed.taName} on ${oldParsed.assignedDateStr} was deleted from Daily Action Board.`
        };
      }

      return {
        id: item._id,
        kind: 'assign',
        typeLabel: 'Assignment Activity',
        title: 'Assignment updated',
        oldVal: rawOld,
        newVal: rawNew,
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `Assignment change event recorded.`
      };
    }

    // 8. Activated on TA Board & Received Date updates
    if (field === 'activatedAt') {
      const formattedAct = rawNew ? new Date(rawNew).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Activated';
      return {
        id: item._id,
        kind: 'assign',
        typeLabel: 'TA Board Activation',
        title: 'Position first activated on TA Board',
        oldVal: 'Yet to Activate on Board',
        newVal: formattedAct,
        actor: `Activated by ${actor}`,
        date: changedAt,
        details: `Position first appeared on the TA Board on ${formattedAct}.`
      };
    }

    if (field === 'receivedDate') {
      const oldDt = rawOld ? new Date(rawOld).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      const newDt = rawNew ? new Date(rawNew).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      return {
        id: item._id,
        kind: 'position',
        typeLabel: 'Position Update',
        title: 'Received Date updated',
        oldVal: oldDt,
        newVal: newDt,
        actor: `Updated by ${actor}`,
        date: changedAt,
        details: `Received Date changed from "${oldDt}" to "${newDt}".`
      };
    }

    // 9. Other Position Updates (assignee, parallelAssignees, position title, client, etc.)
    const fieldLabel = field === 'assignee' ? 'Primary TA' :
      field === 'parallelAssignees' ? 'Parallel TAs' :
      field === 'position' ? 'Position title' :
      field === 'client' ? 'Client' :
      field === 'highlightColor' ? 'Highlight color' : field;

    return {
      id: item._id,
      kind: 'position',
      typeLabel: 'Position Update',
      title: `${fieldLabel} updated`,
      oldVal: rawOld || '—',
      newVal: rawNew || '—',
      actor: `Updated by ${actor}`,
      date: changedAt,
      details: `${fieldLabel} changed from "${rawOld || '—'}" to "${rawNew || '—'}".`
    };
  }

  // Fallback
  return {
    id: item._id || Math.random(),
    kind: 'position',
    typeLabel: 'Activity',
    title: 'Update recorded',
    oldVal: item.oldValue || '—',
    newVal: item.newValue || '—',
    actor: 'Lead',
    date: item.changedAt || item.createdAt || new Date(),
    details: JSON.stringify(item)
  };
}

export default function PositionActivityHistory({ positionId, jobOrderId }) {
  const [historyRecords, setHistoryRecords] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [kindFilter, setKindFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (newest first) | 'asc' (oldest first)
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [showLegacyView, setShowLegacyView] = useState(false);

  useEffect(() => {
    if (!positionId) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      getPositionHistory(positionId).catch(err => ({ data: [] })),
      getPositionActivityHistory(positionId).catch(err => ({ data: { activities: [], assignments: [] } }))
    ])
      .then(([histRes, actRes]) => {
        if (!isMounted) return;
        setHistoryRecords(Array.isArray(histRes.data) ? histRes.data : []);
        setAssignments(Array.isArray(actRes.data?.assignments) ? actRes.data.assignments : []);
        setError(null);
      })
      .catch(err => {
        if (isMounted) {
          setError(err.response?.data?.error || err.message || 'Failed to load history');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [positionId]);

  // Combine and normalize events into timeline items
  const timelineEvents = useMemo(() => {
    const events = [];

    // 1. Process PositionHistory records
    for (const item of historyRecords) {
      events.push(normalizeToTimelineEvent(item, 'positionHistory'));
    }

    // 2. Also incorporate assignments from WorkAssignment if not already tracked in PositionHistory
    const trackedAssignmentIds = new Set();
    for (const e of events) {
      if (e.kind === 'assign' && e.details) {
        const match = e.details.match(/WA-\d+/);
        if (match) trackedAssignmentIds.add(match[0]);
      }
    }

    for (const asg of assignments) {
      if (!trackedAssignmentIds.has(asg.assignmentId)) {
        events.push({
          id: asg._id,
          kind: 'assign',
          typeLabel: 'Assignment Activity',
          title: `${asg.workType} assignment scheduled`,
          oldVal: null,
          newVal: `${asg.ta?.name || 'TA'} · ${asg.assignedDateStr} · ${asg.workType} · ${asg.status}`,
          actor: `Created by ${asg.createdBy || 'Manager'}`,
          date: asg.createdAt || asg.assignedDate,
          details: `Assignment ${asg.assignmentId} was allocated to ${asg.ta?.name || 'TA'} for ${asg.assignedDateStr}. Current status: ${asg.status}. ${asg.notes ? `Notes: "${asg.notes}"` : ''}`
        });
      }
    }

    return events;
  }, [historyRecords, assignments]);

  // Filtered & sorted events
  const filteredEvents = useMemo(() => {
    let result = timelineEvents.filter(ev => {
      // Kind filter
      if (kindFilter !== 'all' && ev.kind !== kindFilter) {
        return false;
      }
      // Date range filter
      if (fromDate || toDate) {
        const evDate = ev.date ? new Date(ev.date).toISOString().split('T')[0] : '';
        if (fromDate && evDate < fromDate) return false;
        if (toDate && evDate > toDate) return false;
      }
      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const text = `${ev.typeLabel} ${ev.title} ${ev.actor} ${ev.oldVal || ''} ${ev.newVal || ''} ${ev.remarks || ''} ${ev.details || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    // Sort order
    result.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [timelineEvents, kindFilter, searchQuery, fromDate, toDate, sortOrder]);

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredEvents, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `${jobOrderId || 'position'}_activity_history.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading) {
    return (
      <div className="pos-timeline-panel" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
        <Clock className="spin" size={24} style={{ display: 'inline-block', marginBottom: '0.5rem' }} />
        <p>Loading activity history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pos-timeline-panel" style={{ color: '#b91c1c', background: '#fee2e2', padding: '1.5rem', borderRadius: '10px' }}>
        <AlertCircle size={20} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
        <span>Error loading history: {error}</span>
      </div>
    );
  }

  return (
    <div className="pos-timeline-panel">
      {/* Panel Header */}
      <div className="pos-timeline-panelhead">
        <div>
          <h2>Position Activity History</h2>
          <div className="pos-timeline-hint">
            A chronological record of changes and recruitment activity for this position ({timelineEvents.length} total events).
          </div>
        </div>

        <div className="pos-timeline-actions">
          <button
            type="button"
            className="pos-timeline-btn"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            title="Toggle sort order"
          >
            <ArrowUpDown size={14} />
            <span>{sortOrder === 'desc' ? 'Newest first ↓' : 'Oldest first ↑'}</span>
          </button>

          <button
            type="button"
            className={`pos-timeline-btn ${showLegacyView ? 'active' : ''}`}
            onClick={() => setShowLegacyView(prev => !prev)}
            title="Toggle raw database view"
          >
            <TableIcon size={14} />
            <span>{showLegacyView ? 'Timeline View' : 'Legacy Table View'}</span>
          </button>

          <button
            type="button"
            className="pos-timeline-btn"
            onClick={handleExport}
            title="Export filtered history as JSON"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Legacy Raw Table View */}
      {showLegacyView ? (
        <div className="pos-legacy-table-wrap">
          <table className="pos-legacy-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Old Value</th>
                <th>New Value</th>
                <th>Changed By</th>
                <th>Changed At</th>
              </tr>
            </thead>
            <tbody>
              {historyRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No raw historical change records found.
                  </td>
                </tr>
              ) : (
                historyRecords.map((h, idx) => (
                  <tr key={h._id || idx}>
                    <td>
                      <span className="pos-legacy-field-badge">{h.field}</span>
                    </td>
                    <td>{h.resolvedOldValue || h.oldValue || '—'}</td>
                    <td>{h.resolvedNewValue || h.newValue || '—'}</td>
                    <td>{h.changedBy || 'Lead'}</td>
                    <td>{new Date(h.changedAt || h.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div className="pos-timeline-filters">
            <select
              value={kindFilter}
              onChange={e => setKindFilter(e.target.value)}
              title="Filter by activity kind"
            >
              <option value="all">All activities ({timelineEvents.length})</option>
              <option value="position">Position updates</option>
              <option value="status">Status changes</option>
              <option value="priority">Priority changes</option>
              <option value="flag">Flag changes</option>
              <option value="cv">CV & shortlist updates</option>
              <option value="salary">Salary changes</option>
              <option value="remark">Remarks updates</option>
              <option value="assign">Assignment activities</option>
            </select>

            <div className="pos-timeline-search" style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search activity, user or details..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '28px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            </div>

            <div className="pos-timeline-date-filter">
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>

            <div className="pos-timeline-date-filter">
              <span>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </div>

          {/* Timeline Events List */}
          {filteredEvents.length === 0 ? (
            <div className="pos-timeline-empty">
              No activity records match your selected filters.
            </div>
          ) : (
            <div className="pos-timeline">
              {filteredEvents.map((ev) => {
                const { day, time } = formatTimelineDateTime(ev.date);
                const isExpanded = expandedIds.has(ev.id);

                return (
                  <div key={ev.id} className="pos-event" data-kind={ev.kind}>
                    {/* Left Date / Time */}
                    <div className="pos-event-date">
                      <div className="pos-event-date-day">{day}</div>
                      <div className="pos-event-date-time">{time}</div>
                    </div>

                    {/* Rail & Dot */}
                    <div className="pos-event-rail">
                      <i className={`pos-event-dot ${ev.kind}`} />
                    </div>

                    {/* Entry Card */}
                    <div className="pos-entry">
                      <div className="pos-entrytop">
                        <span className={`pos-type ${ev.kind}`}>
                          {ev.typeLabel}
                        </span>
                        <span className="pos-actor">{ev.actor}</span>
                      </div>

                      <h3>{ev.title}</h3>

                      {/* Value Changes line if present */}
                      {(ev.oldVal !== null || ev.newVal !== null) && (
                        <div className="pos-change">
                          {ev.oldVal && (
                            <span className="pos-old">{ev.oldVal}</span>
                          )}
                          {ev.oldVal && ev.newVal && <span>→</span>}
                          {ev.newVal && (
                            <span className="pos-new">{ev.newVal}</span>
                          )}
                        </div>
                      )}

                      {/* Remarks Preview if present */}
                      {ev.remarks && (
                        <div className="pos-remarks-preview">
                          {ev.remarks.length > 130 && !isExpanded
                            ? `${ev.remarks.slice(0, 130)}...`
                            : ev.remarks}
                        </div>
                      )}

                      {/* Expand Details Button */}
                      {(ev.details || (ev.remarks && ev.remarks.length > 130)) && (
                        <div>
                          <button
                            type="button"
                            className="pos-more-btn"
                            onClick={() => toggleExpand(ev.id)}
                          >
                            <span>
                              {isExpanded
                                ? (ev.remarks ? 'Hide full remarks −' : 'Hide details −')
                                : (ev.remarks ? 'View full remarks +' : 'View details +')}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="pos-detail-expanded">
                              {ev.details || ev.remarks}
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
        </>
      )}
    </div>
  );
}
