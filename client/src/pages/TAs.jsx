import { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTAs, createTA, updateTAStatus, deleteTA, updateTAColor } from '../api/tas';
import { getPositions } from '../api/positions';
import './TAs.css';

// ---- Shared color palette (duplicated in Positions.jsx) ----
const TA_COLORS = {
  blue:       { bg: '#3b82f6', text: '#ffffff' },
  yellow:     { bg: '#fde047', text: '#78350f' },
  purple:     { bg: '#8b5cf6', text: '#ffffff' },
  darkGreen:  { bg: '#166534', text: '#ffffff' },
  lightGreen: { bg: '#59e48c', text: '#14532d' },
  lightBlue:  { bg: '#7dd3fc', text: '#0c4a6e' },
  turquoise:  { bg: '#14b8a6', text: '#ffffff' },
  pink:       { bg: '#ec4899', text: '#ffffff' },
  slate:      { bg: '#64748b', text: '#ffffff' },
  maroon:     { bg: '#991b1b', text: '#ffffff' },
};

const POPOVER_WIDTH = 140;
const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;

function TAs() {
  const queryClient = useQueryClient();

  // ---- Queries ----
  const {
    data: tas = [],
    isLoading: tasLoading,
    error: tasError,
  } = useQuery({
    queryKey: ['tas'],
    queryFn: () => getTAs().then(res => res.data),
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: positions = [],
    isLoading: positionsLoading,
    error: positionsError,
  } = useQuery({
    queryKey: ['positions'],
    queryFn: () => getPositions().then(res => res.data),
    staleTime: 5 * 60 * 1000,
  });

  const loading = tasLoading || positionsLoading;
  const error = tasError || positionsError;

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: (name) => createTA(name),
    onSuccess: () => {
      queryClient.invalidateQueries(['tas']);
      queryClient.invalidateQueries(['positions']);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateTAStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries(['tas']);
      queryClient.invalidateQueries(['positions']);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteTA(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['tas']);
      queryClient.invalidateQueries(['positions']);
    },
  });

  const updateColorMutation = useMutation({
    mutationFn: ({ id, color }) => updateTAColor(id, color),
    onSuccess: () => {
      queryClient.invalidateQueries(['tas']);
    },
  });

  // ---- Local state ----
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Popover is now portaled to document.body, so it needs viewport-relative
  // coordinates instead of relying on CSS anchoring inside the table.
  // `colorPopover` stores which TA is open + the trigger button's rect.
  // `popoverPos` holds the *final* on-screen coordinates, computed only after
  // the popover has actually rendered, so we know its real height/width
  // instead of guessing.
  const [colorPopover, setColorPopover] = useState(null); // { id, anchorRect }
  const [popoverPos, setPopoverPos] = useState(null); // { top, left }
  const popoverRef = useRef(null);

  // Measure the real popover after it mounts/updates and position it so it
  // always stays fully on-screen, flipping up/down and clamping as needed.
  // useLayoutEffect runs before the browser paints, so there's no visible jump.
  useLayoutEffect(() => {
    if (!colorPopover || !popoverRef.current) {
      setPopoverPos(null);
      return;
    }
    const { anchorRect } = colorPopover;
    const popRect = popoverRef.current.getBoundingClientRect();

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;

    let top;
    if (spaceBelow >= popRect.height + POPOVER_GAP || spaceBelow >= spaceAbove) {
      top = anchorRect.bottom + POPOVER_GAP;
    } else {
      top = anchorRect.top - POPOVER_GAP - popRect.height;
    }
    // Clamp vertically so it never runs off the top or bottom of the viewport.
    top = Math.min(
      Math.max(top, VIEWPORT_MARGIN),
      Math.max(window.innerHeight - popRect.height - VIEWPORT_MARGIN, VIEWPORT_MARGIN)
    );

    // Center under/over the trigger, clamped horizontally.
    let left = anchorRect.left + anchorRect.width / 2 - popRect.width / 2;
    left = Math.min(
      Math.max(left, VIEWPORT_MARGIN),
      Math.max(window.innerWidth - popRect.width - VIEWPORT_MARGIN, VIEWPORT_MARGIN)
    );

    setPopoverPos({ top, left });
  }, [colorPopover]);

  // ---- Helpers ----
  const countAssignedPositions = (taId) => {
    return positions.filter(p => p.assignee?._id === taId).length;
  };

  const handleColorChange = async (id, color) => {
    setColorPopover(null);
    try {
      await updateColorMutation.mutateAsync({ id, color });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update color');
    }
  };

  const handleToggleColorPopover = (ta, e) => {
    if (colorPopover?.id === ta._id) {
      setColorPopover(null);
      return;
    }
    // Snapshot the trigger's position now, while the event is live.
    const rect = e.currentTarget.getBoundingClientRect();
    const anchorRect = {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
    setColorPopover({ id: ta._id, anchorRect });
  };

  // ---- Modal handlers ----
  const handleOpenModal = (ta = null) => {
    if (ta) {
      setEditing(ta._id);
      setFormData({ name: ta.name });
    } else {
      setEditing(null);
      setFormData({ name: '' });
    }
    setDeleteError(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData({ name: '' });
    setDeleteError(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return alert('Name is required');
    setSaving(true);
    setDeleteError(null);
    try {
      if (editing) {
        alert('Editing name is not supported yet. Use status toggle instead.');
      } else {
        await createMutation.mutateAsync(formData.name);
        handleCloseModal();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save TA');
    } finally {
      setSaving(false);
    }
  };

  // ---- Status & delete handlers ----
  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? 'Left' : 'Active';
    const assignedCount = countAssignedPositions(id);
    let confirmMsg = `Mark TA as ${newStatus}?`;
    if (newStatus === 'Left' && assignedCount > 0) {
      confirmMsg = `This TA is assigned to ${assignedCount} position(s). They will be flagged for reassign. Continue?`;
    }
    if (!window.confirm(confirmMsg)) return;

    setUpdating(id);
    try {
      await updateStatusMutation.mutateAsync({ id, status: newStatus });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (id, name) => {
    const assignedCount = countAssignedPositions(id);
    if (assignedCount > 0) {
      alert(`Cannot delete TA: assigned to ${assignedCount} position(s). Mark as Left instead.`);
      return;
    }
    if (!window.confirm(`Delete TA "${name}"?`)) return;
    setDeleting(id);
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete TA';
      setDeleteError(msg);
      alert(msg);
    } finally {
      setDeleting(null);
    }
  };

  // ---- Render ----
  if (loading) return <div>Loading TAs...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const activePopoverTA = colorPopover ? tas.find(t => t._id === colorPopover.id) : null;

  return (
    <div className="tas">
      <div className="tas-header">
        <h1>Recruiters (TAs)</h1>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          + New TA
        </button>
      </div>

      <div className="tas-list">
        {tas.length === 0 ? (
          <p className="no-tas">No TAs yet</p>
        ) : (
          <table className="tas-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Color</th>
                <th>Status</th>
                <th>Assigned Positions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tas.map(ta => {
                const assignedCount = countAssignedPositions(ta._id);

                return (
                  <tr key={ta._id}>
                    <td>{ta.name}</td>
                    <td className="ta-color-cell">
                      <div className="color-picker-wrap">
                        <button
                          className="color-swatch-btn"
                          style={{
                            background: ta.color ? TA_COLORS[ta.color].bg : '#e5e7eb',
                            border: ta.color ? '2px solid rgba(0,0,0,0.15)' : '2px dashed #d1d5db',
                          }}
                          onClick={(e) => handleToggleColorPopover(ta, e)}
                          title="Set TA color"
                        />
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${ta.status === 'Active' ? 'status-active' : 'status-left'}`}>
                        {ta.status}
                      </span>
                    </td>
                    <td>{assignedCount}</td>
                    <td className="actions-cell">
                      <button
                        className="action-toggle"
                        onClick={() => handleToggleStatus(ta._id, ta.status)}
                        disabled={updating === ta._id}
                      >
                        {updating === ta._id ? '...' : `Mark ${ta.status === 'Active' ? 'Left' : 'Active'}`}
                      </button>
                      <button
                        className="action-delete"
                        onClick={() => handleDelete(ta._id, ta.name)}
                        disabled={deleting === ta._id || assignedCount > 0}
                        title={assignedCount > 0 ? 'Cannot delete: assigned to positions' : ''}
                      >
                        {deleting === ta._id ? '...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Color popover is portaled to <body> so it can never be clipped by the
          table's `overflow: hidden` (used for rounded corners). Positioned with
          `position: fixed` using coordinates computed from the trigger button. */}
      {colorPopover && activePopoverTA && createPortal(
        <>
          <div className="popover-backdrop" onClick={() => setColorPopover(null)} />
          <div
            ref={popoverRef}
            className="color-popover"
            style={{
              position: 'fixed',
              // Until we've measured the real size (popoverPos is set), render
              // off-screen but still laid out, so getBoundingClientRect works
              // and nothing flashes in the wrong place.
              top: popoverPos ? popoverPos.top : -9999,
              left: popoverPos ? popoverPos.left : -9999,
              visibility: popoverPos ? 'visible' : 'hidden',
              width: POPOVER_WIDTH,
              // Neutralize the legacy CSS anchoring (left: 50% + translateX)
              // since position is now fully computed in JS.
              transform: 'none',
              right: 'auto',
              bottom: 'auto',
            }}
          >
            <button
              className="color-popover-option"
              onClick={() => handleColorChange(activePopoverTA._id, null)}
            >
              <span className="color-swatch-dot color-swatch-dot--none" />
              None
            </button>
            {Object.entries(TA_COLORS).map(([key, { bg }]) => (
              <button
                key={key}
                className="color-popover-option"
                onClick={() => handleColorChange(activePopoverTA._id, key)}
              >
                <span className="color-swatch-dot" style={{ background: bg }} />
                {key}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>New TA</h3>
            <div className="modal-form">
              <label>TA Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., John Doe"
              />
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TAs;