// Thin wrapper around fetch for the VASTRA JSON API.
const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, path, body, { isForm = false } = {}) {
  const headers = { 'X-Requested-With': 'fetch', Accept: 'application/json' };
  const init = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    if (isForm) {
      init.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  let response;
  try {
    response = await fetch(BASE + path, init);
  } catch {
    throw new ApiError('We could not reach VASTRA. Please check your connection.', 0);
  }
  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!response.ok) {
    throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', response.status, (data && data.fields) || {});
  }
  return data;
}

export const api = {
  get: (path, params) => {
    if (params) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      });
      const s = qs.toString();
      if (s) path += (path.includes('?') ? '&' : '?') + s;
    }
    return request('GET', path);
  },
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData, { isForm: true }),
};
