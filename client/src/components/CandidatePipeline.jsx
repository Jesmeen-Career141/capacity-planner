import React, { useState, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  FileArchive
} from 'lucide-react';
import { getSubmissionFileBlob } from '../api/cvs';
import CandidateCard from './CandidateCard';
import CandidateInterviewHistoryModal from './CandidateInterviewHistoryModal';

/**
 * Helper to generate candidate-identifying filename without collision
 */
function formatZipFileName(candidate, existingNamesSet) {
  const candidateName = (candidate.unverifiedLabel || '').trim();
  const original = (candidate.originalFileName || 'CV.pdf').trim();

  let base = original;
  const simplifiedCandidate = candidateName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const simplifiedOriginal = original.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (candidateName && !simplifiedOriginal.includes(simplifiedCandidate)) {
    base = `${candidateName} - ${original}`;
  }

  let clean = base.replace(/[/\\?%*:|"<>]/g, '_');
  let finalName = clean;
  let counter = 1;
  const extIndex = clean.lastIndexOf('.');
  const namePart = extIndex !== -1 ? clean.slice(0, extIndex) : clean;
  const extPart = extIndex !== -1 ? clean.slice(extIndex) : '';

  while (existingNamesSet.has(finalName.toLowerCase())) {
    finalName = `${namePart} (${counter})${extPart}`;
    counter++;
  }
  existingNamesSet.add(finalName.toLowerCase());
  return finalName;
}

/**
 * CandidatePipeline
 * Implements HTML Demo 3 — Compact Searchable List (#v3):
 * - Single compact list of all internally shortlisted CVs (no repeated cards across columns)
 * - Download All CVs as ZIP for the selected attempt
 * - Search by candidate name or file name
 * - Filter by quality rating (All quality ratings / Not rated / Good / Optional)
 * - Filter by client decision (All client decisions / Shortlisted / Rejected / Pending)
 */
export default function CandidatePipeline({
  position,
  selectedAttempt,
  tas = [],
  positionSets = [],
  submissions = [],
  isReadOnly = false,
  onUpdateStatus,
  onDelete,
  onDownload,
  onRequestClientDecisionConfirmation,
  onRequestWithdrawal
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [qualityFilter, setQualityFilter] = useState('ALL');
  const [setFilter, setSetFilter] = useState('ALL');
  const [historyCandidateId, setHistoryCandidateId] = useState(null);

  // Download All ZIP progress and status state
  const [downloadProgress, setDownloadProgress] = useState(null);
  const isCancelledRef = useRef(false);

  const safeSubmissions = Array.isArray(submissions) ? submissions : [];
  const safePositionSets = Array.isArray(positionSets) ? positionSets : [];

  // Include all non-rejected CVs (both direct CV Tracking uploads and Submission Set uploads)
  const shortlistedSubmissions = useMemo(
    () => safeSubmissions.filter(s => s && s.internalShortlistStatus !== 'Rejected'),
    [safeSubmissions]
  );

  // Derive set filter options (e.g., Set 04, Set 03, Set 02, Set 01)
  const setOptions = useMemo(() => {
    const options = [];
    const seenLabels = new Set();
    const seenIds = new Set();

    safePositionSets.forEach(set => {
      if (!set) return;
      const idStr = String(set._id || set.submissionSetId || set.setNumber || '');
      const label = set.setNumber || set.submissionSetId || idStr;
      if (!label || seenLabels.has(label)) return;
      seenLabels.add(label);
      if (idStr) seenIds.add(idStr);
      options.push({
        value: set.setNumber || idStr,
        id: idStr,
        setNumber: set.setNumber,
        label
      });
    });

    shortlistedSubmissions.forEach(sub => {
      if (sub?.setNumber && !seenLabels.has(sub.setNumber)) {
        seenLabels.add(sub.setNumber);
        options.push({
          value: sub.setNumber,
          id: String(sub.submissionSet?._id || sub.submissionSet || ''),
          setNumber: sub.setNumber,
          label: sub.setNumber
        });
      }
    });

    const hasUnassigned = shortlistedSubmissions.some(s => !s.submissionSet && !s.setNumber);
    if (hasUnassigned && options.length > 0) {
      options.push({
        value: 'UNASSIGNED',
        id: 'UNASSIGNED',
        setNumber: null,
        label: 'Unassigned'
      });
    }

    return options;
  }, [safePositionSets, shortlistedSubmissions]);

  // Filter by search query, consolidated status, quality rating, and submission set
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

      // 2. Consolidated Status filter
      if (statusFilter !== 'ALL') {
        const isWithdrawn = Boolean(candidate.isWithdrawn);
        const clientStatus = candidate.clientShortlistStatus || 'Pending';

        if (statusFilter === 'WITHDRAWN') {
          if (!isWithdrawn) return false;
        } else if (statusFilter === 'CLIENT_SHORTLISTED') {
          if (isWithdrawn || clientStatus !== 'Shortlisted') return false;
        } else if (statusFilter === 'CLIENT_REJECTED') {
          if (isWithdrawn || clientStatus !== 'Rejected') return false;
        } else if (statusFilter === 'PENDING') {
          if (isWithdrawn || clientStatus !== 'Pending') return false;
        } else if (statusFilter === 'INTERNALLY_SHORTLISTED') {
          if (isWithdrawn || clientStatus === 'Rejected' || candidate.internalShortlistStatus === 'Rejected') {
            return false;
          }
        }
      }

      // 3. Quality Rating filter
      if (qualityFilter !== 'ALL') {
        const rating = candidate.qualityRating || 'Not Rated';
        if (rating !== qualityFilter) {
          return false;
        }
      }

      // 4. Submission Set filter
      if (setFilter !== 'ALL') {
        if (setFilter === 'UNASSIGNED') {
          if (candidate.submissionSet || candidate.setNumber) return false;
        } else {
          const matchedOption = setOptions.find(o => o.value === setFilter);
          const candSetId = String(candidate.submissionSet?._id || candidate.submissionSet || '');
          const matchesNumber = candidate.setNumber && candidate.setNumber === setFilter;
          const matchesId =
            (candSetId && candSetId === setFilter) ||
            (matchedOption?.id && candSetId && candSetId === matchedOption.id);
          if (!matchesNumber && !matchesId) {
            return false;
          }
        }
      }

      return true;
    });
  }, [shortlistedSubmissions, searchQuery, statusFilter, qualityFilter, setFilter, setOptions]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusFilter !== 'ALL' ||
    qualityFilter !== 'ALL' ||
    setFilter !== 'ALL';

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setQualityFilter('ALL');
    setSetFilter('ALL');
  };

  /**
   * Handle Download All CVs as ZIP
   */
  const handleDownloadAllCvs = async () => {
    if (shortlistedSubmissions.length === 0) {
      alert('No internally shortlisted CVs to download.');
      return;
    }

    isCancelledRef.current = false;
    const totalCount = shortlistedSubmissions.length;
    setDownloadProgress({
      status: 'downloading',
      current: 0,
      total: totalCount,
      candidateName: shortlistedSubmissions[0]?.unverifiedLabel || '',
      failed: [],
      successfulCount: 0
    });

    const zip = new JSZip();
    const existingNamesSet = new Set();
    const failed = [];
    let successfulCount = 0;

    for (let i = 0; i < shortlistedSubmissions.length; i++) {
      if (isCancelledRef.current) {
        setDownloadProgress(null);
        return;
      }

      const candidate = shortlistedSubmissions[i];
      const displayName = candidate.unverifiedLabel || candidate.originalFileName || `Candidate ${i + 1}`;

      setDownloadProgress(prev => ({
        ...prev,
        current: i + 1,
        candidateName: displayName
      }));

      try {
        const res = await getSubmissionFileBlob(candidate._id, {
          positionId: position?._id,
          attemptId: selectedAttempt?._id
        });
        const fileName = formatZipFileName(candidate, existingNamesSet);
        zip.file(fileName, res.data);
        successfulCount++;
      } catch (err) {
        failed.push({
          candidate: candidate.unverifiedLabel || 'Unknown Candidate',
          fileName: candidate.originalFileName || 'CV file',
          error: err.response?.data?.error || err.message || 'File could not be retrieved from storage'
        });
      }
    }

    if (isCancelledRef.current) {
      setDownloadProgress(null);
      return;
    }

    // If partial failures occurred, add a download report text file into the ZIP
    if (failed.length > 0 && successfulCount > 0) {
      let report = `DOWNLOAD REPORT — ${position?.jobOrderId || 'Position'} (Attempt #${selectedAttempt?.attemptNumber || 1})\n`;
      report += `Generated: ${new Date().toISOString()}\n\n`;
      report += `Total Shortlisted CVs: ${totalCount}\n`;
      report += `Successfully Archived: ${successfulCount}\n`;
      report += `Missing / Failed: ${failed.length}\n\n`;
      report += `--- FAILED FILES ---\n`;
      failed.forEach((f, idx) => {
        report += `${idx + 1}. Candidate: ${f.candidate} | File: ${f.fileName} | Reason: ${f.error}\n`;
      });
      zip.file('_DOWNLOAD_REPORT.txt', report);
    }

    // If zero files succeeded
    if (successfulCount === 0) {
      setDownloadProgress({
        status: 'error',
        current: totalCount,
        total: totalCount,
        failed,
        successfulCount: 0
      });
      return;
    }

    // Generate ZIP
    setDownloadProgress(prev => ({
      ...prev,
      status: 'zipping',
      candidateName: 'Generating ZIP archive...'
    }));

    try {
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const safeJobOrderId = (position?.jobOrderId || 'Position').replace(/[^\w.-]/g, '_');
      const attemptNum = selectedAttempt?.attemptNumber || 1;
      const zipFileName = `${safeJobOrderId}_Attempt_${attemptNum}_CVs.zip`;

      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = zipFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      setDownloadProgress({
        status: 'complete',
        current: totalCount,
        total: totalCount,
        failed,
        successfulCount
      });
    } catch (zipErr) {
      setDownloadProgress({
        status: 'error',
        current: totalCount,
        total: totalCount,
        failed: [{ candidate: 'ZIP Archive', fileName: 'All files', error: zipErr.message }],
        successfulCount: 0
      });
    }
  };

  return (
    <section className="cv-demo3-section">
      {/* Toolbar Header */}
      <div className="cv-demo3-toolbar">
        <h2 className="cv-demo3-title">All tracked CVs</h2>
        <div className="cv-demo3-toolbar-actions">
          {shortlistedSubmissions.length > 0 && (
            <button
              type="button"
              className="cv-demo3-download-all-btn"
              onClick={handleDownloadAllCvs}
              disabled={downloadProgress && (downloadProgress.status === 'downloading' || downloadProgress.status === 'zipping')}
              title={`Download all ${shortlistedSubmissions.length} CVs as a ZIP archive`}
            >
              <span>⇩ Download All CVs ({shortlistedSubmissions.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="cv-demo3-filters-row">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search candidate or file name…"
          aria-label="Search candidates"
          className="cv-demo3-search-input"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Status filter"
          className="cv-demo3-filter-select"
        >
          <option value="ALL">All statuses</option>
          <option value="INTERNALLY_SHORTLISTED">Internally shortlisted</option>
          <option value="CLIENT_SHORTLISTED">Client shortlisted</option>
          <option value="CLIENT_REJECTED">Client rejected</option>
          <option value="WITHDRAWN">Withdrawn</option>
          <option value="PENDING">Pending</option>
        </select>

        <select
          value={qualityFilter}
          onChange={(e) => setQualityFilter(e.target.value)}
          aria-label="Quality filter"
          className="cv-demo3-filter-select"
        >
          <option value="ALL">All quality ratings</option>
          <option value="Good">Good</option>
          <option value="Optional">Optional</option>
          <option value="Not Rated">Not rated</option>
        </select>

        <select
          value={setFilter}
          onChange={(e) => setSetFilter(e.target.value)}
          aria-label="Set filter"
          className="cv-demo3-filter-select"
        >
          <option value="ALL">All sets</option>
          {setOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
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
                selectedAttempt={selectedAttempt}
                tas={tas}
                positionSets={safePositionSets}
                isReadOnly={isReadOnly}
                onUpdateStatus={onUpdateStatus}
                onDelete={onDelete}
                onDownload={onDownload}
                onRequestClientDecisionConfirmation={onRequestClientDecisionConfirmation}
                onRequestWithdrawal={onRequestWithdrawal}
                onViewInterviewHistory={(c) => setHistoryCandidateId(c._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Download All Progress / Status Dialog */}
      {downloadProgress && (
        <div className="cv-submodal-overlay" onClick={() => {
          if (downloadProgress.status === 'complete' || downloadProgress.status === 'error') {
            setDownloadProgress(null);
          }
        }}>
          <div className="cv-submodal cv-download-all-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-submodal-header">
              <div className="flex-items-center gap-2">
                <FileArchive size={18} className="text-forest-600" />
                <h3>Download All CVs (Attempt #{selectedAttempt?.attemptNumber || 1})</h3>
              </div>
              {(downloadProgress.status === 'complete' || downloadProgress.status === 'error') && (
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setDownloadProgress(null)}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="cv-submodal-body">
              {(downloadProgress.status === 'downloading' || downloadProgress.status === 'zipping') && (
                <div className="cv-download-progress-container">
                  <div className="cv-download-progress-header">
                    <span className="font-semibold text-sm">
                      {downloadProgress.status === 'zipping'
                        ? 'Creating ZIP file...'
                        : `Downloading CV ${downloadProgress.current} of ${downloadProgress.total}`}
                    </span>
                    <span className="text-xs font-bold text-forest-700">
                      {downloadProgress.total > 0
                        ? `${Math.round((downloadProgress.current / downloadProgress.total) * 100)}%`
                        : '0%'}
                    </span>
                  </div>

                  <div className="cv-download-progress-bar-bg">
                    <div
                      className="cv-download-progress-bar-fill"
                      style={{
                        width: downloadProgress.total > 0
                          ? `${Math.min(100, Math.round((downloadProgress.current / downloadProgress.total) * 100))}%`
                          : '0%'
                      }}
                    />
                  </div>

                  <p className="cv-download-current-file text-xs text-muted truncate">
                    {downloadProgress.candidateName ? `Processing: ${downloadProgress.candidateName}` : 'Preparing...'}
                  </p>
                </div>
              )}

              {downloadProgress.status === 'complete' && (
                <div className="cv-download-complete-content">
                  {downloadProgress.failed.length === 0 ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-sm flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                      <span>
                        Successfully downloaded all <strong>{downloadProgress.successfulCount}</strong> CVs into ZIP archive.
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                      <div className="flex items-center gap-2 font-semibold mb-1">
                        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
                        <span>
                          Partial Download: {downloadProgress.successfulCount} of {downloadProgress.total} CVs retrieved.
                        </span>
                      </div>
                      <p className="text-xs text-amber-700 mb-2">
                        {downloadProgress.failed.length} file(s) could not be retrieved from storage. Details have been included in <code>_DOWNLOAD_REPORT.txt</code> inside the ZIP archive.
                      </p>
                      <ul className="list-disc pl-5 text-xs text-amber-900 space-y-1 max-h-32 overflow-y-auto">
                        {downloadProgress.failed.map((f, i) => (
                          <li key={i}>
                            <strong>{f.candidate}</strong> ({f.fileName}): {f.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {downloadProgress.status === 'error' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
                    <span>Failed to retrieve CV files</span>
                  </div>
                  <p className="text-xs text-red-700 mb-2">
                    None of the requested files could be retrieved from Cloudflare R2 storage.
                  </p>
                  {downloadProgress.failed && downloadProgress.failed.length > 0 && (
                    <ul className="list-disc pl-5 text-xs text-red-900 space-y-1 max-h-32 overflow-y-auto">
                      {downloadProgress.failed.map((f, i) => (
                        <li key={i}>
                          <strong>{f.candidate}</strong>: {f.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="cv-submodal-footer">
              {(downloadProgress.status === 'downloading' || downloadProgress.status === 'zipping') ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    isCancelledRef.current = true;
                    setDownloadProgress(null);
                  }}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setDownloadProgress(null)}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {historyCandidateId && (
        <CandidateInterviewHistoryModal
          candidateSubmissionId={historyCandidateId}
          onClose={() => setHistoryCandidateId(null)}
        />
      )}
    </section>
  );
}
