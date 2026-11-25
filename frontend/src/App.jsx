import React, { useCallback, useEffect, useState } from 'react';
import {
  Table2,
  ClipboardCheck,
  ShieldCheck,
  Brain,
  Sparkles,
  Calendar,
  FolderKanban,
  Database,
  LogOut,
  Building2,
  FolderGit2,
} from 'lucide-react';
import { api, getAuthToken, setAuthToken } from './api/client.js';
import WpmesLogo from './components/WpmesLogo.jsx';
import LoginView from './components/LoginView.jsx';
import SystemAdminView from './components/SystemAdminView.jsx';
import LarkBaseView from './components/LarkBaseView.jsx';
import PMQualityReviewView from './components/PMQualityReviewView.jsx';
import AIAnalyticsDashboard from './components/AIAnalyticsDashboard.jsx';
import ProjectManagementView from './components/ProjectManagementView.jsx';
import EmployeeProjectsView from './components/EmployeeProjectsView.jsx';
import EmployeeTaskView from './components/EmployeeTaskView.jsx';
import CompanyAdminView from './components/CompanyAdminView.jsx';
import EmployeeDetailModal from './components/EmployeeDetailModal.jsx';
import AICopilotDrawer from './components/AICopilotDrawer.jsx';

const ROLE_META = {
  SYSTEM_ADMIN: { label: 'Quản trị Hệ thống', color: 'bg-slate-900 text-white' },
  COMPANY_ADMIN: { label: 'Admin Công ty', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  DIRECTOR: { label: 'Lãnh đạo Công ty', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  MEMBER: { label: 'Nhân viên', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [authCompany, setAuthCompany] = useState(null);
  const [authPermissions, setAuthPermissions] = useState(null);
  const [dbInfo, setDbInfo] = useState(null);

  const [activeTab, setActiveTab] = useState('ai_dashboard');
  const [weekId, setWeekId] = useState('2026-W47');
  const [projectId, setProjectId] = useState('all');

  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [inspectUserId, setInspectUserId] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [reviewFocusProjectId, setReviewFocusProjectId] = useState(null);

  const handleOpenProjectReview = useCallback((pid) => {
    setReviewFocusProjectId(pid);
    setActiveTab('pm_review');
  }, []);

  const pickDefaultTab = useCallback((perms) => {
    if (!perms?.canViewTeamTasks) return 'employee_tasks';
    if (perms?.canViewAI) return 'ai_dashboard';
    return 'lark_base';
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    api
      .getMe()
      .then((res) => {
        setAuthUser(res.user);
        setAuthCompany(res.company);
        setAuthPermissions(res.permissions);
        setDbInfo(res.dbInfo);
        setActiveTab(pickDefaultTab(res.permissions));
      })
      .catch(() => {
        setAuthToken('');
        setAuthUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, [pickDefaultTab]);

  const loadData = useCallback(async () => {
    if (!authUser || authUser.role === 'SYSTEM_ADMIN' || authUser.role === 'COMPANY_ADMIN') return;
    setLoading(true);
    try {
      setError('');
      const res = await api.getBootstrap(weekId, projectId);
      setBootstrap(res);
      if (res.dbInfo) setDbInfo(res.dbInfo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authUser, weekId, projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLoginSuccess = (res) => {
    setAuthUser(res.user);
    setAuthCompany(res.company);
    setAuthPermissions(res.permissions);
    setProjectId('all');
    setBootstrap(null);
    setCopilotOpen(false);
    setInspectUserId(null);
    setReviewFocusProjectId(null);
    setActiveTab(pickDefaultTab(res.permissions));
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthUser(null);
    setAuthCompany(null);
    setAuthPermissions(null);
    setBootstrap(null);
    setCopilotOpen(false);
    setInspectUserId(null);
    setReviewFocusProjectId(null);
  };

  const handleCreateProject = async (payload) => {
    await api.createProject(payload);
    await loadData();
  };

  const handleUpdateProjectMembers = async (pid, payload) => {
    await api.updateProjectMembers(pid, payload);
    await loadData();
  };

  const handleUpdateTask = async (id, updates) => {
    await api.updateTask(id, updates);
    await loadData();
  };

  const handleCreateTask = async (payload) => {
    await api.createTask(payload);
    await loadData();
  };

  const handleDeleteTask = async (id) => {
    await api.deleteTask(id);
    await loadData();
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6F7] text-slate-500 text-sm">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!authUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // === TIER 1: SYSTEM ADMIN PORTAL ===
  if (authUser.role === 'SYSTEM_ADMIN') {
    return (
      <div className="min-h-screen flex flex-col bg-[#F5F6F7] text-[#1F2329]">
        <header className="sticky top-0 z-30 bg-white border-b border-[#DEE0E3] shadow-xs">
          <div className="max-w-[1540px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <WpmesLogo size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-extrabold text-slate-900">
                    WPMES Platform Admin
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">
                    SYSTEM_ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Work Performance Management and Evaluation System • Quản trị Hệ thống quản lý và đánh giá hiệu quả công việc
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: authUser.color }}
                >
                  {authUser.avatar}
                </span>
                <div>
                  <span className="font-bold text-slate-900">{authUser.name}</span>
                  <span className="text-slate-500 ml-1.5">({authUser.email})</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
              >
                <LogOut className="w-3.5 h-3.5" /> Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1540px] w-full mx-auto p-4 md:p-6">
          <SystemAdminView />
        </main>
      </div>
    );
  }

  // === TIER 2: COMPANY ADMIN PORTAL (ACCOUNT MANAGEMENT ONLY, NO TASKS/PROJECTS) ===
  if (authUser.role === 'COMPANY_ADMIN') {
    return (
      <div className="min-h-screen flex flex-col bg-[#F5F6F7] text-[#1F2329]">
        <header className="sticky top-0 z-30 bg-white border-b border-[#DEE0E3] shadow-xs">
          <div className="max-w-[1540px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <WpmesLogo size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-extrabold text-slate-900">
                    WPMES • Quản trị Tài khoản — {authCompany?.name}
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                    COMPANY_ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Work Performance Management &amp; Evaluation System • Chỉ quản lý tài khoản công ty
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: authUser.color || '#4338CA' }}
                >
                  {authUser.avatar}
                </span>
                <div>
                  <span className="font-bold text-slate-900">{authUser.name}</span>
                  <span className="text-slate-500 ml-1.5">({authUser.email})</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
              >
                <LogOut className="w-3.5 h-3.5" /> Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1540px] w-full mx-auto p-4 md:p-6">
          <CompanyAdminView currentUser={authUser} />
        </main>
      </div>
    );
  }

  // === BUSINESS WORKSPACE (ONLY 2 COMPANY ROLES: DIRECTOR & MEMBER) ===
  const permissions = bootstrap?.permissions || authPermissions || {};
  const currentCompany = bootstrap?.currentCompany || authCompany;
  const currentUser = bootstrap?.actor || authUser;
  const users = bootstrap?.users || [];
  const weeks = bootstrap?.weeks || [];
  const projects = bootstrap?.projects || [];
  const managedProjects = bootstrap?.managedProjects || projects;
  const allCompanyProjects = bootstrap?.allCompanyProjects || managedProjects;
  const tasks = bootstrap?.tasks || [];
  const summary = bootstrap?.summary || null;
  const watchdog = bootstrap?.watchdog || null;
  const roleInfo = ROLE_META[currentUser.role] || {
    label: currentUser.role,
    color: 'bg-slate-100 text-slate-700',
  };
  const projectRolesList = Object.values(permissions?.projectRolesMap || {});
  const uniqueProjectRoles = Array.from(new Set(projectRolesList));

  const isRegularEmployee = !permissions.canViewTeamTasks;
  const visibleTabs = isRegularEmployee
    ? [
      { id: 'employee_projects', label: 'Dự án', icon: FolderGit2 },
      { id: 'employee_tasks', label: 'Quản lý Task', icon: ClipboardCheck },
    ]
    : permissions.isDirector
      ? [
        { id: 'ai_dashboard', label: 'AI Tổng hợp & Chấm điểm KPI', icon: Brain },
        { id: 'pm_review', label: 'Xem Task NV & Đánh giá KPI', icon: ShieldCheck },
        { id: 'lark_base', label: 'Bảng tổng hợp Công việc', icon: Table2 },
        { id: 'projects', label: 'Tạo & Quản lý Dự án', icon: FolderGit2 },
      ]
      : [
        { id: 'ai_dashboard', label: 'AI Hỗ trợ Chấm điểm KPI', icon: Brain },
        { id: 'pm_review', label: 'Dự án PM & Đánh giá Task', icon: ShieldCheck },
        { id: 'employee_tasks', label: 'Task cá nhân', icon: ClipboardCheck },
        { id: 'lark_base', label: 'Bảng Task Dự án', icon: Table2 },
        { id: 'projects', label: 'Thành viên Dự án', icon: FolderGit2 },
      ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F6F7] text-[#1F2329]">
      {/* Top Lark-Style Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#DEE0E3] shadow-xs">
        <div className="max-w-[1540px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand + Locked Company Identity */}
          <div className="flex items-center gap-3">
            <WpmesLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900">
                  {currentCompany?.name || 'WPMES'}
                </h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {currentCompany?.code || 'WPMES'}
                </span>
                {dbInfo && (
                  <span
                    title={dbInfo.uri}
                    className={`hidden xl:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${dbInfo.connected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                  >
                    <Database className="w-2.5 h-2.5" />
                    {dbInfo.connected ? 'MongoDB Connected' : 'MongoDB Schema (Fallback)'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                WPMES • Work Performance Management &amp; Evaluation System
              </p>
            </div>
          </div>

          {/* Filters + Authenticated User Badge + AI Gate + Logout */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Week Filter */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <select
                value={weekId}
                onChange={(e) => setWeekId(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} {w.isCurrent ? '(Hiện tại)' : ''}
                  </option>
                ))}
                {!isRegularEmployee && <option value="all">Tất cả các tuần</option>}
              </select>
            </div>

            {/* Project Filter */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <FolderKanban className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả Dự án ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                    {!permissions.isDirector &&
                    !isRegularEmployee &&
                    (permissions.pmProjectIds || []).includes(p.id)
                      ? ' [PM]'
                      : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Strict RBAC AI Copilot Button (Only for DIRECTOR & Project PM) */}
            {permissions.canUseChatbot && (
              <button
                onClick={() => setCopilotOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#3370FF] to-[#5E47FF] text-white shadow-sm hover:opacity-95 transition"
              >
                <Sparkles className="w-3.5 h-3.5" /> Trợ lý AI Copilot
              </button>
            )}

            {/* Authenticated User & Single Role Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: currentUser.color || '#3370FF' }}
              >
                {currentUser.avatar}
              </span>
              <div className="leading-tight">
                <div className="font-bold text-slate-900">{currentUser.name}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded border ${roleInfo.color}`}>
                    {roleInfo.label}
                  </span>
                  {uniqueProjectRoles.length > 0 && (
                    <span className="inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-800 border border-purple-200">
                      DA: {uniqueProjectRoles.join('/')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
              title="Đăng xuất để đổi tài khoản"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-[1540px] mx-auto px-4 flex items-center gap-1 overflow-x-auto border-t border-slate-100">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition ${active
                  ? 'border-[#3370FF] text-[#3370FF] bg-blue-50/40'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1540px] w-full mx-auto p-4 md:p-5">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            Thông báo từ Backend API: {error}
          </div>
        )}

        {loading && !bootstrap ? (
          <div className="py-20 text-center text-slate-500 text-sm">
            Đang tải dữ liệu công việc & KPI của {currentCompany?.name}...
          </div>
        ) : (
          <>
            {activeTab === 'employee_projects' && isRegularEmployee && (
              <EmployeeProjectsView
                projects={projects}
                users={users}
                tasks={tasks}
                currentUser={currentUser}
                currentCompany={currentCompany}
                selectedWeekId={weekId}
              />
            )}

            {activeTab === 'employee_tasks' && (isRegularEmployee || (!permissions.isDirector && permissions.isProjectPm)) && (
              <EmployeeTaskView
                tasks={tasks}
                projects={projects}
                weeks={weeks}
                currentUser={currentUser}
                selectedWeekId={weekId}
                selectedProjectId={projectId}
                referenceDate={bootstrap?.referenceDate}
                onCreateTask={handleCreateTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
              />
            )}

            {activeTab === 'ai_dashboard' && permissions.canViewAI && (
              <AIAnalyticsDashboard
                summary={summary}
                watchdog={watchdog}
                tasks={tasks}
                projects={managedProjects}
                weeks={weeks}
                currentUser={currentUser}
                permissions={permissions}
                selectedProjectId={projectId}
                onOpenProjectReview={handleOpenProjectReview}
                onInspectEmployee={(uid) => setInspectUserId(uid)}
                onOpenCopilotWithPrompt={() => setCopilotOpen(true)}
              />
            )}

            {activeTab === 'lark_base' && !isRegularEmployee && (
              <LarkBaseView
                tasks={tasks}
                projects={projects}
                users={users}
                weeks={weeks}
                currentUser={currentUser}
                permissions={permissions}
                selectedWeekId={weekId}
                selectedProjectId={projectId}
                onUpdateTask={handleUpdateTask}
                onCreateTask={handleCreateTask}
                onDeleteTask={handleDeleteTask}
                onInspectEmployee={(uid) => setInspectUserId(uid)}
              />
            )}

            {activeTab === 'pm_review' && !isRegularEmployee && (
              <PMQualityReviewView
                tasks={tasks}
                projects={managedProjects}
                weeks={weeks}
                users={users}
                summary={summary}
                currentUser={currentUser}
                permissions={permissions}
                selectedWeekId={weekId}
                selectedProjectId={projectId}
                initialProjectId={reviewFocusProjectId}
                onClearInitialProject={() => setReviewFocusProjectId(null)}
                onUpdateTask={handleUpdateTask}
                onInspectEmployee={(uid) => setInspectUserId(uid)}
              />
            )}

            {activeTab === 'projects' && !isRegularEmployee && (
              <ProjectManagementView
                projects={managedProjects}
                allCompanyProjects={allCompanyProjects}
                users={users}
                summary={summary}
                currentUser={currentUser}
                currentCompany={currentCompany}
                permissions={permissions}
                onCreateProject={handleCreateProject}
                onUpdateProjectMembers={handleUpdateProjectMembers}
              />
            )}
          </>
        )}
      </main>

      {/* Employee 360 Detail Modal */}
      {inspectUserId && (
        <EmployeeDetailModal
          userId={inspectUserId}
          weekId={weekId}
          onClose={() => setInspectUserId(null)}
        />
      )}

      {/* AI Copilot Sidebar Drawer (Only for DIRECTOR & Project PM) */}
      {permissions.canUseChatbot && (
        <AICopilotDrawer
          isOpen={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          weekId={weekId}
          projectId={projectId}
          onInspectEmployee={(uid) => setInspectUserId(uid)}
        />
      )}
    </div>
  );
}
