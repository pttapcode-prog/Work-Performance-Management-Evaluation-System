const RAW_API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://work-performance-management-evaluation.onrender.com/api'
).replace(/\/+$/, '');
const API_BASE =
  RAW_API_BASE === '/api' || RAW_API_BASE.endsWith('/api')
    ? RAW_API_BASE
    : `${RAW_API_BASE}/api`;
const TOKEN_KEY = 'wpmes_auth_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, String(v));
    }
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

async function request(path, options = {}) {
  const { headers = {}, skipAuth = false, ...rest } = options;
  const token = getAuthToken();
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    headers: finalHeaders,
    ...rest,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !skipAuth) {
      setAuthToken('');
    }
    throw new Error(data.error || `API Error ${res.status}`);
  }
  return data;
}

export const api = {
  // Auth
  login(email, password) {
    return request('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
  getMe() {
    return request('/auth/me');
  },
  getDemoAccounts() {
    return request('/auth/demo-accounts', { skipAuth: true });
  },

  // System Admin (Super Admin)
  getSystemOverview(params = {}) {
    return request(`/system/overview${buildQuery(params)}`);
  },
  systemCreateCompany(payload) {
    return request('/system/companies', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  systemCreateCompaniesBulk(rows) {
    return request('/system/companies/bulk', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },
  systemUpdateCompany(id, payload) {
    return request(`/system/companies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  systemDeleteCompany(id) {
    return request(`/system/companies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  systemCreateCompanyAdmin(payload) {
    return request('/system/company-admins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  systemCreateCompanyAdminsBulk(rows) {
    return request('/system/company-admins/bulk', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },
  systemUpdateCompanyAdmin(id, payload) {
    return request(`/system/company-admins/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  systemDeleteCompanyAdmin(id) {
    return request(`/system/company-admins/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Company Admin (Account Management only)
  getCompanyAdminUsers(params = {}) {
    return request(`/company-admin/users${buildQuery(params)}`);
  },

  // File Attachment Upload
  uploadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await request('/upload', {
            method: 'POST',
            body: JSON.stringify({
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              contentBase64: reader.result,
            }),
          });
          resolve(res);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Không thể đọc file đính kèm.'));
      reader.readAsDataURL(file);
    });
  },

  // Company Bootstrap & Live Workspace REST Endpoints
  getBootstrap(weekId = '2026-W47', projectId = 'all', extra = {}) {
    return request(`/bootstrap${buildQuery({ weekId, projectId, ...extra })}`);
  },
  getUsers(params = {}) {
    return request(`/users${buildQuery(params)}`);
  },
  getProjects(params = {}) {
    return request(`/projects${buildQuery(params)}`);
  },
  getProjectDetail(projectId, params = {}) {
    return request(`/projects/${encodeURIComponent(projectId)}${buildQuery(params)}`);
  },
  getTasks(params = {}) {
    return request(`/tasks${buildQuery(params)}`);
  },
  getTaskDetail(taskId, params = {}) {
    return request(`/tasks/${encodeURIComponent(taskId)}${buildQuery(params)}`);
  },
  getKpiSummary(params = {}) {
    return request(`/kpi/summary${buildQuery(params)}`);
  },
  getAiWatchdog(params = {}) {
    return request(`/ai/watchdog${buildQuery(params)}`);
  },

  // Mutations
  createUser(payload) {
    return request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createUsersBulk(rows) {
    return request('/users/bulk', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
  },
  updateUser(userId, payload) {
    return request(`/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteUser(userId) {
    return request(`/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },
  createProject(payload) {
    return request('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateProjectMembers(projectId, payload) {
    return request(`/projects/${encodeURIComponent(projectId)}/members`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  createTask(payload) {
    return request('/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createTasksBulk(tasks) {
    return request('/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify({ tasks }),
    });
  },
  updateTask(id, updates) {
    return request(`/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },
  deleteTask(id) {
    return request(`/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  getEmployee360(userId, weekId = '2026-W47') {
    return request(`/ai/employee-360${buildQuery({ userId, weekId })}`);
  },
  parseSmartTasks(text, weekId, assigneeId) {
    return request('/ai/parse-tasks', {
      method: 'POST',
      body: JSON.stringify({ text, weekId, assigneeId }),
    });
  },
  chatCopilot(query, weekId = '2026-W47', projectId = 'all', apiKey = '') {
    return request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ query, weekId, projectId, apiKey }),
    });
  },
  resetSeed() {
    return request('/admin/reset-seed', { method: 'POST', skipAuth: true });
  },
};
