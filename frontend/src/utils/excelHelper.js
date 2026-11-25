import * as XLSX from 'xlsx';

function normalizeHeader(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildSheetWithWidths(rows, widths = []) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths.length > 0) {
    ws['!cols'] = widths.map((wch) => ({ wch }));
  }
  return ws;
}

export function downloadCompaniesTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Tên công ty (*)',
    'Mã công ty (*)',
    'Domain',
    'Lĩnh vực',
    'Gói dịch vụ',
    'Màu nhận diện',
    'Họ tên Admin',
    'Email Admin',
    'Mật khẩu Admin',
  ];

  // Sheet 1: Mẫu trống sẵn sàng điền dữ liệu từ dòng 2
  const dataSheet = buildSheetWithWidths([headers], [28, 16, 20, 26, 18, 16, 24, 28, 18]);
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh_sach_cong_ty');

  // Sheet 2: Hướng dẫn điền cột
  const guideRows = [
    ['Cột', 'Bắt buộc', 'Mô tả & Ví dụ'],
    ['Tên công ty (*)', 'Có', 'Tên đầy đủ của công ty. VD: SunTech Solutions JSC'],
    ['Mã công ty (*)', 'Có', 'Mã viết tắt duy nhất, viết hoa không dấu. VD: SUNTECH'],
    ['Domain', 'Không', 'Tên miền công ty. VD: suntech.vn'],
    ['Lĩnh vực', 'Không', 'Mặc định: Công nghệ thông tin'],
    ['Gói dịch vụ', 'Không', 'Mặc định: Enterprise'],
    ['Màu nhận diện', 'Không', 'Mã màu HEX (VD: #3370FF). Để trống sẽ tự chọn'],
    ['Họ tên Admin', 'Không', 'Nếu có Email Admin, hệ thống sẽ tự tạo tài khoản Admin Công ty (COMPANY_ADMIN)'],
    ['Email Admin', 'Không', 'Email đăng nhập cho tài khoản Admin khởi tạo (không trùng email đã có)'],
    ['Mật khẩu Admin', 'Không', 'Mặc định: 123456 nếu bỏ trống'],
  ];
  const guideSheet = buildSheetWithWidths(guideRows, [24, 12, 68]);
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Huong_dan');

  XLSX.writeFile(wb, 'WPMES_Mau_Danh_Sach_Cong_Ty.xlsx');
}

export function downloadCompanyAdminsTemplate(companies = []) {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Mã công ty (*)',
    'Họ và tên (*)',
    'Email đăng nhập (*)',
    'Mật khẩu',
    'Chức danh',
  ];

  const dataSheet = buildSheetWithWidths([headers], [18, 26, 30, 16, 28]);
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh_sach_admin_cong_ty');

  const guideRows = [
    ['Cột', 'Bắt buộc', 'Mô tả'],
    ['Mã công ty (*)', 'Có', 'Nhập Mã công ty (VD: TRINAM, VCLOUD) hoặc ID/Tên công ty đã có trên hệ thống'],
    ['Họ và tên (*)', 'Có', 'Họ tên đầy đủ của Quản trị viên công ty'],
    ['Email đăng nhập (*)', 'Có', 'Email duy nhất dùng để đăng nhập hệ thống'],
    ['Mật khẩu', 'Không', 'Bỏ trống sẽ tự đặt mặc định là 123456'],
    ['Chức danh', 'Không', 'VD: Admin Công ty / HR Admin'],
    [],
    ['Danh sách Mã công ty hiện có trên hệ thống', 'Tên công ty', 'ID'],
    ...companies.map((c) => [c.code, c.name, c.id]),
  ];
  const guideSheet = buildSheetWithWidths(guideRows, [32, 32, 48]);
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Huong_dan');

  XLSX.writeFile(wb, 'WPMES_Mau_Admin_Cong_Ty.xlsx');
}

export function downloadCompanyUsersTemplate(company) {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Họ và tên (*)',
    'Email đăng nhập (*)',
    'Mật khẩu',
    'Vai trò (MEMBER/DIRECTOR)',
    'Chức danh',
    'Phòng ban',
  ];

  const dataSheet = buildSheetWithWidths([headers], [26, 30, 16, 26, 26, 28]);
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh_sach_tai_khoan');

  const guideRows = [
    ['Cột', 'Bắt buộc', 'Mô tả'],
    ['Họ và tên (*)', 'Có', 'Họ và tên đầy đủ của nhân sự. VD: Nguyễn Minh Anh'],
    ['Email đăng nhập (*)', 'Có', `Email duy nhất trong hệ thống. VD: anh.nguyen@${company?.domain || 'company.vn'}`],
    ['Mật khẩu', 'Không', 'Bỏ trống sẽ tự đặt mặc định là 123456'],
    ['Vai trò (MEMBER/DIRECTOR)', 'Không', 'Nhập MEMBER (Nhân viên - mặc định) hoặc DIRECTOR (Lãnh đạo). Hỗ trợ tiếng Việt: Nhân viên / Lãnh đạo'],
    ['Chức danh', 'Không', 'VD: Nhân viên Kỹ thuật / Giám đốc Dự án'],
    ['Phòng ban', 'Không', 'VD: Khối Kỹ thuật Phần mềm / Ban Lãnh đạo'],
    [],
    ['Lưu ý', '', `Tất cả tài khoản nhập từ file này sẽ tự động thuộc công ty: ${company?.name || ''} (${company?.code || ''}).`],
  ];
  const guideSheet = buildSheetWithWidths(guideRows, [28, 12, 72]);
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Huong_dan');

  const safeCode = (company?.code || 'CONGTY').replace(/[^A-Za-z0-9_-]/g, '');
  XLSX.writeFile(wb, `WPMES_Mau_Tai_Khoan_${safeCode}.xlsx`);
}

function readFirstSheetObjects(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          reject(new Error('File Excel không có sheet dữ liệu nào.'));
          return;
        }
        const ws = wb.Sheets[firstSheetName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!aoa || aoa.length < 2) {
          resolve([]);
          return;
        }
        const headerRow = aoa[0].map((h) => normalizeHeader(h));
        const results = [];
        for (let r = 1; r < aoa.length; r += 1) {
          const cells = aoa[r];
          if (!Array.isArray(cells)) continue;
          const hasAnyValue = cells.some((v) => String(v ?? '').trim() !== '');
          if (!hasAnyValue) continue;
          const obj = { _rowNumber: r + 1 };
          headerRow.forEach((normKey, idx) => {
            if (normKey) {
              obj[normKey] = String(cells[idx] ?? '').trim();
            }
          });
          results.push(obj);
        }
        resolve(results);
      } catch (err) {
        reject(new Error(`Không thể đọc file Excel: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Lỗi đọc tệp Excel từ thiết bị.'));
    reader.readAsArrayBuffer(file);
  });
}

function pickField(rawObj, candidates) {
  for (const key of candidates) {
    if (rawObj[key] !== undefined && rawObj[key] !== '') {
      return rawObj[key];
    }
  }
  return '';
}

export async function parseCompaniesExcel(file) {
  const rawRows = await readFirstSheetObjects(file);
  return rawRows.map((r) => ({
    _rowNumber: r._rowNumber,
    name: pickField(r, ['ten cong ty', 'name', 'company name', 'cong ty']),
    code: pickField(r, ['ma cong ty', 'code', 'company code', 'ma']).toUpperCase(),
    domain: pickField(r, ['domain', 'ten mien']),
    industry: pickField(r, ['linh vuc', 'industry', 'nganh nghe']),
    plan: pickField(r, ['goi dich vu', 'plan', 'goi']),
    color: pickField(r, ['mau nhan dien', 'color', 'mau']),
    adminName: pickField(r, ['ho ten admin', 'ten admin', 'admin name', 'adminname']),
    adminEmail: pickField(r, ['email admin', 'admin email', 'adminemail']),
    adminPassword: pickField(r, ['mat khau admin', 'admin password', 'adminpassword']),
  }));
}

export async function parseCompanyAdminsExcel(file) {
  const rawRows = await readFirstSheetObjects(file);
  return rawRows.map((r) => ({
    _rowNumber: r._rowNumber,
    companyCode: pickField(r, ['ma cong ty', 'company code', 'companycode', 'company id', 'companyid', 'cong ty']),
    name: pickField(r, ['ho va ten', 'ho ten', 'name', 'ten']),
    email: pickField(r, ['email dang nhap', 'email']),
    password: pickField(r, ['mat khau', 'password', 'mat khau khoi tao']),
    title: pickField(r, ['chuc danh', 'title']),
  }));
}

export async function parseCompanyUsersExcel(file) {
  const rawRows = await readFirstSheetObjects(file);
  return rawRows.map((r) => ({
    _rowNumber: r._rowNumber,
    name: pickField(r, ['ho va ten', 'ho ten', 'name', 'ten']),
    email: pickField(r, ['email dang nhap', 'email']),
    password: pickField(r, ['mat khau', 'password', 'mat khau khoi tao']),
    role: pickField(r, ['vai tro member director', 'vai tro', 'role']) || 'MEMBER',
    title: pickField(r, ['chuc danh', 'title']),
    department: pickField(r, ['phong ban', 'department']),
  }));
}
