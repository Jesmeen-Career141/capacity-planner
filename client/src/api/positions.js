import api from './client';

export const getPositions = () => api.get('/positions');
export const getPosition = (id) => api.get(`/positions/${id}`);
export const createPosition = (data) => api.post('/positions', data);
export const updatePosition = (id, data) => api.put(`/positions/${id}`, data);

// assignPosition – mode param is kept for consistency, though backend now only uses 'primary'
// (parallel assignments go through updatePosition on the frontend)
export const assignPosition = (id, taId, reason, mode = 'primary') =>
  api.put(`/positions/${id}/assign`, { taId, reason, mode });

export const setFlagOverride = (id, flagName, mode) =>
  api.put(`/positions/${id}/flags/${flagName}`, { mode });

export const deletePosition = (id) => api.delete(`/positions/${id}`);