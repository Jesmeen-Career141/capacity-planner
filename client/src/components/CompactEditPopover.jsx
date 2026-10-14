import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { assignPosition, setFlagOverride } from '../api/positions';
import './CompactEditPopover.css';

const FLAG_CONFIG = [
  { key: 'followUp', label: 'Follow Up', color: 'var(--flag-orange, #f97316)' },
  { key: 'addOn', label: 'Add-On', color: 'var(--flag-yellow, #eab308)' },
  { key: 'backup', label: 'Backup', color: 'var(--flag-purple, #a855f7)' },
  { key: 'reAssign', label: 'Re-assign', color: 'var(--flag-red, #ef4444)' },
  { key: 'goingGood', label: 'Going Good', color: 'var(--flag-green, #22c55e)' },
];

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function CompactEditPopover({
  position,
  anchorRef,
  isOpen,
  onClose,
  tas = [],
  onPositionUpdated,
}) {
  const popoverRef = useRef(null);
  const [popoverStyle, setPopoverStyle] = useState({});

  const initialAssigneeId = position?.assignee?._id || position?.assignee || '';
  const [localAssigneeId, setLocalAssigneeId] = useState(initialAssigneeId);
  const [localFlagOverrides, setLocalFlagOverrides] = useState(position?.flagOverrides || {});
  const [prevPositionId, setPrevPositionId] = useState(position?._id);

  const [savingField, setSavingField] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Sync state if a different position is opened
  if (position?._id !== prevPositionId) {
    setPrevPositionId(position?._id);
    setLocalAssigneeId(position?.assignee?._id || position?.assignee || '');
    setLocalFlagOverrides(position?.flagOverrides || {});
    setErrorMessage(null);
    setSavingField(null);
  }

  // Positioning relative to anchor element
  useLayoutEffect(() => {
    if (!isOpen) return;

    const width = 360;
    const margin = 10;
    const anchorEl = anchorRef?.current || anchorRef;

    if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') {
      setPopoverStyle({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    if (left < margin) left = margin;

    let top = rect.bottom + margin;
    const estimatedHeight = 360;
    if (top + estimatedHeight > window.innerHeight - margin) {
      const topAbove = rect.top - estimatedHeight - margin;
      if (topAbove > margin) {
        top = topAbove;
      } else {
        top = Math.max(margin, window.innerHeight - estimatedHeight - margin);
      }
    }

    setPopoverStyle({
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    });
  }, [isOpen, anchorRef]);

  // Handle outside clicks & escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e) => {
      const anchorEl = anchorRef?.current || anchorRef;
      if (anchorEl && typeof anchorEl.contains === 'function' && anchorEl.contains(e.target)) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen || !position) return null;

  const handleAssigneeChange = async (e) => {
    const newTaId = e.target.value;
    const previousTaId = localAssigneeId;
    setLocalAssigneeId(newTaId);
    setSavingField('assignee');
    setErrorMessage(null);

    try {
      const res = await assignPosition(position._id, newTaId, 'Reassigned via Quick Edit');
      if (onPositionUpdated) onPositionUpdated(res.data);
      // Existing backend assigns position and resets flagOverrides.reAssign to 'auto'
      if (newTaId) {
        setLocalFlagOverrides(prev => ({ ...prev, reAssign: 'auto' }));
      }
    } catch (err) {
      setLocalAssigneeId(previousTaId);
      setErrorMessage(err.response?.data?.error || 'Failed to reassign position');
    } finally {
      setSavingField(null);
    }
  };

  const handleFlagModeSelect = async (flagKey, mode) => {
    const previousMode = localFlagOverrides[flagKey] || 'auto';
    if (previousMode === mode) return;

    setLocalFlagOverrides(prev => ({ ...prev, [flagKey]: mode }));
    setSavingField(flagKey);
    setErrorMessage(null);

    try {
      const res = await setFlagOverride(position._id, flagKey, mode);
      if (onPositionUpdated) onPositionUpdated(res.data);
    } catch (err) {
      setLocalFlagOverrides(prev => ({ ...prev, [flagKey]: previousMode }));
      setErrorMessage(err.response?.data?.error || `Failed to update ${flagKey}`);
    } finally {
      setSavingField(null);
    }
  };

  return createPortal(
    <>
      <div className="compact-edit-overlay" onClick={onClose} />
      <div
        className="compact-edit-popover"
        style={popoverStyle}
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit position ${position.jobOrderId}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="cep-header">
          <div className="cep-title-wrap">
            <div className="cep-title-row">
              <span className="cep-title">{position.jobOrderId}</span>
            </div>
            <span className="cep-subtitle">
              {position.client?.clientName ? `${position.client.clientName} — ` : ''}
              {position.position}
            </span>
          </div>
          <button className="cep-close-btn" onClick={onClose} aria-label="Close edit popover">
            <CloseIcon />
          </button>
        </div>

        <div className="cep-body">
          {errorMessage && (
            <div className="cep-error" role="alert">
              <span>{errorMessage}</span>
              <button
                type="button"
                className="cep-close-btn"
                onClick={() => setErrorMessage(null)}
                style={{ padding: 2 }}
                aria-label="Dismiss error"
              >
                <CloseIcon />
              </button>
            </div>
          )}

          {/* TA Reassignment */}
          <div className="cep-section">
            <label htmlFor="cep-assignee-select" className="cep-section-label">
              Assigned Talent Advisor
              {savingField === 'assignee' && <span className="cep-saving-spinner" aria-label="Saving..." />}
            </label>
            <select
              id="cep-assignee-select"
              className="cep-select"
              value={localAssigneeId}
              onChange={handleAssigneeChange}
              disabled={savingField === 'assignee'}
            >
              <option value="">Unassigned</option>
              {tas.map(ta => (
                <option key={ta._id} value={ta._id}>
                  {ta.name} {ta.status && ta.status !== 'Active' ? `(${ta.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Flag Overrides */}
          <div className="cep-section">
            <div className="cep-section-label">
              Flag Overrides (Auto / On / Off)
              {savingField && savingField !== 'assignee' && (
                <span className="cep-saving-spinner" aria-label="Saving flag..." />
              )}
            </div>

            <div className="cep-flags-list">
              {FLAG_CONFIG.map(({ key, label, color }) => {
                const currentMode = localFlagOverrides[key] || 'auto';
                const isCurrentSaving = savingField === key;

                return (
                  <div className="cep-flag-row" key={key}>
                    <div className="cep-flag-info">
                      <span className="cep-flag-dot" style={{ backgroundColor: color }} />
                      <span className="cep-flag-name">{label}</span>
                    </div>

                    <div className="cep-segmented" role="group" aria-label={`${label} override`}>
                      <button
                        type="button"
                        className={`cep-seg-btn ${currentMode === 'auto' ? 'cep-seg-btn--active' : ''}`}
                        onClick={() => handleFlagModeSelect(key, 'auto')}
                        disabled={isCurrentSaving}
                        aria-pressed={currentMode === 'auto'}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        className={`cep-seg-btn cep-seg-btn--on ${currentMode === 'on' ? 'cep-seg-btn--active' : ''}`}
                        onClick={() => handleFlagModeSelect(key, 'on')}
                        disabled={isCurrentSaving}
                        aria-pressed={currentMode === 'on'}
                      >
                        On
                      </button>
                      <button
                        type="button"
                        className={`cep-seg-btn cep-seg-btn--off ${currentMode === 'off' ? 'cep-seg-btn--active' : ''}`}
                        onClick={() => handleFlagModeSelect(key, 'off')}
                        disabled={isCurrentSaving}
                        aria-pressed={currentMode === 'off'}
                      >
                        Off
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
