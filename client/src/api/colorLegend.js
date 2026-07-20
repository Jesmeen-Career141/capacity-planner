import api from './client';
export const getColorLegend = () => api.get('/color-legend');
export const updateColorLegend = (entries) => api.put('/color-legend', { entries });