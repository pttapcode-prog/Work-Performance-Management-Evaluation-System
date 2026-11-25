import React, { useEffect, useState } from 'react';
import {
  X,
  Brain,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Award,
  FolderKanban,
  Sparkles,
  TrendingUp,
  Paperclip,
} from 'lucide-react';
import { api } from '../api/client.js';

const PM_QUALITY_BADGE = {
  excellent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  good: 'bg-blue-50 text-blue-700 border-blue-200',
  rework: 'bg-amber-50 text-amber-700 border-amber-200',
  poor: 'bg-rose-50 text-rose-700 border-rose-200',
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PM_QUALITY_TEXT = {
  excellent: 'Xuất sắc',
  good: 'Đạt chuẩn',
  rework: 'Cần sửa lại (Rework)',
  poor: 'Chưa đạt chất lượng',
  pending: 'Chờ PM đánh giá',
};

const STATUS_TEXT = {
  pending_review: 'Chờ đánh giá',
  completed: 'Đã hoàn thành',
  cancelled: 'Hủy',
};

export default function EmployeeDetailModal({ userId, weekId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scopeWeek, setScopeWeek] = useState(weekId || '2026-W47');

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    setError('');
    api
      .getEmployee360(userId, scopeWeek)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, scopeWeek]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            {data?.user ? (
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm"
                style={{ backgroundColor: data.user.color || '#3370FF' }}
              >
                {data.user.avatar}
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-slate-200 animate-pulse" />
            )}
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                {data?.user?.name || 'Đang tải hồ sơ 360°...'}
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Hồ sơ Công việc 360°
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {data?.user?.title} • {data?.user?.department} • {data?.user?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={scopeWeek}
              onChange={(e) => setScopeWeek(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="2026-W47">Tuần 47 (Hiện tại)</option>
              <option value="2026-W46">Tuần 46</option>
              <option value="all">Tất cả các tuần</option>
            </select>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-16 text-center text-slate-500 text-sm">
              Đang tổng hợp dữ liệu công việc & phân tích AI 360°...
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm">
              Lỗi: {error}
            </div>
          )}

          {!loading && data && (
            <>
              {/* KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-blue-600" /> KPI Tổng hợp
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {data.metrics.finalKpi}
                    <span className="text-xs font-normal text-slate-400"> /100</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Hoàn thành
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {data.metrics.completedTasks}
                    <span className="text-xs font-normal text-slate-400">/{data.metrics.totalTasks} tasks</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-600" /> Chậm Deadline
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      data.metrics.lateCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {data.metrics.lateCount}
                    <span className="text-xs font-normal text-slate-400"> tasks</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Chưa đạt CL
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      data.metrics.lowQualityCount > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {data.metrics.lowQualityCount}
                    <span className="text-xs font-normal text-slate-400"> tasks</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-600" /> Tự chấm vs PM
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {data.metrics.avgSelfScore}
                    <span className="text-slate-400 font-normal mx-1">/</span>
                    <span className="text-blue-600">
                      {data.metrics.avgPmScore !== null ? data.metrics.avgPmScore : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI 360 Narrative Card */}
              <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-white p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
                  <Brain className="w-4 h-4 text-blue-600" />
                  Đánh giá Hiệu suất AI 360° ({data.weekLabel})
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{data.aiAnalysis.narrative}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white/90 rounded-lg p-3 border border-emerald-200">
                    <div className="text-xs font-semibold text-emerald-700 mb-1.5">✅ Điểm mạnh ghi nhận</div>
                    <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                      {data.aiAnalysis.strengths.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white/90 rounded-lg p-3 border border-rose-200">
                    <div className="text-xs font-semibold text-rose-700 mb-1.5">⚠️ Vấn đề / Rủi ro phát hiện</div>
                    {data.aiAnalysis.risks.length === 0 ? (
                      <p className="text-xs text-slate-500">Không phát hiện rủi ro chất lượng hay tiến độ.</p>
                    ) : (
                      <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                        {data.aiAnalysis.risks.map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="bg-white/90 rounded-lg p-3 border border-blue-200">
                    <div className="text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Khuyến nghị hành động
                    </div>
                    <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside">
                      {data.aiAnalysis.nextActions.map((a, idx) => (
                        <li key={idx}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Project Breakdown */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-blue-600" />
                  Chi tiết Công việc theo từng Dự án (Khối lượng Est: {data.metrics.totalEstVolume ?? data.metrics.weeklyEstUsed ?? 0} / 5)
                </h3>

                {data.projectBreakdown.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm">
                    Nhân sự chưa log task nào trong giai đoạn này.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.projectBreakdown.map((proj) => (
                      <div key={proj.projectId} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: proj.projectColor }}
                            />
                            <span className="font-semibold text-sm text-slate-800">{proj.projectName}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-mono">
                              {proj.projectCode}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600">
                            {proj.tasks.length} tasks • <strong>Est: {proj.estVolume ?? Number((proj.tasks || []).reduce((s, t) => s + Number(t.estimatedVolume || 0), 0).toFixed(2))}</strong>
                          </div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {proj.tasks.map((task) => (
                            <div key={task.id} className="p-3.5 hover:bg-slate-50/70 transition space-y-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="font-medium text-sm text-slate-900 flex flex-wrap items-center gap-2">
                                    <span>{task.title}</span>
                                    {task.deliverableUrl && (
                                      <a
                                        href={task.deliverableUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                      >
                                        <ExternalLink className="w-3 h-3" /> Minh chứng
                                      </a>
                                    )}
                                    {(task.attachments || []).map((att) => (
                                      <a
                                        key={att.id || att.url}
                                        href={att.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:underline"
                                      >
                                        <Paperclip className="w-3 h-3" /> {att.name}
                                      </a>
                                    ))}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {task.weekLabel} • Est: <strong>{task.estimatedVolume ?? 1}</strong> •
                                    Bắt đầu: {task.startDate || '—'} • Kết thúc: {task.endDate || '—'} •
                                    Deadline: {task.deadline} • Thực tế: {task.completedAt || (task.isDone ? 'Đã xong' : 'Chưa')}
                                    {task.isLate ? (
                                      <span className="ml-2 text-rose-600 font-semibold">
                                        (🔴 Trễ {task.daysLate} ngày)
                                      </span>
                                    ) : (
                                      <span className="ml-2 text-emerald-600 font-medium">(🟢 Đúng hạn)</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                    {STATUS_TEXT[task.status] || task.status} ({task.selfProgress}%)
                                  </span>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-md border font-medium ${
                                      PM_QUALITY_BADGE[task.pmQualityRating]
                                    }`}
                                  >
                                    PM: {PM_QUALITY_TEXT[task.pmQualityRating]}
                                    {task.pmQualityScore !== null ? ` (${task.pmQualityScore}đ)` : ''}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                                    KPI: {task.finalKpiScore}đ
                                  </span>
                                </div>
                              </div>

                              {(task.selfNote || task.pmFeedback) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
                                  {task.selfNote && (
                                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 text-slate-700">
                                      <span className="font-semibold text-slate-600">Cá nhân tự giải trình: </span>
                                      {task.selfNote} (Tự chấm: {task.selfScore}đ)
                                    </div>
                                  )}
                                  {task.pmFeedback && (
                                    <div
                                      className={`rounded-lg p-2 border ${
                                        task.isLowQuality
                                          ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                                          : 'bg-blue-50/60 border-blue-200 text-slate-700'
                                      }`}
                                    >
                                      <span className="font-semibold">PM Nhận xét: </span>
                                      {task.pmFeedback}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
