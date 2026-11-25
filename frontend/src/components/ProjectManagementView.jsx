import React, { useState } from 'react';
import {
  FolderPlus,
  Users,
  UserPlus,
  CheckCircle2,
  Lock,
  Shield,
  X,
} from 'lucide-react';
import { api } from '../api/client.js';

const PROJECT_COLORS = ['#3370FF', '#00B365', '#7A35F0', '#F57C00', '#E11D48', '#0284C7'];

const PROJECT_ROLES = [
  { value: 'PM', label: 'PM (Quản lý dự án)', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'DEV', label: 'DEV (Lập trình viên)', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'BA', label: 'BA (Phân tích nghiệp vụ)', badge: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'TEST', label: 'TEST (Kiểm thử / QA)', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
];

function getProjectRoleMeta(role) {
  return (
    PROJECT_ROLES.find((r) => r.value === role) || {
      value: role,
      label: role,
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
    }
  );
}

export default function ProjectManagementView({
  projects,
  allCompanyProjects,
  users,
  summary,
  currentUser,
  currentCompany,
  permissions,
  onCreateProject,
  onUpdateProjectMembers,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editMembersMap, setEditMembersMap] = useState({}); // { [userId]: 'PM' | 'DEV' | 'BA' | 'TEST' }
  const [notice, setNotice] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const [newProj, setNewProj] = useState({
    name: '',
    code: '',
    client: '',
    description: '',
    color: '#3370FF',
    membersMap: {}, // { [userId]: 'PM' | 'DEV' | 'BA' | 'TEST' }
  });

  const canAssignPm = Boolean(permissions?.canAssignProjectPm || currentUser?.role === 'DIRECTOR');
  const rawProjects = allCompanyProjects?.length ? allCompanyProjects : projects;

  const isPmOfProject = (proj) => {
    if (currentUser?.role === 'DIRECTOR') return true;
    const entry = (proj.members || []).find((m) => m.userId === currentUser?.id);
    return entry?.projectRole === 'PM' || proj.pmId === currentUser?.id;
  };

  const displayProjects =
    currentUser?.role === 'DIRECTOR'
      ? rawProjects
      : rawProjects.filter((p) => permissions?.pmProjectIds?.includes(p.id) || isPmOfProject(p));

  const openMembersModal = (proj) => {
    const initialMap = {};
    (proj.members || []).forEach((m) => {
      initialMap[m.userId] = m.projectRole || 'DEV';
    });
    setEditingProject(proj);
    setEditMembersMap(initialMap);
    setErrMsg('');
    api.getProjectDetail(proj.id, { action: 'open_members_modal' }).catch(() => {});
    api.getUsers({ action: 'open_members_modal', projectId: proj.id }).catch(() => {});
  };

  const toggleEditMember = (uid) => {
    setEditMembersMap((prev) => {
      if (!canAssignPm && prev[uid] === 'PM') {
        return prev;
      }
      const next = { ...prev };
      if (next[uid]) {
        delete next[uid];
      } else {
        next[uid] = 'DEV';
      }
      return next;
    });
  };

  const setEditMemberRole = (uid, role) => {
    if (!canAssignPm && role === 'PM') return;
    setEditMembersMap((prev) => {
      if (!canAssignPm && prev[uid] === 'PM') return prev;
      return {
        ...prev,
        [uid]: role,
      };
    });
  };

  const toggleNewProjMember = (uid) => {
    setNewProj((prev) => {
      const nextMap = { ...prev.membersMap };
      if (nextMap[uid]) {
        delete nextMap[uid];
      } else {
        nextMap[uid] = 'DEV';
      }
      return { ...prev, membersMap: nextMap };
    });
  };

  const setNewProjMemberRole = (uid, role) => {
    setNewProj((prev) => ({
      ...prev,
      membersMap: { ...prev.membersMap, [uid]: role },
    }));
  };

  const handleSaveMembers = async () => {
    if (!editingProject) return;
    try {
      setErrMsg('');
      const members = Object.entries(editMembersMap).map(([userId, projectRole]) => ({
        userId,
        projectRole,
      }));
      await onUpdateProjectMembers(editingProject.id, { members });
      setNotice(`Đã cập nhật thành viên & phân role dự án cho "${editingProject.name}"!`);
      setEditingProject(null);
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      setErrMsg(err.message);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      setErrMsg('');
      const members = Object.entries(newProj.membersMap).map(([userId, projectRole]) => ({
        userId,
        projectRole,
      }));
      await onCreateProject({
        name: newProj.name,
        code: newProj.code,
        client: newProj.client,
        description: newProj.description,
        color: newProj.color,
        members,
      });
      setNotice(`Đã tạo dự án mới "${newProj.name}" và phân role thành công!`);
      setNewProj({
        name: '',
        code: '',
        client: '',
        description: '',
        color: '#3370FF',
        membersMap: {},
      });
      setShowCreateModal(false);
      setTimeout(() => setNotice(''), 3500);
    } catch (err) {
      setErrMsg(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Quản lý Dự án & Chia Role Dự án (PM / DEV / BA / TEST) — {currentCompany?.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <strong>Lãnh đạo</strong> tạo dự án mới và chỉ định{' '}
            <span className="font-semibold text-purple-700">PM</span> cùng thành viên tham gia.{' '}
            <strong>PM dự án</strong> thêm/gỡ nhân viên và chia vai trò{' '}
            <span className="font-semibold text-blue-700">DEV</span>,{' '}
            <span className="font-semibold text-pink-700">BA</span>,{' '}
            <span className="font-semibold text-amber-700">TEST</span> trong dự án phụ trách.
          </p>
        </div>

        <div>
          {permissions?.canCreateProject ? (
            <button
              onClick={() => {
                setErrMsg('');
                setShowCreateModal(true);
                api.getUsers({ action: 'open_create_project_modal' }).catch(() => {});
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-[#3370FF] hover:bg-[#245BDB] text-white shadow-sm transition"
            >
              <FolderPlus className="w-4 h-4" /> Tạo Dự án mới
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
              <Lock className="w-3.5 h-3.5 text-amber-600" /> Chỉ Lãnh đạo được tạo Dự án mới & chỉ định PM
            </span>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {notice}
        </div>
      )}
      {errMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {errMsg}
        </div>
      )}

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayProjects.map((proj) => {
          const membersDetailed = (proj.members || [])
            .map((m) => {
              const userObj = users.find((u) => u.id === m.userId);
              if (!userObj) return null;
              return { ...userObj, projectRole: m.projectRole };
            })
            .filter(Boolean);

          const pmMembers = membersDetailed.filter((m) => m.projectRole === 'PM');
          const projStat = summary?.projectSummaries?.find((p) => p.projectId === proj.id);
          const canManageThis = isPmOfProject(proj);

          return (
            <div
              key={proj.id}
              className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs"
                      style={{ backgroundColor: proj.color }}
                    >
                      {proj.code}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{proj.name}</h3>
                      <p className="text-[11px] text-slate-500">Khách hàng: {proj.client}</p>
                    </div>
                  </div>
                  {projStat && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                      {projStat.totalTasks} tasks • KPI {projStat.avgKpi}
                    </span>
                  )}
                </div>

                {proj.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{proj.description}</p>
                )}

                {/* PM Strip */}
                <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-200 text-xs flex items-center justify-between">
                  <span className="font-semibold text-purple-900 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-purple-700" /> PM Phụ trách dự án:
                  </span>
                  <span className="font-bold text-purple-950">
                    {pmMembers.length > 0 ? pmMembers.map((p) => p.name).join(', ') : 'Chưa gán PM'}
                  </span>
                </div>

                {/* Members & their individual Project Roles */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Nhân sự & Role trong dự án ({membersDetailed.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {membersDetailed.map((m) => {
                      const roleMeta = getProjectRoleMeta(m.projectRole);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                              style={{ backgroundColor: m.color }}
                            >
                              {m.avatar}
                            </span>
                            <span className="font-medium text-slate-800 truncate">{m.name}</span>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${roleMeta.badge}`}
                          >
                            {m.projectRole}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">ID: {proj.id}</span>
                {canManageThis ? (
                  <button
                    onClick={() => openMembersModal(proj)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Thêm Thành viên & Chia Role (PM/DEV/BA/TEST)
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Chỉ PM của dự án hoặc Lãnh đạo được phân role
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Tạo Dự án mới & Phân Role Thành viên — {currentCompany?.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Tên dự án *</label>
                <input
                  type="text"
                  required
                  value={newProj.name}
                  onChange={(e) => setNewProj({ ...newProj, name: e.target.value })}
                  placeholder="VD: TN-AI Chatbot Portal"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Mã dự án *</label>
                <input
                  type="text"
                  required
                  value={newProj.code}
                  onChange={(e) => setNewProj({ ...newProj, code: e.target.value.toUpperCase() })}
                  placeholder="VD: AICHT"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Khách hàng / Đơn vị</label>
                <input
                  type="text"
                  value={newProj.client}
                  onChange={(e) => setNewProj({ ...newProj, client: e.target.value })}
                  placeholder="VD: Tập đoàn ABC / Nội bộ"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Màu nhận diện</label>
                <div className="flex gap-2 py-1.5">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setNewProj({ ...newProj, color: c })}
                      className={`w-6 h-6 rounded-full border-2 ${
                        newProj.color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-slate-600 mb-1">Mô tả ngắn</label>
                <input
                  type="text"
                  value={newProj.description}
                  onChange={(e) => setNewProj({ ...newProj, description: e.target.value })}
                  placeholder="Mục tiêu và phạm vi dự án..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-slate-600 mb-1.5">
                  Chọn nhân sự công ty & Chia Role trong Dự án (PM / DEV / BA / TEST)
                </label>
                <div className="space-y-1.5 max-h-52 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  {users.map((u) => {
                    const assignedRole = newProj.membersMap[u.id];
                    const isChecked = Boolean(assignedRole);
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200"
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleNewProjMember(u.id)}
                          />
                          <span className="font-semibold text-slate-800">{u.name}</span>
                          <span className="text-[10px] text-slate-400">
                            ({u.role === 'DIRECTOR' ? 'Lãnh đạo' : 'Nhân viên'})
                          </span>
                        </label>
                        {isChecked && (
                          <select
                            value={assignedRole}
                            onChange={(e) => setNewProjMemberRole(u.id, e.target.value)}
                            className="px-2 py-1 rounded border border-slate-300 text-xs font-bold bg-slate-50"
                          >
                            {PROJECT_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#3370FF] text-white hover:bg-[#245BDB]"
              >
                Tạo Dự án
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANAGE PROJECT MEMBERS & ROLES MODAL */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Phân công & Chia Role Dự án: {editingProject.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {canAssignPm
                    ? `Chọn nhân sự thuộc ${currentCompany?.name} để chỉ định PM và các thành viên (DEV, BA, TEST).`
                    : `Bạn đang thêm/cập nhật nhân viên (DEV, BA, TEST) cho dự án. Chỉ Lãnh đạo được thay đổi PM.`}
                </p>
              </div>
              <button
                onClick={() => setEditingProject(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {users.map((u) => {
                const assignedRole = editMembersMap[u.id];
                const isAdded = Boolean(assignedRole);
                const roleMeta = isAdded ? getProjectRoleMeta(assignedRole) : null;
                const isLockedPmRow = !canAssignPm && assignedRole === 'PM';
                const selectableRoles = PROJECT_ROLES.filter((r) => canAssignPm || r.value !== 'PM');

                return (
                  <div
                    key={u.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition ${
                      isAdded ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.avatar}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-slate-900 truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {u.role === 'DIRECTOR' ? 'Lãnh đạo CTy' : 'Nhân viên CTy'} • {u.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isAdded && (
                        isLockedPmRow ? (
                          <span className={`px-2.5 py-1.5 rounded-lg border font-bold text-xs ${roleMeta.badge}`}>
                            PM (Khóa)
                          </span>
                        ) : (
                          <select
                            value={assignedRole}
                            onChange={(e) => setEditMemberRole(u.id, e.target.value)}
                            className={`px-2 py-1.5 rounded-lg border font-bold text-xs ${roleMeta.badge}`}
                          >
                            {selectableRoles.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.value}
                              </option>
                            ))}
                          </select>
                        )
                      )}
                      {isLockedPmRow ? (
                        <span className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-semibold inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Do Lãnh đạo chỉ định
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleEditMember(u.id)}
                          className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                            isAdded
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-700'
                              : 'bg-slate-100 text-slate-700 hover:bg-blue-600 hover:text-white'
                          }`}
                        >
                          {isAdded ? '✓ Đang tham gia (Gỡ)' : '+ Thêm vào dự án'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSaveMembers}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#3370FF] text-white hover:bg-[#245BDB]"
              >
                Lưu Thành viên & Role Dự án
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
