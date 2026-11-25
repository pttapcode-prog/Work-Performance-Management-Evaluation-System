import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Eye,
  Award,
  Sparkles,
  MessageSquareText,
  BellRing,
  FolderKanban,
  Users,
  ChevronRight,
} from 'lucide-react';
import {
  getCalendarWeekWindowFromDate,
  getTaskEvaluationWindow,
  summarizeReviewAlerts,
} from '../utils/reviewAlertHelper.js';

function ProjectAlertDot({ alerts }) {
  if (!alerts || alerts.totalNeedingReview === 0) {
    return (
      <span
        title="Đã chấm xong toàn bộ task"
        className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"
      />
    );
  }
  if (alerts.overdueCount > 0) {
    return (
      <span
        title={`${alerts.overdueCount} task quá hạn đánh giá (>12:00 Trưa CN)`}
        className="relative flex h-3 w-3 shrink-0"
      >
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600 ring-2 ring-rose-200" />
      </span>
    );
  }
  if (alerts.urgentCount > 0) {
    return (
      <span
        title={`${alerts.urgentCount} task cảnh báo từ 19:00 T7 (hạn 12:00 Trưa CN)`}
        className="relative flex h-3 w-3 shrink-0"
      >
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500 ring-2 ring-orange-200" />
      </span>
    );
  }
  return (
    <span
      title={`${alerts.totalNeedingReview} task chờ đánh giá (hạn 12:00 Trưa CN tuần có task)`}
      className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100 shrink-0"
    />
  );
}

export default function AIAnalyticsDashboard({
  summary,
  watchdog,
  tasks = [],
  projects = [],
  weeks = [],
  currentUser,
  permissions,
  selectedProjectId = 'all',
  onOpenProjectReview,
  onInspectEmployee,
  onOpenCopilotWithPrompt,
}) {
  const isDirector = currentUser?.role === 'DIRECTOR';
  const pmProjectSet = useMemo(
    () => new Set(permissions?.pmProjectIds || []),
    [permissions?.pmProjectIds]
  );

  // Live clock for Saturday 19:00 -> Sunday 12:00 alerts & current calendar week
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const currentWeekWindow = useMemo(() => getCalendarWeekWindowFromDate(now), [now]);

  // Director can switch between Project List & Employee Leaderboard; PM ALWAYS sees Project List
  const [directorTableMode, setDirectorTableMode] = useState('projects'); // 'projects' | 'employees'
  const [projectFilter, setProjectFilter] = useState('all'); // 'all' | 'needs_review' | 'warning_only'

  // Projects strictly scoped: DIRECTOR sees all company projects; PM sees ONLY projects where they are PM
  const managedProjects = useMemo(() => {
    const base = isDirector
      ? projects
      : projects.filter(
          (p) =>
            pmProjectSet.has(p.id) ||
            (p.members || []).some((m) => m.userId === currentUser?.id && m.projectRole === 'PM') ||
            p.pmId === currentUser?.id
        );
    if (selectedProjectId && selectedProjectId !== 'all') {
      return base.filter((p) => p.id === selectedProjectId);
    }
    return base;
  }, [projects, isDirector, pmProjectSet, currentUser?.id, selectedProjectId]);

  const managedProjectIds = useMemo(
    () => new Set(managedProjects.map((p) => p.id)),
    [managedProjects]
  );

  const scopedTasks = useMemo(
    () => tasks.filter((t) => managedProjectIds.has(t.projectId)),
    [tasks, managedProjectIds]
  );

  const reviewAlerts = useMemo(
    () => summarizeReviewAlerts(scopedTasks, weeks, now),
    [scopedTasks, weeks, now]
  );

  const projectRows = useMemo(() => {
    const statMap = new Map((summary?.projectSummaries || []).map((p) => [p.projectId, p]));

    return managedProjects
      .map((proj) => {
        const projTasks = scopedTasks.filter((t) => t.projectId === proj.id);
        const activeTasks = projTasks.filter((t) => t.status !== 'cancelled');
        const thisWeekTasks = activeTasks.filter((t) => {
          const w = getTaskEvaluationWindow(t, weeks);
          return Boolean(w && currentWeekWindow && w.mondayStr === currentWeekWindow.mondayStr);
        });
        const thisWeekDone = thisWeekTasks.filter(
          (t) => t.status === 'completed' || t.isDone
        ).length;
        const totalDone = activeTasks.filter((t) => t.status === 'completed' || t.isDone).length;
        const alerts = summarizeReviewAlerts(projTasks, weeks, now);
        const lateCount = activeTasks.filter((t) => t.isLate).length;
        const lowQualityCount = activeTasks.filter((t) => t.isLowQuality).length;

        const members = Array.isArray(proj.members) ? proj.members : [];
        const pmCount = members.filter((m) => m.projectRole === 'PM').length;
        const staffCount = Math.max(0, members.length - pmCount);
        const stat = statMap.get(proj.id);

        return {
          project: proj,
          memberCount: members.length,
          pmCount,
          staffCount,
          thisWeekTaskCount: thisWeekTasks.length,
          thisWeekDoneCount: thisWeekDone,
          totalTaskCount: activeTasks.length,
          totalDoneCount: totalDone,
          alerts,
          lateCount,
          lowQualityCount,
          avgKpi: stat?.avgKpi ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.alerts.overdueCount !== a.alerts.overdueCount) {
          return b.alerts.overdueCount - a.alerts.overdueCount;
        }
        if (b.alerts.urgentCount !== a.alerts.urgentCount) {
          return b.alerts.urgentCount - a.alerts.urgentCount;
        }
        if (b.alerts.totalNeedingReview !== a.alerts.totalNeedingReview) {
          return b.alerts.totalNeedingReview - a.alerts.totalNeedingReview;
        }
        return b.thisWeekTaskCount - a.thisWeekTaskCount;
      });
  }, [managedProjects, scopedTasks, weeks, currentWeekWindow, now, summary?.projectSummaries]);

  const displayedProjects = useMemo(() => {
    return projectRows.filter((row) => {
      if (projectFilter === 'needs_review') return row.alerts.totalNeedingReview > 0;
      if (projectFilter === 'warning_only') return row.alerts.activeWarningCount > 0;
      return true;
    });
  }, [projectRows, projectFilter]);

  const projectsWithReviewCount = useMemo(
    () => projectRows.filter((r) => r.alerts.totalNeedingReview > 0).length,
    [projectRows]
  );
  const projectsWithWarningCount = useMemo(
    () => projectRows.filter((r) => r.alerts.activeWarningCount > 0).length,
    [projectRows]
  );

  if (!summary || !watchdog) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        Đang tải dữ liệu phân tích AI...
      </div>
    );
  }

  const { overview, employeeSummaries } = summary;
  const { lowQualityReport, lateDeadlineReport, executiveSummary } = watchdog;
  const showProjectList = !isDirector || directorTableMode === 'projects';

  return (
    <div className="space-y-5">
      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>{isDirector ? 'KPI Trung bình Toàn công ty' : 'KPI Trung bình Dự án PM'}</span>
            <Award className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{overview.avgTeamKpi}</span>
            <span className="text-xs text-slate-400">/ 100 điểm</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Hoàn thành: <strong>{overview.completedTasks}/{overview.totalTasks}</strong> tasks ({overview.completionRate}%)
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>Chưa đạt Chất lượng</span>
            <AlertOctagon className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold ${
                overview.lowQualityTasks > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {overview.lowQualityTasks}
            </span>
            <span className="text-xs text-slate-400">tasks ({lowQualityReport.length} nhân sự)</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Tỷ lệ đạt chuẩn PM: <strong>{overview.qualityPassRate}%</strong>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>Task Chậm Deadline</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold ${
                overview.lateTasks > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {overview.lateTasks}
            </span>
            <span className="text-xs text-slate-400">tasks ({lateDeadlineReport.length} nhân sự)</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Tỷ lệ đúng hạn: <strong>{overview.onTimeRate}%</strong>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 shadow-sm ${
            reviewAlerts.overdueCount > 0
              ? 'bg-rose-50/70 border-rose-200'
              : reviewAlerts.urgentCount > 0
              ? 'bg-orange-50/70 border-orange-200'
              : 'bg-white border-[#DEE0E3]'
          }`}
        >
          <div className="text-xs font-medium text-slate-600 flex items-center justify-between">
            <span>Task Cần đánh giá (Hạn Trưa CN)</span>
            <BellRing
              className={`w-4 h-4 ${
                reviewAlerts.overdueCount > 0
                  ? 'text-rose-600'
                  : reviewAlerts.urgentCount > 0
                  ? 'text-orange-500'
                  : 'text-purple-600'
              }`}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold ${
                reviewAlerts.overdueCount > 0
                  ? 'text-rose-600'
                  : reviewAlerts.urgentCount > 0
                  ? 'text-orange-600'
                  : reviewAlerts.totalNeedingReview > 0
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            >
              {reviewAlerts.totalNeedingReview}
            </span>
            <span className="text-xs text-slate-500">task chưa chấm</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-600">
            {reviewAlerts.overdueCount > 0 ? (
              <strong className="text-rose-700">
                {reviewAlerts.overdueCount} quá hạn (&gt;12h trưa CN tuần task)
              </strong>
            ) : reviewAlerts.urgentCount > 0 ? (
              <strong className="text-orange-700">
                {reviewAlerts.urgentCount} cảnh báo từ 19h T7
              </strong>
            ) : (
              <span>Cảnh báo từ 19:00 T7 tuần có task</span>
            )}
          </div>
        </div>
      </div>

      {/* AI Executive Summary Banner */}
      <div className="bg-gradient-to-r from-[#EEF4FF] via-white to-[#F4F0FF] rounded-xl border border-blue-200/80 p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3370FF] to-[#7B61FF] flex items-center justify-center text-white shrink-0 shadow-sm">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Báo cáo Trợ lý AI Tổng hợp &amp; Cảnh báo Tự động
              </h2>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {isDirector ? 'Toàn Công ty' : `PM • ${managedProjects.length} dự án`}
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">{executiveSummary}</p>
          </div>
        </div>
        <button
          onClick={() => onOpenCopilotWithPrompt('Tổng hợp rủi ro chất lượng và deadline tuần này')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-[#3370FF] text-white hover:bg-blue-700 transition shadow-sm shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" /> Hỏi Trợ lý AI ngay
        </button>
      </div>

      {/* TWO MANDATORY AI WATCHDOG BOARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Watchdog 1: Low Quality / Rework */}
        <div className="bg-white rounded-xl border border-rose-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-600" />
              <h3 className="text-sm font-bold text-rose-950">
                1. AI Cảnh báo: Task Chưa Đạt Chất Lượng ({lowQualityReport.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
              Chưa đạt / Rework
            </span>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {lowQualityReport.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                Tuyệt vời! Chưa ghi nhận task nào chưa đạt chất lượng.
              </div>
            ) : (
              lowQualityReport.map((item) => (
                <div
                  key={item.userId}
                  className="rounded-lg border border-rose-100 bg-rose-50/30 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: item.avatarColor }}
                      >
                        {item.avatar}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {item.name}{' '}
                          <span className="font-normal text-slate-500">({item.title})</span>
                        </div>
                        <div className="text-[11px] text-rose-700 font-medium">
                          {item.count} task lỗi chất lượng • Tự chấm TB {item.avgSelfScore}đ vs PM{' '}
                          {item.avgPmScore ?? '--'}đ
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onInspectEmployee(item.userId)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      <Eye className="w-3 h-3" /> Chi tiết
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {item.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="bg-white rounded-lg p-2.5 border border-rose-100 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            [{t.projectCode}] {t.title}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold shrink-0">
                            {t.pmQualityRating === 'poor' ? 'Chưa đạt' : 'Rework'} ({t.pmQualityScore}đ)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 flex items-start gap-1">
                          <MessageSquareText className="w-3 h-3 text-rose-500 mt-0.5 shrink-0" />
                          <span>
                            <strong>PM nhận xét:</strong> {t.pmFeedback || 'Chưa nhập nhận xét'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Watchdog 2: Late Deadline */}
        <div className="bg-white rounded-xl border border-amber-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-950">
                2. AI Cảnh báo: Task Chậm Deadline ({lateDeadlineReport.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              Quá hạn / Xong muộn
            </span>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {lateDeadlineReport.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                Không có task nào bị trễ deadline!
              </div>
            ) : (
              lateDeadlineReport.map((item) => (
                <div
                  key={item.userId}
                  className="rounded-lg border border-amber-100 bg-amber-50/30 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: item.avatarColor }}
                      >
                        {item.avatar}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {item.name}{' '}
                          <span className="font-normal text-slate-500">({item.title})</span>
                        </div>
                        <div className="text-[11px] text-amber-800 font-medium">
                          {item.lateCount} task trễ (tối đa {item.maxDaysLate} ngày) • Phân loại AI:{' '}
                          {item.reasonCategory}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onInspectEmployee(item.userId)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white border border-amber-200 text-amber-800 hover:bg-amber-50"
                    >
                      <Eye className="w-3 h-3" /> Chi tiết
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {item.lateTasks.map((t) => (
                      <div
                        key={t.id}
                        className="bg-white rounded-lg p-2.5 border border-amber-100 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            [{t.projectCode}] {t.title}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold shrink-0">
                            {t.deadlineStatus === 'overdue'
                              ? `Quá hạn ${t.daysLate}d`
                              : `Hoàn thành trễ ${t.daysLate}d`}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          <strong>Hạn:</strong> {t.deadline} • <strong>Giải trình:</strong>{' '}
                          {t.selfNote || 'Chưa ghi giải trình'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3: PROJECT LIST (Click a project -> opens its Task List & Evaluation page directly) */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              {showProjectList ? (
                <>
                  <FolderKanban className="w-4 h-4 text-blue-600" />
                  {isDirector
                    ? `3. Danh sách Dự án Toàn Công ty (${displayedProjects.length})`
                    : `3. Danh sách Dự án bạn làm PM (${displayedProjects.length})`}
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 text-blue-600" />
                  3. Bảng Tổng hợp Hiệu suất Nhân sự Toàn Công ty (Click để xem 360°)
                </>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {showProjectList
                ? `Thống kê nhân sự, số task trong tuần hiện tại (${
                    currentWeekWindow?.weekLabel || 'Tuần hiện tại'
                  }) và số task cần chấm. Bấm vào từng dự án để mở danh sách task cụ thể & đánh giá.`
                : 'Tổng hợp khối lượng Est, tỷ lệ đúng hạn, điểm tự chấm vs PM đánh giá trên toàn công ty.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isDirector && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setDirectorTableMode('projects')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                    directorTableMode === 'projects'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" /> Theo Dự án ({projectRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDirectorTableMode('employees')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                    directorTableMode === 'employees'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Theo Nhân sự ({employeeSummaries.length})
                </button>
              </div>
            )}

            {showProjectList && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setProjectFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    projectFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600'
                  }`}
                >
                  Tất cả ({projectRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setProjectFilter('needs_review')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    projectFilter === 'needs_review' ? 'bg-amber-500 text-white' : 'text-slate-600'
                  }`}
                >
                  Có task cần chấm ({projectsWithReviewCount})
                </button>
                <button
                  type="button"
                  onClick={() => setProjectFilter('warning_only')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    projectFilter === 'warning_only' ? 'bg-rose-600 text-white' : 'text-slate-600'
                  }`}
                >
                  Cảnh báo 19h T7/Quá hạn ({projectsWithWarningCount})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PROJECT LIST TABLE (Default for PM & Director) */}
        {showProjectList ? (
          displayedProjects.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {projectRows.length === 0
                ? isDirector
                  ? 'Công ty chưa có dự án nào.'
                  : 'Bạn chưa được phân công làm PM của dự án nào.'
                : 'Không có dự án nào khớp bộ lọc hiện tại.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                    <th className="py-3 pl-5 pr-3 min-w-[260px]">Dự án (Chấm cảnh báo)</th>
                    <th className="py-3 px-3 text-center w-[150px]">Nhân sự</th>
                    <th className="py-3 px-3 text-center w-[175px]">
                      Task tuần này
                      {currentWeekWindow && (
                        <div className="text-[9px] font-medium normal-case text-slate-400">
                          {currentWeekWindow.mondayDateStr.slice(0, 5)} –{' '}
                          {currentWeekWindow.sundayDateStr.slice(0, 5)}
                        </div>
                      )}
                    </th>
                    <th className="py-3 px-3 text-center w-[195px]">Task cần chấm</th>
                    <th className="py-3 px-3 text-center w-[150px]">KPI / Cảnh báo</th>
                    <th className="py-3 pr-5 pl-3 text-right w-[170px]">Chi tiết Task</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedProjects.map((row) => {
                    const { project, alerts } = row;
                    return (
                      <tr
                        key={project.id}
                        onClick={() => onOpenProjectReview?.(project.id)}
                        className={`cursor-pointer transition group ${
                          alerts.overdueCount > 0
                            ? 'bg-rose-50/30 hover:bg-rose-50/70'
                            : alerts.urgentCount > 0
                            ? 'bg-orange-50/30 hover:bg-orange-50/70'
                            : 'hover:bg-blue-50/50'
                        }`}
                      >
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex items-center gap-3">
                            <ProjectAlertDot alerts={alerts} />
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-extrabold text-[11px] shrink-0 shadow-xs"
                              style={{ backgroundColor: project.color || '#3370FF' }}
                            >
                              {project.code}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-[13px] group-hover:text-blue-700 transition">
                                {project.name}
                              </div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span>
                                  PM:{' '}
                                  <strong className="text-slate-700">
                                    {project.pmName || 'Chưa gán'}
                                  </strong>
                                </span>
                                {project.client && (
                                  <>
                                    <span>•</span>
                                    <span>{project.client}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold">
                            <Users className="w-3.5 h-3.5 text-slate-500" />
                            <span>{row.memberCount} nhân sự</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            {row.pmCount} PM • {row.staffCount} thành viên
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          <div className="text-sm font-extrabold text-blue-700">
                            {row.thisWeekTaskCount}{' '}
                            <span className="text-xs font-semibold text-slate-600">task</span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Hoàn thành: <strong>{row.thisWeekDoneCount}/{row.thisWeekTaskCount}</strong>
                            {row.totalTaskCount !== row.thisWeekTaskCount && (
                              <span className="text-slate-400"> • Tổng: {row.totalTaskCount}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          {alerts.totalNeedingReview === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 0 cần chấm
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-bold text-[11px] ${
                                  alerts.overdueCount > 0
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : alerts.urgentCount > 0
                                    ? 'bg-orange-100 text-orange-800 border-orange-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {alerts.totalNeedingReview} task cần chấm
                              </span>
                              <div className="text-[10px] text-slate-500">
                                {alerts.overdueCount > 0
                                  ? `${alerts.overdueCount} quá hạn >12h Trưa CN`
                                  : alerts.urgentCount > 0
                                  ? `${alerts.urgentCount} gấp từ 19h T7`
                                  : 'Hạn 12:00 Trưa CN tuần task'}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-lg font-extrabold text-xs ${
                              row.avgKpi >= 85
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.avgKpi >= 65
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            KPI: {row.avgKpi}
                          </span>
                          <div className="flex items-center justify-center gap-2 text-[10px] mt-1">
                            <span className={row.lateCount > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}>
                              Trễ: {row.lateCount}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className={row.lowQualityCount > 0 ? 'text-rose-700 font-semibold' : 'text-slate-400'}>
                              Lỗi CL: {row.lowQualityCount}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 pr-5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProjectReview?.(project.id);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 font-bold text-[11px] transition"
                          >
                            Xem danh sách Task <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* EMPLOYEE LEADERBOARD TABLE (DIRECTOR ONLY) */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                  <th className="py-3 px-4">Nhân sự</th>
                  <th className="py-3 px-3">Dự án tham gia</th>
                  <th className="py-3 px-3 text-center">Tasks xong</th>
                  <th className="py-3 px-3 text-center">Est tuần (/5)</th>
                  <th className="py-3 px-3 text-center">Tự chấm TB</th>
                  <th className="py-3 px-3 text-center">PM chấm TB</th>
                  <th className="py-3 px-3 text-center">Trạng thái cảnh báo</th>
                  <th className="py-3 px-3 text-center">KPI Tuần</th>
                  <th className="py-3 px-4 text-right">Xem chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employeeSummaries.map((emp) => (
                  <tr key={emp.userId} className="hover:bg-blue-50/40 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                          style={{ backgroundColor: emp.avatarColor }}
                        >
                          {emp.avatar}
                        </span>
                        <div>
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-[11px] text-slate-500">{emp.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {emp.projectBreakdown.map((pb) => (
                          <span
                            key={pb.projectId}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded border"
                            style={{
                              borderColor: `${pb.color}40`,
                              backgroundColor: `${pb.color}12`,
                              color: pb.color,
                            }}
                          >
                            {pb.code} ({pb.totalTasks})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-800">
                      {emp.completedTasks}/{emp.totalTasks}{' '}
                      <span className="text-slate-400 font-normal">({emp.completionRate}%)</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                        {emp.totalEstimatedVolume ?? 0} / 5
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-slate-700">
                      {emp.avgSelfScore}đ
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-blue-700">
                      {emp.avgPmScore !== null ? `${emp.avgPmScore}đ` : '--'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {!emp.hasQualityIssue && !emp.hasDeadlineIssue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                            🟢 Đạt chuẩn
                          </span>
                        )}
                        {emp.hasQualityIssue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                            🔴 {emp.lowQualityTasks} CL kém
                          </span>
                        )}
                        {emp.hasDeadlineIssue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                            ⏰ {emp.lateTasks} trễ hạn
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-extrabold ${
                          emp.finalWeekKpi >= 90
                            ? 'bg-emerald-100 text-emerald-800'
                            : emp.finalWeekKpi >= 75
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {emp.finalWeekKpi} ({emp.kpiGrade.code})
                      </span>
                      {emp.aiRecommendedWeekKpi != null && (
                        <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                          AI gợi ý: {emp.aiRecommendedWeekKpi}đ ({emp.aiRecommendedGrade?.code || ''})
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onInspectEmployee(emp.userId)}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
                      >
                        <Eye className="w-3.5 h-3.5" /> Chi tiết 360°
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
