import React from 'react';
import { Edit3 } from 'lucide-react';

/**
 * AttemptMetricsCard
 * Displays the compact 3-card summary stats from HTML Demo 3 (Option 3: Compact list):
 * 1. Internally shortlisted (All submitted candidates)
 * 2. Good CVs (Counts toward target, with inline target editor)
 * 3. Client shortlisted (Confirmed client decisions)
 */
export default function AttemptMetricsCard({
  attempt,
  submissions = [],
  isReadOnly = false,
  onEditTarget
}) {
  const target = attempt?.requiredGoodCvTarget ?? 0;
  const isTargetUnset = target <= 0;

  const safeSubmissions = Array.isArray(submissions) ? submissions : [];
  const shortlistedSubmissions = safeSubmissions.filter(s => s && s.internalShortlistStatus === 'Shortlisted');
  const totalShortlistedCount = shortlistedSubmissions.length;
  const goodCount = shortlistedSubmissions.filter(s => s && s.qualityRating === 'Good').length;
  const optionalCount = shortlistedSubmissions.filter(s => s && s.qualityRating === 'Optional').length;
  const clientShortlistedCount = safeSubmissions.filter(
    s => s && s.sentToClient === true && s.clientShortlistStatus === 'Shortlisted'
  ).length;

  const goodCvGap = Math.max(0, target - goodCount);
  const rawAchievement = target > 0 ? (goodCount / target) * 100 : 0;
  const achievement = Math.min(100, Math.round(rawAchievement));

  return (
    <div className="cv-demo3-stats">
      <div className="cv-demo3-stat">
        <div className="cv-demo3-stat-info">
          <span className="cv-demo3-stat-label">Internally shortlisted</span>
          <small className="cv-demo3-stat-sub">
            All submitted candidates{optionalCount > 0 ? ` · ${optionalCount} Optional` : ''}
          </small>
        </div>
        <strong className="cv-demo3-stat-value">{totalShortlistedCount}</strong>
      </div>

      <div className="cv-demo3-stat cv-demo3-stat--good">
        <div className="cv-demo3-stat-info">
          <div className="cv-demo3-stat-label-row">
            <span className="cv-demo3-stat-label">Good CVs</span>
            {!isReadOnly && onEditTarget && (
              <button
                type="button"
                className="cv-demo3-edit-target-btn"
                onClick={onEditTarget}
                title="Edit Required Good CV Target"
              >
                <Edit3 size={11} />
                <span>Target</span>
              </button>
            )}
          </div>
          <small className="cv-demo3-stat-sub">
            {isTargetUnset
              ? 'Counts toward target (target unset)'
              : goodCvGap === 0
              ? `Counts toward target · Reached (${achievement}%)`
              : `Counts toward target · ${goodCvGap} more needed (${achievement}%)`}
          </small>
        </div>
        <strong className="cv-demo3-stat-value">
          {goodCount} / {target}
        </strong>
      </div>

      <div className="cv-demo3-stat">
        <div className="cv-demo3-stat-info">
          <span className="cv-demo3-stat-label">Client shortlisted</span>
          <small className="cv-demo3-stat-sub">Confirmed client decisions</small>
        </div>
        <strong className="cv-demo3-stat-value">{clientShortlistedCount}</strong>
      </div>
    </div>
  );
}
