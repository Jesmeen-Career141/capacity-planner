import api from './client';

// Single week (kept for backward compatibility, but we'll use batch)
export const getGrid = (weekStart, weekEnd) =>
  api.get('/weekly-allocations', { params: { weekStart, weekEnd } });

// batch fetch for multiple weeks
export const getWeeklyAllocationsBatch = (startDate, endDate, timestamp) =>
  api.get('/weekly-allocations/batch', { params: { startDate, endDate, _t: timestamp } });

// UPDATED: now also accepts optional leaveType
export const updateWeeklyAllocationCell = (taId, weekStart, { day, positionId, leaveType }) =>
  api.put(`/weekly-allocations/${taId}/${weekStart}`, { day, positionId, leaveType });

export const autofillWeek = (weekStart, weekEnd) =>
  api.post('/weekly-allocations/autofill', { weekStart, weekEnd });

// NEW: bulk leave/holiday setter for multiple TAs across a date range
export const setLeaveBulk = (taIds, startDate, endDate, leaveType, days) =>
  api.post('/weekly-allocations/leave', { taIds, startDate, endDate, leaveType, days });