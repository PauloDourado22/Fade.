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
  getServices: () => request('/api/public/services'),
  getStaff: () => request('/api/public/staff'),
  getAvailability: (staffId, date, durationMinutes) =>
    request(`/api/public/availability?staffId=${staffId}&date=${date}&durationMinutes=${durationMinutes}`),
  createAppointment: (payload) =>
    request('/api/public/appointments', { method: 'POST', body: JSON.stringify(payload) }),
  getAppointmentStatus: (code) => request(`/api/public/appointments/status?code=${code}`),

  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listAppointments: (token, params = '') =>
    request(`/api/appointments${params}`, { token }),
  updateAppointmentStatus: (token, id, status) =>
    request(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    }),
};
