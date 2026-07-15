import api from './client';

export const getArchiveSnapshots = () => api.get('/archive');
export const getArchiveSnapshot = (id) => api.get(`/archive/${id}`);
export const createArchive = (weekStart, weekEnd) => api.post('/archive', { weekStart, weekEnd });
