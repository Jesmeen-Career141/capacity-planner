import api from './client';

export const getGrid = (weekStart, weekEnd) =>
  api.get('/weekly-allocations', { params: { weekStart, weekEnd } });

export const updateWeeklyAllocationCell = (taId, weekStart, { day, positionId }) =>
  api.put(`/weekly-allocations/${taId}/${weekStart}`, { day, positionId });

export const autofillWeek = (weekStart, weekEnd) =>
  api.post('/weekly-allocations/autofill', { weekStart, weekEnd });
