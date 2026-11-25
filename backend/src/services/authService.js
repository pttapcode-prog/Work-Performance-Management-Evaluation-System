import crypto from 'crypto';

const AUTH_SECRET = process.env.JWT_SECRET || 'wpmes-secret-key-2026';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signAuthToken(user) {
  const now = Date.now();
  const payload = {
    sub: user.id,
    role: user.role,
    companyId: user.companyId,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${data}.${sig}`;
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(fromBase64Url(payloadB64));
    if (!payload || !payload.sub || (payload.exp && Date.now() > payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

export function getUserProjectRole(project, userId) {
  if (!project || !userId) return null;
  const found = (project.members || []).find((m) => m.userId === userId);
  if (found) return found.projectRole;
  if (project.pmId === userId) return 'PM';
  if ((project.memberIds || []).includes(userId)) return 'DEV';
  return null;
}

export function computePermissions(actor, companyProjects = []) {
  const role = actor?.role;
  const isSystemAdmin = role === 'SYSTEM_ADMIN';
  const isCompanyAdmin = role === 'COMPANY_ADMIN';
  const isDirector = role === 'DIRECTOR';
  const canAccessWorkspace = isDirector || role === 'MEMBER';

  const pmProjectIds = [];
  const projectRolesMap = {};

  if (canAccessWorkspace && actor?.id && Array.isArray(companyProjects)) {
    for (const p of companyProjects) {
      const pRole = getUserProjectRole(p, actor.id);
      if (pRole) {
        projectRolesMap[p.id] = pRole;
        if (pRole === 'PM') {
          pmProjectIds.push(p.id);
        }
      }
    }
  }

  const isProjectPm = pmProjectIds.length > 0;

  return {
    isSystemAdmin,
    isCompanyAdmin,
    isDirector,
    isProjectPm,
    canAccessWorkspace,
    pmProjectIds,
    projectRolesMap,
    canManageCompanyUsers: isCompanyAdmin,
    // Strictly ONLY Director can create projects and designate who is PM
    canCreateProject: isDirector,
    canAssignProjectPm: isDirector,
    // Both Director and Project PM can add/remove company employees in their projects
    canManageProjectMembers: isDirector || isProjectPm,
    // Only Director & Project PM can view team tasks, grade KPIs, and access AI
    canViewAllCompanyTasks: isDirector,
    canViewTeamTasks: isDirector || isProjectPm,
    canReviewQuality: isDirector || isProjectPm,
    canViewAI: isDirector || isProjectPm,
    canUseChatbot: isDirector || isProjectPm,
  };
}
