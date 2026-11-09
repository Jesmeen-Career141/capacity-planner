import api from './client';

/**
 * 1. Get position-level attempts overview with cumulative totals and attempt-by-attempt list
 */
export const getPositionAttemptsSummary = async (positionId) => {
  const res = await api.get(`/attempts/position/${positionId}/summary`);
  return res.data;
};

/**
 * 2. Get full details and drill-down for a single attempt (sets, candidates, interviews, placements)
 */
export const getAttemptDetails = async (attemptId) => {
  const res = await api.get(`/attempts/${attemptId}/details`);
  return res.data;
};

/**
 * 3. Get global attempt-level dashboard reporting
 */
export const getAttemptDashboard = async (params = {}) => {
  const res = await api.get('/attempts/dashboard', { params });
  return res.data;
};

/**
 * 4. Create a new recruitment attempt under an existing position
 */
export const createAttempt = async (data) => {
  const res = await api.post('/attempts', data);
  return res.data;
};

/**
 * 5. Update attempt properties (status, outcome, TAs, target, reason, notes)
 */
export const updateAttempt = async (id, data) => {
  const res = await api.put(`/attempts/${id}`, data);
  return res.data;
};
