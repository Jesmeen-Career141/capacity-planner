import api from './client';

export const getAssignments = (params) => api.get('/work-board/assignments', { params });
export const getAssignment = (id) => api.get(`/work-board/assignments/${id}`);
export const createAssignment = (data) => api.post('/work-board/assignments', data);
export const updateAssignment = (id, data) => api.patch(`/work-board/assignments/${id}`, data);
export const reassignAssignment = (id, data) => api.post(`/work-board/assignments/${id}/reassign`, data);
export const getAssignmentChain = (id) => api.get(`/work-board/assignments/${id}/chain`);

export default {
  getAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  reassignAssignment,
  getAssignmentChain
};
