import React, { useState, useMemo } from 'react';
import CandidateCard from './CandidateCard';

/**
 * CandidatePipeline
 * Implements HTML Demo 3 — Compact Searchable List (#v3):
 * - Single compact list of all internally shortlisted CVs (no repeated cards across columns)
 * - Search by candidate name or file name
 * - Filter by quality rating (All quality ratings / Not rated / Good / Optional)
 * - Filter by client decision (All client decisions / Shortlisted / Rejected / Pending)
 */
export default function CandidatePipeline({
  submissions = [],
  isReadOnly = false,
  onUpdateStatus,
  onDelete,
  onDownload,
  onRequestClientDecisionConfirmation
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityFilter, setQualityFilter] = useState('ALL');
  const [clientDecisionFilter, setClientDecisionFilter] = useState('ALL');

  const safeSubmissions = Array.isArray(submissions) ? submissions : [];

  // Business Rule: Only internally shortlisted candidates enter CV Tracking
  const shortlistedSubmissions = useMemo(
    () => safeSubmissions.filter(s => s && s.internalShortlistStatus === 'Shortlisted'),
    [safeSubmissions]
  );

  // Filter by search query, quality rating, and client decision
  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return shortlistedSubmissions.filter(candidate => {
      // 1. Search candidate name or original filename
      if (q) {
        const label = (candidate.unverifiedLabel || '').toLowerCase();
        const fileName = (candidate.originalFileName || '').toLowerCase();
        if (!label.includes(q) && !fileName.includes(q)) {
          return false;
        }
      }

      // 2. Filter by quality rating
      if (qualityFilter !== 'ALL') {
        const rating = candidate.qualityRating || 'Not Rated';
        if (rating !== qualityFilter) {
          return false;
        }
      }

      // 3. Filter by client decision
      if (clientDecisionFilter !== 'ALL') {
        const decision = candidate.clientShortlistStatus || 'Pending';
        if (decision !== clientDecisionFilter) {
          return false;
        }
      }

      return true;
    });
  }, [shortlistedSubmissions, searchQuery, qualityFilter, clientDecisionFilter]);

  const hasActiveFilters =
    searchQuery.trim() !== '' || qualityFilter !== 'ALL' || clientDecisionFilter !== 'ALL';

  const handleResetFilters = () => {
    setSearchQuery('');
    setQualityFilter('ALL');
    setClientDecisionFilter('ALL');
  };

  return (
    <section className="cv-demo3-section">
      {/* Toolbar Header */}
      <div className="cv-demo3-toolbar">
        <div>
          <h2 className="cv-demo3-title">All tracked CVs</h2>
          <p className="cv-demo3-subtitle">
            A single list reduces repeated cards and makes searching easier.
          </p>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            className="cv-demo3-reset-btn"
            onClick={handleResetFilters}
          >
            Reset filters ({filteredSubmissions.length} / {shortlistedSubmissions.length})
          </button>
        )}
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="cv-demo3-filters-row">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search candidate or file name…"
          aria-label="Search candidate or file name"
          className="cv-demo3-search-input"
        />

        <select
          value={qualityFilter}
          onChange={(e) => setQualityFilter(e.target.value)}
          aria-label="Filter by quality rating"
          className="cv-demo3-filter-select"
        >
          <option value="ALL">All quality ratings</option>
          <option value="Not Rated">Not rated</option>
          <option value="Good">Good</option>
          <option value="Optional">Optional</option>
        </select>

        <select
          value={clientDecisionFilter}
          onChange={(e) => setClientDecisionFilter(e.target.value)}
          aria-label="Filter by client decision"
          className="cv-demo3-filter-select"
        >
          <option value="ALL">All client decisions</option>
          <option value="Shortlisted">Shortlisted</option>
          <option value="Rejected">Rejected</option>
          <option value="Pending">Pending</option>
        </select>
      </div>

      {/* Compact Candidate List */}
      <div className="cv-demo3-list-box">
        <div className="cv-demo3-list-head">
          <b>Candidate / CV</b>
          <b>Internal status</b>
          <b>Quality</b>
          <b>Client decision</b>
          <b className="cv-demo3-head-actions">Actions</b>
        </div>

        {shortlistedSubmissions.length === 0 ? (
          <div className="cv-demo3-empty">
            No internally shortlisted CVs in this attempt yet.
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="cv-demo3-empty">
            <div>
              No candidates match your current search or filters.
              <div style={{ marginTop: '6px' }}>
                <button
                  type="button"
                  className="cv-demo3-reset-btn"
                  onClick={handleResetFilters}
                >
                  Clear search & filters
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="cv-demo3-rows">
            {filteredSubmissions.map((candidate) => (
              <CandidateCard
                key={candidate._id}
                candidate={candidate}
                isReadOnly={isReadOnly}
                onUpdateStatus={onUpdateStatus}
                onDelete={onDelete}
                onDownload={onDownload}
                onRequestClientDecisionConfirmation={onRequestClientDecisionConfirmation}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
