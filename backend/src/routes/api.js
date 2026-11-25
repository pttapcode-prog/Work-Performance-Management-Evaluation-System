import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import {
  getState,
  getDbInfo,
  getTaskById,
  createCompany,
  updateCompany,
  deleteCompany,
  createUser,
  updateUser,
  deleteUser,
  createProject,
  updateProject,
  deleteProject,
  createTask,
  createTasksBulk,
  updateTask,
  deleteTask,
  resetToSeed,
} from '../db/database.js';
import { REFERENCE_DATE } from '../db/seedData.js';
import { buildEnrichedTasks, buildWeeklySummary } from '../services/kpiService.js';
import {
  generateWatchdogReport,
  generateEmployee360Report,
  parseSmartTaskInput,
  answerCopilotQuery,
} from '../services/aiService.js';
import {
  signAuthToken,
  verifyAuthToken,
  sanitizeUser,
  computePermissions,
  getUserProjectRole,
} from '../services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const router = express.Router();
const VALID_PROJECT_ROLES = new Set(['PM', 'DEV', 'BA', 'TEST']);
const VALID_TASK_STATUSES = new Set(['pending_review', 'completed', 'cancelled']);
const WEEKLY_EST_LIMIT = 5;

function validateWeeklyEstCap(allTasks, companyId, assigneeId, weekId, incomingEst, excludeTaskId = null) {
  const est = Number(incomingEst);
  if (!Number.isFinite(est) || est <= 0 || est > WEEKLY_EST_LIMIT) {
    return `Khối lượng Est phải nằm trong khoảng > 0 và tối đa ${WEEKLY_EST_LIMIT} mỗi tuần.`;
  }

  const currentUsed = allTasks
    .filter(
      (t) =>
        t.companyId === companyId &&
        t.assigneeId === assigneeId &&
        t.weekId === weekId &&
        t.status !== 'cancelled' &&
        t.id !== excludeTaskId
    )
    .reduce((acc, t) => acc + (Number(t.estimatedVolume) || 0), 0);

  if (currentUsed + est > WEEKLY_EST_LIMIT + 0.0001) {
    const remaining = Math.max(0, Number((WEEKLY_EST_LIMIT - currentUsed).toFixed(2)));
    return `Vượt giới hạn khối lượng Est tối đa ${WEEKLY_EST_LIMIT}/tuần! Nhân sự đã sử dụng ${Number(
      currentUsed.toFixed(2)
    )}/${WEEKLY_EST_LIMIT} trong ${weekId}, chỉ còn lại ${remaining} est.`;
  }
  return null;
}

function resolveWeekLabel(weeks, weekId) {
  if (!weekId || weekId === 'all') return 'Tất cả các tuần';
  const found = weeks.find((w) => w.id === weekId);
  return found ? found.label : weekId;
}

function isProjectMember(project, user) {
  if (!project || !user) return false;
  if (user.role === 'DIRECTOR') return true;
  return Boolean(getUserProjectRole(project, user.id));
}

function getProjectMemberIdSet(projects) {
  const ids = new Set();
  for (const p of projects || []) {
    if (p?.pmId) ids.add(p.pmId);
    for (const m of p?.members || []) {
      if (m?.userId) ids.add(m.userId);
    }
    for (const uid of p?.memberIds || []) {
      if (uid) ids.add(uid);
    }
  }
  return ids;
}

function getIsoWeekInfo(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const offsetToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetToMon);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

  // ISO week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  const pad = (n) => String(n).padStart(2, '0');
  const startDate = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  const endDate = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
  const id = `${tmp.getUTCFullYear()}-W${pad(weekNo)}`;
  const label = `Tuần ${weekNo} (${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(
    sunday.getDate()
  )}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()})`;
  return { id, label, startDate, endDate, isCurrent: true, status: 'open' };
}

function ensureCurrentCalendarWeek(weeks = []) {
  const todayWeek = getIsoWeekInfo(new Date());
  const list = Array.isArray(weeks)
    ? weeks.map((w) => ({
        ...w,
        isCurrent: w.id === todayWeek.id || w.startDate === todayWeek.startDate,
      }))
    : [];
  const exists = list.some((w) => w.id === todayWeek.id || w.startDate === todayWeek.startDate);
  if (!exists) {
    list.push(todayWeek);
  }
  return list;
}

function scopeStateToCompany(state, companyId) {
  const companyUsers = state.users
    .filter((u) => u.companyId === companyId && (u.role === 'DIRECTOR' || u.role === 'MEMBER'))
    .map(sanitizeUser);
  const companyProjects = state.projects.filter((p) => p.companyId === companyId);
  const companyTasks = state.tasks.filter((t) => t.companyId === companyId);

  return {
    ...state,
    users: companyUsers,
    projects: companyProjects,
    tasks: companyTasks,
  };
}

function summarizeUserProjectRoles(projects, user) {
  if (user.role === 'SYSTEM_ADMIN') return 'Quản trị toàn Hệ thống';
  if (user.role === 'COMPANY_ADMIN') return 'Admin Công ty (Chỉ quản lý tài khoản)';
  if (user.role === 'DIRECTOR') return 'Lãnh đạo Công ty';

  const entries = projects
    .filter((p) => p.companyId === user.companyId)
    .map((p) => {
      const pRole = getUserProjectRole(p, user.id);
      return pRole ? { projectId: p.id, projectCode: p.code, projectRole: pRole } : null;
    })
    .filter(Boolean);

  if (entries.length === 0) return 'Nhân viên (Chưa gán dự án)';
  const uniqueRoles = Array.from(new Set(entries.map((e) => e.projectRole)));
  return `${uniqueRoles.join('/')} (${entries.map((e) => `${e.projectCode}:${e.projectRole}`).join(', ')})`;
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    }

    const decoded = verifyAuthToken(token);
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    }

    const fullState = await getState();
    const actor = fullState.users.find((u) => u.id === decoded.sub);
    if (!actor) {
      return res.status(401).json({ error: 'Tài khoản không còn tồn tại trong hệ thống.' });
    }
    if (actor.status === 'inactive') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa bởi quản trị viên.' });
    }

    const currentCompany =
      actor.companyId === 'SYSTEM'
        ? null
        : fullState.companies.find((c) => c.id === actor.companyId) || null;
    const companyProjects = fullState.projects.filter((p) => p.companyId === actor.companyId);

    req.fullState = fullState;
    req.auth = {
      actor: sanitizeUser(actor),
      companyId: actor.companyId,
      currentCompany,
      permissions: computePermissions(actor, companyProjects),
    };
    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function requireSystemAdmin(req, res, next) {
  if (req.auth?.actor?.role !== 'SYSTEM_ADMIN') {
    return res.status(403).json({
      error: 'Chỉ Quản trị Hệ thống (SYSTEM_ADMIN) mới có quyền truy cập chức năng này.',
    });
  }
  return next();
}

function requireCompanyAdmin(req, res, next) {
  if (req.auth?.actor?.role !== 'COMPANY_ADMIN') {
    return res.status(403).json({
      error: 'Chỉ tài khoản Admin của công ty (COMPANY_ADMIN) mới có quyền quản lý tài khoản công ty.',
    });
  }
  return next();
}

function requireWorkspaceRole(req, res, next) {
  const role = req.auth?.actor?.role;
  if (role !== 'DIRECTOR' && role !== 'MEMBER') {
    return res.status(403).json({
      error:
        'Tài khoản Admin công ty chỉ quản lý tài khoản nhân sự của công ty, không quản lý dự án hay công việc (task).',
    });
  }
  return next();
}

// === PUBLIC HEALTH & AUTH ROUTES ===
router.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    referenceDate: REFERENCE_DATE,
    dbInfo: getDbInfo(),
  });
});

router.get('/auth/demo-accounts', async (_req, res) => {
  try {
    const state = await getState();
    const companyMap = Object.fromEntries(state.companies.map((c) => [c.id, c]));
    const accounts = state.users
      .filter((u) => u.status !== 'inactive')
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        title: u.title,
        companyId: u.companyId,
        companyName:
          u.companyId === 'SYSTEM' ? 'Quản trị Hệ thống' : companyMap[u.companyId]?.name || u.companyId,
        companyColor:
          u.companyId === 'SYSTEM' ? '#0F172A' : companyMap[u.companyId]?.color || '#3370FF',
        projectRolesSummary: summarizeUserProjectRoles(state.projects, u),
      }));
    res.json({ accounts, defaultPassword: '123456' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Email và Mật khẩu.' });
    }

    const state = await getState();
    const user = state.users.find(
      (u) => u.email.toLowerCase() === String(email).trim().toLowerCase()
    );

    if (!user || user.password !== String(password)) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Tài khoản này đang bị vô hiệu hóa.' });
    }

    const token = signAuthToken(user);
    const company =
      user.companyId === 'SYSTEM'
        ? null
        : state.companies.find((c) => c.id === user.companyId) || null;
    const companyProjects = state.projects.filter((p) => p.companyId === user.companyId);
    const permissions = computePermissions(user, companyProjects);

    return res.json({
      token,
      user: sanitizeUser(user),
      company,
      permissions,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/reset-seed', async (_req, res) => {
  try {
    await resetToSeed();
    res.json({ ok: true, message: 'Đã khôi phục dữ liệu mẫu thành công.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === PROTECTED ROUTES BELOW ===
router.use(requireAuth);

router.get('/auth/me', async (req, res) => {
  res.json({
    user: req.auth.actor,
    company: req.auth.currentCompany,
    permissions: req.auth.permissions,
    dbInfo: getDbInfo(),
  });
});

// === SYSTEM ADMIN ROUTES (MANAGES COMPANIES & COMPANY_ADMIN ACCOUNTS) ===
router.get('/system/overview', requireSystemAdmin, async (req, res) => {
  const { companies, users, projects, tasks } = req.fullState;
  const companySummaries = companies.map((c) => {
    const cUsers = users.filter((u) => u.companyId === c.id).map(sanitizeUser);
    const cAdmins = cUsers.filter((u) => u.role === 'COMPANY_ADMIN');
    const cDirectors = cUsers.filter((u) => u.role === 'DIRECTOR');
    const cMembers = cUsers.filter((u) => u.role === 'MEMBER');
    const cProjects = projects.filter((p) => p.companyId === c.id);
    const cTasks = tasks.filter((t) => t.companyId === c.id);
    return {
      ...c,
      userCount: cUsers.length,
      adminCount: cAdmins.length,
      directorCount: cDirectors.length,
      memberCount: cMembers.length,
      projectCount: cProjects.length,
      taskCount: cTasks.length,
      admins: cAdmins,
    };
  });

  const companyAdmins = users
    .filter((u) => u.role === 'COMPANY_ADMIN')
    .map((u) => ({
      ...sanitizeUser(u),
      companyName: companies.find((c) => c.id === u.companyId)?.name || u.companyId,
    }));

  res.json({
    dbInfo: getDbInfo(),
    stats: {
      totalCompanies: companies.length,
      totalCompanyAdmins: companyAdmins.length,
      totalUsers: users.filter((u) => u.role !== 'SYSTEM_ADMIN').length,
      totalProjects: projects.length,
      totalTasks: tasks.length,
    },
    companies: companySummaries,
    companyAdmins,
  });
});

router.post('/system/companies', requireSystemAdmin, async (req, res) => {
  try {
    const {
      name,
      code,
      domain,
      industry,
      plan,
      color,
      adminName,
      adminEmail,
      adminPassword,
    } = req.body || {};

    if (!name || !name.trim() || !code || !code.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Tên công ty và Mã công ty.' });
    }

    if (adminEmail) {
      const dup = req.fullState.users.find(
        (u) => u.email.toLowerCase() === adminEmail.trim().toLowerCase()
      );
      if (dup) {
        return res.status(409).json({ error: `Email Admin ${adminEmail} đã tồn tại.` });
      }
    }

    const company = await createCompany({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      domain: (domain || '').trim(),
      industry: industry || 'Công nghệ thông tin',
      plan: plan || 'Enterprise',
      color: color || '#0EA5E9',
    });

    let adminUser = null;
    if (adminName && adminName.trim() && adminEmail && adminEmail.trim()) {
      const created = await createUser({
        companyId: company.id,
        name: adminName.trim(),
        email: adminEmail.trim(),
        password: adminPassword?.trim() || '123456',
        role: 'COMPANY_ADMIN',
        title: `Admin Công ty (${company.code})`,
        department: 'Quản trị Tài khoản Công ty',
        color: company.color,
      });
      adminUser = sanitizeUser(created);
    }

    return res.status(201).json({ company, adminUser });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/system/companies/bulk', requireSystemAdmin, async (req, res) => {
  try {
    const rawRows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : Array.isArray(req.body?.companies)
      ? req.body.companies
      : [];
    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'File Excel không có dòng dữ liệu công ty nào để nhập.' });
    }

    const existingCodes = new Set(req.fullState.companies.map((c) => String(c.code || '').toUpperCase()));
    const existingEmails = new Set(req.fullState.users.map((u) => String(u.email || '').toLowerCase()));
    const palette = ['#3370FF', '#00A870', '#0EA5E9', '#7C3AED', '#F57C00', '#E11D48'];

    const createdCompanies = [];
    const createdAdmins = [];
    const errors = [];

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = rawRows[i] || {};
      const rowNum = row._rowNumber || i + 2;
      const name = String(row.name || '').trim();
      const code = String(row.code || '').trim().toUpperCase();
      const domain = String(row.domain || '').trim();
      const industry = String(row.industry || '').trim() || 'Công nghệ thông tin';
      const plan = String(row.plan || '').trim() || 'Enterprise';
      const color = String(row.color || '').trim() || palette[i % palette.length];
      const adminName = String(row.adminName || '').trim();
      const adminEmail = String(row.adminEmail || '').trim();
      const adminPassword = String(row.adminPassword || '').trim() || '123456';

      if (!name || !code) {
        errors.push({ row: rowNum, message: 'Thiếu Tên công ty hoặc Mã công ty.' });
        continue;
      }
      if (existingCodes.has(code)) {
        errors.push({ row: rowNum, message: `Mã công ty "${code}" đã tồn tại.` });
        continue;
      }
      if (adminEmail && existingEmails.has(adminEmail.toLowerCase())) {
        errors.push({ row: rowNum, message: `Email Admin "${adminEmail}" đã tồn tại trong hệ thống.` });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const company = await createCompany({
        name,
        code,
        domain,
        industry,
        plan,
        color,
      });
      existingCodes.add(code);
      createdCompanies.push(company);

      if (adminEmail) {
        // eslint-disable-next-line no-await-in-loop
        const createdAdmin = await createUser({
          companyId: company.id,
          name: adminName || `Admin ${name}`,
          email: adminEmail,
          password: adminPassword,
          role: 'COMPANY_ADMIN',
          title: `Admin Công ty (${company.code})`,
          department: 'Quản trị Tài khoản Công ty',
          color: company.color,
        });
        existingEmails.add(adminEmail.toLowerCase());
        createdAdmins.push(sanitizeUser(createdAdmin));
      }
    }

    return res.status(201).json({
      importedCount: createdCompanies.length,
      createdAdminsCount: createdAdmins.length,
      skippedCount: errors.length,
      createdCompanies,
      createdAdmins,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/system/companies/:id', requireSystemAdmin, async (req, res) => {
  try {
    const existing = req.fullState.companies.find((c) => c.id === req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy công ty.' });
    }
    const { name, code, domain, industry, plan, color, logoText } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ error: 'Tên công ty không được để trống.' });
      }
      updates.name = String(name).trim();
    }
    if (code !== undefined) {
      if (!String(code).trim()) {
        return res.status(400).json({ error: 'Mã công ty không được để trống.' });
      }
      updates.code = String(code).trim().toUpperCase();
    }
    if (domain !== undefined) updates.domain = String(domain).trim();
    if (industry !== undefined) updates.industry = String(industry).trim();
    if (plan !== undefined) updates.plan = String(plan).trim();
    if (color !== undefined) updates.color = String(color).trim();
    if (logoText !== undefined && String(logoText).trim()) {
      updates.logoText = String(logoText).trim().toUpperCase().slice(0, 4);
    }

    const updated = await updateCompany(existing.id, updates);
    return res.json({ company: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/system/companies/:id', requireSystemAdmin, async (req, res) => {
  try {
    const result = await deleteCompany(req.params.id);
    if (!result?.deleted) return res.status(404).json({ error: 'Không tìm thấy công ty.' });
    return res.json({
      deleted: true,
      id: req.params.id,
      deletedUsersCount: result.deletedUsersCount,
      deletedProjectsCount: result.deletedProjectsCount,
      deletedTasksCount: result.deletedTasksCount,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/system/company-admins', requireSystemAdmin, async (req, res) => {
  try {
    const { companyId, name, email, password, title } = req.body || {};
    if (!companyId || !name || !name.trim() || !email || !email.trim()) {
      return res.status(400).json({
        error: 'Vui lòng chọn Công ty, nhập Họ tên và Email cho tài khoản Lãnh đạo / Quản trị Công ty.',
      });
    }
    const targetCompany = req.fullState.companies.find((c) => c.id === companyId);
    if (!targetCompany) {
      return res.status(404).json({ error: 'Công ty được chọn không tồn tại.' });
    }

    const dup = req.fullState.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (dup) {
      return res.status(409).json({ error: `Email ${email} đã tồn tại trong hệ thống.` });
    }

    const created = await createUser({
      companyId: targetCompany.id,
      name: name.trim(),
      email: email.trim(),
      password: password?.trim() || '123456',
      role: 'COMPANY_ADMIN',
      title: title?.trim() || `Admin Công ty ${targetCompany.name}`,
      department: 'Quản trị Tài khoản Công ty',
      color: targetCompany.color,
    });

    return res.status(201).json({ adminUser: sanitizeUser(created) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/system/company-admins/bulk', requireSystemAdmin, async (req, res) => {
  try {
    const rawRows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : Array.isArray(req.body?.admins)
      ? req.body.admins
      : [];
    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'File Excel không có dòng tài khoản Admin nào để nhập.' });
    }

    const existingEmails = new Set(req.fullState.users.map((u) => String(u.email || '').toLowerCase()));
    const createdAdmins = [];
    const errors = [];

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = rawRows[i] || {};
      const rowNum = row._rowNumber || i + 2;
      const companyRef = String(row.companyCode || row.companyId || row.companyName || '').trim();
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim();
      const password = String(row.password || '').trim() || '123456';
      const title = String(row.title || '').trim();

      if (!companyRef || !name || !email) {
        errors.push({ row: rowNum, message: 'Thiếu Mã công ty, Họ tên hoặc Email đăng nhập.' });
        continue;
      }

      const targetCompany = req.fullState.companies.find(
        (c) =>
          c.id.toLowerCase() === companyRef.toLowerCase() ||
          String(c.code || '').toLowerCase() === companyRef.toLowerCase() ||
          String(c.name || '').toLowerCase() === companyRef.toLowerCase()
      );
      if (!targetCompany) {
        errors.push({ row: rowNum, message: `Không tìm thấy công ty khớp "${companyRef}".` });
        continue;
      }

      if (existingEmails.has(email.toLowerCase())) {
        errors.push({ row: rowNum, message: `Email "${email}" đã tồn tại trong hệ thống.` });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const created = await createUser({
        companyId: targetCompany.id,
        name,
        email,
        password,
        role: 'COMPANY_ADMIN',
        title: title || `Admin Công ty ${targetCompany.name}`,
        department: 'Quản trị Tài khoản Công ty',
        color: targetCompany.color,
      });
      existingEmails.add(email.toLowerCase());
      createdAdmins.push(sanitizeUser(created));
    }

    return res.status(201).json({
      importedCount: createdAdmins.length,
      skippedCount: errors.length,
      createdAdmins,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/system/company-admins/:id', requireSystemAdmin, async (req, res) => {
  try {
    const target = req.fullState.users.find(
      (u) => u.id === req.params.id && u.role === 'COMPANY_ADMIN'
    );
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản Admin Công ty.' });
    }

    const { name, email, title, status, password } = req.body || {};
    const updates = {};
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Họ tên không được để trống.' });
      }
      updates.name = trimmedName;
      updates.avatar =
        trimmedName
          .split(/\s+/)
          .slice(-2)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('') || target.avatar;
    }
    if (email !== undefined) {
      const trimmedEmail = String(email).trim();
      if (!trimmedEmail) {
        return res.status(400).json({ error: 'Email đăng nhập không được để trống.' });
      }
      const dup = req.fullState.users.find(
        (u) => u.id !== target.id && u.email.toLowerCase() === trimmedEmail.toLowerCase()
      );
      if (dup) {
        return res.status(409).json({ error: `Email ${trimmedEmail} đã tồn tại trong hệ thống.` });
      }
      updates.email = trimmedEmail;
    }
    if (title !== undefined) updates.title = String(title).trim();
    if (status !== undefined) updates.status = status;
    if (password && String(password).trim()) updates.password = String(password).trim();

    const updated = await updateUser(target.id, updates);
    return res.json({ adminUser: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/system/company-admins/:id', requireSystemAdmin, async (req, res) => {
  try {
    const target = req.fullState.users.find(
      (u) => u.id === req.params.id && u.role === 'COMPANY_ADMIN'
    );
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản Quản trị Công ty.' });
    }
    await deleteUser(target.id);
    return res.json({ deleted: true, id: target.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === COMPANY ADMIN (ONLY ACCOUNT MANAGEMENT, NO TASKS/PROJECTS) ===
router.get('/company-admin/users', requireCompanyAdmin, async (req, res) => {
  const { actor, companyId, currentCompany } = req.auth;
  const companyUsers = req.fullState.users
    .filter((u) => u.companyId === companyId)
    .map(sanitizeUser);

  res.json({
    dbInfo: getDbInfo(),
    actor,
    currentCompany,
    users: companyUsers,
  });
});

router.post('/users', requireCompanyAdmin, async (req, res) => {
  try {
    const { companyId } = req.auth;
    const {
      name,
      email,
      password,
      role = 'MEMBER',
      title = '',
      department = '',
    } = req.body || {};

    if (!name || !name.trim() || !email || !email.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Họ tên và Email nhân viên.' });
    }

    const allowedCompanyRoles = ['DIRECTOR', 'MEMBER'];
    if (!allowedCompanyRoles.includes(role)) {
      return res.status(400).json({
        error:
          'Admin công ty chỉ cấp 2 vai trò nghiệp vụ: Lãnh đạo (DIRECTOR) và Nhân viên (MEMBER). Các role PM, DEV, BA, TEST được chia riêng trong từng Dự án.',
      });
    }

    const duplicate = req.fullState.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ error: `Email ${email} đã tồn tại trong hệ thống.` });
    }

    const createdUser = await createUser({
      companyId,
      name: name.trim(),
      email: email.trim(),
      password: password?.trim() || '123456',
      role,
      title: title.trim() || (role === 'DIRECTOR' ? 'Lãnh đạo Công ty' : 'Nhân viên'),
      department: department.trim() || 'Khối Công nghệ',
    });

    return res.status(201).json({
      user: sanitizeUser(createdUser),
      autoAssignedCompanyId: companyId,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/users/bulk', requireCompanyAdmin, async (req, res) => {
  try {
    const { companyId } = req.auth;
    const rawRows = Array.isArray(req.body?.rows)
      ? req.body.rows
      : Array.isArray(req.body?.users)
      ? req.body.users
      : [];
    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'File Excel không có dòng tài khoản nào để nhập.' });
    }

    const existingEmails = new Set(req.fullState.users.map((u) => String(u.email || '').toLowerCase()));
    const createdUsers = [];
    const errors = [];

    const normalizeRole = (val) => {
      const raw = String(val || '').trim();
      if (!raw) return 'MEMBER';
      const upper = raw.toUpperCase();
      if (upper === 'DIRECTOR' || raw.toLowerCase().includes('lãnh đạo') || raw.toLowerCase().includes('lanh dao')) {
        return 'DIRECTOR';
      }
      if (upper === 'MEMBER' || raw.toLowerCase().includes('nhân viên') || raw.toLowerCase().includes('nhan vien')) {
        return 'MEMBER';
      }
      return null;
    };

    for (let i = 0; i < rawRows.length; i += 1) {
      const row = rawRows[i] || {};
      const rowNum = row._rowNumber || i + 2;
      const name = String(row.name || '').trim();
      const email = String(row.email || '').trim();
      const password = String(row.password || '').trim() || '123456';
      const role = normalizeRole(row.role);
      const title = String(row.title || '').trim();
      const department = String(row.department || '').trim();

      if (!name || !email) {
        errors.push({ row: rowNum, message: 'Thiếu Họ và tên hoặc Email đăng nhập.' });
        continue;
      }
      if (!role) {
        errors.push({
          row: rowNum,
          message: `Vai trò "${row.role}" không hợp lệ (chỉ nhận MEMBER / DIRECTOR hoặc Nhân viên / Lãnh đạo).`,
        });
        continue;
      }
      if (existingEmails.has(email.toLowerCase())) {
        errors.push({ row: rowNum, message: `Email "${email}" đã tồn tại trong hệ thống.` });
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const created = await createUser({
        companyId,
        name,
        email,
        password,
        role,
        title: title || (role === 'DIRECTOR' ? 'Lãnh đạo Công ty' : 'Nhân viên'),
        department: department || 'Khối Công nghệ',
      });
      existingEmails.add(email.toLowerCase());
      createdUsers.push(sanitizeUser(created));
    }

    return res.status(201).json({
      importedCount: createdUsers.length,
      skippedCount: errors.length,
      autoAssignedCompanyId: companyId,
      createdUsers,
      errors,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id', requireCompanyAdmin, async (req, res) => {
  try {
    const { companyId } = req.auth;
    const target = req.fullState.users.find(
      (u) => u.id === req.params.id && u.companyId === companyId
    );
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản trong công ty của bạn.' });
    }
    if (target.role === 'COMPANY_ADMIN') {
      return res.status(403).json({
        error: 'Tài khoản Admin Công ty do Quản trị Hệ thống (SYSTEM_ADMIN) quản lý.',
      });
    }

    const { role, title, department, name, email, status, password } = req.body || {};
    const updates = {};
    if (role !== undefined) {
      if (!['DIRECTOR', 'MEMBER'].includes(role)) {
        return res.status(400).json({
          error: 'Vai trò cấp công ty chỉ gồm DIRECTOR (Lãnh đạo) hoặc MEMBER (Nhân viên).',
        });
      }
      updates.role = role;
    }
    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Họ và tên không được để trống.' });
      }
      updates.name = trimmedName;
      updates.avatar =
        trimmedName
          .split(/\s+/)
          .slice(-2)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('') || target.avatar;
    }
    if (email !== undefined) {
      const trimmedEmail = String(email).trim();
      if (!trimmedEmail) {
        return res.status(400).json({ error: 'Email đăng nhập không được để trống.' });
      }
      const dup = req.fullState.users.find(
        (u) => u.id !== target.id && u.email.toLowerCase() === trimmedEmail.toLowerCase()
      );
      if (dup) {
        return res.status(409).json({ error: `Email ${trimmedEmail} đã tồn tại trong hệ thống.` });
      }
      updates.email = trimmedEmail;
    }
    if (title !== undefined) updates.title = String(title).trim();
    if (department !== undefined) updates.department = String(department).trim();
    if (status !== undefined) updates.status = status;
    if (password && String(password).trim()) updates.password = String(password).trim();

    const updated = await updateUser(target.id, updates);
    return res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', requireCompanyAdmin, async (req, res) => {
  try {
    const { actor, companyId } = req.auth;
    if (req.params.id === actor.id) {
      return res.status(400).json({ error: 'Không thể tự xóa tài khoản đang đăng nhập.' });
    }

    const target = req.fullState.users.find(
      (u) => u.id === req.params.id && u.companyId === companyId
    );
    if (!target) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản trong công ty của bạn.' });
    }
    if (target.role === 'COMPANY_ADMIN') {
      return res.status(403).json({
        error: 'Tài khoản Admin Công ty do Quản trị Hệ thống (SYSTEM_ADMIN) quản lý.',
      });
    }

    await deleteUser(target.id);
    return res.json({ deleted: true, id: target.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === COMPANY WORKSPACE ROUTES (BLOCKED FOR SYSTEM_ADMIN & COMPANY_ADMIN) ===
router.use(requireWorkspaceRole);

router.get('/bootstrap', async (req, res) => {
  try {
    const { actor, companyId, currentCompany, permissions } = req.auth;
    const weekId = req.query.weekId || '2026-W47';
    const projectId = req.query.projectId || 'all';
    const scoped = scopeStateToCompany(req.fullState, companyId);
    // Exclude COMPANY_ADMIN from workspace employee directory / task assignees
    scoped.users = scoped.users.filter((u) => u.role === 'DIRECTOR' || u.role === 'MEMBER');

    const userById = Object.fromEntries(scoped.users.map((u) => [u.id, u]));
    const attachPmName = (proj) => {
      const pmEntry = (proj.members || []).find((m) => m.projectRole === 'PM');
      const pmUser = userById[pmEntry?.userId || proj.pmId];
      return { ...proj, pmName: pmUser?.name || '' };
    };

    const visibleProjects = scoped.projects.filter((p) => isProjectMember(p, actor));
    const visibleProjectIds = new Set(visibleProjects.map((p) => p.id));

    // Projects strictly managed by actor (DIRECTOR: all company projects; PM: ONLY projects where actor is PM)
    const pmSet = new Set(permissions.pmProjectIds || []);
    const managedProjects =
      actor.role === 'DIRECTOR'
        ? scoped.projects
        : scoped.projects.filter((p) => pmSet.has(p.id));
    const managedMemberIds =
      actor.role === 'DIRECTOR'
        ? new Set(scoped.users.map((u) => u.id))
        : getProjectMemberIdSet(managedProjects);

    let enrichedTasks = buildEnrichedTasks(scoped, REFERENCE_DATE).filter((t) =>
      visibleProjectIds.has(t.projectId)
    );

    // Strict visibility:
    // - DIRECTOR: all company tasks
    // - Project PM: ONLY tasks in projects they manage as PM (+ own tasks)
    // - Regular MEMBER (DEV/BA/TEST): ONLY their own tasks!
    if (actor.role !== 'DIRECTOR') {
      if (permissions.isProjectPm) {
        enrichedTasks = enrichedTasks.filter(
          (t) => pmSet.has(t.projectId) || t.assigneeId === actor.id
        );
      } else {
        enrichedTasks = enrichedTasks.filter((t) => t.assigneeId === actor.id);
      }
    }

    // Strict summary scoping:
    // - DIRECTOR: all company employees & all company projects
    // - Project PM: ONLY employees inside projects managed as PM & ONLY projects managed as PM
    // - Regular MEMBER: ONLY self
    const summaryUsers =
      actor.role === 'DIRECTOR'
        ? scoped.users
        : permissions.isProjectPm
        ? scoped.users.filter((u) => managedMemberIds.has(u.id))
        : scoped.users.filter((u) => u.id === actor.id);

    const summaryProjects =
      actor.role === 'DIRECTOR'
        ? scoped.projects
        : permissions.isProjectPm
        ? managedProjects
        : visibleProjects;

    const summaryTasks =
      actor.role === 'DIRECTOR'
        ? enrichedTasks
        : permissions.isProjectPm
        ? enrichedTasks.filter((t) => pmSet.has(t.projectId))
        : enrichedTasks;

    const summary = buildWeeklySummary(
      summaryTasks,
      summaryUsers,
      summaryProjects,
      weekId,
      projectId
    );
    const weeksWithCurrent = ensureCurrentCalendarWeek(scoped.weeks);
    const weekLabel = resolveWeekLabel(weeksWithCurrent, weekId);
    const watchdog = permissions.canViewAI ? generateWatchdogReport(summary, weekLabel) : null;

    return res.json({
      referenceDate: REFERENCE_DATE,
      dbInfo: getDbInfo(),
      currentCompany,
      actor,
      permissions,
      weeks: weeksWithCurrent,
      projects: (actor.role === 'DIRECTOR' ? scoped.projects : visibleProjects).map(attachPmName),
      managedProjects: managedProjects.map(attachPmName),
      allCompanyProjects: (actor.role === 'DIRECTOR' ? scoped.projects : managedProjects).map(
        attachPmName
      ),
      users: permissions.canViewTeamTasks ? scoped.users : [actor],
      managedUsers: summaryUsers,
      tasks: enrichedTasks,
      summary,
      watchdog,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === FILE ATTACHMENT UPLOAD ===
router.post('/upload', async (req, res) => {
  try {
    const { filename, mimeType = 'application/octet-stream', contentBase64 } = req.body || {};
    if (!filename || !contentBase64) {
      return res.status(400).json({ error: 'Thiếu tên file hoặc nội dung tệp đính kèm.' });
    }

    const base64Data = String(contentBase64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Dung lượng file đính kèm vượt quá giới hạn 8MB.' });
    }

    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const savedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, savedName), buffer);

    return res.status(201).json({
      id: `ATT-${Date.now().toString().slice(-6)}`,
      name: filename,
      url: `/uploads/${savedName}`,
      size: buffer.length,
      mimeType,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === PROJECT CREATION (DIRECTOR ONLY) & PER-PROJECT ROLE ASSIGNMENT (PM / DEV / BA / TEST) ===
router.post('/projects', async (req, res) => {
  try {
    const { actor, companyId } = req.auth;

    if (actor.role !== 'DIRECTOR') {
      return res.status(403).json({
        error: 'Chỉ Lãnh đạo Công ty (DIRECTOR) mới có quyền tạo dự án mới và chỉ định PM.',
      });
    }

    const { name, code, client, description, color, members = [] } = req.body || {};
    if (!name || !name.trim() || !code || !code.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Tên dự án và Mã dự án.' });
    }

    const companyUserIds = new Set(
      req.fullState.users
        .filter((u) => u.companyId === companyId && (u.role === 'DIRECTOR' || u.role === 'MEMBER'))
        .map((u) => u.id)
    );

    const sanitizedMembers = [];
    const seen = new Set();
    if (Array.isArray(members)) {
      for (const m of members) {
        if (m && companyUserIds.has(m.userId) && !seen.has(m.userId)) {
          seen.add(m.userId);
          sanitizedMembers.push({
            userId: m.userId,
            projectRole: VALID_PROJECT_ROLES.has(m.projectRole) ? m.projectRole : 'DEV',
          });
        }
      }
    }

    // Ensure project has a PM; if actor is a PM (MEMBER with PM projectRole), ensure actor is PM
    const hasPm = sanitizedMembers.some((m) => m.projectRole === 'PM');
    let fallbackPmId = sanitizedMembers.find((m) => m.projectRole === 'PM')?.userId || '';
    if (!hasPm) {
      if (!seen.has(actor.id)) {
        sanitizedMembers.unshift({ userId: actor.id, projectRole: 'PM' });
      }
      fallbackPmId = actor.id;
    }

    const project = await createProject({
      companyId,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      client: (client || 'Nội bộ').trim(),
      description: (description || '').trim(),
      color: color || '#3370FF',
      pmId: fallbackPmId,
      members: sanitizedMembers,
    });

    return res.status(201).json({ project });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/projects/:id/members', async (req, res) => {
  try {
    const { actor, companyId } = req.auth;

    const project = req.fullState.projects.find(
      (p) => p.id === req.params.id && p.companyId === companyId
    );
    if (!project) {
      return res.status(404).json({ error: 'Không tìm thấy dự án trong công ty của bạn.' });
    }

    const actorProjectRole = getUserProjectRole(project, actor.id);
    const isAllowed = actor.role === 'DIRECTOR' || actorProjectRole === 'PM';

    if (!isAllowed) {
      return res.status(403).json({
        error:
          'Chỉ Lãnh đạo Công ty hoặc PM của dự án này mới có quyền thêm thành viên và chia role PM/DEV/BA/TEST trong dự án.',
      });
    }

    const { members } = req.body || {};
    if (!Array.isArray(members)) {
      return res.status(400).json({ error: 'Danh sách thành viên dự án không hợp lệ.' });
    }

    const companyUserIds = new Set(
      req.fullState.users
        .filter((u) => u.companyId === companyId && (u.role === 'DIRECTOR' || u.role === 'MEMBER'))
        .map((u) => u.id)
    );

    const sanitizedMembers = [];
    const seen = new Set();
    for (const m of members) {
      if (m && companyUserIds.has(m.userId) && !seen.has(m.userId)) {
        seen.add(m.userId);
        sanitizedMembers.push({
          userId: m.userId,
          projectRole: VALID_PROJECT_ROLES.has(m.projectRole) ? m.projectRole : 'DEV',
        });
      }
    }

    if (actor.role !== 'DIRECTOR') {
      // A Project PM can add/remove DEV/BA/TEST employees, but cannot strip/change PM designation
      const currentPmIds = (project.members || [])
        .filter((m) => m.projectRole === 'PM')
        .map((m) => m.userId);
      const nextPmIds = sanitizedMembers
        .filter((m) => m.projectRole === 'PM')
        .map((m) => m.userId);
      const samePmSet =
        currentPmIds.length === nextPmIds.length &&
        currentPmIds.every((id) => nextPmIds.includes(id));
      if (!samePmSet) {
        return res.status(403).json({
          error: 'Chỉ Lãnh đạo Công ty mới có quyền chỉ định hoặc thay đổi PM của dự án.',
        });
      }
    }

    const pmEntry = sanitizedMembers.find((m) => m.projectRole === 'PM');
    const updated = await updateProject(project.id, {
      members: sanitizedMembers,
      pmId: pmEntry ? pmEntry.userId : project.pmId,
    });

    return res.json({ project: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { actor, companyId } = req.auth;
    if (actor.role !== 'DIRECTOR') {
      return res.status(403).json({
        error: 'Chỉ Lãnh đạo Công ty (DIRECTOR) mới có quyền xóa dự án.',
      });
    }

    const existing = req.fullState.projects.find(
      (p) => p.id === req.params.id && p.companyId === companyId
    );
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy dự án trong công ty của bạn.' });
    }

    await deleteProject(existing.id);
    return res.json({ deleted: true, id: existing.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === TASKS ===
router.get('/tasks', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    const { weekId = 'all', projectId = 'all', assigneeId = 'all' } = req.query;
    const scoped = scopeStateToCompany(req.fullState, companyId);
    const visibleProjectIds = new Set(
      scoped.projects.filter((p) => isProjectMember(p, actor)).map((p) => p.id)
    );

    let tasks = buildEnrichedTasks(scoped, REFERENCE_DATE).filter((t) =>
      visibleProjectIds.has(t.projectId)
    );

    if (actor.role !== 'DIRECTOR') {
      if (permissions.isProjectPm) {
        const pmSet = new Set(permissions.pmProjectIds);
        tasks = tasks.filter((t) => pmSet.has(t.projectId) || t.assigneeId === actor.id);
      } else {
        tasks = tasks.filter((t) => t.assigneeId === actor.id);
      }
    }

    if (weekId !== 'all') tasks = tasks.filter((t) => t.weekId === weekId);
    if (projectId !== 'all') tasks = tasks.filter((t) => t.projectId === projectId);
    if (assigneeId !== 'all') tasks = tasks.filter((t) => t.assigneeId === assigneeId);

    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    const {
      title,
      projectId,
      weekId = '2026-W47',
      estimatedVolume = 1,
      status = 'pending_review',
    } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Nội dung công việc không được để trống.' });
    }
    if (!VALID_TASK_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'Trạng thái task không hợp lệ (chỉ nhận: Chờ đánh giá, Đã hoàn thành, Hủy).',
      });
    }

    const targetProject = req.fullState.projects.find(
      (p) => p.id === projectId && p.companyId === companyId
    );
    if (!targetProject) {
      return res.status(400).json({ error: 'Dự án không thuộc công ty hiện tại.' });
    }
    if (!isProjectMember(targetProject, actor)) {
      return res.status(403).json({
        error: 'Bạn chưa được phân vào dự án này để log công việc.',
      });
    }

    const canAssignOthers =
      actor.role === 'DIRECTOR' || permissions.pmProjectIds.includes(targetProject.id);
    const assigneeId = canAssignOthers ? req.body.assigneeId || actor.id : actor.id;

    if (status !== 'cancelled') {
      const capError = validateWeeklyEstCap(
        req.fullState.tasks,
        companyId,
        assigneeId,
        weekId,
        estimatedVolume
      );
      if (capError) {
        return res.status(400).json({ error: capError });
      }
    }

    const created = await createTask({
      ...req.body,
      weekId,
      estimatedVolume: Number(estimatedVolume),
      status,
      assigneeId,
      companyId,
    });
    const scoped = scopeStateToCompany(await getState(), companyId);
    const enriched = buildEnrichedTasks(scoped, REFERENCE_DATE).find((t) => t.id === created.id);
    return res.status(201).json({ task: enriched || created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tasks/bulk', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Danh sách task không hợp lệ.' });
    }

    const simulatedTasks = [...req.fullState.tasks];
    const payload = [];

    for (const t of tasks) {
      const targetProject = req.fullState.projects.find(
        (p) => p.id === t.projectId && p.companyId === companyId
      );
      if (!targetProject || !isProjectMember(targetProject, actor)) {
        return res.status(403).json({ error: 'Có đầu việc thuộc dự án bạn không tham gia.' });
      }
      const assigneeId = permissions.canReviewQuality ? t.assigneeId || actor.id : actor.id;
      const weekId = t.weekId || '2026-W47';
      const est = Number(t.estimatedVolume ?? 1);
      const status = VALID_TASK_STATUSES.has(t.status) ? t.status : 'pending_review';

      if (status !== 'cancelled') {
        const capErr = validateWeeklyEstCap(simulatedTasks, companyId, assigneeId, weekId, est);
        if (capErr) return res.status(400).json({ error: capErr });
      }

      const item = {
        ...t,
        weekId,
        estimatedVolume: est,
        status,
        assigneeId,
        companyId,
      };
      simulatedTasks.push({ ...item, id: `SIM-${simulatedTasks.length}` });
      payload.push(item);
    }

    const created = await createTasksBulk(payload);
    return res.status(201).json({ count: created.length, tasks: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;

    const existing = await getTaskById(req.params.id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ error: 'Không tìm thấy công việc trong công ty.' });
    }

    const canReviewThisTask =
      actor.role === 'DIRECTOR' || permissions.pmProjectIds.includes(existing.projectId);

    const updates = { ...req.body };

    const touchingPmFields =
      updates.pmQualityRating !== undefined ||
      updates.pmQualityScore !== undefined ||
      updates.pmFeedback !== undefined;
    if (touchingPmFields && !canReviewThisTask) {
      return res.status(403).json({
        error: 'Chỉ PM của dự án này hoặc Lãnh đạo Công ty mới có quyền đánh giá chất lượng.',
      });
    }
    if (touchingPmFields) {
      updates.pmReviewerId = actor.id;
      updates.pmReviewerName = actor.name;
    }

    if (!canReviewThisTask && existing.assigneeId !== actor.id) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền sửa công việc của chính mình.' });
    }

    if (updates.status !== undefined && !VALID_TASK_STATUSES.has(updates.status)) {
      return res.status(400).json({
        error: 'Trạng thái không hợp lệ (chỉ nhận: Chờ đánh giá, Đã hoàn thành, Hủy).',
      });
    }

    // Re-validate weekly Est cap <= 5 if estimatedVolume, weekId, or status changes to active
    const nextWeekId = updates.weekId ?? existing.weekId;
    const nextEst =
      updates.estimatedVolume !== undefined ? Number(updates.estimatedVolume) : existing.estimatedVolume;
    const nextStatus = updates.status ?? existing.status;

    if (
      nextStatus !== 'cancelled' &&
      (updates.estimatedVolume !== undefined ||
        updates.weekId !== undefined ||
        (updates.status !== undefined && existing.status === 'cancelled'))
    ) {
      const capError = validateWeeklyEstCap(
        req.fullState.tasks,
        companyId,
        existing.assigneeId,
        nextWeekId,
        nextEst,
        existing.id
      );
      if (capError) {
        return res.status(400).json({ error: capError });
      }
      updates.estimatedVolume = nextEst;
    }

    // Checkbox Xong (isDone) <-> completedAt synchronization
    if (updates.isDone === true && !updates.completedAt && !existing.completedAt) {
      updates.completedAt = REFERENCE_DATE;
      if (updates.selfProgress === undefined && existing.selfProgress < 100) {
        updates.selfProgress = 100;
      }
    } else if (updates.isDone === false && updates.completedAt === undefined) {
      updates.completedAt = null;
    }

    if (updates.status === 'completed') {
      updates.isDone = true;
      if (!updates.completedAt && !existing.completedAt) {
        updates.completedAt = REFERENCE_DATE;
      }
    }

    if (
      (updates.pmQualityRating === 'rework' || updates.pmQualityRating === 'poor') &&
      updates.pmQualityRating !== existing.pmQualityRating
    ) {
      updates.reworkCount = (existing.reworkCount || 0) + 1;
    }

    if (updates.pmQualityRating && updates.pmQualityRating !== 'pending') {
      updates.pmReviewedAt = new Date().toISOString();
    }
    if (updates.selfKpiRating && updates.selfKpiRating !== 'pending') {
      updates.selfSubmittedAt = new Date().toISOString();
    }

    const updated = await updateTask(req.params.id, updates);
    const scoped = scopeStateToCompany(await getState(), companyId);
    const enriched = buildEnrichedTasks(scoped, REFERENCE_DATE).find((t) => t.id === updated.id);
    return res.json({ task: enriched || updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    const existing = await getTaskById(req.params.id);
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ error: 'Không tìm thấy công việc.' });
    }
    const canDelete =
      actor.role === 'DIRECTOR' ||
      permissions.pmProjectIds.includes(existing.projectId) ||
      existing.assigneeId === actor.id;
    if (!canDelete) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền xóa công việc của chính mình.' });
    }
    await deleteTask(req.params.id);
    return res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/kpi/summary', async (req, res) => {
  try {
    const { companyId } = req.auth;
    const weekId = req.query.weekId || '2026-W47';
    const projectId = req.query.projectId || 'all';
    const scoped = scopeStateToCompany(req.fullState, companyId);
    const enrichedTasks = buildEnrichedTasks(scoped, REFERENCE_DATE);
    const summary = buildWeeklySummary(enrichedTasks, scoped.users, scoped.projects, weekId, projectId);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === STRICT RBAC AI ROUTES (ONLY DIRECTOR & PROJECT PM) ===
router.get('/ai/watchdog', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    if (!permissions.canViewAI) {
      return res.status(403).json({
        error:
          'Phân quyền bị từ chối: Chỉ Lãnh đạo Công ty và nhân sự giữ vai trò PM dự án mới được xem AI Tổng hợp trực quan.',
      });
    }

    const weekId = req.query.weekId || '2026-W47';
    const projectId = req.query.projectId || 'all';
    const scoped = scopeStateToCompany(req.fullState, companyId);
    let enrichedTasks = buildEnrichedTasks(scoped, REFERENCE_DATE);
    let visibleProjects = scoped.projects;
    let visibleUsers = scoped.users;
    if (actor.role !== 'DIRECTOR') {
      const pmSet = new Set(permissions.pmProjectIds);
      visibleProjects = scoped.projects.filter((p) => pmSet.has(p.id));
      const managedMemberIds = getProjectMemberIdSet(visibleProjects);
      visibleUsers = scoped.users.filter((u) => managedMemberIds.has(u.id));
      enrichedTasks = enrichedTasks.filter((t) => pmSet.has(t.projectId));
    }
    const summary = buildWeeklySummary(enrichedTasks, visibleUsers, visibleProjects, weekId, projectId);
    const weekLabel = resolveWeekLabel(scoped.weeks, weekId);
    const watchdog = generateWatchdogReport(summary, weekLabel);
    return res.json(watchdog);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/ai/employee-360', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    const { userId, weekId = '2026-W47' } = req.query;

    if (!permissions.canViewAI) {
      return res.status(403).json({
        error: 'Phân quyền bị từ chối: Chỉ Lãnh đạo và PM mới được tra cứu AI 360°.',
      });
    }

    const scoped = scopeStateToCompany(req.fullState, companyId);
    const user = scoped.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy nhân sự trong công ty của bạn.' });
    }
    let enrichedTasks = buildEnrichedTasks(scoped, REFERENCE_DATE);
    if (actor.role !== 'DIRECTOR') {
      const pmSet = new Set(permissions.pmProjectIds);
      const pmProjects = scoped.projects.filter((p) => pmSet.has(p.id));
      const managedMemberIds = getProjectMemberIdSet(pmProjects);
      if (!managedMemberIds.has(user.id) && user.id !== actor.id) {
        return res.status(403).json({
          error: 'Nhân sự này không thuộc dự án do bạn phụ trách làm PM.',
        });
      }
      enrichedTasks = enrichedTasks.filter((t) => pmSet.has(t.projectId));
    }
    const weekLabel = resolveWeekLabel(scoped.weeks, weekId);
    const report = generateEmployee360Report(user, enrichedTasks, weekId, weekLabel);
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/ai/parse-tasks', async (req, res) => {
  try {
    const { actor, companyId } = req.auth;
    const { text, weekId = '2026-W47', assigneeId } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập mô tả công việc để AI bóc tách.' });
    }
    const scoped = scopeStateToCompany(req.fullState, companyId);
    const visibleProjects = scoped.projects.filter((p) => isProjectMember(p, actor));

    const drafts = parseSmartTaskInput(
      text,
      visibleProjects.length > 0 ? visibleProjects : scoped.projects,
      weekId,
      assigneeId || actor.id,
      REFERENCE_DATE
    );
    return res.json({ drafts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/ai/chat', async (req, res) => {
  try {
    const { actor, companyId, permissions } = req.auth;
    if (!permissions.canUseChatbot) {
      return res.status(403).json({
        error:
          'Phân quyền bị từ chối: Chỉ Lãnh đạo Công ty và nhân sự giữ vai trò PM dự án mới được sử dụng AI Chatbot.',
      });
    }

    const { query, weekId = '2026-W47', projectId = 'all', apiKey = '' } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập câu hỏi cho AI Copilot.' });
    }

    const scoped = scopeStateToCompany(req.fullState, companyId);
    let allEnrichedTasks = buildEnrichedTasks(scoped, REFERENCE_DATE);
    let visibleProjects = scoped.projects;
    let visibleUsers = scoped.users;
    if (actor.role !== 'DIRECTOR') {
      const pmSet = new Set(permissions.pmProjectIds);
      visibleProjects = scoped.projects.filter((p) => pmSet.has(p.id));
      const managedMemberIds = getProjectMemberIdSet(visibleProjects);
      visibleUsers = scoped.users.filter((u) => managedMemberIds.has(u.id));
      allEnrichedTasks = allEnrichedTasks.filter((t) => pmSet.has(t.projectId));
    }
    const summary = buildWeeklySummary(allEnrichedTasks, visibleUsers, visibleProjects, weekId, projectId);
    const weekLabel = resolveWeekLabel(scoped.weeks, weekId);
    const watchdog = generateWatchdogReport(summary, weekLabel);

    const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY || '';
    const reply = await answerCopilotQuery(
      query,
      {
        summary,
        watchdog,
        allEnrichedTasks,
        users: visibleUsers,
        weekId,
        weekLabel,
      },
      effectiveApiKey
    );

    return res.json(reply);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
