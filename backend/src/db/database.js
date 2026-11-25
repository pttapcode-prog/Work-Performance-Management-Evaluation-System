import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Company from '../models/Company.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import Week from '../models/Week.js';
import Task from '../models/Task.js';
import { REFERENCE_DATE, createSeedData } from './seedData.js';
import { enrichTask, buildEnrichedTasks } from '../services/kpiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DATA_FILE = path.join(__dirname, 'data.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wpmes';

let dbMode = 'uninitialized'; // 'mongodb' | 'mongodb-fallback'
let initPromise = null;
let lastConnectAttemptAt = 0;

const VALID_COMPANY_ROLES = new Set(['SYSTEM_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'MEMBER']);
const VALID_PROJECT_ROLES = new Set(['PM', 'DEV', 'BA', 'TEST']);
const VALID_TASK_STATUSES = new Set(['pending_review', 'completed', 'cancelled']);

function maskMongoUri(uri) {
  return String(uri || '').replace(/:([^:@/]+)@/, ':****@');
}

function configureNodeDnsForSrv() {
  try {
    const existing = dns.getServers().filter((s) => s !== '127.0.0.1' && s !== '::1');
    dns.setServers(['8.8.8.8', '1.1.1.1', ...existing]);
  } catch {
    // ignore if dns.setServers is restricted
  }
}

function buildDirectAtlasFallbackUri(srvUri) {
  try {
    const match = String(srvUri).match(
      /^mongodb\+srv:\/\/([^@]+)@kpidatabase\.3trm5uf\.mongodb\.net\/([^?]*)(?:\?(.*))?$/i
    );
    if (!match) return null;
    const [, credentials, dbName = 'wpmes'] = match;
    const targetDb = dbName || 'wpmes';
    const hosts = [
      'ac-pfpru37-shard-00-00.3trm5uf.mongodb.net:27017',
      'ac-pfpru37-shard-00-01.3trm5uf.mongodb.net:27017',
      'ac-pfpru37-shard-00-02.3trm5uf.mongodb.net:27017',
    ].join(',');
    return `mongodb://${credentials}@${hosts}/${targetDb}?ssl=true&replicaSet=atlas-ulb8fr-shard-0&authSource=admin&retryWrites=true&w=majority&appName=kpidatabase`;
  } catch {
    return null;
  }
}

function generateId(prefix) {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(10 + Math.random() * 90);
  return `${prefix}-${ts}${rand}`;
}

function stripMongoFields(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj._id;
  delete obj.__v;
  delete obj.createdAt;
  delete obj.updatedAt;
  return obj;
}

function normalizeProjectMembers(membersInput = [], fallbackPmId = '') {
  const map = new Map();
  if (Array.isArray(membersInput)) {
    for (const item of membersInput) {
      if (!item || !item.userId) continue;
      const role = VALID_PROJECT_ROLES.has(item.projectRole) ? item.projectRole : 'DEV';
      map.set(item.userId, { userId: item.userId, projectRole: role });
    }
  }
  if (fallbackPmId && !map.has(fallbackPmId)) {
    map.set(fallbackPmId, { userId: fallbackPmId, projectRole: 'PM' });
  }
  const members = Array.from(map.values());
  const memberIds = members.map((m) => m.userId);
  const pmEntry = members.find((m) => m.projectRole === 'PM');
  const pmId = pmEntry ? pmEntry.userId : fallbackPmId || '';
  return { members, memberIds, pmId };
}

function normalizeLegacyTaskStatus(status, isDone) {
  if (VALID_TASK_STATUSES.has(status)) return status;
  if (status === 'done' || isDone) return 'completed';
  return 'pending_review';
}

function readJsonFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = createSeedData();
    seed.tasks = buildEnrichedTasks(seed, REFERENCE_DATE);
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  const hasValidCompanyRoles =
    Array.isArray(parsed.users) &&
    parsed.users.some((u) => u.role === 'SYSTEM_ADMIN') &&
    parsed.users.some((u) => u.role === 'COMPANY_ADMIN') &&
    parsed.users.every((u) => VALID_COMPANY_ROLES.has(u.role));

  const hasProjectRoleSchema =
    Array.isArray(parsed.projects) &&
    parsed.projects.length > 0 &&
    parsed.projects.every((p) => Array.isArray(p.members));

  const hasNewTaskSchema =
    Array.isArray(parsed.tasks) &&
    parsed.tasks.length > 0 &&
    parsed.tasks.every(
      (t) =>
        t.estimatedVolume !== undefined &&
        t.endDate !== undefined &&
        VALID_TASK_STATUSES.has(t.status)
    );

  const hasWpmesBrand =
    Array.isArray(parsed.users) &&
    parsed.users.some((u) => u.email === 'sysadmin@wpmes.vn') &&
    Array.isArray(parsed.projects) &&
    parsed.projects.every((p) => p.id !== 'PRJ-APEX');

  if (!hasValidCompanyRoles || !hasProjectRoleSchema || !hasNewTaskSchema || !hasWpmesBrand) {
    const seed = createSeedData();
    seed.tasks = buildEnrichedTasks(seed, REFERENCE_DATE);
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
  return parsed;
}

function writeJsonFile(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function seedMongoIfEmpty() {
  const [companyCount, weekCount, projectCount, userCount, taskCount] = await Promise.all([
    Company.countDocuments(),
    Week.countDocuments(),
    Project.countDocuments(),
    User.countDocuments(),
    Task.countDocuments(),
  ]);

  const seed = createSeedData();
  const seedEnrichedTasks = buildEnrichedTasks(seed, REFERENCE_DATE);

  if (companyCount === 0 && weekCount === 0 && projectCount === 0 && userCount === 0 && taskCount === 0) {
    await Company.insertMany(seed.companies);
    await Week.insertMany(seed.weeks);
    await Project.insertMany(seed.projects);
    await User.insertMany(seed.users);
    await Task.insertMany(seedEnrichedTasks);
    console.log('[DB] Seeded initial Companies, Users, Projects, Weeks and Enriched Tasks into MongoDB.');
    return;
  }

  // Ensure Weeks exist if partially empty
  if (weekCount === 0 && seed.weeks.length > 0) {
    await Week.insertMany(seed.weeks);
  }

  // Migrate/enrich any legacy or incomplete Task documents in MongoDB
  if (taskCount > 0) {
    const legacyCount = await Task.countDocuments({
      $or: [
        { status: { $nin: ['pending_review', 'completed', 'cancelled'] } },
        { estimatedVolume: { $exists: false } },
        { endDate: { $exists: false } },
        { finalKpiScore: { $exists: false } },
        { aiSuggestedScore: { $exists: false } },
      ],
    });

    if (legacyCount > 0) {
      const [users, projects, weeks, existingTasks] = await Promise.all([
        User.find().lean(),
        Project.find().lean(),
        Week.find().lean(),
        Task.find().lean(),
      ]);

      const userMap = Object.fromEntries(users.map((u) => [u.id, stripMongoFields(u)]));
      const projectMap = Object.fromEntries(projects.map((p) => [p.id, stripMongoFields(p)]));
      const weekMap = Object.fromEntries(weeks.map((w) => [w.id, stripMongoFields(w)]));

      const ops = existingTasks.map((rawDoc) => {
        const clean = stripMongoFields(rawDoc);
        const normalized = {
          ...clean,
          estimatedVolume: clean.estimatedVolume !== undefined ? Number(clean.estimatedVolume) : 1,
          endDate: clean.endDate || clean.deadline || '2026-11-22',
          startDate: clean.startDate || clean.deadline || '2026-11-16',
          status: normalizeLegacyTaskStatus(clean.status, clean.isDone),
          isDone: Boolean(clean.isDone || clean.status === 'done' || clean.status === 'completed'),
          attachments: Array.isArray(clean.attachments) ? clean.attachments : [],
        };
        const enriched = enrichTask(normalized, REFERENCE_DATE, { userMap, projectMap, weekMap });
        return {
          updateOne: {
            filter: { id: enriched.id },
            update: { $set: enriched },
          },
        };
      });

      if (ops.length > 0) {
        await Task.bulkWrite(ops);
        console.log(`[DB] Migrated and enriched ${ops.length} Task documents in MongoDB.`);
      }
    }
  }
}

async function enrichTaskForDb(rawTask, jsonState = null) {
  let user = null;
  let project = null;
  let week = null;

  if (dbMode === 'mongodb') {
    const [uDoc, pDoc, wDoc] = await Promise.all([
      User.findOne({ id: rawTask.assigneeId }).lean(),
      Project.findOne({ id: rawTask.projectId }).lean(),
      Week.findOne({ id: rawTask.weekId }).lean(),
    ]);
    user = stripMongoFields(uDoc);
    project = stripMongoFields(pDoc);
    week = stripMongoFields(wDoc);
  } else {
    const data = jsonState || readJsonFile();
    user = data.users.find((u) => u.id === rawTask.assigneeId) || null;
    project = data.projects.find((p) => p.id === rawTask.projectId) || null;
    week = data.weeks.find((w) => w.id === rawTask.weekId) || null;
  }

  return enrichTask(rawTask, REFERENCE_DATE, {
    userMap: user ? { [user.id]: user } : {},
    projectMap: project ? { [project.id]: project } : {},
    weekMap: week ? { [week.id]: week } : {},
  });
}

export async function initDatabase(forceRetry = false) {
  if (
    initPromise &&
    (dbMode === 'mongodb' || (!forceRetry && Date.now() - lastConnectAttemptAt < 20000))
  ) {
    return initPromise;
  }

  lastConnectAttemptAt = Date.now();
  initPromise = (async () => {
    try {
      const connectOpts = {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
      };

      if (MONGODB_URI.startsWith('mongodb+srv://')) {
        configureNodeDnsForSrv();
      }

      try {
        await mongoose.connect(MONGODB_URI, connectOpts);
      } catch (srvErr) {
        const directUri = buildDirectAtlasFallbackUri(MONGODB_URI);
        const isDnsSrvError = /querySrv|queryTxt|EREFUSED|ECONNREFUSED|ETIMEOUT/i.test(
          srvErr?.message || ''
        );
        if (isDnsSrvError && directUri) {
          await mongoose.disconnect().catch(() => {});
          await mongoose.connect(directUri, connectOpts);
        } else {
          throw srvErr;
        }
      }

      dbMode = 'mongodb';
      await seedMongoIfEmpty();
      console.log(`[DB] Connected to MongoDB successfully at ${maskMongoUri(MONGODB_URI)}`);
    } catch (error) {
      dbMode = 'mongodb-fallback';
      await mongoose.disconnect().catch(() => {});
      readJsonFile();
      console.warn(
        `[DB] MongoDB unavailable (${error.message}). Using local JSON document store at ${DATA_FILE} as fallback.`
      );
    }
    return getDbInfo();
  })();

  return initPromise;
}

export function getDbInfo() {
  return {
    engine: 'MongoDB (Mongoose)',
    mode: dbMode,
    uri: dbMode === 'mongodb' ? maskMongoUri(MONGODB_URI) : 'local-json-fallback (backend/src/db/data.json)',
    connected: dbMode === 'mongodb',
  };
}

export async function getState() {
  await initDatabase();
  if (dbMode === 'mongodb') {
    const [companies, weeks, projects, users, tasks] = await Promise.all([
      Company.find().sort({ id: 1 }).lean(),
      Week.find().sort({ id: 1 }).lean(),
      Project.find().sort({ id: 1 }).lean(),
      User.find().sort({ id: 1 }).lean(),
      Task.find().sort({ weekId: -1, id: 1 }).lean(),
    ]);
    return {
      companies: companies.map(stripMongoFields),
      weeks: weeks.map(stripMongoFields),
      projects: projects.map(stripMongoFields),
      users: users.map(stripMongoFields),
      tasks: tasks.map(stripMongoFields),
    };
  }
  return readJsonFile();
}

export async function createCompany(companyPayload) {
  await initDatabase();
  const newCompany = {
    id: companyPayload.id || generateId('CMP'),
    name: companyPayload.name,
    code: (companyPayload.code || 'CMP').toUpperCase(),
    domain: companyPayload.domain || '',
    industry: companyPayload.industry || 'Công nghệ thông tin',
    plan: companyPayload.plan || 'Enterprise',
    color: companyPayload.color || '#3370FF',
    logoText: (companyPayload.logoText || companyPayload.name.slice(0, 2)).toUpperCase(),
  };

  if (dbMode === 'mongodb') {
    const created = await Company.create(newCompany);
    return stripMongoFields(created);
  }
  const data = readJsonFile();
  data.companies.push(newCompany);
  writeJsonFile(data);
  return newCompany;
}

export async function updateCompany(companyId, updates) {
  await initDatabase();
  const clean = { ...updates };
  delete clean.id;
  delete clean._id;

  if (dbMode === 'mongodb') {
    const updated = await Company.findOneAndUpdate(
      { id: companyId },
      { $set: clean },
      { new: true }
    ).lean();
    return stripMongoFields(updated);
  }
  const data = readJsonFile();
  const idx = data.companies.findIndex((c) => c.id === companyId);
  if (idx === -1) return null;
  data.companies[idx] = { ...data.companies[idx], ...clean };
  writeJsonFile(data);
  return data.companies[idx];
}

export async function deleteCompany(companyId) {
  await initDatabase();
  if (dbMode === 'mongodb') {
    const res = await Company.deleteOne({ id: companyId });
    if (res.deletedCount === 0) {
      return { deleted: false, deletedUsersCount: 0, deletedProjectsCount: 0, deletedTasksCount: 0 };
    }
    const [uRes, pRes, tRes] = await Promise.all([
      User.deleteMany({ companyId }),
      Project.deleteMany({ companyId }),
      Task.deleteMany({ companyId }),
    ]);
    return {
      deleted: true,
      deletedUsersCount: uRes.deletedCount || 0,
      deletedProjectsCount: pRes.deletedCount || 0,
      deletedTasksCount: tRes.deletedCount || 0,
    };
  }
  const data = readJsonFile();
  const beforeCompanies = data.companies.length;
  const beforeUsers = data.users.length;
  const beforeProjects = data.projects.length;
  const beforeTasks = data.tasks.length;
  data.companies = data.companies.filter((c) => c.id !== companyId);
  if (data.companies.length === beforeCompanies) {
    return { deleted: false, deletedUsersCount: 0, deletedProjectsCount: 0, deletedTasksCount: 0 };
  }
  data.users = data.users.filter((u) => u.companyId !== companyId);
  data.projects = data.projects.filter((p) => p.companyId !== companyId);
  data.tasks = data.tasks.filter((t) => t.companyId !== companyId);
  writeJsonFile(data);
  return {
    deleted: true,
    deletedUsersCount: beforeUsers - data.users.length,
    deletedProjectsCount: beforeProjects - data.projects.length,
    deletedTasksCount: beforeTasks - data.tasks.length,
  };
}

export async function createUser(userPayload) {
  await initDatabase();
  const initials = (userPayload.name || 'NV')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const newUser = {
    id: userPayload.id || generateId('USR'),
    companyId: userPayload.companyId,
    name: userPayload.name,
    email: userPayload.email,
    password: userPayload.password || '123456',
    role: VALID_COMPANY_ROLES.has(userPayload.role) ? userPayload.role : 'MEMBER',
    title: userPayload.title || 'Nhân viên',
    department: userPayload.department || 'Khối Công nghệ',
    avatar: userPayload.avatar || initials || 'NV',
    color: userPayload.color || '#3370FF',
    status: userPayload.status || 'active',
  };

  if (dbMode === 'mongodb') {
    const created = await User.create(newUser);
    return stripMongoFields(created);
  }
  const data = readJsonFile();
  data.users.push(newUser);
  writeJsonFile(data);
  return newUser;
}

export async function updateUser(userId, updates) {
  await initDatabase();
  const clean = { ...updates };
  delete clean.id;
  delete clean._id;
  delete clean.companyId;

  if (dbMode === 'mongodb') {
    const updatedDoc = await User.findOneAndUpdate(
      { id: userId },
      { $set: clean },
      { new: true }
    ).lean();
    if (!updatedDoc) return null;
    const updated = stripMongoFields(updatedDoc);

    // Sync denormalized assignee info on Tasks in MongoDB
    await Task.updateMany(
      { assigneeId: userId },
      {
        $set: {
          assigneeName: updated.name,
          assigneeTitle: updated.title || '',
          assigneeAvatar: updated.avatar || 'NV',
          assigneeColor: updated.color || '#3370FF',
        },
      }
    );
    return updated;
  }
  const data = readJsonFile();
  const idx = data.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  data.users[idx] = { ...data.users[idx], ...clean };
  writeJsonFile(data);
  return data.users[idx];
}

export async function deleteUser(userId) {
  await initDatabase();
  if (dbMode === 'mongodb') {
    const res = await User.deleteOne({ id: userId });
    if (res.deletedCount > 0) {
      const affectedProjects = await Project.find({
        $or: [{ pmId: userId }, { memberIds: userId }, { 'members.userId': userId }],
      }).lean();

      for (const proj of affectedProjects) {
        const nextMembers = (proj.members || []).filter((m) => m.userId !== userId);
        const normalized = normalizeProjectMembers(nextMembers, proj.pmId === userId ? '' : proj.pmId);
        // eslint-disable-next-line no-await-in-loop
        await Project.updateOne({ id: proj.id }, { $set: normalized });
      }
    }
    return res.deletedCount > 0;
  }
  const data = readJsonFile();
  const before = data.users.length;
  data.users = data.users.filter((u) => u.id !== userId);
  data.projects = data.projects.map((p) => {
    const nextMembers = (p.members || []).filter((m) => m.userId !== userId);
    const normalized = normalizeProjectMembers(nextMembers, p.pmId === userId ? '' : p.pmId);
    return {
      ...p,
      ...normalized,
    };
  });
  writeJsonFile(data);
  return data.users.length < before;
}

export async function createProject(projectPayload) {
  await initDatabase();
  const normalized = normalizeProjectMembers(
    projectPayload.members || [],
    projectPayload.pmId || ''
  );

  const newProject = {
    id: projectPayload.id || generateId('PRJ'),
    companyId: projectPayload.companyId,
    code: (projectPayload.code || 'PRJ').toUpperCase(),
    name: projectPayload.name,
    client: projectPayload.client || 'Nội bộ',
    pmId: normalized.pmId,
    members: normalized.members,
    memberIds: normalized.memberIds,
    status: projectPayload.status || 'active',
    color: projectPayload.color || '#3370FF',
    description: projectPayload.description || '',
  };

  if (dbMode === 'mongodb') {
    const created = await Project.create(newProject);
    return stripMongoFields(created);
  }
  const data = readJsonFile();
  data.projects.push(newProject);
  writeJsonFile(data);
  return newProject;
}

export async function updateProject(projectId, updates) {
  await initDatabase();
  const clean = { ...updates };
  delete clean.id;
  delete clean._id;
  delete clean.companyId;

  if (Array.isArray(clean.members)) {
    const normalized = normalizeProjectMembers(clean.members, clean.pmId || '');
    clean.members = normalized.members;
    clean.memberIds = normalized.memberIds;
    clean.pmId = normalized.pmId;
  }

  if (dbMode === 'mongodb') {
    const updatedDoc = await Project.findOneAndUpdate(
      { id: projectId },
      { $set: clean },
      { new: true }
    ).lean();
    if (!updatedDoc) return null;
    const updated = stripMongoFields(updatedDoc);

    // Sync cached project metadata on Tasks in MongoDB
    await Task.updateMany(
      { projectId },
      {
        $set: {
          projectName: updated.name,
          projectCode: updated.code,
          projectColor: updated.color || '#3370FF',
        },
      }
    );

    if (Array.isArray(updated.members)) {
      const roleOps = updated.members.map((m) => ({
        updateMany: {
          filter: { projectId, assigneeId: m.userId },
          update: { $set: { assigneeProjectRole: m.projectRole || 'DEV' } },
        },
      }));
      if (roleOps.length > 0) {
        await Task.bulkWrite(roleOps);
      }
    }

    return updated;
  }
  const data = readJsonFile();
  const idx = data.projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  data.projects[idx] = { ...data.projects[idx], ...clean };
  writeJsonFile(data);
  return data.projects[idx];
}

export async function deleteProject(projectId) {
  await initDatabase();
  if (dbMode === 'mongodb') {
    const res = await Project.deleteOne({ id: projectId });
    await Task.deleteMany({ projectId });
    return res.deletedCount > 0;
  }
  const data = readJsonFile();
  const before = data.projects.length;
  data.projects = data.projects.filter((p) => p.id !== projectId);
  data.tasks = data.tasks.filter((t) => t.projectId !== projectId);
  writeJsonFile(data);
  return data.projects.length < before;
}

export async function getTaskById(taskId) {
  await initDatabase();
  if (dbMode === 'mongodb') {
    const doc = await Task.findOne({ id: taskId }).lean();
    return stripMongoFields(doc);
  }
  const data = readJsonFile();
  return data.tasks.find((t) => t.id === taskId) || null;
}

export async function createTask(taskPayload) {
  await initDatabase();
  const isDone = Boolean(taskPayload.isDone);
  const newTask = {
    id: taskPayload.id || generateId('TSK'),
    companyId: taskPayload.companyId || 'CMP-TRINAM',
    weekId: taskPayload.weekId || '2026-W47',
    projectId: taskPayload.projectId || 'PRJ-WPMES',
    assigneeId: taskPayload.assigneeId || 'USR-01',
    title: taskPayload.title,
    description: taskPayload.description || '',
    deliverableUrl: taskPayload.deliverableUrl || '',
    attachments: Array.isArray(taskPayload.attachments) ? taskPayload.attachments : [],
    category: taskPayload.category || 'Feature',
    priority: taskPayload.priority || 'medium',
    estimatedVolume: Number(taskPayload.estimatedVolume) || 1,
    estimatedHours: Number(taskPayload.estimatedHours) || Number(taskPayload.estimatedVolume || 1) * 8,
    actualHours: Number(taskPayload.actualHours) || 0,
    startDate: taskPayload.startDate || '2026-11-16',
    endDate: taskPayload.endDate || taskPayload.deadline || '2026-11-22',
    deadline: taskPayload.deadline || taskPayload.endDate || '2026-11-22',
    completedAt: taskPayload.completedAt || (isDone ? REFERENCE_DATE : null),
    isDone,
    status: VALID_TASK_STATUSES.has(taskPayload.status) ? taskPayload.status : 'pending_review',
    selfProgress: Number(taskPayload.selfProgress) || (isDone ? 100 : 0),
    selfKpiRating: taskPayload.selfKpiRating || 'pending',
    selfScore: Number(taskPayload.selfScore) || 0,
    selfNote: taskPayload.selfNote || '',
    selfSubmittedAt: taskPayload.selfSubmittedAt || null,
    pmQualityRating: taskPayload.pmQualityRating || 'pending',
    pmQualityScore:
      taskPayload.pmQualityScore !== undefined && taskPayload.pmQualityScore !== null
        ? Number(taskPayload.pmQualityScore)
        : null,
    pmFeedback: taskPayload.pmFeedback || '',
    pmReviewerId: taskPayload.pmReviewerId || null,
    pmReviewerName: taskPayload.pmReviewerName || '',
    reworkCount: Number(taskPayload.reworkCount) || 0,
    pmReviewedAt: taskPayload.pmReviewedAt || null,
  };

  if (dbMode === 'mongodb') {
    const enriched = await enrichTaskForDb(newTask);
    const created = await Task.create(enriched);
    return stripMongoFields(created);
  }

  const data = readJsonFile();
  const enriched = await enrichTaskForDb(newTask, data);
  data.tasks.unshift(enriched);
  writeJsonFile(data);
  return enriched;
}

export async function createTasksBulk(taskPayloads) {
  await initDatabase();
  const createdList = [];
  for (let i = 0; i < taskPayloads.length; i += 1) {
    const payload = taskPayloads[i];
    const id = payload.id || generateId(`TSK-${i}`);
    // eslint-disable-next-line no-await-in-loop
    const created = await createTask({ ...payload, id });
    createdList.push(created);
  }
  return createdList;
}

export async function updateTask(taskId, updates) {
  await initDatabase();
  const cleanUpdates = { ...updates };
  delete cleanUpdates.id;
  delete cleanUpdates._id;
  delete cleanUpdates.companyId;
  delete cleanUpdates.createdAt;
  delete cleanUpdates.updatedAt;

  if (dbMode === 'mongodb') {
    const existingDoc = await Task.findOne({ id: taskId }).lean();
    if (!existingDoc) return null;

    const merged = { ...stripMongoFields(existingDoc), ...cleanUpdates };
    const enriched = await enrichTaskForDb(merged);
    delete enriched.id;
    delete enriched._id;
    delete enriched.companyId;

    const updated = await Task.findOneAndUpdate(
      { id: taskId },
      { $set: enriched },
      { new: true }
    ).lean();
    return stripMongoFields(updated);
  }

  const data = readJsonFile();
  const idx = data.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return null;
  const merged = { ...data.tasks[idx], ...cleanUpdates };
  data.tasks[idx] = await enrichTaskForDb(merged, data);
  writeJsonFile(data);
  return data.tasks[idx];
}

export async function deleteTask(taskId) {
  await initDatabase();
  if (dbMode === 'mongodb') {
    const res = await Task.deleteOne({ id: taskId });
    return res.deletedCount > 0;
  }
  const data = readJsonFile();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter((t) => t.id !== taskId);
  writeJsonFile(data);
  return data.tasks.length < before;
}

export async function resetToSeed() {
  await initDatabase();
  const seed = createSeedData();
  const enrichedTasks = buildEnrichedTasks(seed, REFERENCE_DATE);
  if (dbMode === 'mongodb') {
    await Promise.all([
      Company.deleteMany({}),
      Week.deleteMany({}),
      Project.deleteMany({}),
      User.deleteMany({}),
      Task.deleteMany({}),
    ]);
    await Company.insertMany(seed.companies);
    await Week.insertMany(seed.weeks);
    await Project.insertMany(seed.projects);
    await User.insertMany(seed.users);
    await Task.insertMany(enrichedTasks);
    return { ...seed, tasks: enrichedTasks };
  }
  const fullSeed = { ...seed, tasks: enrichedTasks };
  writeJsonFile(fullSeed);
  return fullSeed;
}
