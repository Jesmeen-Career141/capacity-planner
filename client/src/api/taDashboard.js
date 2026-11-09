import api from './client';

/**
 * TA Activity Dashboard API Client
 * Wraps backend endpoints mounted under /api/ta-dashboard
 */

export const getDashboardSummary = (params) =>
  api.get('/ta-dashboard/summary', { params });

export const getDailyActivitiesOverview = (params) =>
  api.get('/ta-dashboard/daily-activities', { params });

export const getTaProductivityOverview = (params) =>
  api.get('/ta-dashboard/ta-productivity', { params });

export const getPositionActivityOverview = (params) =>
  api.get('/ta-dashboard/position-overview', { params });

export const getPlannedVsActualOverview = (params) =>
  api.get('/ta-dashboard/planned-vs-actual', { params });

export const getSubmissionSetsOverview = (params) =>
  api.get('/ta-dashboard/submission-sets', { params });

export const getTrendsOverview = (params) =>
  api.get('/ta-dashboard/trends', { params });

export default {
  getDashboardSummary,
  getDailyActivitiesOverview,
  getTaProductivityOverview,
  getPositionActivityOverview,
  getPlannedVsActualOverview,
  getSubmissionSetsOverview,
  getTrendsOverview
};
