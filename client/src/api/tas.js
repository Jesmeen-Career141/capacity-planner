import api from './client';

export const getTAs = () => api.get('/tas');
export const getActiveTAs = () => api.get('/tas/active');
export const createTA = (name) => api.post('/tas', { name });
export const updateTAStatus = (id, status) => api.put(`/tas/${id}/status`, { status });
export const deleteTA = (id) => api.delete(`/tas/${id}`);
