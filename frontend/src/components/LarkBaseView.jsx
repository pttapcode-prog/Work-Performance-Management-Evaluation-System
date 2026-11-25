import React, { useMemo, useState } from 'react';
import {
  Table2,
  Kanban,
  Layers,
  Filter,
  Search,
  Plus,
  ExternalLink,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  Trash2,
  Paperclip,
  CheckSquare,
  Square,
  Eye,
  X,
  Sparkles,
} from 'lucide-react';
import { getTaskReviewAlert } from '../utils/reviewAlertHelper.js';
import { api } from '../api/client.js';

const STATUS_OPTIONS = [
  { value: 'pending_review', label: 'Chờ đánh giá', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  { value: 'completed', label: 'Đã hoàn thành', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'cancelled', label: 'Hủy', badge: 'bg-slate-100 text-slate-600 border-slate-300' },
];

const SELF_RATING_OPTIONS = [
  { value: 'pending', label: 'Chưa tự chấm', defaultScore: 0 },
  { value: 'exceed', label: 'Vượt mức (110%)', defaultScore: 105 },
  { value: 'met', label: 'Đạt KPI (100%)', defaultScore: 95 },
  { value: 'partial', label: 'Đạt một phần (70%)', defaultScore: 70 },
  { value: 'unmet', label: 'Chưa đạt (<50%)', defaultScore: 45 },
];

const PM_QUALITY_OPTIONS = [
  { value: 'pending', label: 'Chờ PM chấm', badge: 'bg-slate-100 text-slate-600 border-slate-200', defaultScore: null },
  { value: 'excellent', label: '🟢 Xuất sắc', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', defaultScore: 100 },
  { value: 'good', label: '🔵 Đạt chuẩn', badge: 'bg-blue-50 text-blue-700 border-blue-200', defaultScore: 88 },
  { value: 'rework', label: '🟡 Cần sửa lại', badge: 'bg-amber-50 text-amber-800 border-amber-200', defaultScore: 65 },
  { value: 'poor', label: '🔴 Chưa đạt CL', badge: 'bg-rose-50 text-rose-700 border-rose-200', defaultScore: 45 },
];

export default function LarkBaseView({
  tasks,
  projects,
  users,
  weeks,
  currentUser,
  permissions,
  selectedWeekId,
  selectedProjectId,
  onUpdateTask,
  onCreateTask,
  onDeleteTask,
  onSyncTask,
  onInspectEmployee,
}) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'kanban'
  const [groupBy, setGroupBy] = useState('project'); // 'none' | 'project' | 'assignee' | 'status' | 'quality'
  const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'low_quality' | 'late' | 'gap' | 'pending_pm'
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showNewModal, setShowNewModal] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [modalError, setModalError] = useState('');

  const handleViewModeChange = (nextView) => {
    setViewMode(nextView);
    api
      .getTasks({
        weekId: selectedWeekId,
        projectId: selectedProjectId,
        filter: quickFilter,
        view: nextView,
        groupBy,
      })
      .catch(() => {});
  };

  const handleGroupByChange = (nextGroup) => {
    setGroupBy(nextGroup);
    api
      .getTasks({
        weekId: selectedWeekId,
        projectId: selectedProjectId,
        filter: quickFilter,
        view: viewMode,
        groupBy: nextGroup,
      })
      .catch(() => {});
  };

  const handleQuickFilterChange = (nextFilter) => {
    setQuickFilter(nextFilter);
    api
      .getTasks({
        weekId: selectedWeekId,
        projectId: selectedProjectId,
        filter: nextFilter,
        view: viewMode,
      })
      .catch(() => {});
  };

  const handleOpenNewModal = () => {
    setShowNewModal(true);
    api.getProjects({ action: 'open_create_task_modal' }).catch(() => {});
  };

  const handleOpenDetailTask = (tid) => {
    setDetailTaskId(tid);
    api
      .getTaskDetail(tid, { action: 'open_task_detail' })
      .then((res) => {
        if (res?.task) onSyncTask?.(res.task);
      })
      .catch(() => {});
  };
  const detailTask = useMemo(
    () => tasks.find((t) => t.id === detailTaskId) || null,
    [tasks, detailTaskId]
  );

  const [newTask, setNewTask] = useState({
    weekId: selectedWeekId === 'all' ? '2026-W47' : selectedWeekId,
    projectId: selectedProjectId === 'all' ? projects[0]?.id || '' : selectedProjectId,
    assigneeId:
      !permissions?.canReviewQuality
        ? currentUser?.id || ''
        : users.find((u) => u.role === 'MEMBER')?.id || '',
    title: '',
    startDate: '2026-11-16',
    endDate: '2026-11-21',
    deadline: '2026-11-21',
    estimatedVolume: 1,
    status: 'pending_review',
    isDone: false,
    deliverableUrl: '',
  });

  const canEditPmColumns = Boolean(permissions?.canReviewQuality);

  const canEditPmForTask = (task) =>
    Boolean(currentUser?.role === 'DIRECTOR' || permissions?.pmProjectIds?.includes(task.projectId));

  const canEditMemberColumns = (task) => {
    if (canEditPmForTask(task)) return true;
    return task.assigneeId === currentUser?.id;
  };

  const canInspectTarget = (uid) => Boolean(permissions?.canViewAI || uid === currentUser?.id);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedWeekId !== 'all' && t.weekId !== selectedWeekId) return false;
      if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false;

      if (quickFilter === 'low_quality' && !t.isLowQuality) return false;
      if (quickFilter === 'late' && !t.isLate) return false;
      if (quickFilter === 'gap' && !t.hasSignificantGap) return false;
      if (quickFilter === 'pending_pm' && t.pmQualityRating !== 'pending') return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${t.title} ${t.projectName} ${t.assigneeName} ${t.pmFeedback} ${t.selfNote}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, selectedWeekId, selectedProjectId, quickFilter, search]);

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: `Tất cả đầu việc (${filteredTasks.length})`, color: '#3370FF', items: filteredTasks }];
    }

    const map = {};
    filteredTasks.forEach((task) => {
      let key = '';
      let label = '';
      let color = '#3370FF';
      let userId = null;

      if (groupBy === 'project') {
        key = task.projectId;
        label = `${task.projectName} (${task.projectCode})`;
        color = task.projectColor;
      } else if (groupBy === 'assignee') {
        key = task.assigneeId;
        label = `${task.assigneeName} — ${task.assigneeTitle}`;
        color = task.assigneeColor;
        userId = task.assigneeId;
      } else if (groupBy === 'status') {
        const st = STATUS_OPTIONS.find((s) => s.value === task.status);
        key = task.status;
        label = st?.label || task.status;
        color = task.status === 'completed' ? '#00B365' : task.status === 'cancelled' ? '#64748B' : '#F59E0B';
      } else if (groupBy === 'quality') {
        const qm = PM_QUALITY_OPTIONS.find((q) => q.value === task.pmQualityRating);
        key = task.pmQualityRating;
        label = qm?.label || task.pmQualityRating;
        color = task.isLowQuality ? '#E11D48' : '#00B365';
      }

      if (!map[key]) {
        map[key] = { key, label, color, userId, items: [] };
      }
      map[key].items.push(task);
    });

    return Object.values(map);
  }, [filteredTasks, groupBy]);

  const toggleGroup = (key) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    setModalError('');
    try {
      await onCreateTask({
        ...newTask,
        estimatedVolume: Number(newTask.estimatedVolume || 1),
      });
      setNewTask((prev) => ({ ...prev, title: '', deliverableUrl: '' }));
      setShowNewModal(false);
    } catch (err) {
      setModalError(err.message || 'Không thể tạo task (kiểm tra giới hạn Est <= 5/tuần)');
    }
  };

  const counts = useMemo(() => {
    const scope = tasks.filter(
      (t) =>
        (selectedWeekId === 'all' || t.weekId === selectedWeekId) &&
        (selectedProjectId === 'all' || t.projectId === selectedProjectId)
    );
    return {
      all: scope.length,
      lowQuality: scope.filter((t) => t.isLowQuality).length,
      late: scope.filter((t) => t.isLate).length,
      gap: scope.filter((t) => t.hasSignificantGap).length,
      pendingPm: scope.filter((t) => t.pmQualityRating === 'pending').length,
    };
  }, [tasks, selectedWeekId, selectedProjectId]);

  return (
    <div className="space-y-3">
      {/* Lark Base Toolbar */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] p-3 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* View Mode + Group By */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                onClick={() => handleViewModeChange('grid')}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  viewMode === 'grid' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" /> Bảng Lark Base
              </button>
              <button
                onClick={() => handleViewModeChange('kanban')}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition ${
                  viewMode === 'kanban' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" /> Kanban Board
              </button>
            </div>

            {viewMode === 'grid' && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-slate-500">Nhóm (Group by):</span>
                <select
                  value={groupBy}
                  onChange={(e) => handleGroupByChange(e.target.value)}
                  className="font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                >
                  <option value="project">Theo Dự án</option>
                  <option value="assignee">Theo Nhân sự</option>
                  <option value="status">Theo Trạng thái</option>
                  <option value="quality">Theo Đánh giá Chất lượng</option>
                  <option value="none">Không phân nhóm</option>
                </select>
              </div>
            )}
          </div>

          {/* Search & New Task */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm đầu việc, nhân sự, dự án..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleOpenNewModal}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#3370FF] hover:bg-[#245BDB] text-white shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm dòng Task
            </button>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 inline-flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Lọc nhanh:
            </span>
            <button
              onClick={() => handleQuickFilterChange('all')}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                quickFilter === 'all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tất cả ({counts.all})
            </button>
            <button
              onClick={() => handleQuickFilterChange('low_quality')}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                quickFilter === 'low_quality'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              🔴 Chưa đạt chất lượng / Rework ({counts.lowQuality})
            </button>
            <button
              onClick={() => handleQuickFilterChange('late')}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                quickFilter === 'late'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              ⏰ Chậm Deadline ({counts.late})
            </button>
            <button
              onClick={() => handleQuickFilterChange('gap')}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                quickFilter === 'gap'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              }`}
            >
              ⚠️ Lệch Tự chấm vs PM ({counts.gap})
            </button>
            <button
              onClick={() => handleQuickFilterChange('pending_pm')}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                quickFilter === 'pending_pm'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              ⏳ Chờ PM chấm ({counts.pendingPm})
            </button>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            {canEditPmColumns ? (
              <span className="text-emerald-700 font-medium">
                🔓 Quyền {currentUser?.role === 'DIRECTOR' ? 'Lãnh đạo' : 'PM Dự án'}: Sửa trực tiếp tất cả cột (bao gồm cột PM Đánh giá)
              </span>
            ) : (
              <span className="text-slate-600 inline-flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-600" /> Quyền Nhân viên (DEV/BA/TEST): Chỉ sửa task của mình; Cột PM được khóa
              </span>
            )}
          </div>
        </div>
      </div>

      {/* GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse lark-grid-table min-w-[1320px]">
              <thead>
                <tr className="bg-[#F7F8FA] text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                  <th className="py-2.5 px-3 w-[250px]">Công việc (Task)</th>
                  <th className="py-2.5 px-2.5 w-[130px]">Nhân sự</th>
                  <th className="py-2.5 px-2.5 w-[125px]">Dự án</th>
                  <th className="py-2.5 px-2.5 w-[125px]">Trạng thái</th>
                  <th className="py-2.5 px-2.5 w-[140px]">Lịch trình & Xong</th>
                  <th className="py-2.5 px-2.5 w-[125px]">Cảnh báo Hạn (Formula)</th>
                  <th className="py-2.5 px-2.5 w-[75px] text-center">Est</th>
                  <th className="py-2.5 px-2.5 w-[140px] bg-blue-50/40">Cá nhân Tự chấm</th>
                  <th className="py-2.5 px-2.5 w-[160px] bg-purple-50/50">PM Chất lượng</th>
                  <th className="py-2.5 px-2.5 w-[75px] text-center bg-indigo-50/50">KPI Cuối</th>
                  <th className="py-2.5 px-2 w-[48px] text-center">Xóa</th>
                </tr>
              </thead>
              <tbody>
                {groupedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-sm text-slate-500">
                      Không có đầu việc nào khớp bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  groupedTasks.map((group) => {
                    const isCollapsed = collapsedGroups[group.key];
                    return (
                      <React.Fragment key={group.key}>
                        {groupBy !== 'none' && (
                          <tr className="bg-slate-50/90 hover:bg-slate-100/80 transition">
                            <td colSpan={11} className="py-2 px-3">
                              <div className="flex items-center justify-between">
                                <button
                                  onClick={() => toggleGroup(group.key)}
                                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-800"
                                >
                                  {isCollapsed ? (
                                    <ChevronRight className="w-4 h-4 text-slate-500" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                  )}
                                  <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: group.color }}
                                  />
                                  <span>{group.label}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-600">
                                    {group.items.length} tasks
                                  </span>
                                </button>
                                {group.userId && canInspectTarget(group.userId) && (
                                  <button
                                    onClick={() => onInspectEmployee(group.userId)}
                                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                                  >
                                    Xem hồ sơ 360° →
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}

                        {!isCollapsed &&
                          group.items.map((task) => {
                            const editableSelf = canEditMemberColumns(task);
                            const reviewAlert = getTaskReviewAlert(task, weeks);
                            return (
                              <tr key={task.id} className="hover:bg-blue-50/20 text-xs transition group">
                                {/* Task Title + Review Alert Dot + Link */}
                                <td className="py-2 px-3 align-top">
                                  <div className="flex items-start gap-2">
                                    {reviewAlert.needsReview && (
                                      <span title={reviewAlert.label} className="relative flex h-2.5 w-2.5 mt-1 shrink-0">
                                        {reviewAlert.isWarningActive && (
                                          <span
                                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                              reviewAlert.level === 'overdue' ? 'bg-rose-500' : 'bg-orange-400'
                                            }`}
                                          />
                                        )}
                                        <span
                                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                            reviewAlert.level === 'overdue'
                                              ? 'bg-rose-600'
                                              : reviewAlert.level === 'urgent'
                                              ? 'bg-orange-500'
                                              : 'bg-amber-400'
                                          }`}
                                        />
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDetailTask(task.id)}
                                      className="text-left font-semibold text-slate-900 hover:text-blue-600 leading-snug inline-flex items-start gap-1.5 transition"
                                      title="Bấm để xem chi tiết task"
                                    >
                                      <span>{task.title}</span>
                                      <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                      {task.category}
                                    </span>
                                    {task.deliverableUrl && (
                                      <a
                                        href={task.deliverableUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 hover:underline"
                                      >
                                        <ExternalLink className="w-3 h-3" /> Link kết quả
                                      </a>
                                    )}
                                    {(task.attachments || []).map((att) => (
                                      <a
                                        key={att.id || att.url}
                                        href={att.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:underline"
                                      >
                                        <Paperclip className="w-2.5 h-2.5" /> {att.name}
                                      </a>
                                    ))}
                                    {task.anomalies.length > 0 && (
                                      <span
                                        title={task.anomalies.join('\n')}
                                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 cursor-help"
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5" /> {task.anomalies.length} lưu ý
                                      </span>
                                    )}
                                  </div>
                                  {task.pmFeedback && (
                                    <div className="mt-1 text-[11px] text-slate-500 line-clamp-1" title={task.pmFeedback}>
                                      💬 PM: {task.pmFeedback}
                                    </div>
                                  )}
                                </td>

                                {/* Assignee */}
                                <td className="py-2 px-2.5 align-top">
                                  <button
                                    onClick={() => canInspectTarget(task.assigneeId) && onInspectEmployee(task.assigneeId)}
                                    className={`flex items-center gap-1.5 text-left transition ${
                                      canInspectTarget(task.assigneeId) ? 'hover:text-blue-600 cursor-pointer' : 'cursor-default'
                                    }`}
                                    title={canInspectTarget(task.assigneeId) ? 'Click để xem chi tiết công việc 360°' : task.assigneeName}
                                  >
                                    <span
                                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                      style={{ backgroundColor: task.assigneeColor }}
                                    >
                                      {task.assigneeAvatar}
                                    </span>
                                    <span className="font-medium text-slate-800 truncate max-w-[85px]">
                                      {task.assigneeName}
                                    </span>
                                    {task.assigneeProjectRole && (
                                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                        {task.assigneeProjectRole}
                                      </span>
                                    )}
                                  </button>
                                </td>

                                {/* Project */}
                                <td className="py-2 px-2.5 align-top">
                                  <span
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                                    style={{
                                      borderColor: `${task.projectColor}40`,
                                      backgroundColor: `${task.projectColor}12`,
                                      color: task.projectColor,
                                    }}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{ backgroundColor: task.projectColor }}
                                    />
                                    {task.projectCode}
                                  </span>
                                </td>

                                {/* Status Inline Select */}
                                <td className="py-2 px-2.5 align-top">
                                  <select
                                    disabled={!editableSelf}
                                    value={task.status}
                                    onChange={(e) => onUpdateTask(task.id, { status: e.target.value })}
                                    className={`w-full text-[11px] font-medium px-2 py-1 rounded-md border focus:outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed ${
                                      STATUS_OPTIONS.find((s) => s.value === task.status)?.badge
                                    }`}
                                  >
                                    {STATUS_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* Schedule, Deadline & Done Checkbox */}
                                <td className="py-2 px-2.5 align-top font-mono text-[11px] text-slate-700 space-y-0.5">
                                  <div>Hạn: <strong>{task.deadline}</strong></div>
                                  {(task.startDate || task.endDate) && (
                                    <div className="text-[10px] text-slate-500">
                                      {task.startDate || '?'} → {task.endDate || '?'}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    disabled={!editableSelf}
                                    onClick={() =>
                                      onUpdateTask(task.id, {
                                        isDone: !task.isDone,
                                        completedAt: !task.isDone ? task.completedAt || '2026-11-22' : '',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-slate-700 hover:text-emerald-700 disabled:opacity-60"
                                  >
                                    {task.isDone ? (
                                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                                    ) : (
                                      <Square className="w-3.5 h-3.5 text-slate-400" />
                                    )}
                                    <span>Xong {task.completedAt ? `(${task.completedAt})` : ''}</span>
                                  </button>
                                </td>

                                {/* Formula Deadline Warning */}
                                <td className="py-2 px-2.5 align-top">
                                  {task.deadlineStatus === 'overdue' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                                      <Clock className="w-3 h-3" /> Quá hạn {task.daysLate}d
                                    </span>
                                  )}
                                  {task.deadlineStatus === 'late_done' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                                      <Clock className="w-3 h-3" /> Xong trễ {task.daysLate}d
                                    </span>
                                  )}
                                  {task.deadlineStatus === 'due_soon' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                                      Sắp tới hạn
                                    </span>
                                  )}
                                  {task.deadlineStatus === 'on_time' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3" /> Đúng hạn
                                    </span>
                                  )}
                                </td>

                                {/* Estimated Volume */}
                                <td className="py-2 px-2.5 align-top text-center font-mono text-[11px]">
                                  <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                                    {task.estimatedVolume ?? 1}
                                  </span>
                                </td>

                                {/* Self KPI Inline */}
                                <td className="py-2 px-2.5 align-top bg-blue-50/20">
                                  <select
                                    disabled={!editableSelf}
                                    value={task.selfKpiRating}
                                    onChange={(e) => {
                                      const found = SELF_RATING_OPTIONS.find((o) => o.value === e.target.value);
                                      onUpdateTask(task.id, {
                                        selfKpiRating: e.target.value,
                                        selfScore: found ? found.defaultScore : task.selfScore,
                                      });
                                    }}
                                    className="w-full text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-white focus:outline-none disabled:bg-slate-50"
                                  >
                                    {SELF_RATING_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                                    <span>Tiến độ: {task.selfProgress}%</span>
                                    <span className="font-semibold text-blue-700">{task.selfScore}đ</span>
                                  </div>
                                </td>

                                {/* PM Quality Inline */}
                                <td className="py-2 px-2.5 align-top bg-purple-50/20">
                                  <select
                                    disabled={!canEditPmForTask(task)}
                                    value={task.pmQualityRating}
                                    onChange={(e) => {
                                      const found = PM_QUALITY_OPTIONS.find((o) => o.value === e.target.value);
                                      onUpdateTask(task.id, {
                                        pmQualityRating: e.target.value,
                                        pmQualityScore: found ? found.defaultScore : task.pmQualityScore,
                                      });
                                    }}
                                    className={`w-full text-[11px] font-medium px-1.5 py-1 rounded border focus:outline-none disabled:opacity-80 disabled:cursor-not-allowed ${
                                      PM_QUALITY_OPTIONS.find((o) => o.value === task.pmQualityRating)?.badge
                                    }`}
                                  >
                                    {PM_QUALITY_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                                    <span>PM chấm:</span>
                                    <span
                                      className={`font-bold ${
                                        task.isLowQuality ? 'text-rose-600' : 'text-slate-800'
                                      }`}
                                    >
                                      {task.pmQualityScore !== null ? `${task.pmQualityScore}đ` : '--'}
                                    </span>
                                  </div>
                                </td>

                                {/* Formula Final KPI */}
                                <td className="py-2 px-2.5 align-top text-center bg-indigo-50/20">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${
                                      task.finalKpiScore >= 90
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : task.finalKpiScore >= 75
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {task.finalKpiScore}
                                  </span>
                                </td>

                                {/* Delete */}
                                <td className="py-2 px-2 align-top text-center">
                                  {editableSelf && (
                                    <button
                                      onClick={() => onDeleteTask(task.id)}
                                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition opacity-60 group-hover:opacity-100"
                                      title="Xóa dòng"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUS_OPTIONS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.value);
            return (
              <div
                key={col.value}
                className="bg-[#F0F2F5] rounded-xl p-3 border border-slate-200/80 flex flex-col gap-2.5 min-h-[420px]"
              >
                <div className="flex items-center justify-between px-1">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${col.badge}`}>
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{colTasks.length}</span>
                </div>

                <div className="space-y-2.5">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm hover:shadow transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${task.projectColor}15`,
                            color: task.projectColor,
                          }}
                        >
                          {task.projectName}
                        </span>
                        {task.isLate && (
                          <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                            Trễ {task.daysLate}d
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenDetailTask(task.id)}
                        className="text-left text-xs font-semibold text-slate-900 hover:text-blue-600 leading-snug transition"
                      >
                        {task.title}
                      </button>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <button
                          onClick={() => onInspectEmployee(task.assigneeId)}
                          className="flex items-center gap-1.5 text-[11px] text-slate-700 hover:text-blue-600"
                        >
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                            style={{ backgroundColor: task.assigneeColor }}
                          >
                            {task.assigneeAvatar}
                          </span>
                          {task.assigneeName}
                        </button>
                        <span className="text-[11px] font-bold text-indigo-700">KPI: {task.finalKpiScore}</span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>Hạn: {task.deadline}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            PM_QUALITY_OPTIONS.find((q) => q.value === task.pmQualityRating)?.badge
                          }`}
                        >
                          {PM_QUALITY_OPTIONS.find((q) => q.value === task.pmQualityRating)?.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* NEW TASK MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleAddSubmit}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">Thêm Công việc mới vào Lark Base</h3>
            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {modalError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Tuần làm việc</label>
                <select
                  value={newTask.weekId}
                  onChange={(e) => setNewTask({ ...newTask, weekId: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                >
                  {weeks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Dự án</label>
                <select
                  value={newTask.projectId}
                  onChange={(e) => setNewTask({ ...newTask, projectId: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Nhân sự thực hiện</label>
                <select
                  value={newTask.assigneeId}
                  onChange={(e) => setNewTask({ ...newTask, assigneeId: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                >
                  {users
                    .filter((u) => u.role === 'MEMBER')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Trạng thái</label>
                <select
                  value={newTask.status}
                  onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Ngày bắt đầu</label>
                <input
                  type="date"
                  value={newTask.startDate}
                  onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Ngày kết thúc</label>
                <input
                  type="date"
                  value={newTask.endDate}
                  onChange={(e) => setNewTask({ ...newTask, endDate: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Deadline cam kết</label>
                <input
                  type="date"
                  value={newTask.deadline}
                  onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Khối lượng Est (Tối đa 5/tuần)</label>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={5}
                  value={newTask.estimatedVolume}
                  onChange={(e) => setNewTask({ ...newTask, estimatedVolume: Number(e.target.value) })}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-slate-600 mb-1">Nội dung công việc *</label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="VD: Xây dựng API đồng bộ đơn hàng..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-slate-600 mb-1">Link sản phẩm minh chứng (tùy chọn)</label>
                <input
                  type="text"
                  value={newTask.deliverableUrl}
                  onChange={(e) => setNewTask({ ...newTask, deliverableUrl: e.target.value })}
                  placeholder="https://git.trinam.vn/..."
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#3370FF] text-white hover:bg-[#245BDB]"
              >
                Lưu vào MongoDB
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TASK DETAIL POPUP MODAL */}
      {detailTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setDetailTaskId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${detailTask.projectColor}15`,
                      color: detailTask.projectColor,
                    }}
                  >
                    {detailTask.projectName} ({detailTask.projectCode})
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Est: {detailTask.estimatedVolume ?? 1}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      STATUS_OPTIONS.find((s) => s.value === detailTask.status)?.badge || ''
                    }`}
                  >
                    {STATUS_OPTIONS.find((s) => s.value === detailTask.status)?.label || detailTask.status}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{detailTask.id}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">{detailTask.title}</h3>
                <p className="text-xs text-slate-500">
                  Nhân sự: <strong className="text-slate-800">{detailTask.assigneeName}</strong>{' '}
                  {detailTask.assigneeProjectRole ? `(${detailTask.assigneeProjectRole})` : ''} • Tuần{' '}
                  <strong>{detailTask.weekId}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTaskId(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Schedule & Execution */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500">Ngày bắt đầu</div>
                  <div className="font-bold text-slate-900 mt-0.5">{detailTask.startDate || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Ngày kết thúc</div>
                  <div className="font-bold text-slate-900 mt-0.5">{detailTask.endDate || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Deadline</div>
                  <div className="font-bold text-slate-900 mt-0.5">{detailTask.deadline || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Hoàn thành thực tế</div>
                  <div className="font-bold text-emerald-700 mt-0.5">
                    {detailTask.completedAt || (detailTask.isDone ? 'Đã tick Xong' : 'Chưa xong')}
                  </div>
                </div>
              </div>

              {/* Evidence */}
              <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-slate-800">Minh chứng &amp; File đính kèm</div>
                <div className="flex flex-wrap items-center gap-2">
                  {detailTask.deliverableUrl && (
                    <a
                      href={detailTask.deliverableUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-medium hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> Link minh chứng
                    </a>
                  )}
                  {(detailTask.attachments || []).map((att) => (
                    <a
                      key={att.id || att.url}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium hover:underline"
                    >
                      <Paperclip className="w-3 h-3" /> {att.name}
                    </a>
                  ))}
                  {!detailTask.deliverableUrl && (!detailTask.attachments || detailTask.attachments.length === 0) && (
                    <span className="text-slate-400 italic">Chưa đính kèm file hoặc link minh chứng.</span>
                  )}
                </div>
              </div>

              {/* Self vs PM & AI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200 space-y-1.5">
                  <div className="font-bold text-blue-900">Nhân viên Tự đánh giá</div>
                  <div>
                    Điểm tự chấm: <strong className="text-blue-700">{detailTask.selfScore}đ</strong> ({detailTask.selfProgress}%)
                  </div>
                  <div className="text-slate-700 bg-white/90 rounded-lg p-2 border border-blue-100 min-h-[48px]">
                    {detailTask.selfNote || <span className="italic text-slate-400">Chưa có giải trình.</span>}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-900">PM / Lãnh đạo Đánh giá</span>
                    <span className="font-extrabold text-indigo-700">KPI: {detailTask.finalKpiScore}/100</span>
                  </div>
                  <div>
                    Điểm CL:{' '}
                    <strong className="text-purple-800">
                      {detailTask.pmQualityScore != null ? `${detailTask.pmQualityScore}đ` : 'Chưa chấm'}
                    </strong>{' '}
                    ({PM_QUALITY_OPTIONS.find((q) => q.value === detailTask.pmQualityRating)?.label})
                  </div>
                  <div className="text-slate-700 bg-white/90 rounded-lg p-2 border border-purple-100 min-h-[48px]">
                    {detailTask.pmFeedback || <span className="italic text-slate-400">Chưa có nhận xét.</span>}
                  </div>
                </div>
              </div>

              {detailTask.aiSuggestedScore != null && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">AI Gợi ý Chấm điểm KPI: {detailTask.aiSuggestedScore}/100</div>
                    {detailTask.aiGradingHint && (
                      <div className="text-[11px] text-slate-700 mt-0.5">{detailTask.aiGradingHint}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailTaskId(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
