import React from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';

export default function ExcelImportModal({
  isOpen,
  title,
  subtitle,
  columns = [],
  rows = [],
  importing = false,
  importResult = null,
  onClose,
  onConfirmImport,
  onDownloadTemplate,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      onClick={() => !importing && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-emerald-50/70 border-b border-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
              {subtitle && <p className="text-[11px] text-slate-600">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-100 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Result Summary Banner */}
          {importResult && (
            <div className="space-y-2">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    Đã nhập thành công {importResult.importedCount ?? 0} bản ghi vào hệ thống
                    {importResult.createdAdminsCount > 0
                      ? ` (kèm ${importResult.createdAdminsCount} tài khoản Admin khởi tạo)`
                      : ''}
                    !
                  </span>
                </div>
                {importResult.skippedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                    Bỏ qua / lỗi: {importResult.skippedCount} dòng
                  </span>
                )}
              </div>

              {importResult.errors?.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-1 max-h-36 overflow-y-auto">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    Chi tiết các dòng không nhập được:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>
                        <strong>Dòng {err.row}:</strong> {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Preview Table */}
          {rows.length === 0 ? (
            <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 text-slate-500 space-y-2">
              <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-semibold text-slate-700">
                File Excel chưa có dòng dữ liệu nào (ngoài dòng tiêu đề).
              </div>
              <p className="text-[11px]">
                Hãy tải file mẫu trống, điền thông tin từ dòng số 2 rồi tải lên lại.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  Xem trước dữ liệu đọc từ Excel ({rows.length} dòng)
                </span>
                <span className="text-[11px] text-slate-500">
                  Kiểm tra nhanh dữ liệu trước khi xác nhận lưu vào MongoDB
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[46vh]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-semibold text-slate-600">
                      <th className="py-2 px-2.5 w-[55px] text-center">Dòng</th>
                      {columns.map((col) => (
                        <th key={col.key} className="py-2 px-2.5 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 text-center font-mono text-slate-400">
                          {row._rowNumber || idx + 2}
                        </td>
                        {columns.map((col) => (
                          <td key={col.key} className="py-2 px-2.5 text-slate-800">
                            {row[col.key] || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {onDownloadTemplate ? (
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" /> Tải lại file mẫu trống
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              Đóng
            </button>
            {!importResult && rows.length > 0 && (
              <button
                type="button"
                disabled={importing}
                onClick={onConfirmImport}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                {importing ? 'Đang nhập dữ liệu...' : `Xác nhận nhập ${rows.length} dòng`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
