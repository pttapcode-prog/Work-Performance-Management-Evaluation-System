import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import {
  Plus,
  CheckSquare,
  Square,
  Paperclip,
  Upload,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Calendar,
  Award,
  FileText,
  Eye,
  X,
} from 'lucide-react';

const STATUS_OPTIONS = [
  {
    value: 'pending_review',
    label: 'Chờ đánh giá',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    value: 'completed',
    label: 'Đã hoàn thành',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    value: 'cancelled',
    label: 'Hủy',
    badge: 'bg-slate-200 text-slate-700 border-slate-300',
  },
];

const SELF_RATINGS = [
  { value: 'exceed', label: 'Vượt KPI (95-100)', defaultScore: 98 },
  { value: 'met', label: 'Đạt KPI (85-94)', defaultScore: 88 },
  { value: 'partial', label: 'Đạt 1 phần (65-84)', defaultScore: 72 },
  { value: 'unmet', label: 'Chưa đạt (< 65)', defaultScore: 45 },
  { value: 'pending', label: 'Chưa tự chấm', defaultScore: 0 },
];

const PM_QUALITY_LABELS = {
  excellent: { label: 'Xuất sắc', badge: 'bg-emerald-100 text-emerald-800' },
  good: { label: 'Đạt chuẩn', badge: 'bg-blue-100 text-blue-800' },
  rework: { label: 'Cần sửa lại (Rework)', badge: 'bg-amber-100 text-amber-800' },
  poor: { label: 'Chưa đạt chất lượng', badge: 'bg-rose-100 text-rose-800' },
  pending: { label: 'Chờ PM / Lãnh đạo đánh giá', badge: 'bg-slate-100 text-slate-600' },
};

const WEEKLY_EST_LIMIT = 5;

function getStatusMeta(status) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

export default function EmployeeTaskView({
  tasks = [],
  projects = [],
  weeks = [],
  currentUser,
  selectedWeekId,
  selectedProjectId,
  referenceDate,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}) {
  const myProjects = useMemo(() => {
    const joined = projects.filter(
      (p) => (p.members || []).some((m) => m.userId === currentUser?.id) || p.pmId === currentUser?.id
    );
    return joined.length > 0 ? joined : projects;
  }, [projects, currentUser?.id]);

  const activeWeekId =
    selectedWeekId && selectedWeekId !== 'all'
      ? selectedWeekId
      : weeks.find((w) => w.isCurrent)?.id || weeks[0]?.id || '2026-W47';

  const weekTasks = useMemo(
    () => tasks.filter((t) => t.assigneeId === currentUser?.id && t.weekId === activeWeekId),
    [tasks, currentUser?.id, activeWeekId]
  );

  const myTasks = useMemo(
    () =>
      weekTasks.filter(
        (t) => !selectedProjectId || selectedProjectId === 'all' || t.projectId === selectedProjectId
      ),
    [weekTasks, selectedProjectId]
  );

  const selectedWeek = weeks.find((w) => w.id === activeWeekId);
  const defaultDate = referenceDate || selectedWeek?.startDate || '2026-11-22';
  const defaultDeadline = selectedWeek?.endDate || defaultDate;

  const weeklyEstUsed = useMemo(() => {
    const total = weekTasks
      .filter((t) => t.status !== 'cancelled')
      .reduce((sum, t) => sum + Number(t.estimatedVolume || 0), 0);
    return Number(total.toFixed(2));
  }, [weekTasks]);

  const remainingEst = Math.max(0, Number((WEEKLY_EST_LIMIT - weeklyEstUsed).toFixed(2)));
  const estPercent = Math.min(100, Math.round((weeklyEstUsed / WEEKLY_EST_LIMIT) * 100));

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [detailDraft, setDetailDraft] = useState(null);
  const [savingDetail, setSavingDetail] = useState(false);

  const [formError, setFormError] = useState('');
  const [modalError, setModalError] = useState('');
  const [banner, setBanner] = useState('');
  const [uploadingFor, setUploadingFor] = useState(null); // 'new' | taskId

  const [newTask, setNewTask] = useState({
    title: '',
    projectId: myProjects[0]?.id || '',
    startDate: selectedWeek?.startDate || defaultDate,
    endDate: selectedWeek?.endDate || defaultDeadline,
    deadline: selectedWeek?.endDate || defaultDeadline,
    estimatedVolume: Math.min(1, remainingEst > 0 ? remainingEst : 0.5),
    isDone: false,
    completedAt: '',
    status: 'pending_review',
    attachments: [],
    deliverableUrl: '',
    selfProgress: 0,
    selfKpiRating: 'pending',
    selfScore: 0,
    selfNote: '',
  });

  useEffect(() => {
    setNewTask((prev) => ({
      ...prev,
      projectId:
        prev.projectId && myProjects.some((p) => p.id === prev.projectId)
          ? prev.projectId
          : myProjects[0]?.id || '',
      startDate: selectedWeek?.startDate || defaultDate,
      endDate: selectedWeek?.endDate || defaultDeadline,
      deadline: selectedWeek?.endDate || defaultDeadline,
    }));
  }, [
    activeWeekId,
    selectedWeek?.startDate,
    selectedWeek?.endDate,
    defaultDate,
    defaultDeadline,
    myProjects,
  ]);

  const selectedTask = useMemo(
    () => myTasks.find((t) => t.id === selectedTaskId) || weekTasks.find((t) => t.id === selectedTaskId) || null,
    [myTasks, weekTasks, selectedTaskId]
  );

  const openTaskDetail = (task) => {
    setModalError('');
    setSelectedTaskId(task.id);
    setDetailDraft({
      title: task.title || '',
      projectId: task.projectId || myProjects[0]?.id || '',
      startDate: task.startDate || '',
      endDate: task.endDate || '',
      deadline: task.deadline || '',
      estimatedVolume: Number(task.estimatedVolume ?? 1),
      isDone: Boolean(task.isDone),
      completedAt: task.completedAt || '',
      status: task.status || 'pending_review',
      attachments: Array.isArray(task.attachments) ? task.attachments : [],
      deliverableUrl: task.deliverableUrl || '',
      selfProgress: Number(task.selfProgress ?? 0),
      selfKpiRating: task.selfKpiRating || 'pending',
      selfScore: Number(task.selfScore ?? 0),
      selfNote: task.selfNote || '',
    });
  };

  const closeTaskDetail = () => {
    setSelectedTaskId(null);
    setDetailDraft(null);
    setModalError('');
  };

  const showNotice = (msg) => {
    setBanner(msg);
    setTimeout(() => setBanner(''), 3500);
  };

  const openCreateModal = () => {
    setModalError('');
    setNewTask((prev) => ({
      ...prev,
      projectId:
        prev.projectId && myProjects.some((p) => p.id === prev.projectId)
          ? prev.projectId
          : myProjects[0]?.id || '',
      estimatedVolume: Math.min(1, remainingEst > 0 ? remainingEst : 0.5),
    }));
    setShowCreateModal(true);
  };

  const handleUploadNew = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setModalError('');
    setUploadingFor('new');
    try {
      const uploaded = [];
      for (const file of files) {
        const res = await api.uploadFile(file);
        uploaded.push(res);
      }
      setNewTask((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...uploaded],
      }));
    } catch (err) {
      setModalError(err.message || 'Lỗi tải file đính kèm');
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  };

  const handleUploadForSelected = async (e) => {
    if (!selectedTask || !detailDraft) return;
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setModalError('');
    setUploadingFor(selectedTask.id);
    try {
      const uploaded = [];
      for (const file of files) {
        const res = await api.uploadFile(file);
        uploaded.push(res);
      }
      const nextAttachments = [...(detailDraft.attachments || []), ...uploaded];
      setDetailDraft((prev) => ({ ...prev, attachments: nextAttachments }));
      await onUpdateTask(selectedTask.id, { attachments: nextAttachments });
      showNotice(`Đã tải lên ${uploaded.length} file minh chứng cho task.`);
    } catch (err) {
      setModalError(err.message || 'Lỗi tải file minh chứng');
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    const est = Number(newTask.estimatedVolume);
    const chosenProjectId = newTask.projectId || myProjects[0]?.id;
    if (!newTask.title.trim()) {
      setModalError('Vui lòng nhập Nội dung công việc.');
      return;
    }
    if (!chosenProjectId) {
      setModalError('Bạn chưa được phân công vào dự án nào để log task.');
      return;
    }
    if (Number.isNaN(est) || est <= 0 || est > WEEKLY_EST_LIMIT) {
      setModalError(`Khối lượng est phải nằm trong khoảng > 0 và <= ${WEEKLY_EST_LIMIT}.`);
      return;
    }
    if (newTask.status !== 'cancelled' && weeklyEstUsed + est > WEEKLY_EST_LIMIT + 1e-6) {
      setModalError(
        `Vượt giới hạn Khối lượng est tuần (${WEEKLY_EST_LIMIT}). Bạn đã dùng ${weeklyEstUsed}/${WEEKLY_EST_LIMIT}, chỉ còn ${remainingEst} est.`
      );
      return;
    }

    try {
      await onCreateTask({
        weekId: activeWeekId,
        projectId: chosenProjectId,
        assigneeId: currentUser?.id,
        title: newTask.title.trim(),
        startDate: newTask.startDate,
        endDate: newTask.endDate,
        deadline: newTask.deadline,
        estimatedVolume: est,
        isDone: newTask.isDone,
        completedAt: newTask.completedAt || (newTask.isDone ? defaultDate : ''),
        status: newTask.status,
        attachments: newTask.attachments,
        deliverableUrl: newTask.deliverableUrl.trim(),
        selfProgress: Number(newTask.selfProgress || 0),
        selfKpiRating: newTask.selfKpiRating,
        selfScore: Number(newTask.selfScore || 0),
        selfNote: newTask.selfNote.trim(),
      });
      setNewTask((prev) => ({
        ...prev,
        title: '',
        estimatedVolume: Math.min(1, Math.max(0.5, Number((remainingEst - est).toFixed(2)))),
        isDone: false,
        completedAt: '',
        status: 'pending_review',
        attachments: [],
        deliverableUrl: '',
        selfProgress: 0,
        selfKpiRating: 'pending',
        selfScore: 0,
        selfNote: '',
      }));
      setShowCreateModal(false);
      showNotice('Đã log task mới thành công.');
    } catch (err) {
      setModalError(err.message || 'Không thể tạo task');
    }
  };

  const handleSaveDetail = async (e) => {
    e.preventDefault();
    if (!selectedTask || !detailDraft || savingDetail) return;
    setModalError('');
    const d = detailDraft;
    const est = Number(d.estimatedVolume);
    if (!d.title.trim()) {
      setModalError('Nội dung công việc không được để trống.');
      return;
    }
    if (Number.isNaN(est) || est <= 0 || est > WEEKLY_EST_LIMIT) {
      setModalError(`Khối lượng est phải trong khoảng > 0 và <= ${WEEKLY_EST_LIMIT}.`);
      return;
    }

    const otherEst = weekTasks
      .filter((t) => t.id !== selectedTask.id && t.status !== 'cancelled')
      .reduce((sum, t) => sum + Number(t.estimatedVolume || 0), 0);
    if (d.status !== 'cancelled' && otherEst + est > WEEKLY_EST_LIMIT + 1e-6) {
      setModalError(
        `Tổng khối lượng est tuần sẽ thành ${(otherEst + est).toFixed(1)}/${WEEKLY_EST_LIMIT}. Vui lòng giảm est hoặc hủy bớt task khác.`
      );
      return;
    }

    setSavingDetail(true);
    try {
      await onUpdateTask(selectedTask.id, {
        title: d.title.trim(),
        projectId: d.projectId,
        startDate: d.startDate,
        endDate: d.endDate,
        deadline: d.deadline,
        estimatedVolume: est,
        isDone: Boolean(d.isDone),
        completedAt: d.completedAt,
        status: d.status,
        attachments: d.attachments,
        deliverableUrl: d.deliverableUrl.trim(),
        selfProgress: Number(d.selfProgress || 0),
        selfKpiRating: d.selfKpiRating,
        selfScore: Number(d.selfScore || 0),
        selfNote: d.selfNote.trim(),
      });
      closeTaskDetail();
      showNotice(`Đã lưu cập nhật & tự đánh giá KPI cho task "${d.title.trim()}".`);
    } catch (err) {
      setModalError(err.message || 'Lỗi khi lưu task');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleToggleDoneQuick = async (task, e) => {
    e.stopPropagation();
    setFormError('');
    const nextDone = !task.isDone;
    const nextCompletedAt = nextDone ? task.completedAt || defaultDate : '';
    try {
      await onUpdateTask(task.id, {
        isDone: nextDone,
        completedAt: nextCompletedAt,
      });
      showNotice(nextDone ? `Đã tick Xong: "${task.title}"` : `Đã bỏ tick Xong: "${task.title}"`);
    } catch (err) {
      setFormError(err.message || 'Không thể cập nhật trạng thái Xong.');
    }
  };

  const handleDeleteClick = async (task, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Xóa task "${task.title}"?`)) return;
    try {
      await onDeleteTask(task.id);
      if (selectedTaskId === task.id) closeTaskDetail();
      showNotice(`Đã xóa task "${task.title}".`);
    } catch (err) {
      setFormError(err.message || 'Không thể xóa task.');
    }
  };

  const getProjectObj = (pid) => projects.find((p) => p.id === pid);

  return (
    <div className="space-y-5">
      {/* Weekly Est Quota Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Quản lý Task cá nhân theo tuần ({activeWeekId})
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Bấm vào từng dòng bản ghi bên dưới để mở popup xem chi tiết, tải minh chứng và tự đánh giá KPI.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Log Task mới
            </button>
          </div>
        </div>

        {/* Est Meter */}
        <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm mb-2">
            <div className="font-semibold text-slate-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Kiểm soát Khối lượng Est tuần {activeWeekId}:
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  weeklyEstUsed >= WEEKLY_EST_LIMIT
                    ? 'bg-rose-100 text-rose-800'
                    : weeklyEstUsed >= 4
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {weeklyEstUsed} / {WEEKLY_EST_LIMIT} est
              </span>
            </div>
            <div className="text-xs text-slate-600">
              Còn lại có thể log: <strong className="text-slate-900">{remainingEst} est</strong> (Task trạng thái <strong>Hủy</strong> không tính vào quỹ tuần)
            </div>
          </div>
          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                weeklyEstUsed >= WEEKLY_EST_LIMIT
                  ? 'bg-rose-500'
                  : weeklyEstUsed >= 4
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${estPercent}%` }}
            />
          </div>
        </div>

        {formError && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}
        {banner && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{banner}</span>
          </div>
        )}
      </div>

      {/* Compact Task Records List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Danh sách Task của bạn trong tuần {activeWeekId} ({myTasks.length})
          </h3>
          <span className="text-[11px] text-slate-500">
            Click vào bản ghi để mở popup chi tiết &amp; cập nhật
          </span>
        </div>

        {myTasks.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">
              Bạn chưa có task nào trong tuần {activeWeekId}.
            </p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Bấm nút &ldquo;Log Task mới&rdquo; để thêm công việc tuần (tổng khối lượng Est tối đa 5/tuần).
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Log Task mới
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                  <th className="py-2.5 px-3 w-[48px] text-center">Xong</th>
                  <th className="py-2.5 px-3 min-w-[240px]">Nội dung công việc</th>
                  <th className="py-2.5 px-3 w-[150px]">Dự án</th>
                  <th className="py-2.5 px-3 w-[180px]">Lịch trình &amp; Deadline</th>
                  <th className="py-2.5 px-3 w-[65px] text-center">Est</th>
                  <th className="py-2.5 px-3 w-[105px] text-center">Minh chứng</th>
                  <th className="py-2.5 px-3 w-[120px] text-center">Trạng thái</th>
                  <th className="py-2.5 px-3 w-[145px] text-center">Tự chấm / PM / KPI</th>
                  <th className="py-2.5 px-3 w-[95px] text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myTasks.map((task) => {
                  const statusMeta = getStatusMeta(task.status);
                  const proj = getProjectObj(task.projectId);
                  const attCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
                  const hasLink = Boolean(task.deliverableUrl?.trim());
                  const pmMeta = PM_QUALITY_LABELS[task.pmQualityRating || 'pending'] || PM_QUALITY_LABELS.pending;

                  return (
                    <tr
                      key={task.id}
                      onClick={() => openTaskDetail(task)}
                      className={`cursor-pointer transition hover:bg-blue-50/40 ${
                        task.status === 'cancelled' ? 'bg-slate-50/80 text-slate-400' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleToggleDoneQuick(task, e)}
                          title={task.isDone ? 'Đã tick Xong' : 'Tick Xong'}
                          className="inline-flex items-center justify-center p-1 rounded hover:bg-emerald-50"
                        >
                          {task.isDone ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <div
                          className={`font-semibold text-sm leading-snug ${
                            task.status === 'cancelled'
                              ? 'line-through text-slate-400'
                              : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </div>
                        {task.pmFeedback && (
                          <div className="text-[11px] text-purple-700 mt-0.5 line-clamp-1">
                            💬 Nhận xét: {task.pmFeedback}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded border"
                          style={{
                            borderColor: `${proj?.color || '#3370FF'}35`,
                            backgroundColor: `${proj?.color || '#3370FF'}12`,
                            color: proj?.color || '#3370FF',
                          }}
                        >
                          {proj?.name || task.projectName || task.projectId}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono text-[11px] text-slate-800">
                          Hạn: <strong>{task.deadline || '—'}</strong>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {task.startDate || '—'} → {task.endDate || '—'}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {task.isLate ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                              Trễ {task.daysLate} ngày
                            </span>
                          ) : task.status !== 'cancelled' ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              Đúng hạn
                            </span>
                          ) : null}
                          {task.completedAt && (
                            <span className="text-[10px] text-emerald-700 font-mono">
                              ✓ {task.completedAt}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold font-mono">
                          {task.estimatedVolume ?? 1}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        {attCount > 0 || hasLink ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
                            <Paperclip className="w-3 h-3" />
                            {attCount + (hasLink ? 1 : 0)} tệp/link
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Chưa có</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusMeta.badge}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 font-mono text-[11px]">
                          <span className="text-blue-700 font-semibold" title="Điểm tự chấm">
                            {task.selfScore ?? 0}đ
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="text-purple-700 font-semibold" title="Điểm PM/Lãnh đạo">
                            {task.pmQualityScore != null ? `${task.pmQualityScore}đ` : '--'}
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-extrabold" title="KPI tổng hợp">
                            {task.finalKpiScore ?? 0}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className={`inline-block text-[10px] px-1.5 py-0.2 rounded ${pmMeta.badge}`}>
                            {pmMeta.label}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTaskDetail(task);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold"
                            title="Xem chi tiết & cập nhật"
                          >
                            <Eye className="w-3.5 h-3.5" /> Chi tiết
                          </button>
                          {task.pmQualityRating === 'pending' && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(task, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Xóa task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* POPUP 1: LOG NEW TASK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  Log Task Mới Tuần {activeWeekId}
                </h3>
                <p className="text-xs text-slate-500">
                  Quỹ Est còn lại tuần này: <strong className="text-blue-700">{remainingEst} / {WEEKLY_EST_LIMIT} est</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {modalError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Part 1 */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                  Phần 1: Nội dung &amp; Kế hoạch (Est tối đa {WEEKLY_EST_LIMIT}/tuần)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                  <div className="md:col-span-6">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nội dung công việc <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newTask.title}
                      onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                      placeholder="VD: Thiết kế API phân quyền & Upload file minh chứng..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Dự án (Chọn) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newTask.projectId}
                      onChange={(e) => setNewTask((p) => ({ ...p, projectId: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {myProjects.length === 0 ? (
                        <option value="">-- Chưa tham gia dự án nào --</option>
                      ) : (
                        myProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.code || p.id}] {p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Khối lượng Est
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max={WEEKLY_EST_LIMIT}
                      required
                      value={newTask.estimatedVolume}
                      onChange={(e) => setNewTask((p) => ({ ...p, estimatedVolume: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày bắt đầu</label>
                    <input
                      type="date"
                      value={newTask.startDate}
                      onChange={(e) => setNewTask((p) => ({ ...p, startDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày kết thúc</label>
                    <input
                      type="date"
                      value={newTask.endDate}
                      onChange={(e) => setNewTask((p) => ({ ...p, endDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline</label>
                    <input
                      type="date"
                      value={newTask.deadline}
                      onChange={(e) => setNewTask((p) => ({ ...p, deadline: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Part 2 */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg inline-block">
                  Phần 2: Kết quả thực tế, File đính kèm &amp; Trạng thái
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={newTask.isDone}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setNewTask((p) => ({
                            ...p,
                            isDone: checked,
                            completedAt: checked ? p.completedAt || defaultDate : '',
                          }));
                        }}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                      <span>Xong</span>
                    </label>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ngày hoàn thành thực tế
                    </label>
                    <input
                      type="date"
                      value={newTask.completedAt}
                      onChange={(e) => setNewTask((p) => ({ ...p, completedAt: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái</label>
                    <select
                      value={newTask.status}
                      onChange={(e) => setNewTask((p) => ({ ...p, status: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      File đính kèm / Minh chứng
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shrink-0">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>{uploadingFor === 'new' ? 'Đang tải...' : 'Tải file'}</span>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleUploadNew}
                          disabled={uploadingFor === 'new'}
                        />
                      </label>
                      <input
                        type="text"
                        value={newTask.deliverableUrl}
                        onChange={(e) => setNewTask((p) => ({ ...p, deliverableUrl: e.target.value }))}
                        placeholder="Link PR / Docs..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {newTask.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {newTask.attachments.map((att) => (
                      <div
                        key={att.id || att.url}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800"
                      >
                        <Paperclip className="w-3 h-3" />
                        <a href={att.url} target="_blank" rel="noreferrer" className="underline font-medium">
                          {att.name}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setNewTask((p) => ({
                              ...p,
                              attachments: p.attachments.filter((x) => x.id !== att.id),
                            }))
                          }
                          className="text-rose-600 hover:text-rose-800 ml-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={remainingEst <= 0 && newTask.status !== 'cancelled'}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-sm"
              >
                <Plus className="w-4 h-4" /> Lưu Task mới
              </button>
            </div>
          </form>
        </div>
      )}

      {/* POPUP 2: TASK DETAIL & SELF-ASSESSMENT MODAL */}
      {selectedTask && detailDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={closeTaskDetail}
        >
          <form
            onSubmit={handleSaveDetail}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {selectedTask.id}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      getStatusMeta(detailDraft.status).badge
                    }`}
                  >
                    {getStatusMeta(detailDraft.status).label}
                  </span>
                  {selectedTask.isLate && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                      Trễ {selectedTask.daysLate} ngày
                    </span>
                  )}
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Chi tiết Task &amp; Tự đánh giá KPI
                </h3>
              </div>
              <button
                type="button"
                onClick={closeTaskDetail}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5">
              {modalError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Part 1 */}
              <div className="p-4 rounded-xl bg-blue-50/40 border border-blue-200/70 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Phần 1: Nội dung công việc &amp; Kế hoạch
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                  <div className="md:col-span-6">
                    <label className="block font-semibold text-slate-700 mb-1">Nội dung công việc *</label>
                    <input
                      type="text"
                      required
                      value={detailDraft.title}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, title: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Dự án</label>
                    <select
                      value={detailDraft.projectId}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, projectId: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                    >
                      {myProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.code || p.id}] {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Khối lượng Est</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max={WEEKLY_EST_LIMIT}
                      value={detailDraft.estimatedVolume}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, estimatedVolume: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white font-bold"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Ngày bắt đầu</label>
                    <input
                      type="date"
                      value={detailDraft.startDate}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, startDate: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Ngày kết thúc</label>
                    <input
                      type="date"
                      value={detailDraft.endDate}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, endDate: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Deadline</label>
                    <input
                      type="date"
                      value={detailDraft.deadline}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, deadline: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Part 2 + Self-Assessment + Read-only PM Review */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Part 2 */}
                <div className="lg:col-span-5 p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Phần 2: Hoàn thành &amp; Minh chứng
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Ngày hoàn thành thực tế</label>
                      <input
                        type="date"
                        value={detailDraft.completedAt}
                        onChange={(e) =>
                          setDetailDraft((p) => ({
                            ...p,
                            completedAt: e.target.value,
                            isDone: Boolean(e.target.value) || p.isDone,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Trạng thái</label>
                      <select
                        value={detailDraft.status}
                        onChange={(e) => setDetailDraft((p) => ({ ...p, status: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detailDraft.isDone}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDetailDraft((p) => ({
                          ...p,
                          isDone: checked,
                          completedAt: checked ? p.completedAt || defaultDate : '',
                        }));
                      }}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span>Xong (Đã hoàn tất thực hiện)</span>
                  </label>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600">
                        File đính kèm ({detailDraft.attachments.length})
                      </span>
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer">
                        <Upload className="w-3 h-3 text-blue-600" />
                        <span>{uploadingFor === selectedTask.id ? 'Đang tải...' : '+ Tải file'}</span>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={handleUploadForSelected}
                          disabled={uploadingFor === selectedTask.id}
                        />
                      </label>
                    </div>
                    {detailDraft.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {detailDraft.attachments.map((att) => (
                          <div
                            key={att.id || att.url}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-200 text-[11px] text-blue-800"
                          >
                            <Paperclip className="w-3 h-3" />
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline max-w-[150px] truncate"
                            >
                              {att.name}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setDetailDraft((p) => ({
                                  ...p,
                                  attachments: p.attachments.filter((x) => x.id !== att.id),
                                }))
                              }
                              className="text-rose-500 hover:text-rose-700 ml-0.5"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={detailDraft.deliverableUrl}
                        onChange={(e) => setDetailDraft((p) => ({ ...p, deliverableUrl: e.target.value }))}
                        placeholder="Link minh chứng (PR, GitLab, Docs...)"
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                      />
                      {detailDraft.deliverableUrl && (
                        <a
                          href={detailDraft.deliverableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50"
                          title="Mở link minh chứng"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Self Assessment */}
                <div className="lg:col-span-4 p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
                    Nhân viên Tự đánh giá
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Tiến độ (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={detailDraft.selfProgress}
                        onChange={(e) => setDetailDraft((p) => ({ ...p, selfProgress: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Xếp loại</label>
                      <select
                        value={detailDraft.selfKpiRating}
                        onChange={(e) => {
                          const rating = e.target.value;
                          const preset = SELF_RATINGS.find((r) => r.value === rating);
                          setDetailDraft((p) => ({
                            ...p,
                            selfKpiRating: rating,
                            selfScore: preset ? preset.defaultScore : p.selfScore,
                          }));
                        }}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                      >
                        {SELF_RATINGS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Tự chấm</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={detailDraft.selfScore}
                        onChange={(e) => setDetailDraft((p) => ({ ...p, selfScore: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-bold text-blue-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Ghi chú tự đánh giá / Giải trình
                    </label>
                    <textarea
                      rows={4}
                      value={detailDraft.selfNote}
                      onChange={(e) => setDetailDraft((p) => ({ ...p, selfNote: e.target.value }))}
                      placeholder="Mô tả kết quả đạt được, khó khăn, minh chứng đi kèm..."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Read-only PM / Director Evaluation */}
                <div className="lg:col-span-3 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-purple-600" />
                      PM / Lãnh đạo
                    </span>
                    <span className="text-xs font-extrabold text-indigo-700">
                      KPI: {selectedTask.finalKpiScore ?? 0}/100
                    </span>
                  </div>
                  <div>
                    <span
                      className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        (PM_QUALITY_LABELS[selectedTask.pmQualityRating || 'pending'] || PM_QUALITY_LABELS.pending)
                          .badge
                      }`}
                    >
                      {(PM_QUALITY_LABELS[selectedTask.pmQualityRating || 'pending'] || PM_QUALITY_LABELS.pending)
                        .label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Điểm thẩm định:{' '}
                    <strong className="text-slate-900">
                      {selectedTask.pmQualityScore != null && selectedTask.pmQualityScore > 0
                        ? `${selectedTask.pmQualityScore}/100`
                        : 'Chưa chấm'}
                    </strong>
                  </div>
                  {selectedTask.pmReviewerName && (
                    <div className="text-[11px] text-slate-500">
                      Người đánh giá: <strong className="text-slate-700">{selectedTask.pmReviewerName}</strong>
                    </div>
                  )}
                  <div className="text-xs text-slate-600 bg-white rounded-lg p-2.5 border border-slate-200 min-h-[84px]">
                    <div className="text-[10px] font-semibold text-slate-400 mb-0.5">Nhận xét:</div>
                    {selectedTask.pmFeedback ? (
                      <p className="text-slate-800">{selectedTask.pmFeedback}</p>
                    ) : (
                      <p className="italic text-slate-400">Chưa có nhận xét từ PM/Lãnh đạo.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <div>
                {selectedTask.pmQualityRating === 'pending' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(selectedTask)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa task
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeTaskDetail}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={savingDetail}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingDetail ? 'Đang lưu...' : 'Lưu Task & Tự đánh giá'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
