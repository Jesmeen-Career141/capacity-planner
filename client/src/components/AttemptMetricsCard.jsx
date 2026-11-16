import React from 'react';

/**
 * AttemptMetricsCard
 * Displays the 4 summary cards:
 * 1. Internally shortlisted
 * 2. Good CVs (with target editor)
 * 3. Client shortlisted
 * 4. Withdrawn
 */
export default function AttemptMetricsCard({
  attempt,
  submissions = [],
  isReadOnly = false,
  onEditTarget
}) {
  const target = attempt?.requiredGoodCvTarget ?? 0;

  const safeSubmissions = Array.isArray(submissions) ? submissions : [];
  const shortlistedSubmissions = safeSubmissions.filter(s => s && s.internalShortlistStatus !== 'Rejected');
  const totalShortlistedCount = shortlistedSubmissions.length;
  const goodCount = shortlistedSubmissions.filter(s => s && s.qualityRating === 'Good').length;
  const clientShortlistedCount = safeSubmissions.filter(
    s => s && s.sentToClient === true && s.clientShortlistStatus === 'Shortlisted'
  ).length;
  const withdrawnCount = safeSubmissions.filter(
    s => s && s.internalShortlistStatus !== 'Rejected' && s.isWithdrawn === true
  ).length;

  const canEditTarget = !isReadOnly && typeof onEditTarget === 'function';

  return (
    <div className="cv-demo3-stats">
      <div className="cv-demo3-stat">
        <span className="cv-demo3-stat-label">Internally shortlisted</span>
        <strong className="cv-demo3-stat-value">{totalShortlistedCount}</strong>
      </div>

      <div
        className={`cv-demo3-stat cv-demo3-stat--good ${canEditTarget ? 'cv-demo3-stat--clickable' : ''}`}
        onClick={canEditTarget ? onEditTarget : undefined}
        role={canEditTarget ? 'button' : undefined}
        tabIndex={canEditTarget ? 0 : undefined}
        onKeyDown={canEditTarget ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEditTarget();
          }
        } : undefined}
        title={canEditTarget ? 'Click to edit Required Good CV Target' : undefined}
      >
        <span className="cv-demo3-stat-label">Good CVs</span>
        <strong className="cv-demo3-stat-value">
          {goodCount} / {target}
        </strong>
      </div>

      <div className="cv-demo3-stat">
        <span className="cv-demo3-stat-label">Client shortlisted</span>
        <strong className="cv-demo3-stat-value">{clientShortlistedCount}</strong>
      </div>

      <div className="cv-demo3-stat cv-demo3-stat--withdrawn">
        <span className="cv-demo3-stat-label">Withdrawn</span>
        <strong className="cv-demo3-stat-value">{withdrawnCount}</strong>
      </div>
    </div>
  );
}
