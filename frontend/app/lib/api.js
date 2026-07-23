const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4100';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  getPublicSettings: () => request('/api/public/settings'),
  getServices: () => request('/api/public/services'),
  getStaff: () => request('/api/public/staff'),
  getAvailability: (staffId, date, durationMinutes) =>
    request(`/api/public/availability?staffId=${staffId}&date=${date}&durationMinutes=${durationMinutes}`),
  createAppointment: (payload) =>
    request('/api/public/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  getAppointmentStatus: (code) => request(`/api/public/appointments/status?code=${code}`),
  getManageBooking: (code) => request(`/api/public/appointments/${code}/manage`),
  rescheduleAppointment: (code, startAt) =>
    request(`/api/public/appointments/${code}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startAt }),
    }),
  cancelAppointment: (code) =>
    request(`/api/public/appointments/${code}/cancel`, { method: 'POST' }),

  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listAppointments: (token, params = '') =>
    request(`/api/appointments${params}`, { token }),
  // Builds the query string from a filter object, dropping empty values so
  // an unset filter isn't sent as `&status=` (which the backend would treat
  // as a real, unmatchable status).
  listAppointmentsFiltered: (token, { date, status, search } = {}) => {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    if (status) qs.set('status', status);
    if (search) qs.set('search', search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/api/appointments${suffix}`, { token });
  },
  updateAppointmentStatus: (token, id, status) =>
    request(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    }),
  getDashboardStats: (token) => request('/api/appointments/stats', { token }),
  createOwnerBooking: (token, payload) =>
    request('/api/appointments', { method: 'POST', token, body: JSON.stringify(payload) }),
  createBlock: (token, payload) =>
    request('/api/appointments/block', { method: 'POST', token, body: JSON.stringify(payload) }),
  getCustomerHistory: (token, email) =>
    request(`/api/appointments/customer?email=${encodeURIComponent(email)}`, { token }),

  // --- Admin / settings ---
  getSettings: (token) => request('/api/admin/settings', { token }),
  updateSettings: (token, patch) =>
    request('/api/admin/settings', { method: 'PATCH', token, body: JSON.stringify(patch) }),
  changePassword: (token, currentPassword, newPassword) =>
    request('/api/admin/password', { method: 'POST', token, body: JSON.stringify({ currentPassword, newPassword }) }),

  listStaffAccounts: (token) => request('/api/admin/staff-accounts', { token }),
  createStaffAccount: (token, email, password) =>
    request('/api/admin/staff-accounts', { method: 'POST', token, body: JSON.stringify({ email, password }) }),

  listClosures: (token) => request('/api/admin/closures', { token }),
  addClosure: (token, date, reason) =>
    request('/api/admin/closures', { method: 'POST', token, body: JSON.stringify({ date, reason }) }),
  deleteClosure: (token, id) => request(`/api/admin/closures/${id}`, { method: 'DELETE', token }),

  adminListServices: (token) => request('/api/admin/services', { token }),
  createService: (token, body) => request('/api/admin/services', { method: 'POST', token, body: JSON.stringify(body) }),
  updateService: (token, id, body) => request(`/api/admin/services/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) }),
  retireService: (token, id) => request(`/api/admin/services/${id}`, { method: 'DELETE', token }),

  adminListStaff: (token) => request('/api/admin/staff', { token }),
  createStaff: (token, body) => request('/api/admin/staff', { method: 'POST', token, body: JSON.stringify(body) }),
  updateStaff: (token, id, body) => request(`/api/admin/staff/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) }),
  retireStaff: (token, id) => request(`/api/admin/staff/${id}`, { method: 'DELETE', token }),

  getWorkingHours: (token) => request('/api/admin/working-hours', { token }),
  setWorkingHours: (token, staffId, hours) =>
    request(`/api/admin/working-hours/${staffId}`, { method: 'PUT', token, body: JSON.stringify({ hours }) }),
};
