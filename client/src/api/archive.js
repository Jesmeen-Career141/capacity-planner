import api from './client';

export const getArchiveSnapshots = () => api.get('/archive');
export const getArchiveSnapshot = (id) => api.get(`/archive/${id}`);
export const createArchive = (weekStart, weekEnd) => api.post('/archive', { weekStart, weekEnd });
export const triggerSnapshot = () => api.post('/archive/trigger');
export const triggerBackfill = (startDate) => api.post('/archive/backfill', { startDate });
export const getSnapshotLogs = (limit = 20) => api.get(`/archive/logs?limit=${limit}`);
