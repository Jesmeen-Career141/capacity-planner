import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Layers,
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  FileText,
  Download,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  RefreshCw
} from 'lucide-react';
import {
  getSubmissionSets,
  getSubmissionSetById,
  createSetWithUpload,
  uploadCvsToSet
} from '../api/submissionSets';
import { getPositions } from '../api/positions';
import { getActiveTAs } from '../api/tas';
import { getDownloadUrl } from '../api/cvs';
import './SubmissionSets.css';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SubmissionSets() {
  const queryClient = useQueryClient();

  // Filters state
  const [filterPosition, setFilterPosition] = useState('');
  const [filterTa, setFilterTa] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'grouped'

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSetDetailsId, setSelectedSetDetailsId] = useState(null);
  const [uploadTargetSet, setUploadTargetSet] = useState(null);

  // Expanded position groups in grouped view
  const [expandedPositions, setExpandedPositions] = useState({});

  // 1. Fetch Positions and TAs
  const { data: positionsRes } = useQuery({
    queryKey: ['positions', 'list'],
    queryFn: () => getPositions({}),
    staleTime: 5 * 60 * 1000
  });
  const positionsList = Array.isArray(positionsRes?.data) ? positionsRes.data : [];

  const { data: tasRes } = useQuery({
    queryKey: ['tas', 'active'],
    queryFn: () => getActiveTAs(),
    staleTime: 5 * 60 * 1000
  });
  const tasList = Array.isArray(tasRes?.data) ? tasRes.data : [];

  // 2. Fetch Submission Sets
  const {
    data: setsRes,
    isLoading: loadingSets,
    error: setsError,
    refetch: refetchSets
  } = useQuery({
    queryKey: ['submission-sets', filterPosition, filterTa, dateFrom, dateTo, searchQuery],
    queryFn: () => getSubmissionSets({
      position: filterPosition || undefined,
      ta: filterTa || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: searchQuery || undefined
    })
  });
  const setsList = Array.isArray(setsRes?.data) ? setsRes.data : [];

  // 3. Fetch detailed set if selected
  const {
    data: detailedSetRes,
    isLoading: loadingDetails,
    refetch: refetchDetails
  } = useQuery({
    queryKey: ['submission-set-details', selectedSetDetailsId],
    queryFn: () => getSubmissionSetById(selectedSetDetailsId),
    enabled: !!selectedSetDetailsId
  });
  const detailedSetData = detailedSetRes?.data || null;

  // Overall metric totals
  const metrics = useMemo(() => {
    let totalSubmissions = 0;
    setsList.forEach(s => {
      totalSubmissions += s.cvCount || 0;
    });
    return {
      totalSets: setsList.length,
      totalSubmissions
    };
  }, [setsList]);

  // Grouped sets by position
  const groupedSets = useMemo(() => {
    const groups = {};
    setsList.forEach(set => {
      const posId = set.position?._id || set.jobOrderId || 'other';
      if (!groups[posId]) {
        groups[posId] = {
          positionId: posId,
          jobOrderId: set.jobOrderId,
          positionName: set.position?.position || 'Unknown Position',
          clientName: set.position?.client?.clientName || 'Unknown Client',
          sets: []
        };
      }
      groups[posId].sets.push(set);
    });
    return Object.values(groups);
  }, [setsList]);

  const toggleGroup = (posId) => {
    setExpandedPositions(prev => ({
      ...prev,
      [posId]: !prev[posId]
    }));
  };

  const handleDownloadCv = async (submissionId) => {
    try {
      const res = await getDownloadUrl(submissionId);
      if (res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, '_blank');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate download URL');
    }
  };

  return (
    <div className="sets-page">
      {/* Header */}
      <div className="sets-header">
        <div>
          <h1 className="sets-title">
            <Layers className="sets-title-icon" />
            Submission Sets
          </h1>
          <p className="sets-subtitle">
            Manage CV batches transmitted to clients with strict sequential set numbering (Set 01, Set 02),
            independent transmission dates, and candidate quality audits.
          </p>
        </div>

        <div className="sets-actions">
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowCreateModal(true)}
          >
            <FolderPlus size={16} />
            Create Submission Set
          </button>
        </div>
      </div>

      {/* Metric Cards Ribbon */}
      <div className="sets-metrics-grid">
        <div className="sets-metric-card">
          <span className="sets-metric-val">{metrics.totalSets}</span>
          <span className="sets-metric-label">Total Submission Sets</span>
          <span className="sets-metric-sub">Batches sent to clients</span>
        </div>
        <div className="sets-metric-card">
          <span className="sets-metric-val">{metrics.totalSubmissions}</span>
          <span className="sets-metric-label">Total CV Submissions</span>
          <span className="sets-metric-sub">Across all positions</span>
        </div>
        <div className="sets-metric-card">
          <span className="sets-metric-val">{groupedSets.length}</span>
          <span className="sets-metric-label">Active Positions</span>
          <span className="sets-metric-sub">With client transmissions</span>
        </div>
        <div className="sets-metric-card sets-metric-card--highlight">
          <span className="sets-metric-val">
            {metrics.totalSets > 0 ? (metrics.totalSubmissions / metrics.totalSets).toFixed(1) : 0}
          </span>
          <span className="sets-metric-label">Avg CVs per Set</span>
          <span className="sets-metric-sub">Batch sizing density</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="sets-filter-bar">
        <div className="sets-search-box">
          <Search size={16} className="sets-search-icon" />
          <input
            type="text"
            placeholder="Search by Job Order ID, Set Number, Client, Position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sets-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="sets-search-clear"
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="sets-filters-group">
          {/* Position Filter */}
          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="sets-filter-select"
          >
            <option value="">All Positions</option>
            {positionsList.map(p => (
              <option key={p._id} value={p._id}>
                {p.jobOrderId} — {p.position} ({p.client?.clientName})
              </option>
            ))}
          </select>

          {/* TA Filter */}
          <select
            value={filterTa}
            onChange={(e) => setFilterTa(e.target.value)}
            className="sets-filter-select"
          >
            <option value="">All Uploaders</option>
            {tasList.map(ta => (
              <option key={ta._id} value={ta._id}>
                {ta.name}
              </option>
            ))}
          </select>

          {/* Date Range: Sent To Client */}
          <div className="sets-date-filter">
            <span className="sets-date-label">Sent:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="sets-date-input"
              title="Sent Date From"
            />
            <span>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="sets-date-input"
              title="Sent Date To"
            />
          </div>

          {/* View mode toggle */}
          <div className="sets-view-toggle">
            <button
              type="button"
              className={`sets-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
            >
              All Sets
            </button>
            <button
              type="button"
              className={`sets-toggle-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              onClick={() => setViewMode('grouped')}
            >
              Group by Position
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loadingSets ? (
        <div className="sets-loading-state">
          <RefreshCw className="animate-spin text-forest-600 mb-2" size={24} />
          <span>Loading submission sets...</span>
        </div>
      ) : setsError ? (
        <div className="sets-error-state">
          <AlertTriangle size={24} className="text-red-500 mb-2" />
          <span>Error loading submission sets: {setsError.message}</span>
          <button type="button" className="btn-secondary mt-3" onClick={() => refetchSets()}>
            Retry
          </button>
        </div>
      ) : setsList.length === 0 ? (
        <div className="sets-empty-state">
          <Layers size={36} className="text-gray-400 mb-2" />
          <h3>No submission sets found</h3>
          <p>
            {searchQuery || filterPosition || filterTa || dateFrom || dateTo
              ? 'Try adjusting your filters or search terms.'
              : 'Create a new submission set to begin tracking CV batches sent to clients.'}
          </p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => setShowCreateModal(true)}
          >
            <FolderPlus size={16} /> Create First Submission Set
          </button>
        </div>
      ) : viewMode === 'all' ? (
        /* Flat chronological list */
        <div className="sets-table-card">
          <table className="sets-table">
            <thead>
              <tr>
                <th>Set Number</th>
                <th>Position / Job Order</th>
                <th>Client</th>
                <th>Sent to Client</th>
                <th>Uploaded Time</th>
                <th>Sourcing TAs / Uploader</th>
                <th>CVs</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {setsList.map(set => (
                <tr key={set._id} className="sets-row">
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="sets-badge-set">{set.setNumber}</span>
                      <span className="sets-id-label">{set.submissionSetId}</span>
                    </div>
                  </td>
                  <td>
                    <Link
                      to={`/positions/${set.position?._id || set.position}`}
                      className="sets-pos-link"
                    >
                      <strong>{set.jobOrderId}</strong>
                      <span className="sets-pos-title">{set.position?.position || '—'}</span>
                    </Link>
                  </td>
                  <td>
                    <span className="sets-client-name">
                      {set.position?.client?.clientName || '—'}
                    </span>
                  </td>
                  <td>
                    <div className="sets-date-cell">
                      <Calendar size={13} className="text-forest-600" />
                      <strong>{formatDate(set.sentToClientAt)}</strong>
                    </div>
                  </td>
                  <td>
                    <div className="sets-time-cell">
                      <Clock size={13} className="text-gray-400" />
                      <span>{formatDateTime(set.uploadedAt)}</span>
                    </div>
                  </td>
                  <td>
                    {set.sourcingTAs && set.sourcingTAs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {set.sourcingTAs.map(ta => (
                          <span key={ta._id || ta} className="sets-ta-pill">
                            {ta.name || 'TA'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="sets-ta-pill">
                        {set.uploadedBy?.name || '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="sets-count-badge">
                      {set.cvCount} CV{set.cvCount !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="sets-notes-cell" title={set.notes}>
                    {set.notes || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="sets-row-actions">
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setSelectedSetDetailsId(set._id)}
                      >
                        View CVs
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => setUploadTargetSet(set)}
                        title="Upload more CVs into this set"
                      >
                        + Add CVs
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grouped by position accordion */
        <div className="sets-grouped-container">
          {groupedSets.map(group => {
            const isExpanded = expandedPositions[group.positionId] !== false; // default open
            return (
              <div key={group.positionId} className="sets-group-card">
                <div
                  className="sets-group-header"
                  onClick={() => toggleGroup(group.positionId)}
                >
                  <div className="flex items-center gap-3">
                    <button type="button" className="sets-group-toggle-icon">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <div>
                      <h3 className="sets-group-title">
                        {group.jobOrderId} — {group.positionName}
                      </h3>
                      <span className="sets-group-subtitle">{group.clientName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="sets-group-stat">
                      {group.sets.length} Set{group.sets.length !== 1 ? 's' : ''}
                    </span>
                    <span className="sets-group-stat">
                      {group.sets.reduce((sum, s) => sum + (s.cvCount || 0), 0)} Total CVs
                    </span>
                    <Link
                      to={`/positions/${group.positionId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="sets-group-pos-link"
                      title="Open position details"
                    >
                      <ExternalLink size={15} />
                    </Link>
                  </div>
                </div>

                {isExpanded && (
                  <div className="sets-group-body">
                    <table className="sets-table">
                      <thead>
                        <tr>
                          <th>Set Number</th>
                          <th>Sent to Client</th>
                          <th>Uploaded At</th>
                          <th>Sourcing TAs / Uploader</th>
                          <th>CV Count</th>
                          <th>Notes</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.sets.map(set => (
                          <tr key={set._id} className="sets-row">
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="sets-badge-set">{set.setNumber}</span>
                                <span className="sets-id-label">{set.submissionSetId}</span>
                              </div>
                            </td>
                            <td>
                              <div className="sets-date-cell">
                                <Calendar size={13} className="text-forest-600" />
                                <strong>{formatDate(set.sentToClientAt)}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="sets-time-cell">
                                <Clock size={13} className="text-gray-400" />
                                <span>{formatDateTime(set.uploadedAt)}</span>
                              </div>
                            </td>
                            <td>
                              {set.sourcingTAs && set.sourcingTAs.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {set.sourcingTAs.map(ta => (
                                    <span key={ta._id || ta} className="sets-ta-pill">
                                      {ta.name || 'TA'}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="sets-ta-pill">
                                  {set.uploadedBy?.name || '—'}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="sets-count-badge">
                                {set.cvCount} CV{set.cvCount !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="sets-notes-cell" title={set.notes}>
                              {set.notes || '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="sets-row-actions">
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => setSelectedSetDetailsId(set._id)}
                                >
                                  View CVs
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => setUploadTargetSet(set)}
                                >
                                  + Add CVs
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create Submission Set (with file upload) */}
      {showCreateModal && (
        <CreateSubmissionSetModal
          positions={positionsList}
          tas={tasList}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetchSets();
          }}
        />
      )}

      {/* Modal 2: View Set Details & Candidate Submissions */}
      {selectedSetDetailsId && (
        <SetDetailsModal
          setId={selectedSetDetailsId}
          data={detailedSetData}
          loading={loadingDetails}
          onClose={() => setSelectedSetDetailsId(null)}
          onDownloadCv={handleDownloadCv}
          onAddCvs={() => {
            setUploadTargetSet(detailedSetData?.set);
          }}
        />
      )}

      {/* Modal 3: Upload Additional CVs into an Existing Set */}
      {uploadTargetSet && (
        <UploadToExistingSetModal
          set={uploadTargetSet}
          tas={tasList}
          onClose={() => setUploadTargetSet(null)}
          onSuccess={() => {
            setUploadTargetSet(null);
            refetchSets();
            if (selectedSetDetailsId) {
              refetchDetails();
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal Component: Create Submission Set
 */
function CreateSubmissionSetModal({ positions, tas, onClose, onSuccess }) {
  const [positionId, setPositionId] = useState('');
  const [sentToClientAt, setSentToClientAt] = useState(new Date().toISOString().split('T')[0]);
  const [sourcingTAs, setSourcingTAs] = useState([]);
  const [qualityRating, setQualityRating] = useState('Not Rated');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [clientErrors, setClientErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const fileInputRef = useRef(null);

  // Auto-select assignee as initial sourcing TA if position has an assignee
  useEffect(() => {
    if (positionId) {
      const pos = positions.find(p => p._id === positionId);
      if (pos && pos.assignee?._id) {
        setSourcingTAs(prev => (prev.length === 0 ? [pos.assignee._id] : prev));
      }
    }
  }, [positionId, positions]);

  const handleAddSourcingTA = (taId) => {
    if (!taId) return;
    if (!sourcingTAs.includes(taId)) {
      setSourcingTAs(prev => [...prev, taId]);
    }
  };

  const handleRemoveSourcingTA = (taId) => {
    setSourcingTAs(prev => prev.filter(id => id !== taId));
  };

  const validateFiles = (fileList) => {
    const valid = [];
    const errors = [];

    Array.from(fileList).forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
      const isMimeAllowed = !file.type || ALLOWED_MIME_TYPES.includes(file.type);

      if (!isExtAllowed || !isMimeAllowed) {
        errors.push(`${file.name}: Invalid format. Allowed: PDF, DOC, DOCX.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: Exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
        return;
      }

      valid.push(file);
    });

    return { valid, errors };
  };

  const handleFileChange = (e) => {
    setClientErrors([]);
    const { valid, errors } = validateFiles(e.target.files);
    if (errors.length > 0) setClientErrors(errors);
    setFiles(prev => [...prev, ...valid]);
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!positionId) return alert('Please select a position.');
    if (!sentToClientAt) return alert('Please specify the date CVs were sent to the client.');
    if (files.length === 0) return alert('Please add at least one CV file.');

    setIsSubmitting(true);
    setServerError(null);

    const formData = new FormData();
    formData.append('positionId', positionId);
    formData.append('sentToClientAt', sentToClientAt);
    sourcingTAs.forEach(id => formData.append('sourcingTAs[]', id));
    formData.append('sourcingTAs', JSON.stringify(sourcingTAs));
    formData.append('qualityRating', qualityRating);
    formData.append('notes', notes);

    files.forEach(f => {
      formData.append('files', f);
    });

    try {
      await createSetWithUpload(formData);
      onSuccess();
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.failed && Array.isArray(respData.failed) && respData.failed.length > 0) {
        const failureDetails = respData.failed.map(f => `${f.fileName}: ${f.error}`).join(' | ');
        setServerError(`${respData.error || 'Upload failed'}: ${failureDetails}`);
      } else {
        setServerError(respData?.error || err.message || 'Failed to create submission set');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sets-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="flex items-center gap-2">
            <FolderPlus className="text-forest-700" size={20} />
            Create Submission Set
          </h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sets-modal-form">
          {serverError && (
            <div className="sets-alert-error">
              <AlertTriangle size={16} />
              <span>{serverError}</span>
            </div>
          )}

          {/* Position Selector */}
          <div className="sets-form-group">
            <label className="sets-form-label">Position / Job Order *</label>
            <select
              value={positionId}
              onChange={e => setPositionId(e.target.value)}
              className="sets-form-input"
              required
            >
              <option value="">Select a position...</option>
              {positions.map(p => (
                <option key={p._id} value={p._id}>
                  {p.jobOrderId} — {p.position} ({p.client?.clientName})
                </option>
              ))}
            </select>
            <span className="sets-form-help">
              The sequential set number (Set 01, Set 02, etc.) will be automatically assigned safely by the server.
            </span>
          </div>

          {/* Actual Sent Date vs Upload Timestamp */}
          <div className="sets-form-row">
            <div className="sets-form-group flex-1">
              <label className="sets-form-label">Date Sent to Client *</label>
              <input
                type="date"
                value={sentToClientAt}
                onChange={e => setSentToClientAt(e.target.value)}
                className="sets-form-input"
                required
              />
              <span className="sets-form-help">
                Actual date the CVs were emailed or transmitted to the client.
              </span>
            </div>

            <div className="sets-form-group flex-1">
              <label className="sets-form-label">System Upload Date</label>
              <input
                type="text"
                value="Now (auto-timestamped)"
                disabled
                className="sets-form-input bg-gray-50 text-gray-500"
              />
              <span className="sets-form-help">
                Kept strictly distinct from client transmission date.
              </span>
            </div>
          </div>

          {/* Sourcing TAs Multi-Select */}
          <div className="sets-form-group">
            <label className="sets-form-label">Sourcing TAs</label>
            <select
              value=""
              onChange={e => handleAddSourcingTA(e.target.value)}
              className="sets-form-input"
            >
              <option value="">Select a sourcing TA to add...</option>
              {tas
                .filter(t => !sourcingTAs.includes(t._id))
                .map(t => (
                  <option key={t._id} value={t._id}>
                    {t.name} {t.status ? `(${t.status})` : ''}
                  </option>
                ))}
            </select>
            {sourcingTAs.length > 0 && (
              <div className="sets-ta-chips">
                {sourcingTAs.map(id => {
                  const taObj = tas.find(t => t._id === id);
                  return (
                    <span key={id} className="sets-ta-chip">
                      <span
                        className="sets-ta-chip-dot"
                        style={{ backgroundColor: taObj?.color || '#059669' }}
                      />
                      {taObj?.name || 'Unknown TA'}
                      <button
                        type="button"
                        onClick={() => handleRemoveSourcingTA(id)}
                        className="sets-ta-chip-remove"
                        title="Remove TA"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <span className="sets-form-help">
              Select one or more TAs who sourced candidates in this batch. Sourcing attribution is preserved per candidate.
            </span>
          </div>

          {/* Quality Rating & Batch Notes */}
          <div className="sets-form-row">
            <div className="sets-form-group flex-1">
              <label className="sets-form-label">Quality Rating</label>
              <select
                value={qualityRating}
                onChange={e => setQualityRating(e.target.value)}
                className="sets-form-input"
              >
                <option value="Not Rated">Not Rated</option>
                <option value="Good">Good CV</option>
                <option value="Optional">Optional CV</option>
              </select>
              <span className="sets-form-help">
                Initial batch quality rating.
              </span>
            </div>

            <div className="sets-form-group flex-1">
              <label className="sets-form-label">Batch Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. First round of 4 senior candidates sent after initial call"
                className="sets-form-input"
              />
            </div>
          </div>

          {/* Files Upload Dropzone */}
          <div className="sets-form-group">
            <label className="sets-form-label">CV Files (.pdf, .doc, .docx up to 10MB) *</label>
            <div
              className="sets-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="text-forest-600 mb-1" size={24} />
              <p className="text-sm font-semibold text-gray-700">Click or Drag CV files here</p>
              <span className="text-xs text-gray-500">Supports multi-file upload up to 10 files</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {clientErrors.length > 0 && (
              <div className="sets-client-errors">
                {clientErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">⚠ {err}</p>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <div className="sets-selected-files">
                <span className="text-xs font-semibold text-gray-600">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected:
                </span>
                <ul className="sets-files-list">
                  {files.map((f, i) => (
                    <li key={i} className="sets-file-item">
                      <span className="sets-file-name" title={f.name}>{f.name}</span>
                      <span className="sets-file-size">({(f.size / 1024).toFixed(0)} KB)</span>
                      <button
                        type="button"
                        className="sets-file-remove"
                        onClick={() => handleRemoveFile(i)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || files.length === 0}
            >
              {isSubmitting ? 'Uploading & Creating...' : `Create Set (${files.length} CVs)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal Component: Set Details & Candidate Submissions View
 */
function SetDetailsModal({ setId, data, loading, onClose, onDownloadCv, onAddCvs }) {
  if (loading || !data) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal sets-modal sets-modal--lg" onClick={e => e.stopPropagation()}>
          <div className="p-8 text-center text-gray-500">Loading set details...</div>
        </div>
      </div>
    );
  }

  const { set, submissions, metrics } = data;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sets-modal sets-modal--lg" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="sets-badge-set text-sm">{set.setNumber}</span>
              <span className="sets-id-label">{set.submissionSetId}</span>
              <span className="text-gray-400">·</span>
              <strong>{set.jobOrderId}</strong>
              <span className="text-gray-600 font-medium">({set.position?.client?.clientName})</span>
            </div>
            <p className="text-xs text-gray-500">
              {set.position?.position} — Transmission Date: <strong>{formatDate(set.sentToClientAt)}</strong>
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Set Metrics Ribbon */}
        <div className="sets-detail-metrics">
          <div className="sets-detail-metric">
            <span className="sets-detail-metric-val">{metrics.totalSubmissions}</span>
            <span className="sets-detail-metric-label">Submissions</span>
          </div>
          <div className="sets-detail-metric">
            <span className="sets-detail-metric-val">{metrics.uniqueCandidatesByName}</span>
            <span className="sets-detail-metric-label">Unique Candidates</span>
          </div>
          <div className="sets-detail-metric">
            <span className="sets-detail-metric-val">{metrics.goodCvs}</span>
            <span className="sets-detail-metric-label">Good CVs</span>
          </div>
          <div className="sets-detail-metric">
            <span className="sets-detail-metric-val">{metrics.clientShortlisted}</span>
            <span className="sets-detail-metric-label">Client Shortlisted</span>
          </div>
          <div className="sets-detail-metric">
            <span className="sets-detail-metric-val">{metrics.withdrawn}</span>
            <span className="sets-detail-metric-label">Withdrawn</span>
          </div>
        </div>

        {/* Meta summary strip */}
        <div className="sets-meta-strip">
          {set.sourcingTAs && set.sourcingTAs.length > 0 ? (
            <div className="sets-meta-item">
              <span className="sets-meta-label">Sourcing TAs:</span>
              <div className="flex flex-wrap gap-1">
                {set.sourcingTAs.map(ta => (
                  <span key={ta._id || ta} className="sets-ta-pill">
                    {ta.name || 'TA'}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="sets-meta-item">
              <span className="sets-meta-label">Uploaded By:</span>
              <span className="sets-ta-pill">{set.uploadedBy?.name || '—'}</span>
            </div>
          )}
          <div className="sets-meta-item">
            <span className="sets-meta-label">Uploaded At:</span>
            <span>{formatDateTime(set.uploadedAt)}</span>
          </div>
          {set.notes && (
            <div className="sets-meta-item flex-1">
              <span className="sets-meta-label">Notes:</span>
              <span className="text-gray-700 italic">{set.notes}</span>
            </div>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm flex items-center gap-1.5"
            onClick={onAddCvs}
          >
            <Plus size={14} /> Add CVs to Set
          </button>
        </div>

        {/* Submissions Table */}
        <div className="sets-submissions-wrap">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
            Candidate Submissions in this Set ({submissions.length})
          </h4>

          {submissions.length === 0 ? (
            <div className="p-6 text-center text-gray-500 bg-gray-50 rounded border border-dashed border-gray-200">
              No CVs uploaded in this set yet.
            </div>
          ) : (
            <table className="sets-table">
              <thead>
                <tr>
                  <th>Candidate Name</th>
                  <th>File Metadata</th>
                  <th>Attribution (Sourced / Uploaded)</th>
                  <th>Internal Evaluation</th>
                  <th>Client Decision</th>
                  <th style={{ textAlign: 'right' }}>CV</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => (
                  <tr key={sub._id}>
                    <td>
                      <strong className="sets-candidate-name">{sub.unverifiedLabel || 'Candidate'}</strong>
                      {sub.isWithdrawn && (
                        <span className="sets-withdrawn-badge ml-1.5">Withdrawn</span>
                      )}
                    </td>
                    <td>
                      <div className="text-xs text-gray-700">
                        <span className="font-mono">{sub.originalFileName}</span>
                        <span className="text-gray-400"> · {formatBytes(sub.fileSize)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1 text-xs">
                        {sub.sourcedBy?.name && (
                          <span className="text-gray-700">
                            <strong>Sourced:</strong> {sub.sourcedBy.name}
                          </span>
                        )}
                        {sub.submittedBy?.name && (
                          <span className="text-gray-500">
                            <strong>Uploaded:</strong> {sub.submittedBy.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={`sets-status-pill sets-status--${(sub.internalShortlistStatus || 'pending').toLowerCase()}`}>
                          {sub.internalShortlistStatus}
                        </span>
                        {sub.qualityRating && sub.qualityRating !== 'Not Rated' && (
                          <span className={`sets-quality-pill sets-quality--${sub.qualityRating.toLowerCase()}`}>
                            {sub.qualityRating}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`sets-client-pill sets-client--${(sub.clientShortlistStatus || 'pending').replace(/\s+/g, '').toLowerCase()}`}>
                        {sub.clientShortlistStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => onDownloadCv(sub._id)}
                        title="Download CV"
                      >
                        <Download size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal Component: Upload to Existing Set
 */
function UploadToExistingSetModal({ set, tas, onClose, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [clientErrors, setClientErrors] = useState([]);
  const [sourcedBy, setSourcedBy] = useState('');
  const [internalShortlistStatus, setInternalShortlistStatus] = useState('Pending');
  const [qualityRating, setQualityRating] = useState('Not Rated');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const fileInputRef = useRef(null);

  const validateFiles = (fileList) => {
    const valid = [];
    const errors = [];

    Array.from(fileList).forEach(file => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
      const isMimeAllowed = !file.type || ALLOWED_MIME_TYPES.includes(file.type);

      if (!isExtAllowed || !isMimeAllowed) {
        errors.push(`${file.name}: Invalid format. Allowed: PDF, DOC, DOCX.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: Exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
        return;
      }

      valid.push(file);
    });

    return { valid, errors };
  };

  const handleFileChange = (e) => {
    setClientErrors([]);
    const { valid, errors } = validateFiles(e.target.files);
    if (errors.length > 0) setClientErrors(errors);
    setFiles(prev => [...prev, ...valid]);
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) return alert('Please select at least one CV file.');

    setIsSubmitting(true);
    setServerError(null);

    const formData = new FormData();
    if (sourcedBy) formData.append('sourcedBy', sourcedBy);
    formData.append('internalShortlistStatus', internalShortlistStatus);
    formData.append('qualityRating', qualityRating);

    files.forEach(f => {
      formData.append('files', f);
    });

    try {
      await uploadCvsToSet(set._id, formData);
      onSuccess();
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.failed && Array.isArray(respData.failed) && respData.failed.length > 0) {
        const failureDetails = respData.failed.map(f => `${f.fileName}: ${f.error}`).join(' | ');
        setServerError(`${respData.error || 'Upload failed'}: ${failureDetails}`);
      } else {
        setServerError(respData?.error || err.message || 'Failed to upload CVs to set');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sets-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="flex items-center gap-2">
            <Plus className="text-forest-700" size={20} />
            Add CVs to {set.setNumber} ({set.submissionSetId})
          </h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="sets-modal-form">
          {serverError && (
            <div className="sets-alert-error">
              <AlertTriangle size={16} />
              <span>{serverError}</span>
            </div>
          )}

          <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 mb-2">
            Adding CVs to <strong>{set.jobOrderId}</strong> ({set.setNumber}). All submissions in this batch will inherit the actual client-sent date (<strong>{formatDate(set.sentToClientAt)}</strong>).
          </div>

          <div className="sets-form-row">
            <div className="sets-form-group flex-1">
              <label className="sets-form-label">Sourcing TA (Optional)</label>
              <select
                value={sourcedBy}
                onChange={e => setSourcedBy(e.target.value)}
                className="sets-form-input"
              >
                <option value="">Default (Uploader)</option>
                {tas.map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="sets-form-group flex-1">
              <label className="sets-form-label">Initial Shortlist Status</label>
              <select
                value={internalShortlistStatus}
                onChange={e => setInternalShortlistStatus(e.target.value)}
                className="sets-form-input"
              >
                <option value="Pending">Pending Evaluation</option>
                <option value="Shortlisted">Internally Shortlisted</option>
              </select>
            </div>
          </div>

          {internalShortlistStatus === 'Shortlisted' && (
            <div className="sets-form-group">
              <label className="sets-form-label">Quality Rating</label>
              <select
                value={qualityRating}
                onChange={e => setQualityRating(e.target.value)}
                className="sets-form-input"
              >
                <option value="Not Rated">Not Rated</option>
                <option value="Good">Good CV</option>
                <option value="Optional">Optional CV</option>
              </select>
            </div>
          )}

          <div className="sets-form-group">
            <label className="sets-form-label">CV Files (.pdf, .doc, .docx) *</label>
            <div
              className="sets-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileText className="text-forest-600 mb-1" size={24} />
              <p className="text-sm font-semibold text-gray-700">Click or Drag CV files here</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {clientErrors.length > 0 && (
              <div className="sets-client-errors">
                {clientErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">⚠ {err}</p>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <div className="sets-selected-files">
                <span className="text-xs font-semibold text-gray-600">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected:
                </span>
                <ul className="sets-files-list">
                  {files.map((f, i) => (
                    <li key={i} className="sets-file-item">
                      <span className="sets-file-name">{f.name}</span>
                      <button
                        type="button"
                        className="sets-file-remove"
                        onClick={() => handleRemoveFile(i)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || files.length === 0}
            >
              {isSubmitting ? 'Uploading...' : `Upload to ${set.setNumber}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
