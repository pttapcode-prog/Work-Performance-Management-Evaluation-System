import React from 'react';
import { FolderGit2, Users, UserCheck, Building2, CalendarDays, CheckCircle2, Clock } from 'lucide-react';

const PROJECT_ROLE_META = {
  PM: { label: 'PM (Quản lý dự án)', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
  DEV: { label: 'DEV (Lập trình viên)', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  BA: { label: 'BA (Phân tích nghiệp vụ)', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
  TEST: { label: 'TEST (Kiểm thử / QA)', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
};

export default function EmployeeProjectsView({
  projects = [],
  users = [],
  tasks = [],
  currentUser,
  currentCompany,
  selectedWeekId,
}) {
  const myProjects = projects.filter((proj) => {
    const memberIds = (proj.members || []).map((m) => m.userId);
    return memberIds.includes(currentUser?.id) || proj.pmId === currentUser?.id;
  });

  const displayList = myProjects.length > 0 ? myProjects : projects;

  const getUserById = (id) => users.find((u) => u.id === id);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            <Building2 className="w-3.5 h-3.5" />
            {currentCompany?.name || 'Doanh nghiệp'}
          </div>
          <h2 className="text-xl font-bold text-slate-900">Danh sách Dự án tham gia</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Bạn đang tham gia <span className="font-semibold text-slate-800">{displayList.length}</span> dự án.
            Chế độ xem thông tin dự án và vai trò phân công (chỉ đọc).
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span>Tài khoản nhân viên: <strong className="text-slate-900">{currentUser?.name}</strong></span>
        </div>
      </div>

      {displayList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <FolderGit2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Bạn chưa được phân công vào dự án nào.</p>
          <p className="text-xs text-slate-500 mt-1">
            Vui lòng liên hệ Lãnh đạo hoặc PM dự án để được thêm vào dự án phù hợp.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayList.map((proj) => {
            const members = proj.members || [];
            const myMember = members.find((m) => m.userId === currentUser?.id);
            const myRole = myMember?.projectRole || (proj.pmId === currentUser?.id ? 'PM' : 'DEV');
            const roleMeta = PROJECT_ROLE_META[myRole] || {
              label: myRole,
              badge: 'bg-slate-100 text-slate-700 border-slate-200',
            };

            const pmMember = members.find((m) => m.projectRole === 'PM');
            const pmUser = getUserById(pmMember?.userId || proj.pmId);

            const myProjectTasks = tasks.filter(
              (t) =>
                t.projectId === proj.id &&
                t.assigneeId === currentUser?.id &&
                (!selectedWeekId || selectedWeekId === 'all' || t.weekId === selectedWeekId)
            );
            const activeTasks = myProjectTasks.filter((t) => t.status !== 'cancelled');
            const doneTasks = activeTasks.filter((t) => t.status === 'completed' || t.isDone);
            const pendingTasks = activeTasks.filter((t) => t.status === 'pending_review');
            const estTotal = activeTasks.reduce((sum, t) => sum + Number(t.estimatedVolume || 0), 0);

            return (
              <div
                key={proj.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
              >
                <div
                  className="h-2 w-full"
                  style={{ backgroundColor: proj.color || '#3370FF' }}
                />
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 mb-1.5">
                          {proj.code || proj.id}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {proj.name}
                        </h3>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${roleMeta.badge}`}
                      >
                        {myRole}
                      </span>
                    </div>

                    {proj.client && (
                      <div className="text-xs text-slate-500">
                        Khách hàng / Đơn vị: <span className="font-medium text-slate-700">{proj.client}</span>
                      </div>
                    )}

                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {proj.description || 'Chưa có mô tả chi tiết cho dự án này.'}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                        PM phụ trách:
                      </span>
                      <span className="font-semibold text-slate-800">
                        {proj.pmName || (pmUser ? pmUser.name : 'Chưa chỉ định')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        Thành viên dự án:
                      </span>
                      <span className="font-medium text-slate-700">
                        {members.length} nhân sự
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                        <div className="text-[10px] text-slate-500">Vai trò</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">{myRole}</div>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                        <div className="text-[10px] text-emerald-700 flex items-center justify-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Hoàn thành
                        </div>
                        <div className="text-xs font-bold text-emerald-800 mt-0.5">
                          {doneTasks.length}/{activeTasks.length}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-100">
                        <div className="text-[10px] text-blue-700 flex items-center justify-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> Est tuần
                        </div>
                        <div className="text-xs font-bold text-blue-800 mt-0.5">
                          {Number(estTotal.toFixed(1))}
                        </div>
                      </div>
                    </div>

                    {pendingTasks.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                        <span>Có {pendingTasks.length} task đang chờ đánh giá trong tuần chọn</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
