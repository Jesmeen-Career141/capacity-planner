import api from './client';

export const getClients = () => api.get('/clients');
export const createClient = (clientId, clientName) => api.post('/clients', { clientId, clientName });
export const updateClient = (id, clientName) => api.put(`/clients/${id}`, { clientName });
export const deleteClient = (id) => api.delete(`/clients/${id}`);
