import React from 'react';
import { Target, Award, Users, CheckCircle2, AlertCircle, Edit3, ListFilter } from 'lucide-react';

/**
 * AttemptMetricsCard
 * Displays target progress, Good CV gap, achievement rate, and volume metrics
 * for the selected recruitment attempt, aligning with the three-column pipeline.
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
    <div className="attempt-metrics-container">
      {/* Target & Progress Header Card */}
      <div className="metrics-hero-card">
        <div className="metrics-hero-top">
          <div className="metrics-target-info">
            <div className="metrics-target-title">
              <Target size={18} className="text-forest-600" />
              <span>Required Good CV Target</span>
              {!isReadOnly && onEditTarget && (
                <button
                  type="button"
                  className="metrics-edit-btn"
                  onClick={onEditTarget}
                  title="Edit Required Good CV Target"
                >
                  <Edit3 size={14} />
                  <span>Edit Target</span>
                </button>
              )}
            </div>
            <div className="metrics-target-stat">
              <span className="metrics-number-large">{target}</span>
              <span className="metrics-subtext">
                {isTargetUnset ? '(Target not configured)' : 'Good CVs required'}
              </span>
            </div>
          </div>

          <div className="metrics-achievement-info">
            <div className="metrics-achievement-header">
              <span className="metrics-stat-label">Achievement</span>
              <span className="metrics-achievement-percent">
                {isTargetUnset ? '0% (Unset)' : `${achievement}%`}
              </span>
            </div>
            <div className="metrics-progress-bar-bg">
              <div
                className={`metrics-progress-bar-fill ${
                  achievement >= 100 ? 'bg-forest-500' : 'bg-forest-600'
                }`}
                style={{ width: `${isTargetUnset ? 0 : achievement}%` }}
              />
            </div>
            <div className="metrics-gap-info">
              {isTargetUnset ? (
                <span className="text-muted">Set a target to calculate remaining gap</span>
              ) : goodCvGap === 0 ? (
                <span className="text-forest-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={13} /> Target reached ({goodCount}/{target})
                </span>
              ) : (
                <span className="text-amber-700 font-medium flex items-center gap-1">
                  <AlertCircle size={13} /> Gap: {goodCvGap} more Good {goodCvGap === 1 ? 'CV' : 'CVs'} needed
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Mini-Cards */}
      <div className="metrics-grid">
        <div className="metric-pill metric-pill-shortlisted">
          <div className="metric-pill-label">
            <ListFilter size={15} />
            <span>Total Shortlisted</span>
          </div>
          <div className="metric-pill-value">{totalShortlistedCount}</div>
          <div className="metric-pill-note">Transmitted to client</div>
        </div>

        <div className="metric-pill metric-pill-good">
          <div className="metric-pill-label">
            <Award size={15} />
            <span>Good CVs</span>
          </div>
          <div className="metric-pill-value">{goodCount}</div>
          <div className="metric-pill-note">Counts toward target</div>
        </div>

        <div className="metric-pill metric-pill-optional">
          <div className="metric-pill-label">
            <Users size={15} />
            <span>Optional CVs</span>
          </div>
          <div className="metric-pill-value">{optionalCount}</div>
          <div className="metric-pill-note">Secondary pool</div>
        </div>

        <div className="metric-pill metric-pill-client">
          <div className="metric-pill-label">
            <CheckCircle2 size={15} />
            <span>External Shortlists</span>
          </div>
          <div className="metric-pill-value">{clientShortlistedCount}</div>
          <div className="metric-pill-note">Approved by client</div>
        </div>
      </div>
    </div>
  );
}
