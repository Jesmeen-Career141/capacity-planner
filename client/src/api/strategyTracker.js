import api from './client';

export const getStrategies = () => api.get('/strategy-tracker/strategies');
export const getEntries = () => api.get('/strategy-tracker/entries');
export const getPositionEntries = (positionId) => api.get(`/strategy-tracker/positions/${positionId}`);
export const updateEntry = (id, body) => api.put(`/strategy-tracker/entries/${id}`, body);
