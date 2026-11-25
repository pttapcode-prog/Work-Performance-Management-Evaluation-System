import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  UserPlus,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Users,
  KeyRound,
  AlertCircle,
  AlertTriangle,
  Pencil,
  Save,
  X,
  Download,
  Upload,
} from 'lucide-react';
import { api } from '../api/client.js';
import ExcelImportModal from './ExcelImportModal.jsx';
import {
  downloadCompanyUsersTemplate,
  parseCompanyUsersExcel,
} from '../utils/excelHelper.js';
import {
  generateAccountDefaults,
  normalizeCompanyCodeSlug,
} from '../utils/accountGenerator.js';

const COMPANY_ROLE_OPTIONS = [
  { value: 'MEMBER', label: 'Nhân viên (MEMBER)' },
  { value: 'DIRECTOR', label: 'Lãnh đạo (DIRECTOR)' },
];

export default function CompanyAdminView({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '123456',
    role: 'MEMBER',
    title: '',
    department: 'Khối Kỹ thuật Phần mềm',
  });
  const [manualFields, setManualFields] = useState({
    username: false,
    email: false,
    password: false,
  });
  const [resetPassMap, setResetPassMap] = useState({});
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Edit User modal state
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({
    name: '',
    email: '',
    role: 'MEMBER',
    title: '',
    department: '',
    status: 'active',
    password: '',
  });
  const [savingUser, setSavingUser] = useState(false);

  // Confirm Delete User popup state
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Excel import modal state
  const [excelModal, setExcelModal] = useState(null);

  const loadAccounts = useCallback(async () => {
    try {
      setErrorMsg('');
      const res = await api.getCompanyAdminUsers();
      setData(res);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const code = data?.currentCompany?.code;
    if (!code) return;
    const slug = normalizeCompanyCodeSlug(code);
    if (!slug) return;
    setForm((prev) => {
      const next = { ...prev };
      if (!manualFields.password && (!prev.password || prev.password === '123456')) {
        next.password = `123456${slug}`;
      }
      return next;
    });
  }, [data?.currentCompany?.code, manualFields.password]);

  const handleCreateNameChange = (nextName) => {
    const code = data?.currentCompany?.code || '';
    const defaults = generateAccountDefaults(nextName, code);
    setForm((prev) => {
      const nextUsername = manualFields.username ? prev.username : defaults.username;
      const nextEmail = manualFields.email
        ? prev.email
        : nextUsername && defaults.codeSlug
        ? `${nextUsername}@${defaults.codeSlug}.com`
        : '';
      const nextPassword = manualFields.password ? prev.password : defaults.password;
      return {
        ...prev,
        name: nextName,
        username: nextUsername,
        email: nextEmail,
        password: nextPassword,
      };
    });
  };

  const handleCreateUsernameChange = (nextUsername) => {
    const slug = normalizeCompanyCodeSlug(data?.currentCompany?.code || '');
    setManualFields((prev) => ({ ...prev, username: nextUsername.trim() !== '' }));
    setForm((prev) => ({
      ...prev,
      username: nextUsername,
      email: manualFields.email
        ? prev.email
        : nextUsername.trim() && slug
        ? `${nextUsername.trim()}@${slug}.com`
        : '',
    }));
  };

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4500);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      setErrorMsg('');
      const res = await api.createUser(form);
      const slug = normalizeCompanyCodeSlug(data?.currentCompany?.code || '');
      setForm({
        name: '',
        username: '',
        email: '',
        password: slug ? `123456${slug}` : '123456',
        role: 'MEMBER',
        title: '',
        department: 'Khối Kỹ thuật Phần mềm',
      });
      setManualFields({ username: false, email: false, password: false });
      await loadAccounts();
      showToast(
        `Đã tạo tài khoản "${res.user.username || res.user.email}" (${res.user.email}) — ${
          res.user.role === 'DIRECTOR' ? 'Lãnh đạo' : 'Nhân viên'
        } thuộc công ty ${data?.currentCompany?.name}!`
      );
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleRoleChange = async (userId, nextRole) => {
    try {
      setErrorMsg('');
      await api.updateUser(userId, { role: nextRole });
      await loadAccounts();
      showToast('Đã cập nhật vai trò tài khoản thành công.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleToggleStatus = async (userObj) => {
    try {
      setErrorMsg('');
      const nextStatus = userObj.status === 'inactive' ? 'active' : 'inactive';
      await api.updateUser(userObj.id, { status: nextStatus });
      await loadAccounts();
      showToast(
        `Đã ${nextStatus === 'active' ? 'kích hoạt' : 'khóa'} tài khoản ${userObj.email}.`
      );
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleResetPassword = async (uid) => {
    const pwd = (resetPassMap[uid] || '123456').trim();
    try {
      setErrorMsg('');
      await api.updateUser(uid, { password: pwd });
      setResetPassMap((prev) => ({ ...prev, [uid]: '' }));
      showToast(`Đã đặt lại mật khẩu thành "${pwd}".`);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const openEditUser = (u) => {
    setErrorMsg('');
    setEditingUser(u);
    setEditUserForm({
      name: u.name || '',
      email: u.email || '',
      role: u.role || 'MEMBER',
      title: u.title || '',
      department: u.department || '',
      status: u.status || 'active',
      password: '',
    });
    api.getCompanyAdminUsers({ action: 'open_edit_user', userId: u.id }).catch(() => {});
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!editingUser || savingUser) return;
    setSavingUser(true);
    try {
      setErrorMsg('');
      const payload = {
        name: editUserForm.name,
        email: editUserForm.email,
        role: editUserForm.role,
        title: editUserForm.title,
        department: editUserForm.department,
        status: editUserForm.status,
      };
      if (editUserForm.password.trim()) {
        payload.password = editUserForm.password.trim();
      }
      const res = await api.updateUser(editingUser.id, payload);
      setEditingUser(null);
      await loadAccounts();
      showToast(`Đã cập nhật thông tin tài khoản "${res.user.name}" (${res.user.email}) thành công.`);
    } catch (err) {
      setErrorMsg(err.message || 'Không thể cập nhật thông tin tài khoản.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!confirmDeleteUser || deletingUser) return;
    const u = confirmDeleteUser;
    setDeletingUser(true);
    try {
      setErrorMsg('');
      await api.deleteUser(u.id);
      setConfirmDeleteUser(null);
      await loadAccounts();
      showToast(`Đã xóa tài khoản ${u.email}.`);
    } catch (err) {
      setErrorMsg(err.message || 'Không thể xóa tài khoản.');
    } finally {
      setDeletingUser(false);
    }
  };

  const handleSelectUsersExcel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setErrorMsg('');
      const rows = await parseCompanyUsersExcel(file, data?.currentCompany?.code || '');
      setExcelModal({
        title: `Nhập danh sách Tài khoản từ Excel — ${data?.currentCompany?.name || ''}`,
        subtitle: `Tệp: ${file.name} • Tự động gán thuộc công ty ${data?.currentCompany?.code || ''}`,
        columns: [
          { key: 'name', label: 'Họ và tên' },
          { key: 'username', label: 'Tên tài khoản' },
          { key: 'email', label: 'Email đăng nhập' },
          { key: 'password', label: 'Mật khẩu' },
          { key: 'role', label: 'Vai trò' },
          { key: 'title', label: 'Chức danh' },
          { key: 'department', label: 'Phòng ban' },
        ],
        rows,
        importing: false,
        result: null,
      });
    } catch (err) {
      setErrorMsg(err.message || 'Không thể đọc tệp Excel danh sách tài khoản.');
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!excelModal || excelModal.importing) return;
    setExcelModal((prev) => ({ ...prev, importing: true }));
    try {
      setErrorMsg('');
      const res = await api.createUsersBulk(excelModal.rows);
      setExcelModal((prev) => ({ ...prev, importing: false, result: res }));
      await loadAccounts();
      if (res.importedCount > 0) {
        showToast(
          `Đã nhập thành công ${res.importedCount} tài khoản từ Excel vào công ty ${data?.currentCompany?.name || ''}!`
        );
      }
    } catch (err) {
      setExcelModal((prev) => ({ ...prev, importing: false }));
      setErrorMsg(err.message || 'Lỗi khi nhập danh sách tài khoản từ Excel.');
    }
  };

  if (loading && !data) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">
        Đang tải danh sách tài khoản công ty...
      </div>
    );
  }

  const currentCompany = data?.currentCompany;
  const users = data?.users || [];
  const directorCount = users.filter((u) => u.role === 'DIRECTOR').length;
  const memberCount = users.filter((u) => u.role === 'MEMBER').length;

  return (
    <div className="space-y-5">
      {/* Company Admin Banner */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-sm"
            style={{ backgroundColor: currentCompany?.color || '#3370FF' }}
          >
            {currentCompany?.logoText || 'CO'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Quản trị Tài khoản Công ty: {currentCompany?.name}
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                {currentCompany?.code}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tài khoản Admin công ty <strong>chỉ quản lý tài khoản nhân sự</strong> của{' '}
              <strong>{currentCompany?.name}</strong> (không quản lý task hay dự án). Hiện có{' '}
              <strong>{directorCount} Lãnh đạo</strong> & <strong>{memberCount} Nhân viên</strong>.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {notice}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" /> {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Create Account Form */}
        <form
          onSubmit={handleCreateSubmit}
          className="lg:col-span-5 bg-white rounded-xl border border-[#DEE0E3] p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <UserPlus className="w-4 h-4 text-[#3370FF]" />
            <h3 className="text-sm font-bold text-slate-900">
              Cấp Tài khoản mới cho Công ty
            </h3>
          </div>

          <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-xs">
            <div className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Công ty trực thuộc (Tự động gán)
            </div>
            <div className="font-bold text-blue-950 mt-0.5">
              {currentCompany?.name} ({currentCompany?.code})
            </div>
            <div className="text-[11px] text-blue-700">
              Mọi tài khoản tạo tại đây tự động thuộc công ty này.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="col-span-2">
              <label className="block font-medium text-slate-600 mb-1">
                Họ và tên *{' '}
                <span className="text-[10px] font-normal text-blue-600">
                  (Nhập họ tên → tự điền tài khoản, email, mật khẩu)
                </span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => handleCreateNameChange(e.target.value)}
                placeholder="VD: Phan Đình Thắng"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Tên tài khoản *</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => handleCreateUsernameChange(e.target.value)}
                placeholder="VD: thangPD"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono bg-blue-50/30"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Mật khẩu khởi tạo *</label>
              <input
                type="text"
                required
                value={form.password}
                onChange={(e) => {
                  setManualFields((prev) => ({ ...prev, password: true }));
                  setForm({ ...form, password: e.target.value });
                }}
                placeholder={`123456${normalizeCompanyCodeSlug(currentCompany?.code || 'ptech') || 'ptech'}`}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono bg-blue-50/30"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-medium text-slate-600 mb-1">Email đăng nhập *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => {
                  setManualFields((prev) => ({ ...prev, email: e.target.value.trim() !== '' }));
                  setForm({ ...form, email: e.target.value });
                }}
                placeholder={`thangPD@${normalizeCompanyCodeSlug(currentCompany?.code || 'ptech') || 'ptech'}.com`}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono bg-blue-50/30"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Vai trò trong Công ty *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
              >
                {COMPANY_ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Chức danh</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="VD: Nhân viên Kỹ thuật"
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div className="col-span-2">
              <label className="block font-medium text-slate-600 mb-1">Phòng ban</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#3370FF] hover:bg-[#245BDB] text-white text-xs font-bold shadow-sm transition"
          >
            + Tạo Tài khoản thuộc {currentCompany?.name}
          </button>
        </form>

        {/* Scope & Role Explanation */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#DEE0E3] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Phạm vi Quyền hạn của Admin Công ty & Mô hình Phân quyền
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1.5">
              <div className="font-bold text-indigo-950">🛡️ Admin Công ty (Tài khoản hiện tại)</div>
              <ul className="list-disc list-inside text-indigo-900 space-y-1 text-[11px]">
                <li>Chỉ tạo, sửa vai trò, khóa/mở khóa, đổi mật khẩu và xóa tài khoản thuộc công ty.</li>
                <li><strong>Không xem & không can thiệp</strong> vào danh sách Dự án, Công việc (Task), Đánh giá KPI hay AI của dự án.</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1.5">
              <div className="font-bold text-blue-950">👔 Lãnh đạo (DIRECTOR)</div>
              <ul className="list-disc list-inside text-blue-900 space-y-1 text-[11px]">
                <li>Xem AI Tổng hợp trực quan & AI Chatbot của toàn công ty.</li>
                <li>Tạo dự án mới, chỉ định PM dự án và nghiệm thu chất lượng.</li>
              </ul>
            </div>

            <div className="md:col-span-2 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
              <div className="font-bold text-emerald-950">
                👥 Nhân viên (MEMBER) — Chia Role riêng trong từng Dự án (PM / DEV / BA / TEST)
              </div>
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                Sau khi Admin công ty tạo tài khoản Nhân viên (<code>MEMBER</code>), Lãnh đạo hoặc PM của từng dự án sẽ thêm nhân viên đó vào dự án và gán vai trò riêng:
                <strong> PM</strong> (tạo dự án, chia role, chấm chất lượng, xem AI & Chatbot) hoặc <strong>DEV / BA / TEST</strong> (log task tuần & tự đánh giá KPI cuối tuần).
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Bảo mật tách biệt:</strong> Mọi API quản lý task (<code>/api/tasks</code>) và dự án (<code>/api/projects</code>) đều trả về <code>HTTP 403</code> đối với tài khoản <code>COMPANY_ADMIN</code>.
            </div>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Danh sách Tài khoản thuộc {currentCompany?.name} ({users.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCompanyUsersTemplate(currentCompany)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" /> Tải mẫu Excel Tài khoản
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" /> Nhập Tài khoản từ Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleSelectUsersExcel}
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                <th className="py-2.5 px-4">Họ và tên</th>
                <th className="py-2.5 px-3">Email đăng nhập</th>
                <th className="py-2.5 px-3">Chức danh / Phòng ban</th>
                <th className="py-2.5 px-3">Vai trò</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
                <th className="py-2.5 px-3">Đặt lại Mật khẩu</th>
                <th className="py-2.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelfOrCompanyAdmin = u.role === 'COMPANY_ADMIN' || u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: u.color }}
                        >
                          {u.avatar}
                        </span>
                        <span className="font-bold text-slate-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800">{u.title}</div>
                      <div className="text-[11px] text-slate-500">{u.department}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {u.role === 'COMPANY_ADMIN' ? (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-[11px]">
                          Admin Công ty (COMPANY_ADMIN)
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className={`px-2 py-1 rounded-lg border font-bold text-xs ${
                            u.role === 'DIRECTOR'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          <option value="MEMBER">Nhân viên (MEMBER)</option>
                          <option value="DIRECTOR">Lãnh đạo (DIRECTOR)</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {u.role === 'COMPANY_ADMIN' ? (
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Đang hoạt động
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                            u.status === 'inactive'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {u.status === 'inactive' ? 'Đã khóa' : 'Đang hoạt động'}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {!isSelfOrCompanyAdmin && (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={resetPassMap[u.id] ?? ''}
                            onChange={(e) =>
                              setResetPassMap((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                            placeholder="123456"
                            className="w-20 px-2 py-1 rounded border border-slate-300 font-mono text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleResetPassword(u.id)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px]"
                          >
                            Đổi
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {!isSelfOrCompanyAdmin && (
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditUser(u)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"
                            title="Chỉnh sửa thông tin tài khoản"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUser(u)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Employee / Director Account Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveUser}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Chỉnh sửa Thông tin Tài khoản
                </h3>
                <p className="text-[11px] text-slate-500">
                  {currentCompany?.name} • <span className="font-mono">{editingUser.id}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={savingUser}
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email đăng nhập *</label>
                <input
                  type="email"
                  required
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vai trò công ty *</label>
                  <select
                    value={editUserForm.role}
                    onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    {COMPANY_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={editUserForm.status}
                    onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Đã khóa</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chức danh</label>
                  <input
                    type="text"
                    value={editUserForm.title}
                    onChange={(e) => setEditUserForm({ ...editUserForm, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phòng ban</label>
                  <input
                    type="text"
                    value={editUserForm.department}
                    onChange={(e) => setEditUserForm({ ...editUserForm, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mật khẩu mới (tùy chọn — bỏ trống nếu không đổi)
                </label>
                <input
                  type="text"
                  value={editUserForm.password}
                  onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                  placeholder="Nhập mật khẩu mới..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingUser}
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3370FF] hover:bg-[#245BDB] text-white font-bold shadow-sm disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingUser ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete User Popup */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-extrabold">Xác nhận xóa Tài khoản</h3>
              </div>
              <button
                type="button"
                disabled={deletingUser}
                onClick={() => setConfirmDeleteUser(null)}
                className="p-1 rounded-lg text-rose-600 hover:bg-rose-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p>
                Bạn có chắc chắn muốn xóa tài khoản{' '}
                <strong className="text-slate-900">{confirmDeleteUser.name}</strong> (
                <span className="font-mono">{confirmDeleteUser.email}</span>)? Nhân sự này sẽ đồng thời bị gỡ khỏi danh sách thành viên các dự án.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deletingUser}
                  onClick={() => setConfirmDeleteUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={deletingUser}
                  onClick={handleConfirmDeleteUser}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingUser ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Excel Preview & Bulk Import Modal */}
      <ExcelImportModal
        isOpen={Boolean(excelModal)}
        title={excelModal?.title || ''}
        subtitle={excelModal?.subtitle || ''}
        columns={excelModal?.columns || []}
        rows={excelModal?.rows || []}
        importing={Boolean(excelModal?.importing)}
        importResult={excelModal?.result || null}
        onClose={() => setExcelModal(null)}
        onConfirmImport={handleConfirmExcelImport}
        onDownloadTemplate={() => downloadCompanyUsersTemplate(currentCompany)}
      />
    </div>
  );
}
