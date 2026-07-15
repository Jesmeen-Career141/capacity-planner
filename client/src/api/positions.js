import api from './client';

export const getPositions = () => api.get('/positions');
export const getPosition = (id) => api.get(`/positions/${id}`);
export const createPosition = (data) => api.post('/positions', data);
export const updatePosition = (id, data) => api.put(`/positions/${id}`, data);
export const assignPosition = (id, taId, reason) => api.put(`/positions/${id}/assign`, { taId, reason });
export const deletePosition = (id) => api.delete(`/positions/${id}`);
