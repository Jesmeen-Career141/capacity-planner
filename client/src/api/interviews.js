import api from './client';

/**
 * 1. Get filtered, sorted, paginated interviews
 */
export const getInterviews = async (params = {}) => {
  const res = await api.get('/interviews', { params });
  return res.data;
};

/**
 * 2. Get single interview details by ID
 */
export const getInterviewById = async (id) => {
  const res = await api.get(`/interviews/${id}`);
  return res.data;
};

/**
 * 3. Schedule a new interview round
 */
export const createInterview = async (data) => {
  const res = await api.post('/interviews', data);
  return res.data;
};

/**
 * 4. Update general interview details
 */
export const updateInterview = async (id, data) => {
  const res = await api.put(`/interviews/${id}`, data);
  return res.data;
};

/**
 * 5. Reschedule interview
 */
export const rescheduleInterview = async (id, data) => {
  const res = await api.post(`/interviews/${id}/reschedule`, data);
  return res.data;
};

/**
 * 6. Update interview feedback and decision
 */
export const updateFeedbackAndDecision = async (id, data) => {
  const res = await api.post(`/interviews/${id}/feedback`, data);
  return res.data;
};

/**
 * 7. Update operational status
 */
export const updateInterviewStatus = async (id, data) => {
  const res = await api.post(`/interviews/${id}/status`, data);
  return res.data;
};

/**
 * 8. Candidate-level interview history
 */
export const getCandidateInterviewHistory = async (candidateSubmissionId) => {
  const res = await api.get(`/interviews/candidate/${candidateSubmissionId}`);
  return res.data;
};

/**
 * 9. Position-level interview tracking summary
 */
export const getPositionInterviewTracking = async (positionId) => {
  const res = await api.get(`/interviews/position/${positionId}/tracking`);
  return res.data;
};

/**
 * 10. Interview dashboard summary
 */
export const getInterviewDashboard = async (params = {}) => {
  const res = await api.get('/interviews/dashboard', { params });
  return res.data;
};

/**
 * 11. Interview calendar events
 */
export const getInterviewCalendar = async (params = {}) => {
  const res = await api.get('/interviews/calendar', { params });
  return res.data;
};

/**
 * 12. Eligible candidates for interview scheduling
 */
export const getEligibleCandidates = async (params = {}) => {
  const res = await api.get('/interviews/eligible-candidates', { params });
  return res.data;
};
