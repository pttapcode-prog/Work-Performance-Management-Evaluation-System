import React, { useEffect, useState } from 'react';
import {
  LogIn,
  Eye,
  EyeOff,
  Shield,
  Building2,
  UserCheck,
  AlertCircle,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { api, setAuthToken } from '../api/client.js';
import WpmesLogo from './WpmesLogo.jsx';

const COMPANY_ROLE_LABELS = {
  SYSTEM_ADMIN: { label: 'Quản trị Hệ thống', badge: 'bg-slate-900 text-white' },
  COMPANY_ADMIN: { label: 'Admin Công ty', badge: 'bg-indigo-100 text-indigo-800' },
  DIRECTOR: { label: 'Lãnh đạo Công ty', badge: 'bg-blue-100 text-blue-800' },
  MEMBER: { label: 'Nhân viên', badge: 'bg-emerald-100 text-emerald-800' },
};

export default function LoginView({ onLoginSuccess }) {
  const [email, setEmail] = useState('sysadmin@wpmes.vn');
  const [password, setPassword] = useState('123456');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoAccounts, setDemoAccounts] = useState([]);

  const loadDemos = async () => {
    try {
      const res = await api.getDemoAccounts();
      setDemoAccounts(res.accounts || []);
    } catch {
      // Ignore if backend temporarily unavailable
    }
  };

  useEffect(() => {
    loadDemos();
  }, []);

  const performLogin = async (loginEmail, loginPass) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.login(loginEmail, loginPass);
      setAuthToken(res.token);
      onLoginSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  const handleResetDemo = async () => {
    await api.resetSeed();
    await loadDemos();
  };

  const grouped = demoAccounts.reduce((acc, item) => {
    const key = item.companyId;
    if (!acc[key]) {
      acc[key] = {
        companyId: key,
        companyName: item.companyName,
        companyColor: item.companyColor,
        items: [],
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EEF2FF] via-[#F5F6F7] to-[#E0F2FE] flex items-center justify-center p-4 md:p-8">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Left: Login Form */}
        <div className="lg:col-span-5 p-8 md:p-10 flex flex-col justify-between bg-white">
          <div className="space-y-6">
            <WpmesLogo
              size="lg"
              showWordmark
              subtitle="Work Performance Management and Evaluation System"
            />

            <div>
              <h2 className="text-xl font-bold text-slate-900">Đăng nhập Hệ thống</h2>
              <p className="text-xs text-slate-500 mt-1">
                Cấp Công ty chỉ có <strong>Lãnh đạo</strong> và <strong>Nhân viên</strong>; trong từng dự án chia riêng role <strong>PM, DEV, BA, TEST</strong>.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email đăng nhập
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.vn"
                  className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3370FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full text-sm px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#3370FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3370FF] to-[#5E47FF] hover:opacity-95 text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition"
              >
                <LogIn className="w-4 h-4" />
                {loading ? 'Đang xác thực...' : 'Đăng nhập'}
              </button>
            </form>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              Phân quyền Hệ thống 2 Tầng:
            </div>
            <p>1. <strong>Quản trị Hệ thống</strong> quản lý các Công ty & tài khoản Lãnh đạo Công ty.</p>
            <p>2. <strong>Lãnh đạo Công ty</strong> tạo nhân viên thuộc công ty; từng dự án phân role <strong>PM / DEV / BA / TEST</strong>.</p>
          </div>
        </div>

        {/* Right: Quick Demo Accounts Helper */}
        <div className="lg:col-span-7 bg-[#F7F8FA] border-t lg:border-t-0 lg:border-l border-slate-200 p-6 md:p-8 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#3370FF]" />
                  Tài khoản Demo (Mật khẩu: <code className="bg-white px-1.5 py-0.5 rounded border text-blue-700">123456</code>)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Click để đăng nhập nhanh kiểm thử Lãnh đạo, Nhân viên giữ role PM, DEV, BA, TEST.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <RotateCcw className="w-3 h-3" /> Reset Data
              </button>
            </div>

            <div className="space-y-3 max-h-[470px] overflow-y-auto pr-1">
              {Object.values(grouped).map((grp) => (
                <div
                  key={grp.companyId}
                  className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2 shadow-2xs"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 pb-1.5 border-b border-slate-100">
                    {grp.companyId === 'SYSTEM' ? (
                      <Shield className="w-4 h-4 text-slate-900" />
                    ) : (
                      <Building2 className="w-4 h-4" style={{ color: grp.companyColor }} />
                    )}
                    <span>{grp.companyName}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grp.items.map((acc) => {
                      const roleMeta = COMPANY_ROLE_LABELS[acc.role] || {
                        label: acc.role,
                        badge: 'bg-slate-100 text-slate-700',
                      };
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => {
                            setEmail(acc.email);
                            setPassword('123456');
                            performLogin(acc.email, '123456');
                          }}
                          className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition group"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate">
                              {acc.name}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${roleMeta.badge}`}>
                              {roleMeta.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                            {acc.email}
                          </div>
                          <div className="text-[10px] font-medium text-indigo-700 truncate mt-0.5">
                            {acc.projectRolesSummary}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
