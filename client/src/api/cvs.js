import api from './client';

/**
 * CV Tracking API Client
 * Wraps backend endpoints mounted under /api/cvs
 */

// Attempts
export const getAttempts = (positionId) =>
  api.get(`/cvs/positions/${positionId}/attempts`);

export const createAttempt = (positionId, data) =>
  api.post(`/cvs/positions/${positionId}/attempts`, data);

export const updateAttempt = (positionId, attemptId, data) =>
  api.patch(`/cvs/positions/${positionId}/attempts/${attemptId}`, data);

export const closeAttempt = (positionId, attemptId, data) =>
  api.post(`/cvs/positions/${positionId}/attempts/${attemptId}/close`, data);

// Submissions
export const getSubmissions = (positionId, attemptId) =>
  api.get(`/cvs/positions/${positionId}/attempts/${attemptId}/submissions`);

export const uploadCvs = (positionId, formData, config = {}) =>
  api.post(`/cvs/positions/${positionId}/upload`, formData, config);

export const getDownloadUrl = (submissionId) =>
  api.get(`/cvs/submissions/${submissionId}/download-url`);

export const deleteSubmission = (submissionId) =>
  api.delete(`/cvs/submissions/${submissionId}`);

export const updateSubmissionStatus = (submissionId, data) =>
  api.patch(`/cvs/submissions/${submissionId}/status`, data);
