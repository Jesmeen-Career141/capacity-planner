import api from './client';

/**
 * 1. Record a new candidate placement
 */
export const createPlacement = async (data) => {
  const res = await api.post('/placements', data);
  return res.data;
};

/**
 * 2. Get filtered placements list
 */
export const getPlacements = async (params = {}) => {
  const res = await api.get('/placements', { params });
  return res.data;
};

/**
 * 3. Get single placement details by ID
 */
export const getPlacementById = async (id) => {
  const res = await api.get(`/placements/${id}`);
  return res.data;
};

/**
 * 4. Update placement details
 */
export const updatePlacement = async (id, data) => {
  const res = await api.put(`/placements/${id}`, data);
  return res.data;
};
