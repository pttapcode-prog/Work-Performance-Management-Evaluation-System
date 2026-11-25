import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Plus,
  CheckCircle2,
  Clock,
  Save,
  Wand2,
  AlertCircle,
  FolderKanban,
} from 'lucide-react';
import { api } from '../api/client.js';

const SELF_RATINGS = [
  { value: 'exceed', label: 'Vượt mức (110%)', score: 105 },
  { value: 'met', label: 'Đạt KPI (100%)', score: 95 },
  { value: 'partial', label: 'Đạt một phần (70%)', score: 70 },
  { value: 'unmet', label: 'Chưa đạt (<50%)', score: 45 },
];

export default function SelfAssessmentView({
  tasks,
  projects,
  users,
  weeks,
  currentUser,
  permissions,
  selectedWeekId,
  onCreateTask,
  onCreateTasksBulk,
  onUpdateTask,
}) {
  const members = users.filter((u) => u.role === 'MEMBER');
  const isPersonalOnly = !permissions?.canReviewQuality;
  const defaultMemberId = isPersonalOnly ? currentUser?.id || '' : members[0]?.id || currentUser?.id || '';

  const [activeMemberId, setActiveMemberId] = useState(defaultMemberId);
  const effectiveMemberId = isPersonalOnly
    ? currentUser.id
    : members.some((m) => m.id === activeMemberId)
    ? activeMemberId
    : members[0]?.id || '';
  const activeMember = users.find((u) => u.id === effectiveMemberId) || members[0];

  // AI Smart Logger state
  const [aiInput, setAiInput] = useState(
    'Hoàn thiện API xuất báo cáo KPI tuần dự án WPMES hết 8h deadline thứ 6; và kiểm tra giao diện mobile form đăng ký dự án TN-SmartGov 6h hạn 2026-11-21'
  );
  const [aiDrafts, setAiDrafts] = useState([]);
  const [parsingAi, setParsingAi] = useState(false);

  // Manual Quick Log state
  const [manualForm, setManualForm] = useState({
    projectId: projects[0]?.id || 'PRJ-WPMES',
    title: '',
    estimatedHours: 6,
    deadline: '2026-11-21',
    category: 'Feature',
    deliverableUrl: '',
  });

  // Local edits for end-of-week self assessment
  const [editingSelf, setEditingSelf] = useState({});
  const [savedNotice, setSavedNotice] = useState('');

  const myTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        t.assigneeId === effectiveMemberId &&
        (selectedWeekId === 'all' || t.weekId === selectedWeekId)
    );
  }, [tasks, effectiveMemberId, selectedWeekId]);

  const myStats = useMemo(() => {
    const total = myTasks.length;
    const done = myTasks.filter((t) => t.status === 'done').length;
    const est = myTasks.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0);
    const act = myTasks.reduce((s, t) => s + (Number(t.actualHours) || 0), 0);
    const avgSelf =
      total > 0 ? Math.round(myTasks.reduce((s, t) => s + (Number(t.selfScore) || 0), 0) / total) : 0;
    const late = myTasks.filter((t) => t.isLate).length;
    return { total, done, est, act, avgSelf, late };
  }, [myTasks]);

  const handleParseAi = async () => {
    if (!aiInput.trim()) return;
    setParsingAi(true);
    try {
      const res = await api.parseSmartTasks(aiInput, selectedWeekId, effectiveMemberId);
      setAiDrafts(res.drafts || []);
    } finally {
      setParsingAi(false);
    }
  };

  const handleConfirmAiDrafts = async () => {
    if (aiDrafts.length === 0) return;
    await onCreateTasksBulk(aiDrafts);
    setAiDrafts([]);
    setAiInput('');
    setSavedNotice(`Đã log thành công ${aiDrafts.length} công việc từ AI Smart Logger!`);
    setTimeout(() => setSavedNotice(''), 3000);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualForm.title.trim()) return;
    const validProjectId = projects.some((p) => p.id === manualForm.projectId)
      ? manualForm.projectId
      : projects[0]?.id || '';
    if (!validProjectId) return;
    await onCreateTask({
      ...manualForm,
      projectId: validProjectId,
      weekId: selectedWeekId === 'all' ? '2026-W47' : selectedWeekId,
      assigneeId: effectiveMemberId,
      status: 'todo',
    });
    setManualForm((prev) => ({ ...prev, title: '', deliverableUrl: '' }));
    setSavedNotice('Đã thêm công việc mới vào tuần làm việc!');
    setTimeout(() => setSavedNotice(''), 3000);
  };

  const getFieldVal = (task, field) => {
    if (editingSelf[task.id] && editingSelf[task.id][field] !== undefined) {
      return editingSelf[task.id][field];
    }
    return task[field];
  };

  const setFieldVal = (taskId, field, value) => {
    setEditingSelf((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveSelfRow = async (task) => {
    const patch = editingSelf[task.id];
    if (!patch) return;
    await onUpdateTask(task.id, patch);
    setEditingSelf((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setSavedNotice(`Đã lưu tự đánh giá KPI cho task "${task.title}"!`);
    setTimeout(() => setSavedNotice(''), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Banner & Member selector */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base"
            style={{ backgroundColor: activeMember?.color || '#3370FF' }}
          >
            {activeMember?.avatar}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Không gian Cá nhân Log Task & Tự đánh giá KPI Cuối tuần
            </h2>
            <p className="text-xs text-slate-500">
              {activeMember?.name} ({activeMember?.title}) •{' '}
              {weeks.find((w) => w.id === selectedWeekId)?.label || 'Tất cả các tuần'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isPersonalOnly && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Xem theo nhân sự:</span>
              <select
                value={effectiveMemberId}
                onChange={(e) => setActiveMemberId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-800 bg-white"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.title})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span>
              Hoàn thành: <strong className="text-emerald-700">{myStats.done}/{myStats.total}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span>
              Giờ: <strong>{myStats.act}h / {myStats.est}h</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span>
              Tự chấm TB: <strong className="text-blue-700">{myStats.avgSelf}đ</strong>
            </span>
          </div>
        </div>
      </div>

      {savedNotice && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedNotice}
        </div>
      )}

      {/* Two columns: AI Smart Task Logger + Manual Quick Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* AI Smart Task Logger */}
        <div className="lg:col-span-7 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white rounded-xl border border-blue-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#3370FF] text-white flex items-center justify-center">
                <Wand2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">AI Smart Task Logger (Log nhanh bằng ngôn ngữ tự nhiên)</h3>
                <p className="text-[11px] text-slate-500">
                  Nhập mô tả tự nhiên kèm tên dự án, số giờ và deadline — AI tự tách thành các dòng Task chuẩn.
                </p>
              </div>
            </div>
          </div>

          <textarea
            rows={2}
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="VD: Làm API thanh toán dự án TN-ERP 8h deadline thứ 5; sửa lỗi responsive dự án TN-SmartGov 4h hạn 2026-11-21"
            className="w-full text-xs p-3 rounded-xl border border-blue-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Hỗ trợ nhận diện: <code className="bg-white px-1 rounded border">WPMES</code>,{' '}
              <code className="bg-white px-1 rounded border">TN-EduLMS</code>,{' '}
              <code className="bg-white px-1 rounded border">TN-SmartGov</code>,{' '}
              <code className="bg-white px-1 rounded border">TN-ERP</code>, số giờ (8h), ngày (thứ 6, 2026-11-21).
            </span>
            <button
              onClick={handleParseAi}
              disabled={parsingAi || !aiInput.trim()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-[#3370FF] hover:bg-[#245BDB] text-white shadow-sm disabled:opacity-50 transition"
            >
              <Sparkles className="w-3.5 h-3.5" /> {parsingAi ? 'AI đang tách...' : 'AI Bóc tách Task'}
            </button>
          </div>

          {aiDrafts.length > 0 && (
            <div className="bg-white rounded-xl border border-blue-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800">
                  AI đã bóc tách {aiDrafts.length} đầu việc dự kiến:
                </span>
                <button
                  onClick={handleConfirmAiDrafts}
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"
                >
                  ✅ Xác nhận thêm tất cả
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {aiDrafts.map((d) => (
                  <div key={d.tempId} className="py-1.5 flex items-center justify-between text-xs gap-2">
                    <div>
                      <span className="font-semibold text-blue-700 mr-1.5">[{d.projectName}]</span>
                      <span className="text-slate-800 font-medium">{d.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 shrink-0">
                      {d.estimatedHours}h • Hạn {d.deadline}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manual Quick Log */}
        <form
          onSubmit={handleManualSubmit}
          className="lg:col-span-5 bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm space-y-3"
        >
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-blue-600" /> Log nhanh 1 đầu việc theo Dự án
          </h3>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Dự án</label>
              <select
                value={manualForm.projectId}
                onChange={(e) => setManualForm({ ...manualForm, projectId: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Deadline cam kết</label>
              <input
                type="date"
                value={manualForm.deadline}
                onChange={(e) => setManualForm({ ...manualForm, deadline: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-600 font-medium mb-1">Tên đầu việc *</label>
              <input
                type="text"
                required
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                placeholder="VD: Thiết kế API xuất báo cáo..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Giờ định mức</label>
              <input
                type="number"
                min={1}
                value={manualForm.estimatedHours}
                onChange={(e) => setManualForm({ ...manualForm, estimatedHours: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Link kết quả (nếu có)</label>
              <input
                type="text"
                value={manualForm.deliverableUrl}
                onChange={(e) => setManualForm({ ...manualForm, deliverableUrl: e.target.value })}
                placeholder="https://git.trinam.vn/..."
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
          >
            + Thêm công việc vào Bảng tuần
          </button>
        </form>
      </div>

      {/* End-of-week Self Assessment Cards */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-blue-600" />
            Danh sách Đầu việc & Form Tự đánh giá KPI Cuối tuần ({myTasks.length} tasks)
          </h3>
          <span className="text-xs text-slate-500">
            Cập nhật % hoàn thành, giờ thực tế, link minh chứng & tự chấm điểm KPI
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {myTasks.map((task) => {
            const hasDirty = Boolean(editingSelf[task.id]);
            const curRating = getFieldVal(task, 'selfKpiRating');
            const curScore = getFieldVal(task, 'selfScore');
            const curProgress = getFieldVal(task, 'selfProgress');
            const curActualHours = getFieldVal(task, 'actualHours');
            const curNote = getFieldVal(task, 'selfNote');
            const curUrl = getFieldVal(task, 'deliverableUrl');
            const curStatus = getFieldVal(task, 'status');

            return (
              <div key={task.id} className="p-4 hover:bg-slate-50/50 transition space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: `${task.projectColor}15`,
                          color: task.projectColor,
                        }}
                      >
                        {task.projectName}
                      </span>
                      <span className="font-bold text-sm text-slate-900">{task.title}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                      <span>Deadline: {task.deadline}</span>
                      {task.isLate ? (
                        <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Trễ {task.daysLate} ngày (Cần giải trình rõ)
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">🟢 Đúng tiến độ</span>
                      )}
                      {task.pmQualityRating !== 'pending' && (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            task.isLowQuality
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          PM đã chấm: {task.pmQualityScore}đ ({task.pmQualityRating})
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleSaveSelfRow(task)}
                    disabled={!hasDirty}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                      hasDirty
                        ? 'bg-[#3370FF] text-white hover:bg-[#245BDB] shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" /> Lưu tự đánh giá
                  </button>
                </div>

                {/* Form Inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Trạng thái</label>
                    <select
                      value={curStatus}
                      onChange={(e) => setFieldVal(task.id, 'status', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="todo">Chưa bắt đầu</option>
                      <option value="in_progress">Đang làm</option>
                      <option value="review">Chờ nghiệm thu</option>
                      <option value="done">Hoàn thành</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">% Tiến độ</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={curProgress}
                      onChange={(e) => setFieldVal(task.id, 'selfProgress', Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Giờ thực tế (Est: {task.estimatedHours}h)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={curActualHours}
                      onChange={(e) => setFieldVal(task.id, 'actualHours', Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Tự xếp loại KPI</label>
                    <select
                      value={curRating}
                      onChange={(e) => {
                        const found = SELF_RATINGS.find((r) => r.value === e.target.value);
                        setFieldVal(task.id, 'selfKpiRating', e.target.value);
                        if (found) setFieldVal(task.id, 'selfScore', found.score);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                      <option value="pending">Chưa tự chấm</option>
                      {SELF_RATINGS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Điểm tự chấm (0-110)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={curScore}
                      onChange={(e) => setFieldVal(task.id, 'selfScore', Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-blue-700"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Link PR / Minh chứng</label>
                    <input
                      type="text"
                      value={curUrl}
                      onChange={(e) => setFieldVal(task.id, 'deliverableUrl', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-6">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Giải trình cá nhân (Kết quả đạt được / Lý do nếu chậm deadline)
                    </label>
                    <input
                      type="text"
                      value={curNote}
                      onChange={(e) => setFieldVal(task.id, 'selfNote', e.target.value)}
                      placeholder="Nhập kết quả thực hiện hoặc giải trình nguyên nhân..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                </div>

                {task.pmFeedback && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                      task.isLowQuality
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-blue-50 border-blue-200 text-blue-900'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Nhận xét từ PM Đỗ Tuấn Hùng: </span>
                      {task.pmFeedback}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
