import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  AlertTriangle,
  Download,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check,
  Trash2
} from 'lucide-react';
import {
  getSubmissionSets,
  getSubmissionSetById,
  createSetWithUpload,
  uploadCvsToSet,
  updateSubmissionSet,
  deleteSubmissionSet
} from '../api/submissionSets';
import { getPositions } from '../api/positions';
import { getDownloadUrl, deleteSubmission } from '../api/cvs';
import './SubmissionSets.css';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Converts a Date or date string into YYYY-MM-DD format safely.
 */
export function toYMD(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats any date strictly as DD MMM YYYY (e.g. 16 Nov 2026).
 */
export function formatDateDDMMMYYYY(dateInput) {
  if (!dateInput) return '—';
  const ymd = toYMD(dateInput);
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  const monthIndex = Number(m) - 1;
  if (monthIndex < 0 || monthIndex > 11) return '—';
  return `${String(Number(d)).padStart(2, '0')} ${MONTH_SHORT[monthIndex]} ${y}`;
}

/**
 * Parses a human-readable date ("16 Nov 2026") or ISO ("2026-11-16") into YYYY-MM-DD.
 */
export function parseHumanDate(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const dayNum = Number(m[1]);
    const monthIdx = MONTH_SHORT.findIndex(
      mon => mon.toLowerCase() === m[2].slice(0, 3).toLowerCase()
    );
    const yearNum = Number(m[3]);
    if (monthIdx >= 0 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1970 && yearNum <= 2100) {
      const check = new Date(yearNum, monthIdx, dayNum);
      if (
        check.getFullYear() === yearNum &&
        check.getMonth() === monthIdx &&
        check.getDate() === dayNum
      ) {
        return `${yearNum}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

/**
 * Returns the colour badge class for Set 01 (Green), Set 02 (Blue), Set 03 (Purple), Set 04 (Amber), cycling for subsequent sets.
 */
export function getSetBadgeClass(setNumber, setSequence) {
  let seq = Number(setSequence);
  if (!seq || isNaN(seq)) {
    const match = String(setNumber || '').match(/(\d+)/);
    seq = match ? Number(match[1]) : 1;
  }
  const colorIndex = ((Math.max(1, seq) - 1) % 4) + 1;
  return `ss-chip ss-chip--s${colorIndex}`;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 KB';
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  const kb = Math.round(bytes / k);
  if (kb < 1024) return `${kb} KB`;
  return `${(bytes / (k * k)).toFixed(1)} MB`;
}

function getFileTypeLabel(mimeType, fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'PDF';
  if (lower.endsWith('.docx') || String(mimeType).includes('wordprocessingml')) return 'DOCX';
  if (lower.endsWith('.doc') || mimeType === 'application/msword') return 'DOC';
  return 'CV';
}

/**
 * Helper hook for portal popover positioning so dropdowns and calendars are never clipped.
 */
function usePopoverPosition(triggerRef, isOpen, menuWidth = 260, estimatedHeight = 280) {
  const [style, setStyle] = useState({});

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !isOpen) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let top = rect.bottom + 6;
    if (top + estimatedHeight > viewportH - 12 && rect.top > estimatedHeight + 12) {
      top = rect.top - estimatedHeight - 6;
    }

    const width = Math.max(rect.width, menuWidth);
    let left = rect.left;
    if (left + width > viewportW - 12) {
      left = Math.max(12, viewportW - width - 12);
    }

    setStyle({
      position: 'fixed',
      top: `${Math.max(8, top)}px`,
      left: `${left}px`,
      width: `${width}px`,
    });
  }, [triggerRef, isOpen, menuWidth, estimatedHeight]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return style;
}

/**
 * PHASE 5: Custom Modern Dropdown Component
 */
export function CustomDropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  searchable = false,
  searchPlaceholder = 'Search…',
  fullWidth = false,
  inModal = false,
  minMenuWidth = 220
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedOption = useMemo(
    () => options.find(o => String(o.value) === String(value)),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(o =>
      String(o.label || '').toLowerCase().includes(q) ||
      String(o.searchText || '').toLowerCase().includes(q)
    );
  }, [options, searchable, query]);

  const popoverStyle = usePopoverPosition(triggerRef, open, minMenuWidth, 255);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    if (searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 10);
    }
    const handleOutside = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, searchable]);

  return (
    <div className={`ss-dropdown ${fullWidth ? 'ss-dropdown--full' : ''} ${inModal ? 'ss-dropdown--modal' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`ss-dropdown-trigger ${open ? 'ss-dropdown-trigger--open' : ''}`}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className={`ss-dropdown-trigger-text ${!selectedOption ? 'ss-dropdown-trigger-placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`ss-dropdown-arrow ${open ? 'ss-dropdown-arrow--open' : ''}`}
        />
      </button>

      {open &&
        createPortal(
          <div ref={menuRef} className="ss-dropdown-menu" style={popoverStyle}>
            {searchable && (
              <div className="ss-dropdown-search-wrap">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="ss-dropdown-search-input"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
            )}
            <div className="ss-dropdown-options">
              {filteredOptions.length === 0 ? (
                <div className="ss-dropdown-empty">No matching options</div>
              ) : (
                filteredOptions.map(opt => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <div
                      key={String(opt.value)}
                      className={`ss-dropdown-option ${isSelected ? 'ss-dropdown-option--selected' : ''}`}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <Check size={14} />}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * PHASE 6: Custom Modern Calendar Picker Component
 * Displays and selects dates consistently in DD MMM YYYY format (e.g. 16 Nov 2026).
 */
export function CustomDatePicker({
  value,
  onChange,
  placeholder = 'Choose a date',
  allowClear = false,
  fullWidth = false,
  renderTrigger = null
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const selectedYMD = useMemo(() => toYMD(value), [value]);
  const todayYMD = useMemo(() => toYMD(new Date()), []);

  const [viewDate, setViewDate] = useState(() => {
    if (selectedYMD) {
      const [y, m] = selectedYMD.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (open && selectedYMD) {
      const [y, m] = selectedYMD.split('-').map(Number);
      setViewDate(new Date(y, m - 1, 1));
    }
  }, [open, selectedYMD]);

  const popoverStyle = usePopoverPosition(triggerRef, open, 292, 315);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const moveMonth = (delta) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const moveYear = (delta) => {
    setViewDate(prev => new Date(prev.getFullYear() + delta, prev.getMonth(), 1));
  };

  const handleSelectDay = (dayNum) => {
    const formattedYMD = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    onChange(formattedYMD);
    setOpen(false);
  };

  return (
    <div className={`ss-datepicker ${fullWidth ? 'ss-datepicker--full' : ''}`}>
      {renderTrigger ? (
        <span
          ref={triggerRef}
          onClick={() => setOpen(prev => !prev)}
          style={{ display: 'inline-block' }}
        >
          {renderTrigger({
            open,
            displayValue: selectedYMD ? formatDateDDMMMYYYY(selectedYMD) : placeholder
          })}
        </span>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={`ss-datepicker-input ${open ? 'ss-datepicker-input--open' : ''}`}
          onClick={() => setOpen(prev => !prev)}
        >
          <span className={!selectedYMD ? 'ss-datepicker-placeholder' : ''}>
            {selectedYMD ? formatDateDDMMMYYYY(selectedYMD) : placeholder}
          </span>
          <span className="ss-datebtn-icon">▦</span>
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="ss-calendar-popover"
            style={{ ...popoverStyle, width: '292px' }}
          >
            <div className="ss-cal-head">
              <span className="ss-cal-title">
                {MONTH_FULL[month]} {year}
              </span>
              <div className="ss-cal-nav">
                <button
                  type="button"
                  className="ss-cal-nav-btn"
                  onClick={() => moveYear(-1)}
                  title="Previous Year"
                >
                  «
                </button>
                <button
                  type="button"
                  className="ss-cal-nav-btn"
                  onClick={() => moveMonth(-1)}
                  title="Previous Month"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="ss-cal-nav-btn"
                  onClick={() => moveMonth(1)}
                  title="Next Month"
                >
                  ›
                </button>
                <button
                  type="button"
                  className="ss-cal-nav-btn"
                  onClick={() => moveYear(1)}
                  title="Next Year"
                >
                  »
                </button>
              </div>
            </div>

            <div className="ss-cal-grid">
              {WEEKDAYS.map(d => (
                <span key={d} className="ss-cal-weekday">
                  {d}
                </span>
              ))}
              {Array.from({ length: 42 }, (_, idx) => {
                const dayNum = idx - firstDayOffset + 1;
                const isValid = dayNum >= 1 && dayNum <= daysInMonth;
                if (!isValid) {
                  return (
                    <button key={idx} type="button" className="ss-cal-day" disabled>
                      {''}
                    </button>
                  );
                }
                const cellYMD = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = cellYMD === selectedYMD;
                const isToday = cellYMD === todayYMD;
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`ss-cal-day ${isToday ? 'ss-cal-day--today' : ''} ${isSelected ? 'ss-cal-day--selected' : ''}`}
                    onClick={() => handleSelectDay(dayNum)}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>

            <div className="ss-cal-footer">
              <button
                type="button"
                className="ss-cal-footer-btn"
                onClick={() => {
                  onChange(todayYMD);
                  setOpen(false);
                }}
              >
                Today
              </button>
              {allowClear && selectedYMD && (
                <button
                  type="button"
                  className="ss-cal-footer-btn ss-cal-footer-btn--muted"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * Main Submission Sets Page (Phase 1)
 */
export default function SubmissionSets() {
  const queryClient = useQueryClient();

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'grouped'

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSetDetailsId, setSelectedSetDetailsId] = useState(null);
  const [uploadTargetSet, setUploadTargetSet] = useState(null);

  // Expanded position groups in grouped view
  const [expandedPositions, setExpandedPositions] = useState({});

  // 1. Fetch Positions
  const { data: positionsRes } = useQuery({
    queryKey: ['positions', 'list'],
    queryFn: () => getPositions({}),
    staleTime: 5 * 60 * 1000
  });
  const positionsList = Array.isArray(positionsRes?.data) ? positionsRes.data : [];

  // 2. Fetch Submission Sets
  const {
    data: setsRes,
    isLoading: loadingSets,
    error: setsError,
    refetch: refetchSets
  } = useQuery({
    queryKey: ['submission-sets', filterPosition, dateFrom, dateTo, searchQuery],
    queryFn: () =>
      getSubmissionSets({
        position: filterPosition || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        search: searchQuery || undefined
      })
  });
  const rawSetsList = Array.isArray(setsRes?.data) ? setsRes.data : [];

  // Client-side partial-match filtering for Client name, Position/designation, and Set number (Phase 1.2)
  const setsList = useMemo(() => {
    return rawSetsList.filter(set => {
      if (filterPosition && String(set.position?._id || set.position) !== String(filterPosition)) {
        return false;
      }
      if (dateFrom) {
        const setYMD = toYMD(set.sentToClientAt);
        if (!setYMD || setYMD < dateFrom) return false;
      }
      if (dateTo) {
        const setYMD = toYMD(set.sentToClientAt);
        if (!setYMD || setYMD > dateTo) return false;
      }
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const clientName = (set.position?.client?.clientName || '').toLowerCase();
        const positionName = (set.position?.position || '').toLowerCase();
        const setNumber = (set.setNumber || '').toLowerCase();
        const setSeqStr = set.setSequence ? `set ${set.setSequence}` : '';
        const combined = `${clientName} ${positionName} ${setNumber} ${setSeqStr}`;
        if (
          !clientName.includes(q) &&
          !positionName.includes(q) &&
          !setNumber.includes(q) &&
          !setSeqStr.includes(q) &&
          !combined.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rawSetsList, filterPosition, dateFrom, dateTo, searchQuery]);

  // 3. Fetch detailed set when a Set Number is clicked
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

  // Position filter dropdown options (No Job Order IDs shown)
  const positionFilterOptions = useMemo(() => {
    const opts = [{ value: '', label: 'All Positions', searchText: 'all positions' }];
    positionsList.forEach(p => {
      const clientName = p.client?.clientName || '';
      const posTitle = p.position || 'Unnamed Position';
      const label = clientName ? `${posTitle} (${clientName})` : posTitle;
      opts.push({
        value: p._id,
        label,
        searchText: `${clientName} ${posTitle}`
      });
    });
    return opts;
  }, [positionsList]);

  // Grouped sets by position
  const groupedSets = useMemo(() => {
    const groups = {};
    setsList.forEach(set => {
      const posId = set.position?._id || set.position || 'other';
      if (!groups[posId]) {
        groups[posId] = {
          positionId: posId,
          positionName: set.position?.position || '—',
          clientName: set.position?.client?.clientName || '—',
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
      [posId]: prev[posId] === false ? true : false
    }));
  };

  // Direct inline Sent to Client date update from main table (Phase 1.6)
  const handleInlineDateUpdate = async (setId, newDateYMD) => {
    if (!newDateYMD) return;
    try {
      await updateSubmissionSet(setId, { sentToClientAt: newDateYMD });
      refetchSets();
      if (selectedSetDetailsId === setId) {
        refetchDetails();
      }
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    } catch (err) {
      const serverErrMsg = err.response?.data?.error || err.response?.data?.message;
      const isRouteNotLoaded = err.response?.status === 404 && !serverErrMsg;
      alert(
        isRouteNotLoaded
          ? 'Cannot connect to the update route (404). Please restart your backend server terminal (press Ctrl+C, then run npm start or npm run dev) to load the new route.'
          : serverErrMsg || (err.message ? `Error: ${err.message}` : 'Failed to update Sent to Client date.')
      );
    }
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

  const renderSetRow = (set) => {
    const clientName = set.position?.client?.clientName || '—';
    const positionName = set.position?.position || '—';
    const cvCount = Number(set.cvCount) || 0;

    return (
      <tr key={set._id}>
        <td className="ss-client-cell" title={clientName}>
          {clientName}
        </td>
        <td className="ss-pos-cell" title={positionName}>
          <button
            type="button"
            className="ss-pos-link"
            onClick={() => setSelectedSetDetailsId(set._id)}
          >
            {positionName}
          </button>
        </td>
        <td>
          <button
            type="button"
            className={getSetBadgeClass(set.setNumber, set.setSequence)}
            onClick={() => setSelectedSetDetailsId(set._id)}
          >
            {set.setNumber}
          </button>
        </td>
        <td>
          <CustomDatePicker
            value={set.sentToClientAt}
            onChange={(newYMD) => handleInlineDateUpdate(set._id, newYMD)}
            renderTrigger={({ displayValue }) => (
              <button
                type="button"
                className="ss-datebtn"
                title="Click to edit Sent to Client date"
              >
                <span className="ss-datebtn-icon">▦</span>
                <span>{displayValue}</span>
              </button>
            )}
          />
        </td>
        <td>
          <span className="ss-cv-badge">
            {cvCount} CV{cvCount === 1 ? '' : 's'}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <main className="ss-page">
      {/* Phase 1.1: Header without descriptive subtitle and without KPI cards */}
      <header className="ss-head">
        <h1>
          <span className="ss-head-icon">▱</span>
          Submission Sets
        </h1>
        <button
          type="button"
          className="ss-btn ss-btn--primary"
          onClick={() => setShowCreateModal(true)}
        >
          ＋ Create Submission Set
        </button>
      </header>

      {/* Phase 1.2: Search and Filters Toolbar */}
      <div className="ss-toolbar">
        <div className="ss-search">
          <Search size={16} className="ss-search-icon" />
          <input
            type="text"
            placeholder="Search by Client, Position or Set Number…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ss-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="ss-filters">
          {/* Searchable All Positions Custom Dropdown */}
          <CustomDropdown
            value={filterPosition}
            onChange={setFilterPosition}
            options={positionFilterOptions}
            placeholder="All Positions"
            searchable={true}
            searchPlaceholder="Search position or client…"
            minMenuWidth={280}
          />

          {/* Sent Date Range Filter with Custom Calendar Picker */}
          <span className="ss-filter-label">Sent:</span>
          <CustomDatePicker
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="From date"
            allowClear={true}
          />
          <span className="ss-filter-label">to</span>
          <CustomDatePicker
            value={dateTo}
            onChange={setDateTo}
            placeholder="To date"
            allowClear={true}
          />

          {/* All Sets / Group by Position Toggle */}
          <button
            type="button"
            className={`ss-btn ss-btn--small ${viewMode === 'all' ? 'ss-btn--active-toggle' : ''}`}
            onClick={() => setViewMode('all')}
          >
            All Sets
          </button>
          <button
            type="button"
            className={`ss-btn ss-btn--small ${viewMode === 'grouped' ? 'ss-btn--active-toggle' : ''}`}
            onClick={() => setViewMode('grouped')}
          >
            Group by Position
          </button>
        </div>
      </div>

      {/* Phase 1.3–1.8: Main Table Content */}
      {loadingSets ? (
        <div className="ss-state-box">
          <RefreshCw className="animate-spin mx-auto mb-2" size={22} />
          <div>Loading submission sets…</div>
        </div>
      ) : setsError ? (
        <div className="ss-state-box">
          <AlertTriangle size={22} className="mx-auto mb-2" style={{ color: '#dc2626' }} />
          <div>Error loading submission sets: {setsError.message}</div>
          <button type="button" className="ss-btn mt-3" onClick={() => refetchSets()}>
            Retry
          </button>
        </div>
      ) : viewMode === 'all' ? (
        <section className="ss-tablecard">
          <div className="ss-scroll">
            <table className="ss-table">
              <colgroup>
                <col className="col-client" />
                <col className="col-position" />
                <col className="col-set" />
                <col className="col-sent" />
                <col className="col-cvs" />
              </colgroup>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Position</th>
                  <th>Set Number</th>
                  <th>Sent to Client</th>
                  <th>CVs</th>
                </tr>
              </thead>
              <tbody>
                {setsList.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '35px', color: '#718078' }}>
                      No submission sets found.
                    </td>
                  </tr>
                ) : (
                  setsList.map(set => renderSetRow(set))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : groupedSets.length === 0 ? (
        <section className="ss-tablecard">
          <div style={{ textAlign: 'center', padding: '35px', color: '#718078' }}>
            No submission sets found.
          </div>
        </section>
      ) : (
        <div className="ss-grouped-list">
          {groupedSets.map(group => {
            const isExpanded = expandedPositions[group.positionId] !== false;
            const totalCvs = group.sets.reduce((sum, s) => sum + (Number(s.cvCount) || 0), 0);
            return (
              <section key={group.positionId} className="ss-group-card">
                <div
                  className="ss-group-header"
                  onClick={() => toggleGroup(group.positionId)}
                >
                  <div className="ss-group-title-wrap">
                    {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    <h3 className="ss-group-title">
                      {group.clientName} – {group.positionName}
                    </h3>
                  </div>
                  <div className="ss-group-meta">
                    <span className="ss-cv-badge">
                      {group.sets.length} Set{group.sets.length === 1 ? '' : 's'} · {totalCvs} CV{totalCvs === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="ss-scroll">
                    <table className="ss-table">
                      <colgroup>
                        <col className="col-client" />
                        <col className="col-position" />
                        <col className="col-set" />
                        <col className="col-sent" />
                        <col className="col-cvs" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Position</th>
                          <th>Set Number</th>
                          <th>Sent to Client</th>
                          <th>CVs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.sets.map(set => renderSetRow(set))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Phase 2: Submission Set Details Modal */}
      {selectedSetDetailsId && (
        <SetDetailsModal
          data={detailedSetData}
          loading={loadingDetails}
          onClose={() => setSelectedSetDetailsId(null)}
          onDownloadCv={handleDownloadCv}
          onAddCvs={() => {
            if (detailedSetData?.set) {
              setUploadTargetSet(detailedSetData.set);
            }
          }}
          onUpdated={() => {
            refetchDetails();
            refetchSets();
            queryClient.invalidateQueries({ queryKey: ['positions'] });
          }}
          onDeletedSet={() => {
            setSelectedSetDetailsId(null);
            refetchSets();
            queryClient.invalidateQueries({ queryKey: ['positions'] });
          }}
        />
      )}

      {/* Phase 3: Create Submission Set Modal */}
      {showCreateModal && (
        <CreateSubmissionSetModal
          positions={positionsList}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetchSets();
            queryClient.invalidateQueries({ queryKey: ['positions'] });
          }}
        />
      )}

      {/* Phase 4: Add CVs Modal */}
      {uploadTargetSet && (
        <AddCvsToSetModal
          set={uploadTargetSet}
          onClose={() => setUploadTargetSet(null)}
          onSuccess={() => {
            setUploadTargetSet(null);
            refetchSets();
            queryClient.invalidateQueries({ queryKey: ['positions'] });
            if (selectedSetDetailsId) {
              refetchDetails();
            }
          }}
        />
      )}
    </main>
  );
}

/**
 * PHASE 2: Submission Set Details Modal
 */
function SetDetailsModal({ data, loading, onClose, onDownloadCv, onAddCvs, onUpdated, onDeletedSet }) {
  const set = data?.set;
  const submissions = Array.isArray(data?.submissions) ? data.submissions : [];
  const metrics = data?.metrics || {
    totalSubmissions: 0,
    goodCvs: 0,
    clientShortlisted: 0,
    withdrawn: 0
  };

  const [editedDateYMD, setEditedDateYMD] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [deletingSubId, setDeletingSubId] = useState(null);
  const [deletingSet, setDeletingSet] = useState(false);

  useEffect(() => {
    if (set?.sentToClientAt) {
      setEditedDateYMD(toYMD(set.sentToClientAt));
    }
  }, [set?.sentToClientAt]);

  if (loading || !set) {
    return (
      <div className="ss-overlay" onClick={onClose}>
        <section className="ss-dialog" onClick={e => e.stopPropagation()}>
          <div className="ss-db" style={{ textAlign: 'center', padding: '40px', color: '#718078' }}>
            Loading submission set details…
          </div>
        </section>
      </div>
    );
  }

  const clientName = set.position?.client?.clientName || 'Client';
  const positionName = set.position?.position || 'Position';

  const handleSaveDate = async () => {
    const parsed = parseHumanDate(editedDateYMD) || toYMD(editedDateYMD);
    if (!parsed) {
      alert('Please select a valid date (e.g. 16 Nov 2026).');
      return;
    }
    setSavingDate(true);
    try {
      await updateSubmissionSet(set._id, { sentToClientAt: parsed });
      if (typeof onUpdated === 'function') onUpdated();
    } catch (err) {
      const serverErrMsg = err.response?.data?.error || err.response?.data?.message;
      const isRouteNotLoaded = err.response?.status === 404 && !serverErrMsg;
      alert(
        isRouteNotLoaded
          ? 'Cannot connect to the update route (404). Please restart your backend server terminal (press Ctrl+C, then run npm start or npm run dev) to load the new route.'
          : serverErrMsg || (err.message ? `Error: ${err.message}` : 'Failed to update Sent to Client date.')
      );
    } finally {
      setSavingDate(false);
    }
  };

  const handleDeleteCandidate = async (sub) => {
    const label = sub.unverifiedLabel || sub.originalFileName || 'this CV';
    if (!window.confirm(`Delete "${label}" from ${set.setNumber}?`)) {
      return;
    }
    setDeletingSubId(sub._id);
    try {
      await deleteSubmission(sub._id);
      if (typeof onUpdated === 'function') onUpdated();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete CV.');
    } finally {
      setDeletingSubId(null);
    }
  };

  const handleDeleteWholeSet = async () => {
    const count = submissions.length;
    const msg =
      count > 0
        ? `Are you sure you want to delete ${set.setNumber} (${clientName} – ${positionName}) and its ${count} CV${count === 1 ? '' : 's'}?`
        : `Are you sure you want to delete ${set.setNumber} (${clientName} – ${positionName})?`;
    if (!window.confirm(msg)) {
      return;
    }
    setDeletingSet(true);
    try {
      await deleteSubmissionSet(set._id, { deleteCvs: true });
      if (typeof onDeletedSet === 'function') {
        onDeletedSet();
      } else {
        onClose();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete submission set.');
    } finally {
      setDeletingSet(false);
    }
  };

  return (
    <div className="ss-overlay" onClick={onClose}>
      <section className="ss-dialog" onClick={e => e.stopPropagation()}>
        {/* Phase 2.1: Header with Set Number, Client Name, Position Name only */}
        <header className="ss-dh">
          <div>
            <h2>
              <span className={getSetBadgeClass(set.setNumber, set.setSequence)}>
                {set.setNumber}
              </span>
              <span>· {clientName}</span>
            </h2>
            <div className="ss-dh-sub">{positionName}</div>
          </div>
          <button type="button" className="ss-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="ss-db">
          {/* Phase 2.2: Sent to Client Date in DD MMM YYYY with Save Date action */}
          <div className="ss-meta-box" style={{ justifyContent: 'space-between' }}>
            <div>
              <label>Sent to Client</label>
              <div className="ss-meta-date-row">
                <CustomDatePicker
                  value={editedDateYMD}
                  onChange={setEditedDateYMD}
                  placeholder="e.g. 16 Nov 2026"
                />
                <button
                  type="button"
                  className="ss-btn ss-btn--small"
                  onClick={handleSaveDate}
                  disabled={savingDate}
                >
                  {savingDate ? 'Saving…' : 'Save date'}
                </button>
              </div>
            </div>

            <button
              type="button"
              className="ss-btn ss-btn--danger ss-btn--small"
              onClick={handleDeleteWholeSet}
              disabled={deletingSet}
              title={`Delete ${set.setNumber}`}
            >
              <Trash2 size={14} />
              <span>{deletingSet ? 'Deleting…' : 'Delete Set'}</span>
            </button>
          </div>

          {/* Phase 2.3: 4 KPI Cards */}
          <div className="ss-metrics-grid">
            <div className="ss-metric-card">
              <b>{metrics.totalSubmissions}</b>
              <span>Submissions</span>
            </div>
            <div className="ss-metric-card">
              <b>{metrics.goodCvs}</b>
              <span>Good CVs</span>
            </div>
            <div className="ss-metric-card">
              <b>{metrics.clientShortlisted}</b>
              <span>Client Shortlisted</span>
            </div>
            <div className="ss-metric-card">
              <b>{metrics.withdrawn}</b>
              <span>Withdrawn</span>
            </div>
          </div>

          {/* Phase 2.4 & 2.5: Candidate Submissions & Add CVs button */}
          <div className="ss-section-bar">
            <h3 className="ss-section-title">Candidate Submissions</h3>
            <button
              type="button"
              className="ss-btn ss-btn--primary ss-btn--small"
              onClick={onAddCvs}
            >
              ＋ Add CVs to this Set
            </button>
          </div>

          <div className="ss-candidate-card">
            <table className="ss-candidate-table">
              <thead>
                <tr>
                  <th>Candidate / CV</th>
                  <th>Quality</th>
                  <th>Client Decision</th>
                  <th>Interview / Outcome</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: '#718078' }}>
                      No CVs uploaded in this set yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map(sub => {
                    const fileType = getFileTypeLabel(sub.mimeType, sub.originalFileName);
                    const qualityBadgeClass =
                      sub.qualityRating === 'Good'
                        ? 'ss-status-badge--good'
                        : sub.qualityRating === 'Reject'
                        ? 'ss-status-badge--rejected'
                        : 'ss-status-badge--muted';
                    const qualityLabel = sub.qualityRating || 'Not rated';

                    const isShortlisted = sub.clientShortlistStatus === 'Shortlisted';
                    const isCvRejected = sub.clientShortlistStatus === 'Rejected';

                    const outcome = sub.interviewOutcome;
                    const outcomeBadgeClass =
                      outcome === 'Selected'
                        ? 'ss-status-badge--selected'
                        : outcome === 'Withdrawn'
                        ? 'ss-status-badge--withdrawn'
                        : outcome && outcome.startsWith('Rejected')
                        ? 'ss-status-badge--rejected'
                        : outcome && outcome.includes('Shortlisted')
                        ? 'ss-status-badge--shortlisted'
                        : 'ss-status-badge--progress';

                    return (
                      <tr key={sub._id}>
                        <td>
                          <div className="ss-cand-cell">
                            <button
                              type="button"
                              className="ss-cand-name-link"
                              onClick={() => onDownloadCv(sub._id)}
                              title={`Download ${sub.originalFileName || 'CV'}`}
                            >
                              {sub.unverifiedLabel || 'Candidate'}
                            </button>
                            <span className="ss-cand-meta">
                              {fileType} · {formatBytes(sub.fileSize)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`ss-status-badge ${qualityBadgeClass}`}>
                            {qualityLabel}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`ss-status-badge ${
                              isShortlisted
                                ? 'ss-status-badge--shortlisted'
                                : isCvRejected
                                ? 'ss-status-badge--rejected'
                                : ''
                            }`}
                          >
                            {isCvRejected ? 'CV Rejected' : sub.clientShortlistStatus || 'Pending'}
                          </span>
                        </td>
                        <td>
                          {isShortlisted && outcome ? (
                            <span className={`ss-status-badge ${outcomeBadgeClass}`}>
                              {outcome}
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '13px' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="ss-cv-delete-btn"
                            onClick={() => handleDeleteCandidate(sub)}
                            disabled={deletingSubId === sub._id}
                            title={`Delete ${sub.unverifiedLabel || 'CV'}`}
                            aria-label={`Delete ${sub.unverifiedLabel || 'CV'}`}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="ss-df">
          <button type="button" className="ss-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}

/**
 * PHASE 3: Create Submission Set Modal
 * - Searchable "Client – Position *" dropdown (without JO IDs)
 * - Mandatory "Date Sent to Client *" with custom calendar picker
 * - Multi-file drag-and-drop CV upload (.pdf, .doc, .docx up to 10MB)
 */
function CreateSubmissionSetModal({ positions, onClose, onSuccess }) {
  const [positionId, setPositionId] = useState('');
  const [positionSearch, setPositionSearch] = useState('');
  const [comboOpen, setComboOpen] = useState(false);
  const [sentToClientAt, setSentToClientAt] = useState(() => toYMD(new Date()));
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientErrors, setClientErrors] = useState([]);
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const comboRef = useRef(null);
  const comboMenuRef = useRef(null);

  const formattedPositions = useMemo(() => {
    return positions.map(p => {
      const clientName = p.client?.clientName || 'Unknown Client';
      const posName = p.position || 'Unnamed Position';
      const displayLabel = `${clientName} – ${posName}`;
      return {
        _id: p._id,
        clientName,
        posName,
        displayLabel,
        searchText: `${clientName} ${posName}`.toLowerCase()
      };
    });
  }, [positions]);

  const matchingPositions = useMemo(() => {
    const q = positionSearch.trim().toLowerCase();
    if (!q) return formattedPositions;
    return formattedPositions.filter(item =>
      item.searchText.includes(q) || item.displayLabel.toLowerCase().includes(q)
    );
  }, [formattedPositions, positionSearch]);

  const comboPopoverStyle = usePopoverPosition(comboRef, comboOpen, 320, 240);

  useEffect(() => {
    if (!comboOpen) return;
    const handleOutside = (e) => {
      if (
        comboRef.current &&
        !comboRef.current.contains(e.target) &&
        comboMenuRef.current &&
        !comboMenuRef.current.contains(e.target)
      ) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [comboOpen]);

  const validateAndAddFiles = (fileList) => {
    setClientErrors([]);
    const valid = [];
    const errors = [];

    Array.from(fileList || []).forEach(file => {
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

    if (errors.length > 0) setClientErrors(errors);
    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!positionId) {
      setServerError('Please select a Client – Position from the list.');
      return;
    }
    if (!sentToClientAt) {
      setServerError('Please choose the Date Sent to Client.');
      return;
    }
    if (files.length === 0) {
      setServerError('Please select at least one CV file to upload.');
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    const formData = new FormData();
    formData.append('positionId', positionId);
    formData.append('sentToClientAt', sentToClientAt);
    files.forEach(f => formData.append('files', f));

    try {
      await createSetWithUpload(formData);
      onSuccess();
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.failed && Array.isArray(respData.failed) && respData.failed.length > 0) {
        const details = respData.failed.map(f => `${f.fileName}: ${f.error}`).join(' | ');
        setServerError(`${respData.error || 'Upload failed'}: ${details}`);
      } else {
        setServerError(respData?.error || err.message || 'Failed to create submission set.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ss-overlay" onClick={onClose}>
      <section className="ss-dialog ss-dialog--medium" onClick={e => e.stopPropagation()}>
        <header className="ss-dh">
          <div>
            <h2>＋ Create Submission Set</h2>
            <div className="ss-dh-sub">Create a new client submission batch.</div>
          </div>
          <button type="button" className="ss-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="ss-db">
            {serverError && (
              <div className="ss-error-banner">
                <AlertTriangle size={16} />
                <span>{serverError}</span>
              </div>
            )}

            {/* Phase 3.1: Searchable Client – Position * Dropdown without JO IDs */}
            <div className="ss-field">
              <label htmlFor="ss-client-position-input">Client – Position *</label>
              <div ref={comboRef} className="ss-combo-wrap">
                <input
                  id="ss-client-position-input"
                  type="text"
                  className="ss-combo-input"
                  placeholder="Search client or position…"
                  autoComplete="off"
                  value={positionSearch}
                  onFocus={() => setComboOpen(true)}
                  onChange={e => {
                    setPositionSearch(e.target.value);
                    setPositionId('');
                    setComboOpen(true);
                  }}
                />
                <ChevronDown size={15} className="ss-combo-chevron" />
              </div>

              {comboOpen &&
                createPortal(
                  <div ref={comboMenuRef} className="ss-dropdown-menu" style={comboPopoverStyle}>
                    <div className="ss-dropdown-options">
                      {matchingPositions.length === 0 ? (
                        <div className="ss-dropdown-empty">No matching client or position</div>
                      ) : (
                        matchingPositions.map(item => {
                          const isSelected = String(item._id) === String(positionId);
                          return (
                            <div
                              key={item._id}
                              className={`ss-dropdown-option ${isSelected ? 'ss-dropdown-option--selected' : ''}`}
                              onClick={() => {
                                setPositionId(item._id);
                                setPositionSearch(item.displayLabel);
                                setComboOpen(false);
                              }}
                            >
                              <span>{item.displayLabel}</span>
                              {isSelected && <Check size={14} />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              <div className="ss-hint">
                Search by client name or position. Job Order ID is not displayed.
              </div>
            </div>

            {/* Phase 3.2: Date Sent to Client * with Custom Calendar Picker */}
            <div className="ss-field">
              <label>Date Sent to Client *</label>
              <CustomDatePicker
                value={sentToClientAt}
                onChange={setSentToClientAt}
                placeholder="Choose a date"
                fullWidth={true}
              />
            </div>

            {/* Phase 3.5: CV Files Upload */}
            <div className="ss-field">
              <label>CV Files (.pdf, .doc, .docx up to 10MB) *</label>
              <div
                className={`ss-upload ${isDragOver ? 'ss-upload--dragover' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer?.files?.length) {
                    validateAndAddFiles(e.dataTransfer.files);
                  }
                }}
              >
                <b>⇧ Click or drag CV files here</b>
                <small>PDF, DOC and DOCX files · Maximum 10 MB per file</small>
                <div className="ss-hint">
                  {files.length === 0
                    ? 'No files selected'
                    : `${files.length} file${files.length === 1 ? '' : 's'} selected`}
                </div>
              </div>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                onChange={e => {
                  validateAndAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />

              {clientErrors.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {clientErrors.map((err, i) => (
                    <div key={i} style={{ color: '#dc2626', fontSize: '12px' }}>
                      ⚠ {err}
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <div className="ss-filelist">
                  {files.map((f, idx) => (
                    <div key={idx} className="ss-file-row">
                      <span>
                        {f.name} <small style={{ color: '#718078' }}>({formatBytes(f.size)})</small>
                      </span>
                      <button
                        type="button"
                        className="ss-file-remove"
                        onClick={() => handleRemoveFile(idx)}
                        title="Remove file"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <footer className="ss-df">
            <button
              type="button"
              className="ss-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ss-btn ss-btn--primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating…' : 'Create Submission Set'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

/**
 * PHASE 4: Add CVs Modal
 * - Clean, spacious design consistent with Create Submission Set modal
 * - Retains: Initial Shortlist Status (custom dropdown), CV File Upload, Cancel, Upload to Set
 * - Removes uploader and quality-rating fields
 */
function AddCvsToSetModal({ set, onClose, onSuccess }) {
  const [internalShortlistStatus, setInternalShortlistStatus] = useState('Shortlisted');
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [clientErrors, setClientErrors] = useState([]);
  const [serverError, setServerError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const shortlistOptions = useMemo(
    () => [
      { value: 'Shortlisted', label: 'Internally Shortlisted' },
      { value: 'Pending', label: 'Not Shortlisted' }
    ],
    []
  );

  const validateAndAddFiles = (fileList) => {
    setClientErrors([]);
    const valid = [];
    const errors = [];

    Array.from(fileList || []).forEach(file => {
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

    if (errors.length > 0) setClientErrors(errors);
    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setServerError('Please select at least one CV file.');
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    const formData = new FormData();
    formData.append('internalShortlistStatus', internalShortlistStatus);
    files.forEach(f => formData.append('files', f));

    try {
      await uploadCvsToSet(set._id, formData);
      onSuccess();
    } catch (err) {
      const respData = err.response?.data;
      if (respData?.failed && Array.isArray(respData.failed) && respData.failed.length > 0) {
        const details = respData.failed.map(f => `${f.fileName}: ${f.error}`).join(' | ');
        setServerError(`${respData.error || 'Upload failed'}: ${details}`);
      } else {
        setServerError(respData?.error || err.message || 'Failed to upload CVs to set.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const clientName = set.position?.client?.clientName || 'Client';
  const positionName = set.position?.position || 'Position';

  return (
    <div className="ss-overlay" onClick={onClose}>
      <section className="ss-dialog ss-dialog--medium" onClick={e => e.stopPropagation()}>
        <header className="ss-dh">
          <div>
            <h2>
              ＋ Add CVs to <span>{set.setNumber}</span>
            </h2>
            <div className="ss-dh-sub">
              {clientName} · {positionName} · Sent {formatDateDDMMMYYYY(set.sentToClientAt)}
            </div>
          </div>
          <button type="button" className="ss-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="ss-db">
            {serverError && (
              <div className="ss-error-banner">
                <AlertTriangle size={16} />
                <span>{serverError}</span>
              </div>
            )}

            {/* Initial Shortlist Status Custom Dropdown */}
            <div className="ss-field">
              <label>Initial Shortlist Status</label>
              <CustomDropdown
                value={internalShortlistStatus}
                onChange={setInternalShortlistStatus}
                options={shortlistOptions}
                fullWidth={true}
                inModal={true}
              />
            </div>

            {/* CV File Upload */}
            <div className="ss-field">
              <label>CV Files (.pdf, .doc, .docx) *</label>
              <div
                className={`ss-upload ${isDragOver ? 'ss-upload--dragover' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer?.files?.length) {
                    validateAndAddFiles(e.dataTransfer.files);
                  }
                }}
              >
                <b>⇧ Click or drag CV files here</b>
                <small>PDF, DOC and DOCX files · Maximum 10 MB per file</small>
                <div className="ss-hint">
                  {files.length === 0
                    ? 'No files selected'
                    : `${files.length} file${files.length === 1 ? '' : 's'} selected`}
                </div>
              </div>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                onChange={e => {
                  validateAndAddFiles(e.target.files);
                  e.target.value = '';
                }}
              />

              {clientErrors.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {clientErrors.map((err, i) => (
                    <div key={i} style={{ color: '#dc2626', fontSize: '12px' }}>
                      ⚠ {err}
                    </div>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <div className="ss-filelist">
                  {files.map((f, idx) => (
                    <div key={idx} className="ss-file-row">
                      <span>
                        {f.name} <small style={{ color: '#718078' }}>({formatBytes(f.size)})</small>
                      </span>
                      <button
                        type="button"
                        className="ss-file-remove"
                        onClick={() => handleRemoveFile(idx)}
                        title="Remove file"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <footer className="ss-df">
            <button
              type="button"
              className="ss-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ss-btn ss-btn--primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Uploading…' : 'Upload to Set'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
