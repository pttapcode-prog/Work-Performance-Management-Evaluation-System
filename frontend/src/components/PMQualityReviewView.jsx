import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Clock,
  Lock,
  Save,
  Paperclip,
  Sparkles,
  CheckSquare,
  Eye,
  X,
  ArrowLeft,
  FolderKanban,
  Users,
  Calendar,
  ChevronDown,
  ChevronRight,
  BellRing,
} from 'lucide-react';
import {
  getCalendarWeekWindowFromDate,
  getTaskEvaluationWindow,
  getTaskReviewAlert,
  summarizeReviewAlerts,
} from '../utils/reviewAlertHelper.js';
import { api } from '../api/client.js';

const STATUS_OPTIONS = [
  { value: 'pending_review', label: 'Chờ đánh giá', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'completed', label: 'Đã hoàn thành', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'cancelled', label: 'Hủy', badge: 'bg-slate-200 text-slate-700 border-slate-300' },
];

const QUALITY_LEVELS = [
  {
    value: 'excellent',
    label: '🟢 Xuất sắc',
    shortLabel: 'Xuất sắc',
    defaultScore: 100,
    style: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  {
    value: 'good',
    label: '🔵 Đạt chuẩn',
    shortLabel: 'Đạt chuẩn',
    defaultScore: 88,
    style: 'border-blue-300 bg-blue-50 text-blue-800',
  },
  {
    value: 'rework',
    label: '🟡 Cần sửa lại (Rework)',
    shortLabel: 'Cần sửa lại',
    defaultScore: 65,
    style: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  {
    value: 'poor',
    label: '🔴 Chưa đạt chất lượng',
    shortLabel: 'Chưa đạt CL',
    defaultScore: 45,
    style: 'border-rose-300 bg-rose-50 text-rose-800',
  },
];

const PROJECT_ROLE_BADGE = {
  PM: 'bg-purple-100 text-purple-800 border-purple-200',
  DEV: 'bg-blue-100 text-blue-800 border-blue-200',
  BA: 'bg-pink-100 text-pink-800 border-pink-200',
  TEST: 'bg-amber-100 text-amber-800 border-amber-200',
};

function getQualityMeta(rating) {
  return (
    QUALITY_LEVELS.find((q) => q.value === rating) || {
      value: 'pending',
      label: 'Chờ chấm',
      shortLabel: 'Chờ chấm',
      style: 'border-slate-200 bg-slate-100 text-slate-600',
    }
  );
}

function ReviewAlertDot({ alert }) {
  if (!alert || !alert.needsReview) {
    return (
      <span
        title="Đã đánh giá / Không cần đánh giá"
        className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"
      />
    );
  }
  if (alert.level === 'overdue') {
    return (
      <span title={alert.label} className="relative flex h-3 w-3 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600 ring-2 ring-rose-200" />
      </span>
    );
  }
  if (alert.level === 'urgent') {
    return (
      <span title={alert.label} className="relative flex h-3 w-3 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500 ring-2 ring-orange-200" />
      </span>
    );
  }
  return (
    <span
      title={alert.label}
      className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100 shrink-0"
    />
  );
}

export default function PMQualityReviewView({
  tasks = [],
  projects = [],
  weeks = [],
  users = [],
  summary,
  currentUser,
  permissions,
  selectedWeekId,
  selectedProjectId,
  initialProjectId = null,
  onClearInitialProject,
  onUpdateTask,
  onSyncTask,
  onInspectEmployee,
}) {
  const isDirector = currentUser?.role === 'DIRECTOR';
  const canReview = Boolean(permissions?.canReviewQuality);
  const canReviewThisTask = (task) =>
    Boolean(isDirector || permissions?.pmProjectIds?.includes(task.projectId));

  // Live clock refreshed every minute so 19:00 Saturday / 12:00 Sunday alerts activate automatically
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Visible projects strictly scoped: DIRECTOR sees ALL company projects; PM sees ONLY projects where they are PM
  const managedProjects = useMemo(() => {
    const base = isDirector
      ? projects
      : projects.filter(
          (p) =>
            permissions?.pmProjectIds?.includes(p.id) ||
            (p.members || []).some((m) => m.userId === currentUser?.id && m.projectRole === 'PM') ||
            p.pmId === currentUser?.id
        );
    if (selectedProjectId && selectedProjectId !== 'all') {
      return base.filter((p) => p.id === selectedProjectId);
    }
    return base;
  }, [projects, isDirector, permissions?.pmProjectIds, currentUser?.id, selectedProjectId]);

  const managedProjectIds = useMemo(
    () => new Set(managedProjects.map((p) => p.id)),
    [managedProjects]
  );

  // Tasks belonging strictly to the managed projects
  const managedTasks = useMemo(
    () => tasks.filter((t) => managedProjectIds.has(t.projectId)),
    [tasks, managedProjectIds]
  );

  // Drill-down state: null = Project List view; projectId = Project Detail (grouped by Week & Member)
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId || null);

  useEffect(() => {
    if (initialProjectId) {
      setActiveProjectId(initialProjectId);
      setTaskFilter('all');
      api
        .getProjectDetail(initialProjectId, {
          weekId: 'all',
          filter: 'all',
          action: 'open_project_tasks',
        })
        .catch(() => {});
    }
  }, [initialProjectId]);

  const handleOpenProject = (pid) => {
    setActiveProjectId(pid);
    setTaskFilter('all');
    api
      .getProjectDetail(pid, {
        weekId: weekScopeMode === 'selected' ? selectedWeekId : 'all',
        filter: 'all',
        action: 'open_project_tasks',
      })
      .catch(() => {});
  };

  const handleBackToProjects = () => {
    setActiveProjectId(null);
    onClearInitialProject?.();
    api.getProjects({ scope: 'managed', action: 'back_to_project_list' }).catch(() => {});
  };

  const handleWeekScopeChange = (mode) => {
    setWeekScopeMode(mode);
    if (activeProjectId) {
      api
        .getProjectDetail(activeProjectId, {
          weekId: mode === 'selected' ? selectedWeekId : 'all',
          filter: taskFilter,
          action: 'switch_week_scope',
        })
        .catch(() => {});
    }
  };

  const handleTaskFilterChange = (nextFilter) => {
    setTaskFilter(nextFilter);
    if (activeProjectId) {
      api
        .getProjectDetail(activeProjectId, {
          weekId: weekScopeMode === 'selected' ? selectedWeekId : 'all',
          filter: nextFilter,
          action: 'filter_project_tasks',
        })
        .catch(() => {});
    }
  };

  const currentWeekWindow = useMemo(() => getCalendarWeekWindowFromDate(now), [now]);

  const activeProject = useMemo(
    () => managedProjects.find((p) => p.id === activeProjectId) || null,
    [managedProjects, activeProjectId]
  );

  // Inside Project detail view controls
  const [weekScopeMode, setWeekScopeMode] = useState('all'); // 'all' | 'selected'
  const [taskFilter, setTaskFilter] = useState('all'); // 'all' | 'needs_review' | 'warning_only'
  const [collapsedWeeks, setCollapsedWeeks] = useState({});

  // Task Review Popup state
  const [reviewTaskId, setReviewTaskId] = useState(null);
  const [modalDraft, setModalDraft] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [savedBanner, setSavedBanner] = useState('');

  const reviewTask = useMemo(
    () => managedTasks.find((t) => t.id === reviewTaskId) || tasks.find((t) => t.id === reviewTaskId) || null,
    [managedTasks, tasks, reviewTaskId]
  );

  const overallAlertSummary = useMemo(
    () => summarizeReviewAlerts(managedTasks, weeks, now),
    [managedTasks, weeks, now]
  );

  const openReviewModal = (task) => {
    setReviewTaskId(task.id);
    setModalDraft({
      pmQualityRating: task.pmQualityRating || 'pending',
      pmQualityScore: task.pmQualityScore ?? '',
      pmFeedback: task.pmFeedback || '',
      status: task.status || 'pending_review',
    });
    api
      .getTaskDetail(task.id, { action: 'open_review_popup' })
      .then((res) => {
        if (res?.task) {
          onSyncTask?.(res.task);
          setModalDraft({
            pmQualityRating: res.task.pmQualityRating || 'pending',
            pmQualityScore: res.task.pmQualityScore ?? '',
            pmFeedback: res.task.pmFeedback || '',
            status: res.task.status || 'pending_review',
          });
        }
      })
      .catch(() => {});
  };

  const closeReviewModal = () => {
    setReviewTaskId(null);
    setModalDraft(null);
  };

  const handleSaveModalReview = async (e) => {
    e.preventDefault();
    if (!reviewTask || !modalDraft || !canReviewThisTask(reviewTask) || savingReview) return;
    setSavingReview(true);
    try {
      await onUpdateTask(reviewTask.id, {
        pmQualityRating: modalDraft.pmQualityRating,
        pmQualityScore: modalDraft.pmQualityScore === '' ? null : Number(modalDraft.pmQualityScore),
        pmFeedback: modalDraft.pmFeedback,
        status: modalDraft.status,
      });
      const title = reviewTask.title;
      closeReviewModal();
      setSavedBanner(`Đã lưu đánh giá KPI & nhận xét cho "${title}"`);
      setTimeout(() => setSavedBanner(''), 3500);
    } finally {
      setSavingReview(false);
    }
  };

  // Build grouped Week -> Member -> Tasks data for the selected project
  const projectDetailGrouped = useMemo(() => {
    if (!activeProject) return { weekGroups: [], projectTasks: [], alertStats: null };

    let projTasks = managedTasks.filter((t) => t.projectId === activeProject.id);
    if (weekScopeMode === 'selected' && selectedWeekId && selectedWeekId !== 'all') {
      projTasks = projTasks.filter((t) => t.weekId === selectedWeekId);
    }

    const alertStats = summarizeReviewAlerts(projTasks, weeks, now);

    const filteredProjTasks = projTasks.filter((t) => {
      const alert = getTaskReviewAlert(t, weeks, now);
      if (taskFilter === 'needs_review') return alert.needsReview;
      if (taskFilter === 'warning_only') return alert.isWarningActive;
      return true;
    });

    // Map members of this project (only people in this project!)
    const userById = Object.fromEntries(users.map((u) => [u.id, u]));
    const projectMemberRoleMap = {};
    (activeProject.members || []).forEach((m) => {
      projectMemberRoleMap[m.userId] = m.projectRole || 'DEV';
    });

    // Group by the ACTUAL calendar week of each task (derived from task.deadline / endDate / startDate)
    const weekMap = new Map();

    filteredProjTasks.forEach((task) => {
      const taskWin = getTaskEvaluationWindow(task, weeks);
      const wId = taskWin?.weekId || task.weekId || 'unknown';
      const sortKey = taskWin?.sundayKey || wId;
      if (!weekMap.has(wId)) {
        const wObj = weeks.find((w) => w.id === wId);
        weekMap.set(wId, {
          weekId: wId,
          sortKey,
          weekLabel: taskWin?.label || wObj?.label || task.weekLabel || wId,
          weekObj: wObj || null,
          evalWindow: taskWin,
          tasks: [],
          memberMap: new Map(),
        });
      }
      const wGroup = weekMap.get(wId);
      wGroup.tasks.push(task);

      const uid = task.assigneeId;
      if (!wGroup.memberMap.has(uid)) {
        const uObj = userById[uid];
        wGroup.memberMap.set(uid, {
          userId: uid,
          name: uObj?.name || task.assigneeName || uid,
          avatar: uObj?.avatar || task.assigneeAvatar || 'NV',
          color: uObj?.color || task.assigneeColor || '#3370FF',
          title: uObj?.title || task.assigneeTitle || '',
          projectRole: projectMemberRoleMap[uid] || task.assigneeProjectRole || 'DEV',
          tasks: [],
        });
      }
      wGroup.memberMap.get(uid).tasks.push(task);
    });

    const weekGroups = Array.from(weekMap.values())
      .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)))
      .map((wg) => {
        const wAlerts = summarizeReviewAlerts(wg.tasks, weeks, now);
        const members = Array.from(wg.memberMap.values()).map((m) => {
          const mAlerts = summarizeReviewAlerts(m.tasks, weeks, now);
          const estUsed = Number(
            m.tasks
              .filter((t) => t.status !== 'cancelled')
              .reduce((sum, t) => sum + Number(t.estimatedVolume || 0), 0)
              .toFixed(2)
          );
          return {
            ...m,
            alerts: mAlerts,
            estUsed,
          };
        });
        return {
          ...wg,
          alerts: wAlerts,
          members,
        };
      });

    return { weekGroups, projectTasks: projTasks, alertStats };
  }, [activeProject, managedTasks, weekScopeMode, selectedWeekId, taskFilter, weeks, users, now]);

  const toggleWeekCollapse = (wId) => {
    setCollapsedWeeks((prev) => ({ ...prev, [wId]: !prev[wId] }));
  };

  return (
    <div className="space-y-4">
      {!canReview && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Chỉ <strong>Lãnh đạo Công ty</strong> hoặc <strong>PM phụ trách dự án</strong> mới có quyền đánh giá Task &amp; chấm điểm KPI.
          </span>
        </div>
      )}

      {savedBanner && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedBanner}
        </div>
      )}

      {/* Weekend Review Deadline Alert Banner (Saturday 19:00 -> Sunday 12:00) */}
      <div
        className={`rounded-2xl border p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 ${
          overallAlertSummary.overdueCount > 0
            ? 'bg-rose-50/80 border-rose-200'
            : overallAlertSummary.urgentCount > 0
            ? 'bg-orange-50/80 border-orange-200'
            : 'bg-white border-[#DEE0E3]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              overallAlertSummary.overdueCount > 0
                ? 'bg-rose-600 text-white'
                : overallAlertSummary.urgentCount > 0
                ? 'bg-orange-500 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900">
                {isDirector
                  ? 'Đánh giá Task & KPI Toàn Công ty (Theo Dự án → Tuần → Thành viên)'
                  : 'Đánh giá Task & KPI Dự án Phụ trách (PM)'}
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isDirector
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200'
                }`}
              >
                {isDirector
                  ? `Lãnh đạo đơn vị • ${managedProjects.length} dự án`
                  : `PM phụ trách • ${managedProjects.length} dự án`}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Quy định: Hạn hoàn tất đánh giá task tuần là <strong>12:00 Trưa Chủ Nhật</strong> — hệ thống tự động bật chấm cảnh báo khẩn từ <strong>19:00 (7h tối) Thứ 7</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {overallAlertSummary.overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
              {overallAlertSummary.overdueCount} quá hạn (&gt;12h trưa CN)
            </span>
          )}
          {overallAlertSummary.urgentCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-100 text-orange-800 border border-orange-300 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
              {overallAlertSummary.urgentCount} cảnh báo từ 19h T7
            </span>
          )}
          {overallAlertSummary.pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              {overallAlertSummary.pendingCount} chờ đánh giá
            </span>
          )}
          {overallAlertSummary.totalNeedingReview === 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã đánh giá xong toàn bộ task
            </span>
          )}
        </div>
      </div>

      {/* LEVEL 1: PROJECT LIST VIEW */}
      {!activeProject ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-600" />
              {isDirector
                ? `Danh sách Toàn bộ Dự án Công ty (${managedProjects.length})`
                : `Danh sách Dự án bạn làm PM (${managedProjects.length})`}
            </h3>
            <span className="text-xs text-slate-500">
              Bấm vào một dự án để xem danh sách task nhóm theo tuần &amp; từng thành viên
            </span>
          </div>

          {managedProjects.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
              <FolderKanban className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                {isDirector
                  ? 'Công ty chưa có dự án nào.'
                  : 'Bạn chưa được phân công làm PM của dự án nào.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {managedProjects.map((proj) => {
                const projTasks = managedTasks.filter((t) => t.projectId === proj.id);
                const activeProjTasks = projTasks.filter((t) => t.status !== 'cancelled');
                const thisWeekTasksCount = activeProjTasks.filter((t) => {
                  const w = getTaskEvaluationWindow(t, weeks);
                  return Boolean(w && currentWeekWindow && w.mondayStr === currentWeekWindow.mondayStr);
                }).length;
                const projAlerts = summarizeReviewAlerts(projTasks, weeks, now);
                const memberCount = (proj.members || []).length;

                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => handleOpenProject(proj.id)}
                    className={`text-left bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group ${
                      projAlerts.overdueCount > 0
                        ? 'border-rose-300 ring-1 ring-rose-100'
                        : projAlerts.urgentCount > 0
                        ? 'border-orange-300 ring-1 ring-orange-100'
                        : 'border-[#DEE0E3] hover:border-blue-300'
                    }`}
                  >
                    <div className="h-1.5 w-full" style={{ backgroundColor: proj.color || '#3370FF' }} />
                    <div className="p-5 space-y-3.5 flex-1 flex flex-col justify-between w-full">
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-xs shrink-0 shadow-xs"
                              style={{ backgroundColor: proj.color || '#3370FF' }}
                            >
                              {proj.code}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-blue-700 truncate transition">
                                {proj.name}
                              </h4>
                              <p className="text-[11px] text-slate-500 truncate">
                                KH: {proj.client || 'Nội bộ'} • PM: <strong className="text-slate-700">{proj.pmName || 'Chưa gán'}</strong>
                              </p>
                            </div>
                          </div>

                          {/* Project-level Alert Indicator */}
                          {projAlerts.overdueCount > 0 ? (
                            <span
                              title="Có task quá hạn đánh giá (sau 12h trưa Chủ Nhật)"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold shrink-0"
                            >
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
                              </span>
                              {projAlerts.totalNeedingReview} cần chấm
                            </span>
                          ) : projAlerts.urgentCount > 0 ? (
                            <span
                              title="Cảnh báo từ 19:00 Thứ 7 — Hạn đánh giá 12:00 Trưa Chủ Nhật"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-300 text-[11px] font-bold shrink-0"
                            >
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                              </span>
                              {projAlerts.totalNeedingReview} gấp
                            </span>
                          ) : projAlerts.pendingCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold shrink-0">
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                              {projAlerts.pendingCount} chờ chấm
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold shrink-0">
                              <CheckCircle2 className="w-3 h-3" /> Xong
                            </span>
                          )}
                        </div>

                        {proj.description && (
                          <p className="text-xs text-slate-600 line-clamp-2">{proj.description}</p>
                        )}
                      </div>

                      <div className="space-y-3 pt-3 border-t border-slate-100">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                            <div className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
                              <Users className="w-3 h-3" /> Nhân sự
                            </div>
                            <div className="text-xs font-bold text-slate-900 mt-0.5">{memberCount}</div>
                          </div>
                          <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-2">
                            <div className="text-[10px] text-blue-700">Task tuần này</div>
                            <div className="text-xs font-extrabold text-blue-800 mt-0.5">
                              {thisWeekTasksCount}
                            </div>
                          </div>
                          <div
                            className={`rounded-lg border p-2 ${
                              projAlerts.overdueCount > 0
                                ? 'bg-rose-50 border-rose-200'
                                : projAlerts.totalNeedingReview > 0
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-emerald-50 border-emerald-200'
                            }`}
                          >
                            <div className="text-[10px] text-slate-600">Task cần chấm</div>
                            <div
                              className={`text-xs font-extrabold mt-0.5 ${
                                projAlerts.overdueCount > 0
                                  ? 'text-rose-700'
                                  : projAlerts.totalNeedingReview > 0
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {projAlerts.totalNeedingReview}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-semibold text-blue-600 group-hover:text-blue-700">
                          <span>Mở danh sách task theo tuần &amp; thành viên</span>
                          <span>→</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* LEVEL 2: SELECTED PROJECT -> GROUPED BY WEEK -> GROUPED BY MEMBER -> COMPACT TASK LIST */
        <div className="space-y-4">
          {/* Selected Project Top Header */}
          <div className="bg-white rounded-2xl border border-[#DEE0E3] p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBackToProjects}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Danh sách Dự án
              </button>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-xs shadow-xs"
                style={{ backgroundColor: activeProject.color || '#3370FF' }}
              >
                {activeProject.code}
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{activeProject.name}</h3>
                <p className="text-xs text-slate-500">
                  PM: <strong className="text-slate-800">{activeProject.pmName || 'Chưa gán'}</strong> •{' '}
                  {(activeProject.members || []).length} thành viên •{' '}
                  {projectDetailGrouped.projectTasks.length} tasks
                </p>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => handleWeekScopeChange('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    weekScopeMode === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Tất cả các tuần
                </button>
                <button
                  type="button"
                  onClick={() => handleWeekScopeChange('selected')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    weekScopeMode === 'selected' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Tuần đang chọn ({selectedWeekId === 'all' ? 'Tất cả' : selectedWeekId})
                </button>
              </div>

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => handleTaskFilterChange('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    taskFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => handleTaskFilterChange('needs_review')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    taskFilter === 'needs_review' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Cần đánh giá ({projectDetailGrouped.alertStats?.totalNeedingReview ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => handleTaskFilterChange('warning_only')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    taskFilter === 'warning_only' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Cảnh báo 19h T7/Quá hạn ({projectDetailGrouped.alertStats?.activeWarningCount ?? 0})
                </button>
              </div>
            </div>
          </div>

          {/* Grouped by Week -> Member */}
          {projectDetailGrouped.weekGroups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              Không có task nào trong dự án khớp bộ lọc hiện tại.
            </div>
          ) : (
            projectDetailGrouped.weekGroups.map((wg) => {
              const isCollapsed = Boolean(collapsedWeeks[wg.weekId]);
              return (
                <div
                  key={wg.weekId}
                  className="bg-white rounded-2xl border border-[#DEE0E3] shadow-sm overflow-hidden"
                >
                  {/* Week Group Header */}
                  <button
                    type="button"
                    onClick={() => toggleWeekCollapse(wg.weekId)}
                    className="w-full px-5 py-3.5 bg-slate-50/90 hover:bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-left transition"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-extrabold text-slate-900">{wg.weekLabel}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                        {wg.members.length} thành viên • {wg.tasks.length} tasks
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {wg.evalWindow && (
                        <span className="text-[11px] text-slate-500">
                          Cảnh báo: <strong>19:00 T7 ({wg.evalWindow.saturdayDateStr})</strong> • Hạn chấm:{' '}
                          <strong>12:00 Trưa CN ({wg.evalWindow.sundayDateStr})</strong>
                        </span>
                      )}
                      {wg.alerts.overdueCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                          {wg.alerts.overdueCount} quá hạn đánh giá
                        </span>
                      ) : wg.alerts.urgentCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          {wg.alerts.urgentCount} cảnh báo gấp
                        </span>
                      ) : wg.alerts.pendingCount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          {wg.alerts.pendingCount} chờ đánh giá
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" /> Đã chấm đủ
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Member Sub-groups inside Week */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-200">
                      {wg.members.map((member) => {
                        const roleBadge =
                          PROJECT_ROLE_BADGE[member.projectRole] || 'bg-slate-100 text-slate-700 border-slate-200';
                        return (
                          <div key={`${wg.weekId}-${member.userId}`} className="bg-white">
                            {/* Member Header Strip */}
                            <div className="px-5 py-2.5 bg-blue-50/30 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                                  style={{ backgroundColor: member.color }}
                                >
                                  {member.avatar}
                                </span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-extrabold text-slate-900">
                                      {member.name}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${roleBadge}`}
                                    >
                                      {member.projectRole}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      Est dự án: <strong className="text-indigo-700">{member.estUsed}</strong> •{' '}
                                      {member.tasks.length} tasks
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {member.alerts.totalNeedingReview > 0 && (
                                  <span
                                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                      member.alerts.overdueCount > 0
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : member.alerts.urgentCount > 0
                                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full ${
                                        member.alerts.overdueCount > 0
                                          ? 'bg-rose-600'
                                          : member.alerts.urgentCount > 0
                                          ? 'bg-orange-500'
                                          : 'bg-amber-400'
                                      }`}
                                    />
                                    {member.alerts.totalNeedingReview} task cần đánh giá
                                  </span>
                                )}
                                {canReview && (
                                  <button
                                    type="button"
                                    onClick={() => onInspectEmployee(member.userId)}
                                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                                  >
                                    Hồ sơ 360° →
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Compact Task List Table for this Member */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-50/60 text-[10px] font-semibold text-slate-500 uppercase border-b border-slate-100">
                                    <th className="py-2 pl-5 pr-3 min-w-[260px]">Công việc (Chấm cảnh báo đầu dòng)</th>
                                    <th className="py-2 px-2.5 text-center w-[55px]">Est</th>
                                    <th className="py-2 px-2.5 w-[135px]">Deadline / Xong</th>
                                    <th className="py-2 px-2.5 text-center w-[115px]">Trạng thái</th>
                                    <th className="py-2 px-2.5 text-center w-[80px]">Tự chấm</th>
                                    <th className="py-2 px-2.5 text-center w-[85px]">AI gợi ý</th>
                                    <th className="py-2 px-2.5 text-center w-[135px]">Đánh giá / KPI</th>
                                    <th className="py-2 pr-5 pl-2 text-right w-[95px]">Thao tác</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {member.tasks.map((task) => {
                                    const alert = getTaskReviewAlert(task, weeks, now);
                                    const statusMeta =
                                      STATUS_OPTIONS.find((s) => s.value === task.status) || STATUS_OPTIONS[0];
                                    const qMeta = getQualityMeta(task.pmQualityRating);
                                    const attCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
                                    const hasEvidence = attCount > 0 || Boolean(task.deliverableUrl?.trim());

                                    return (
                                      <tr
                                        key={task.id}
                                        onClick={() => openReviewModal(task)}
                                        className={`cursor-pointer transition ${
                                          alert.level === 'overdue'
                                            ? 'bg-rose-50/30 hover:bg-rose-50/70'
                                            : alert.level === 'urgent'
                                            ? 'bg-orange-50/30 hover:bg-orange-50/70'
                                            : 'hover:bg-blue-50/40'
                                        }`}
                                      >
                                        <td className="py-2.5 pl-5 pr-3">
                                          <div className="flex items-start gap-2.5">
                                            <div className="mt-1">
                                              <ReviewAlertDot alert={alert} />
                                            </div>
                                            <div className="min-w-0">
                                              <div className="font-bold text-slate-900 leading-snug">
                                                {task.title}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                {alert.needsReview && (
                                                  <span
                                                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                                      alert.level === 'overdue'
                                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                                        : alert.level === 'urgent'
                                                        ? 'bg-orange-100 text-orange-800 border-orange-300'
                                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                                    }`}
                                                  >
                                                    {alert.shortLabel}
                                                  </span>
                                                )}
                                                {hasEvidence ? (
                                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-700">
                                                    <Paperclip className="w-2.5 h-2.5" /> {attCount + (task.deliverableUrl ? 1 : 0)} minh chứng
                                                  </span>
                                                ) : (
                                                  <span className="text-[10px] text-rose-600">Thiếu minh chứng</span>
                                                )}
                                                {task.anomalies?.length > 0 && (
                                                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> {task.anomalies.length} lưu ý
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </td>

                                        <td className="py-2.5 px-2.5 text-center font-mono">
                                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                                            {task.estimatedVolume ?? 1}
                                          </span>
                                        </td>

                                        <td className="py-2.5 px-2.5 font-mono text-[11px]">
                                          <div className="text-slate-800">{task.deadline || '—'}</div>
                                          <div className="flex items-center gap-1 mt-0.5 font-sans">
                                            {task.isLate ? (
                                              <span className="text-[10px] text-rose-600 font-semibold">
                                                Trễ {task.daysLate}d
                                              </span>
                                            ) : (
                                              <span className="text-[10px] text-emerald-600 font-medium">Đúng hạn</span>
                                            )}
                                            <span className="text-slate-300">•</span>
                                            <span
                                              className={`text-[10px] ${
                                                task.isDone ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                                              }`}
                                            >
                                              {task.isDone ? '✓ Xong' : 'Chưa'}
                                            </span>
                                          </div>
                                        </td>

                                        <td className="py-2.5 px-2.5 text-center">
                                          <span
                                            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.badge}`}
                                          >
                                            {statusMeta.label}
                                          </span>
                                        </td>

                                        <td className="py-2.5 px-2.5 text-center">
                                          <div className="font-bold text-blue-700">{task.selfScore ?? 0}đ</div>
                                          <div className="text-[10px] text-slate-400">{task.selfProgress ?? 0}%</div>
                                        </td>

                                        <td className="py-2.5 px-2.5 text-center">
                                          {task.aiSuggestedScore != null ? (
                                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[11px]">
                                              <Sparkles className="w-2.5 h-2.5" /> {task.aiSuggestedScore}đ
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">--</span>
                                          )}
                                        </td>

                                        <td className="py-2.5 px-2.5 text-center">
                                          <span
                                            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${qMeta.style}`}
                                          >
                                            {qMeta.shortLabel}
                                            {task.pmQualityScore != null ? ` (${task.pmQualityScore}đ)` : ''}
                                          </span>
                                          <div className="text-[10px] font-bold text-indigo-700 mt-0.5">
                                            KPI: {task.finalKpiScore ?? 0}
                                          </div>
                                        </td>

                                        <td className="py-2.5 pr-5 pl-2 text-right">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openReviewModal(task);
                                            }}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                                              alert.isWarningActive
                                                ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
                                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                                            }`}
                                          >
                                            <Eye className="w-3.5 h-3.5" /> Đánh giá
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TASK DETAIL & PM / DIRECTOR REVIEW POPUP MODAL */}
      {reviewTask && modalDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={closeReviewModal}
        >
          <form
            onSubmit={handleSaveModalReview}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ReviewAlertDot alert={getTaskReviewAlert(reviewTask, weeks, now)} />
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${reviewTask.projectColor}15`,
                      color: reviewTask.projectColor,
                    }}
                  >
                    {reviewTask.projectName}
                  </span>
                  {reviewTask.assigneeProjectRole && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                      Role: {reviewTask.assigneeProjectRole}
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Est: {reviewTask.estimatedVolume ?? 1}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">{reviewTask.id}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">{reviewTask.title}</h3>
                <p className="text-xs text-slate-500">
                  Nhân sự: <strong className="text-slate-800">{reviewTask.assigneeName}</strong> • Tự chấm:{' '}
                  <strong className="text-blue-700">
                    {reviewTask.selfScore}đ ({reviewTask.selfProgress}%)
                  </strong>{' '}
                  • KPI hiện tại: <strong className="text-indigo-700">{reviewTask.finalKpiScore}/100</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {(() => {
                const modalAlert = getTaskReviewAlert(reviewTask, weeks, now);
                if (!modalAlert.isWarningActive) return null;
                return (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 font-semibold ${
                      modalAlert.level === 'overdue'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-orange-50 border-orange-200 text-orange-800'
                    }`}
                  >
                    <BellRing className="w-4 h-4 shrink-0" />
                    <span>{modalAlert.label}</span>
                  </div>
                );
              })()}

              {/* Schedule & Evidence */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-4 text-slate-600">
                  <span>Bắt đầu: <strong className="text-slate-900">{reviewTask.startDate || '—'}</strong></span>
                  <span>Kết thúc: <strong className="text-slate-900">{reviewTask.endDate || '—'}</strong></span>
                  <span>Deadline: <strong className="text-slate-900">{reviewTask.deadline || '—'}</strong></span>
                  <span>
                    Hoàn thành thực tế:{' '}
                    <strong className="text-emerald-700">{reviewTask.completedAt || 'Chưa'}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                    <CheckSquare className={`w-3.5 h-3.5 ${reviewTask.isDone ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {reviewTask.isDone ? 'Đã tick Xong' : 'Chưa tick Xong'}
                  </span>
                  {reviewTask.isLate ? (
                    <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Trễ {reviewTask.daysLate} ngày
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-medium">🟢 Đúng hạn</span>
                  )}
                </div>

                {/* Evidence files & link */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/80">
                  <span className="font-semibold text-slate-600">Minh chứng:</span>
                  {reviewTask.deliverableUrl && (
                    <a
                      href={reviewTask.deliverableUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 font-medium hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Link minh chứng
                    </a>
                  )}
                  {(reviewTask.attachments || []).map((att) => (
                    <a
                      key={att.id || att.url}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[11px] hover:underline"
                    >
                      <Paperclip className="w-3 h-3" /> {att.name}
                    </a>
                  ))}
                  {!reviewTask.deliverableUrl && (!reviewTask.attachments || reviewTask.attachments.length === 0) && (
                    <span className="text-rose-600 font-medium">⚠️ Chưa đính kèm file / link minh chứng</span>
                  )}
                </div>

                {reviewTask.selfNote && (
                  <div className="pt-1 border-t border-slate-200/80 text-slate-700">
                    <span className="font-semibold text-slate-600">Giải trình cá nhân: </span>
                    {reviewTask.selfNote}
                  </div>
                )}
              </div>

              {/* AI Assisted KPI Scoring Box */}
              {reviewTask.aiSuggestedScore != null && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs">
                    <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      AI Hỗ trợ Chấm điểm KPI: Gợi ý{' '}
                      <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700">
                        {reviewTask.aiSuggestedScore}/100
                      </span>
                      <span className="text-purple-700 font-semibold">
                        ({QUALITY_LEVELS.find((l) => l.value === reviewTask.aiSuggestedRating)?.label || reviewTask.aiSuggestedRating})
                      </span>
                    </div>
                    {reviewTask.aiGradingHint && (
                      <p className="text-[11px] text-slate-700">{reviewTask.aiGradingHint}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!canReviewThisTask(reviewTask)}
                    onClick={() =>
                      setModalDraft((prev) => ({
                        ...prev,
                        pmQualityRating: reviewTask.aiSuggestedRating,
                        pmQualityScore: reviewTask.aiSuggestedScore,
                        pmFeedback: prev.pmFeedback || reviewTask.aiGradingHint || '',
                      }))
                    }
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold shadow-xs transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Áp dụng gợi ý AI
                  </button>
                </div>
              )}

              {/* AI Anomaly Pre-Check */}
              {reviewTask.anomalies?.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    AI Pre-Check Cảnh báo bất thường:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {reviewTask.anomalies.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reviewer Controls */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Đánh giá Chất lượng &amp; Nhận xét của PM / Lãnh đạo
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUALITY_LEVELS.map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      disabled={!canReviewThisTask(reviewTask)}
                      onClick={() =>
                        setModalDraft((prev) => ({
                          ...prev,
                          pmQualityRating: lvl.value,
                          pmQualityScore: lvl.defaultScore,
                        }))
                      }
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition disabled:opacity-60 ${
                        modalDraft.pmQualityRating === lvl.value
                          ? `${lvl.style} ring-2 ring-offset-1 ring-blue-500`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Trạng thái Task</label>
                    <select
                      disabled={!canReviewThisTask(reviewTask)}
                      value={modalDraft.status}
                      onChange={(e) => setModalDraft((p) => ({ ...p, status: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Điểm chất lượng (0 - 120)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      disabled={!canReviewThisTask(reviewTask)}
                      value={modalDraft.pmQualityScore}
                      onChange={(e) =>
                        setModalDraft((p) => ({ ...p, pmQualityScore: e.target.value }))
                      }
                      placeholder="0-100"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nhận xét chi tiết của PM / Lãnh đạo
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canReviewThisTask(reviewTask)}
                    value={modalDraft.pmFeedback}
                    onChange={(e) => setModalDraft((p) => ({ ...p, pmFeedback: e.target.value }))}
                    placeholder="Nhập nhận xét chi tiết về chất lượng sản phẩm, điểm cần cải thiện..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 disabled:bg-slate-50"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeReviewModal}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={!canReviewThisTask(reviewTask) || savingReview}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#3370FF] hover:bg-[#245BDB] disabled:bg-slate-300 text-white text-xs font-bold shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                {savingReview ? 'Đang lưu...' : 'Lưu đánh giá KPI'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
