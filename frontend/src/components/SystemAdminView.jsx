import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Users,
  FolderKanban,
  Plus,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  UserPlus,
  Pencil,
  Save,
  X,
  Download,
  Upload,
} from 'lucide-react';
import { api } from '../api/client.js';
import WpmesLogo from './WpmesLogo.jsx';
import ExcelImportModal from './ExcelImportModal.jsx';
import {
  downloadCompaniesTemplate,
  downloadCompanyAdminsTemplate,
  parseCompaniesExcel,
  parseCompanyAdminsExcel,
} from '../utils/excelHelper.js';

const COMPANY_COLORS = ['#3370FF', '#00A870', '#0EA5E9', '#7C3AED', '#F57C00', '#E11D48', '#0F172A'];

export default function SystemAdminView() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [companyForm, setCompanyForm] = useState({
    name: '',
    code: '',
    domain: '',
    industry: 'Công nghệ thông tin',
    color: '#0EA5E9',
    adminName: '',
    adminEmail: '',
    adminPassword: '123456',
  });

  const [adminForm, setAdminForm] = useState({
    companyId: '',
    name: '',
    email: '',
    password: '123456',
    title: '',
  });

  const [resetPassMap, setResetPassMap] = useState({});
  const [confirmDeleteCompany, setConfirmDeleteCompany] = useState(null);
  const [deletingCompany, setDeletingCompany] = useState(false);

  // Edit Company modal state
  const [editingCompany, setEditingCompany] = useState(null);
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: '',
    code: '',
    logoText: '',
    domain: '',
    industry: '',
    plan: '',
    color: '#3370FF',
  });
  const [savingCompany, setSavingCompany] = useState(false);

  // Edit Company Admin modal state
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [editAdminForm, setEditAdminForm] = useState({
    name: '',
    email: '',
    title: '',
    status: 'active',
    password: '',
  });
  const [savingAdmin, setSavingAdmin] = useState(false);

  // Confirm Delete Admin popup state
  const [confirmDeleteAdmin, setConfirmDeleteAdmin] = useState(null);
  const [deletingAdmin, setDeletingAdmin] = useState(false);

  // Excel import modal state
  const [excelModal, setExcelModal] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      setErrorMsg('');
      const res = await api.getSystemOverview();
      setOverview(res);
      if (res.companies?.length && !adminForm.companyId) {
        setAdminForm((prev) => ({ ...prev, companyId: res.companies[0].id }));
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminForm.companyId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const showToast = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4500);
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    try {
      setErrorMsg('');
      const res = await api.systemCreateCompany(companyForm);
      setCompanyForm({
        name: '',
        code: '',
        domain: '',
        industry: 'Công nghệ thông tin',
        color: '#0EA5E9',
        adminName: '',
        adminEmail: '',
        adminPassword: '123456',
      });
      await loadOverview();
      showToast(
        `Đã tạo công ty "${res.company.name}"${
          res.adminUser ? ` và tài khoản Admin "${res.adminUser.email}"` : ''
        }!`
      );
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      setErrorMsg('');
      const res = await api.systemCreateCompanyAdmin(adminForm);
      setAdminForm((prev) => ({
        ...prev,
        name: '',
        email: '',
        password: '123456',
        title: '',
      }));
      await loadOverview();
      showToast(`Đã cấp tài khoản Quản trị Công ty: ${res.adminUser.email}`);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleToggleAdminStatus = async (admin) => {
    const nextStatus = admin.status === 'inactive' ? 'active' : 'inactive';
    await api.systemUpdateCompanyAdmin(admin.id, { status: nextStatus });
    await loadOverview();
    showToast(`Đã ${nextStatus === 'active' ? 'kích hoạt' : 'khóa'} tài khoản ${admin.email}`);
  };

  const handleResetAdminPassword = async (adminId) => {
    const newPass = (resetPassMap[adminId] || '123456').trim();
    await api.systemUpdateCompanyAdmin(adminId, { password: newPass });
    setResetPassMap((prev) => ({ ...prev, [adminId]: '' }));
    showToast(`Đã đặt lại mật khẩu thành "${newPass}"`);
  };

  const openEditCompany = (comp) => {
    setErrorMsg('');
    setEditingCompany(comp);
    setEditCompanyForm({
      name: comp.name || '',
      code: comp.code || '',
      logoText: comp.logoText || '',
      domain: comp.domain || '',
      industry: comp.industry || '',
      plan: comp.plan || 'Enterprise',
      color: comp.color || '#3370FF',
    });
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    if (!editingCompany || savingCompany) return;
    setSavingCompany(true);
    try {
      setErrorMsg('');
      const res = await api.systemUpdateCompany(editingCompany.id, editCompanyForm);
      setEditingCompany(null);
      await loadOverview();
      showToast(`Đã cập nhật thông tin công ty "${res.company.name}" thành công!`);
    } catch (err) {
      setErrorMsg(err.message || 'Không thể cập nhật thông tin công ty.');
    } finally {
      setSavingCompany(false);
    }
  };

  const openEditAdmin = (adm) => {
    setErrorMsg('');
    setEditingAdmin(adm);
    setEditAdminForm({
      name: adm.name || '',
      email: adm.email || '',
      title: adm.title || '',
      status: adm.status || 'active',
      password: '',
    });
  };

  const handleSaveAdmin = async (e) => {
    e.preventDefault();
    if (!editingAdmin || savingAdmin) return;
    setSavingAdmin(true);
    try {
      setErrorMsg('');
      const payload = {
        name: editAdminForm.name,
        email: editAdminForm.email,
        title: editAdminForm.title,
        status: editAdminForm.status,
      };
      if (editAdminForm.password.trim()) {
        payload.password = editAdminForm.password.trim();
      }
      const res = await api.systemUpdateCompanyAdmin(editingAdmin.id, payload);
      setEditingAdmin(null);
      await loadOverview();
      showToast(`Đã cập nhật tài khoản Admin Công ty "${res.adminUser.email}" thành công!`);
    } catch (err) {
      setErrorMsg(err.message || 'Không thể cập nhật tài khoản Admin Công ty.');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!confirmDeleteAdmin || deletingAdmin) return;
    const admin = confirmDeleteAdmin;
    setDeletingAdmin(true);
    try {
      setErrorMsg('');
      await api.systemDeleteCompanyAdmin(admin.id);
      setConfirmDeleteAdmin(null);
      await loadOverview();
      showToast(`Đã xóa tài khoản Quản trị Công ty ${admin.email}`);
    } catch (err) {
      setErrorMsg(err.message || 'Không thể xóa tài khoản Admin Công ty.');
    } finally {
      setDeletingAdmin(false);
    }
  };

  const handleSelectCompaniesExcel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setErrorMsg('');
      const rows = await parseCompaniesExcel(file);
      setExcelModal({
        type: 'companies',
        title: 'Nhập danh sách Công ty từ Excel',
        subtitle: `Tệp: ${file.name} • Tự động lưu vào MongoDB`,
        columns: [
          { key: 'name', label: 'Tên công ty' },
          { key: 'code', label: 'Mã công ty' },
          { key: 'domain', label: 'Domain' },
          { key: 'industry', label: 'Lĩnh vực' },
          { key: 'adminName', label: 'Họ tên Admin' },
          { key: 'adminEmail', label: 'Email Admin' },
        ],
        rows,
        importing: false,
        result: null,
      });
    } catch (err) {
      setErrorMsg(err.message || 'Không thể đọc tệp Excel danh sách công ty.');
    }
  };

  const handleSelectAdminsExcel = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setErrorMsg('');
      const rows = await parseCompanyAdminsExcel(file);
      setExcelModal({
        type: 'admins',
        title: 'Nhập danh sách Tài khoản Admin Công ty từ Excel',
        subtitle: `Tệp: ${file.name} • Tự động gán theo Mã công ty`,
        columns: [
          { key: 'companyCode', label: 'Mã công ty' },
          { key: 'name', label: 'Họ và tên' },
          { key: 'email', label: 'Email đăng nhập' },
          { key: 'password', label: 'Mật khẩu' },
          { key: 'title', label: 'Chức danh' },
        ],
        rows,
        importing: false,
        result: null,
      });
    } catch (err) {
      setErrorMsg(err.message || 'Không thể đọc tệp Excel danh sách Admin công ty.');
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!excelModal || excelModal.importing) return;
    setExcelModal((prev) => ({ ...prev, importing: true }));
    try {
      setErrorMsg('');
      const res =
        excelModal.type === 'companies'
          ? await api.systemCreateCompaniesBulk(excelModal.rows)
          : await api.systemCreateCompanyAdminsBulk(excelModal.rows);
      setExcelModal((prev) => ({ ...prev, importing: false, result: res }));
      await loadOverview();
      if (res.importedCount > 0) {
        showToast(
          excelModal.type === 'companies'
            ? `Đã nhập ${res.importedCount} công ty${res.createdAdminsCount ? ` & ${res.createdAdminsCount} Admin` : ''} từ Excel!`
            : `Đã nhập ${res.importedCount} tài khoản Admin Công ty từ Excel!`
        );
      }
    } catch (err) {
      setExcelModal((prev) => ({ ...prev, importing: false }));
      setErrorMsg(err.message || 'Lỗi khi nhập dữ liệu từ Excel.');
    }
  };

  const handleRequestDeleteCompany = (comp) => {
    setErrorMsg('');
    setConfirmDeleteCompany(comp);
  };

  const handleConfirmDeleteCompany = async () => {
    if (!confirmDeleteCompany || deletingCompany) return;
    const comp = confirmDeleteCompany;
    setDeletingCompany(true);
    try {
      setErrorMsg('');
      const res = await api.systemDeleteCompany(comp.id);
      setConfirmDeleteCompany(null);
      if (adminForm.companyId === comp.id) {
        const nextComp = (overview?.companies || []).find((c) => c.id !== comp.id);
        setAdminForm((prev) => ({ ...prev, companyId: nextComp?.id || '' }));
      }
      await loadOverview();
      showToast(
        `Đã xóa công ty "${comp.name}" cùng ${res.deletedUsersCount ?? comp.userCount ?? 0} tài khoản nhân sự, ${
          res.deletedProjectsCount ?? comp.projectCount ?? 0
        } dự án và ${res.deletedTasksCount ?? comp.taskCount ?? 0} task.`
      );
    } catch (err) {
      setErrorMsg(err.message || 'Không thể xóa công ty.');
    } finally {
      setDeletingCompany(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">
        Đang tải bảng điều khiển Quản trị Hệ thống...
      </div>
    );
  }

  const stats = overview?.stats || {};
  const companies = overview?.companies || [];
  const companyAdmins = overview?.companyAdmins || [];

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <WpmesLogo size="lg" variant="light" />
          <div>
            <h2 className="text-lg font-extrabold">
              WPMES — Cổng Quản trị Hệ thống (System Admin Portal)
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Work Performance Management and Evaluation System • Quản lý toàn bộ Công ty &amp; tài khoản Admin Công ty (COMPANY_ADMIN).
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

      {/* Platform KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Tổng số Công ty</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-1">{stats.totalCompanies ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Tài khoản Admin Công ty</span>
            <KeyRound className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-1">
            {stats.totalCompanyAdmins ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Tổng Nhân sự các Công ty</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-1">{stats.totalUsers ?? 0}</div>
        </div>
        <div className="bg-white rounded-xl border border-[#DEE0E3] p-4 shadow-sm">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Tổng Dự án đang chạy</span>
            <FolderKanban className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-slate-900 mt-1">{stats.totalProjects ?? 0}</div>
        </div>
      </div>

      {/* Forms: Create Company + Create Company Admin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Form 1: Create Company + Initial Admin */}
        <form
          onSubmit={handleCreateCompany}
          className="bg-white rounded-xl border border-[#DEE0E3] p-5 shadow-sm space-y-3"
        >
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Plus className="w-4 h-4 text-blue-600" /> Tạo Công ty mới & Admin khởi tạo
          </h3>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Tên công ty *</label>
              <input
                type="text"
                required
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                placeholder="VD: SunTech Solutions JSC"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Mã công ty *</label>
              <input
                type="text"
                required
                value={companyForm.code}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })
                }
                placeholder="VD: SUNTECH"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Domain</label>
              <input
                type="text"
                value={companyForm.domain}
                onChange={(e) => setCompanyForm({ ...companyForm, domain: e.target.value })}
                placeholder="suntech.vn"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Lĩnh vực</label>
              <input
                type="text"
                value={companyForm.industry}
                onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>

            <div className="col-span-2 pt-2 border-t border-slate-100 font-semibold text-blue-800">
              Thông tin Tài khoản Admin của Công ty này (Role: COMPANY_ADMIN)
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Họ tên Admin *</label>
              <input
                type="text"
                required
                value={companyForm.adminName}
                onChange={(e) => setCompanyForm({ ...companyForm, adminName: e.target.value })}
                placeholder="VD: Trần Minh Khôi"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Email đăng nhập *</label>
              <input
                type="email"
                required
                value={companyForm.adminEmail}
                onChange={(e) => setCompanyForm({ ...companyForm, adminEmail: e.target.value })}
                placeholder="khoi.tran@suntech.vn"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-medium text-slate-600 mb-1">Mật khẩu khởi tạo</label>
              <input
                type="text"
                value={companyForm.adminPassword}
                onChange={(e) =>
                  setCompanyForm({ ...companyForm, adminPassword: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-[#3370FF] hover:bg-[#245BDB] text-white text-xs font-bold transition"
          >
            + Khởi tạo Công ty & Tài khoản Quản trị Công ty
          </button>
        </form>

        {/* Form 2: Add Company Admin to Existing Company */}
        <form
          onSubmit={handleCreateAdmin}
          className="bg-white rounded-xl border border-[#DEE0E3] p-5 shadow-sm space-y-3 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <UserPlus className="w-4 h-4 text-indigo-600" /> Cấp thêm Tài khoản Quản trị cho Công ty
            </h3>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="col-span-2">
                <label className="block font-medium text-slate-600 mb-1">Chọn Công ty *</label>
                <select
                  required
                  value={adminForm.companyId}
                  onChange={(e) => setAdminForm({ ...adminForm, companyId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Họ tên Quản trị viên *</label>
                <input
                  type="text"
                  required
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  placeholder="VD: Nguyễn Thị Lan"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Email đăng nhập *</label>
                <input
                  type="email"
                  required
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  placeholder="lan.nguyen@trinam.vn"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Mật khẩu *</label>
                <input
                  type="text"
                  required
                  value={adminForm.password}
                  onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Chức danh</label>
                <input
                  type="text"
                  value={adminForm.title}
                  onChange={(e) => setAdminForm({ ...adminForm, title: e.target.value })}
                  placeholder="VD: Phó Giám đốc / HR Admin"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition"
          >
            + Cấp Tài khoản Admin Công ty (COMPANY_ADMIN)
          </button>
        </form>
      </div>

      {/* Table 1: Companies List */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            1. Danh sách các Công ty trên Hệ thống ({companies.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadCompaniesTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" /> Tải mẫu Excel Công ty
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" /> Nhập Công ty từ Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleSelectCompaniesExcel}
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                <th className="py-2.5 px-4">Công ty</th>
                <th className="py-2.5 px-3">Domain & Lĩnh vực</th>
                <th className="py-2.5 px-3 text-center">Nhân sự</th>
                <th className="py-2.5 px-3 text-center">Dự án</th>
                <th className="py-2.5 px-3">Tài khoản Quản trị Công ty</th>
                <th className="py-2.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.logoText}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900">{c.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {c.id} • {c.code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-slate-800">{c.domain || 'N/A'}</div>
                    <div className="text-[11px] text-slate-500">{c.industry}</div>
                  </td>
                  <td className="py-3 px-3 text-center font-bold">{c.userCount}</td>
                  <td className="py-3 px-3 text-center font-bold">{c.projectCount}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(c.admins || []).map((adm) => (
                        <span
                          key={adm.id}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-medium"
                        >
                          {adm.name} ({adm.email})
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditCompany(c)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"
                        title="Chỉnh sửa thông tin công ty"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestDeleteCompany(c)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Xóa công ty và toàn bộ tài khoản nhân viên"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table 2: Company Admins Directory */}
      <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            2. Danh sách Tài khoản Quản trị của từng Công ty ({companyAdmins.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadCompanyAdminsTemplate(companies)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" /> Tải mẫu Excel Admin
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" /> Nhập Admin từ Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleSelectAdminsExcel}
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase border-b border-slate-200">
                <th className="py-2.5 px-4">Quản trị viên</th>
                <th className="py-2.5 px-3">Email đăng nhập</th>
                <th className="py-2.5 px-3">Công ty quản lý</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
                <th className="py-2.5 px-3">Đặt lại Mật khẩu</th>
                <th className="py-2.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companyAdmins.map((adm) => (
                <tr key={adm.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{adm.name}</div>
                    <div className="text-[11px] text-slate-500">{adm.title}</div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700">{adm.email}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                      {adm.companyName}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => handleToggleAdminStatus(adm)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                        adm.status === 'inactive'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {adm.status === 'inactive' ? 'Đã khóa' : 'Đang hoạt động'}
                    </button>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={resetPassMap[adm.id] ?? ''}
                        onChange={(e) =>
                          setResetPassMap((prev) => ({ ...prev, [adm.id]: e.target.value }))
                        }
                        placeholder="123456"
                        className="w-24 px-2 py-1 rounded border border-slate-300 font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => handleResetAdminPassword(adm.id)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px]"
                      >
                        Đổi MK
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditAdmin(adm)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition"
                        title="Chỉnh sửa thông tin tài khoản Admin công ty"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAdmin(adm)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                        title="Xóa tài khoản Admin công ty"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Delete Company Modal Popup */}
      {confirmDeleteCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-800">
                <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Xác nhận xóa Công ty</h3>
                  <p className="text-[11px] text-rose-700">Thao tác này không thể hoàn tác</p>
                </div>
              </div>
              <button
                type="button"
                disabled={deletingCompany}
                onClick={() => setConfirmDeleteCompany(null)}
                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p className="leading-relaxed">
                Bạn có chắc chắn muốn xóa công ty{' '}
                <strong className="text-slate-900">{confirmDeleteCompany.name}</strong>{' '}
                (<span className="font-mono font-semibold">{confirmDeleteCompany.code}</span>)?
              </p>

              <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                <div className="font-bold text-rose-900">
                  Toàn bộ dữ liệu thuộc công ty này sẽ bị xóa vĩnh viễn:
                </div>
                <ul className="space-y-1 text-rose-800 list-disc list-inside">
                  <li>
                    <strong>{confirmDeleteCompany.userCount ?? 0} tài khoản</strong> (gồm{' '}
                    {confirmDeleteCompany.adminCount ?? 0} Admin công ty,{' '}
                    {confirmDeleteCompany.directorCount ?? 0} Lãnh đạo,{' '}
                    {confirmDeleteCompany.memberCount ?? 0} Nhân viên)
                  </li>
                  <li>
                    <strong>{confirmDeleteCompany.projectCount ?? 0} dự án</strong> thuộc công ty
                  </li>
                  <li>
                    <strong>{confirmDeleteCompany.taskCount ?? 0} công việc (task)</strong> và dữ liệu KPI liên quan
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deletingCompany}
                  onClick={() => setConfirmDeleteCompany(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={deletingCompany}
                  onClick={handleConfirmDeleteCompany}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm transition disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingCompany ? 'Đang xóa...' : 'Xác nhận xóa Công ty'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveCompany}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs"
                  style={{ backgroundColor: editCompanyForm.color }}
                >
                  {editCompanyForm.logoText || editCompanyForm.code?.slice(0, 2) || 'CO'}
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Chỉnh sửa Thông tin Công ty</h3>
                  <p className="text-[11px] font-mono text-slate-500">{editingCompany.id}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingCompany}
                onClick={() => setEditingCompany(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Tên công ty *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.name}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã công ty *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.code}
                    onChange={(e) =>
                      setEditCompanyForm({ ...editCompanyForm, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ký hiệu đại diện (2-4 ký tự)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={editCompanyForm.logoText}
                    onChange={(e) =>
                      setEditCompanyForm({ ...editCompanyForm, logoText: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Domain</label>
                  <input
                    type="text"
                    value={editCompanyForm.domain}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, domain: e.target.value })}
                    placeholder="company.vn"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gói dịch vụ</label>
                  <input
                    type="text"
                    value={editCompanyForm.plan}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, plan: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Lĩnh vực hoạt động</label>
                  <input
                    type="text"
                    value={editCompanyForm.industry}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, industry: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1.5">Màu nhận diện</label>
                  <div className="flex items-center gap-2">
                    {COMPANY_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setEditCompanyForm({ ...editCompanyForm, color: hex })}
                        className={`w-7 h-7 rounded-full border-2 transition ${
                          editCompanyForm.color === hex
                            ? 'border-slate-900 scale-110'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingCompany}
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingCompany}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3370FF] hover:bg-[#245BDB] text-white font-bold shadow-sm disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingCompany ? 'Đang lưu...' : 'Lưu thông tin Công ty'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Edit Company Admin Account Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveAdmin}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Chỉnh sửa Tài khoản Admin Công ty
                </h3>
                <p className="text-[11px] text-slate-500">
                  {editingAdmin.companyName} • <span className="font-mono">{editingAdmin.id}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={savingAdmin}
                onClick={() => setEditingAdmin(null)}
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
                  value={editAdminForm.name}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email đăng nhập *</label>
                <input
                  type="email"
                  required
                  value={editAdminForm.email}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chức danh</label>
                <input
                  type="text"
                  value={editAdminForm.title}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={editAdminForm.status}
                    onChange={(e) => setEditAdminForm({ ...editAdminForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Đã khóa</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mật khẩu mới (tùy chọn)</label>
                  <input
                    type="text"
                    value={editAdminForm.password}
                    onChange={(e) => setEditAdminForm({ ...editAdminForm, password: e.target.value })}
                    placeholder="Để trống nếu giữ nguyên"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingAdmin}
                  onClick={() => setEditingAdmin(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingAdmin}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingAdmin ? 'Đang lưu...' : 'Lưu tài khoản'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete Company Admin Popup */}
      {confirmDeleteAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-extrabold">Xác nhận xóa Tài khoản Admin</h3>
              </div>
              <button
                type="button"
                disabled={deletingAdmin}
                onClick={() => setConfirmDeleteAdmin(null)}
                className="p-1 rounded-lg text-rose-600 hover:bg-rose-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-700">
              <p>
                Bạn có chắc chắn muốn xóa tài khoản Admin Công ty{' '}
                <strong className="text-slate-900">{confirmDeleteAdmin.name}</strong> (
                <span className="font-mono">{confirmDeleteAdmin.email}</span>)?
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deletingAdmin}
                  onClick={() => setConfirmDeleteAdmin(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={deletingAdmin}
                  onClick={handleConfirmDeleteAdmin}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingAdmin ? 'Đang xóa...' : 'Xác nhận xóa'}
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
        onDownloadTemplate={
          excelModal?.type === 'companies'
            ? downloadCompaniesTemplate
            : () => downloadCompanyAdminsTemplate(companies)
        }
      />
    </div>
  );
}
