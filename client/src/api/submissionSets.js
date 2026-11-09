import api from './client';

/**
 * Submission Sets API Client
 * Wraps backend endpoints mounted under /api/submission-sets
 */

export const getSubmissionSets = (params) =>
  api.get('/submission-sets', { params });

export const getSubmissionSetById = (id) =>
  api.get(`/submission-sets/${id}`);

export const getPositionSets = (positionId) =>
  api.get(`/submission-sets/positions/${positionId}`);

export const createSubmissionSet = (data) =>
  api.post('/submission-sets', data);

export const uploadCvsToSet = (setId, formData, config = {}) =>
  api.post(`/submission-sets/${setId}/upload`, formData, config);

export const createSetWithUpload = (formData, config = {}) =>
  api.post('/submission-sets/create-with-upload', formData, config);

export const deleteSubmissionSet = (id) =>
  api.delete(`/submission-sets/${id}`);

export default {
  getSubmissionSets,
  getSubmissionSetById,
  getPositionSets,
  createSubmissionSet,
  uploadCvsToSet,
  createSetWithUpload,
  deleteSubmissionSet
};
