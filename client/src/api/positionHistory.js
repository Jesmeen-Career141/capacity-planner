import api from './client';

export const getPositionHistory = (positionId) => api.get(`/position-history/${positionId}`);
