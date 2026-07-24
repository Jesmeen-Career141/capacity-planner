import api from './client';

// Single week (kept for backward compatibility, but we'll use batch)
export const getGrid = (weekStart, weekEnd) =>
  api.get('/weekly-allocations', { params: { weekStart, weekEnd } });

// NEW: batch fetch for multiple weeks
export const getWeeklyAllocationsBatch = (startDate, endDate, timestamp) =>
  api.get('/weekly-allocations/batch', { params: { startDate, endDate, _t: timestamp } });

export const updateWeeklyAllocationCell = (taId, weekStart, { day, positionId }) =>
  api.put(`/weekly-allocations/${taId}/${weekStart}`, { day, positionId });

export const autofillWeek = (weekStart, weekEnd) =>
  api.post('/weekly-allocations/autofill', { weekStart, weekEnd });