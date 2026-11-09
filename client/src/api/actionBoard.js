import api from './client';

export const getAssignments = (params) => api.get('/action-board/assignments', { params });
export const getAssignment = (id) => api.get(`/action-board/assignments/${id}`);
export const createAssignment = (data) => api.post('/action-board/assignments', data);
export const updateAssignment = (id, data) => api.patch(`/action-board/assignments/${id}`, data);
export const deleteAssignment = (id) => api.delete(`/action-board/assignments/${id}`);
export const getOverview = (params) => api.get('/action-board/overview', { params });
export const getAvailableWork = (params) => api.get('/action-board/available-work', { params });

export default {
  getAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getOverview,
  getAvailableWork
};
