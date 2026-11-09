import api from './client';

export const getActivities = (params) => api.get('/daily-activity', { params });
export const getActivity = (id) => api.get(`/daily-activity/${id}`);
export const createActivity = (data) => api.post('/daily-activity', data);
export const updateActivity = (id, data) => api.patch(`/daily-activity/${id}`, data);
export const deleteActivity = (id) => api.delete(`/daily-activity/${id}`);
export const getPlannedVsActual = (params) => api.get('/daily-activity/planned-vs-actual', { params });
export const getPositionActivityHistory = (positionId) => api.get(`/daily-activity/positions/${positionId}/history`);
export const getSourcingOptions = (positionId) => api.get(`/daily-activity/positions/${positionId}/sourcing-options`);

export default {
  getActivities,
  getActivity,
  createActivity,
  updateActivity,
  deleteActivity,
  getPlannedVsActual,
  getPositionActivityHistory,
  getSourcingOptions
};
