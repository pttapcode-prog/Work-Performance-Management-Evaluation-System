import * as XLSX from 'xlsx';
import {
  generateAccountDefaults,
  normalizeCompanyCodeSlug,
} from './accountGenerator.js';

const TEMPLATE_ROW_COUNT = 100; // Rows 2..101 pre-filled with live Excel formulas & dropdowns
const CFB = XLSX.CFB || (XLSX['default'] && XLSX['default'].CFB);

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

function escapeXmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildNestedSubstitute(expr, chars, replacement) {
  return chars.reduce((acc, ch) => `SUBSTITUTE(${acc},"${ch}","${replacement}")`, expr);
}

/**
 * Attaches hidden Vietnamese diacritic stripping + account auto-fill formulas
 * across rows 2..(TEMPLATE_ROW_COUNT + 1).
 * Max nesting depth per formula is 28 (< Excel's 64 limit), compatible with Excel 2007-365,
 * Google Sheets, WPS Office, and LibreOffice Calc.
 */
function applyAccountAutoFillFormulas(
  ws,
  {
    nameCol,
    usernameCol,
    emailCol,
    passwordCol,
    companyCodeCol = null,
    fixedCompanyCodeSlug = '',
    visibleColCount,
  }
) {
  const aChars = ['à', 'á', 'ả', 'ã', 'ạ', 'ă', 'ằ', 'ắ', 'ẳ', 'ẵ', 'ặ', 'â', 'ầ', 'ấ', 'ẩ', 'ẫ', 'ậ'];
  const eChars = ['è', 'é', 'ẻ', 'ẽ', 'ẹ', 'ê', 'ề', 'ế', 'ể', 'ễ', 'ệ'];
  const iChars = ['ì', 'í', 'ỉ', 'ĩ', 'ị'];
  const yChars = ['ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'];
  const oChars = ['ò', 'ó', 'ỏ', 'õ', 'ọ', 'ô', 'ồ', 'ố', 'ổ', 'ỗ', 'ộ', 'ơ', 'ờ', 'ớ', 'ở', 'ỡ', 'ợ'];
  const uChars = ['ù', 'ú', 'ủ', 'ũ', 'ụ', 'ư', 'ừ', 'ứ', 'ử', 'ữ', 'ự'];

  const lastRow = TEMPLATE_ROW_COUNT + 1;
  for (let r = 2; r <= lastRow; r += 1) {
    const nameRef = `${nameCol}${r}`;
    const xRef = `X${r}`;
    const yRef = `Y${r}`;
    const zRef = `Z${r}`;
    const aaRef = `AA${r}`;

    // Hidden helper col X: lowercase + strip 'a' accents (17 nested SUBSTITUTE)
    const xFormula = `IF(TRIM(${nameRef})="","",${buildNestedSubstitute(
      `LOWER(TRIM(${nameRef}))`,
      aChars,
      'a'
    )})`;

    // Hidden helper col Y: strip e, i, y, đ (22 nested SUBSTITUTE)
    let yExpr = buildNestedSubstitute(xRef, eChars, 'e');
    yExpr = buildNestedSubstitute(yExpr, iChars, 'i');
    yExpr = buildNestedSubstitute(yExpr, yChars, 'y');
    yExpr = `SUBSTITUTE(${yExpr},"đ","d")`;
    const yFormula = `IF(${xRef}="","",${yExpr})`;

    // Hidden helper col Z: strip o, u (28 nested SUBSTITUTE)
    let zExpr = buildNestedSubstitute(yRef, oChars, 'o');
    zExpr = buildNestedSubstitute(zExpr, uChars, 'u');
    const zFormula = `IF(${yRef}="","",${zExpr})`;

    // Hidden helper col AA: prefix (họ + tên đệm) before last word
    const lastWordExpr = `TRIM(RIGHT(SUBSTITUTE(${zRef}," ",REPT(" ",99)),99))`;
    const aaFormula = `IF(${zRef}="","",IF(ISERROR(FIND(" ",${zRef})),"",TRIM(LEFT(${zRef},LEN(${zRef})-LEN(${lastWordExpr})))))`;

    // Visible username formula: ten + UPPER(initials of họ + tên đệm)
    const initialsExpr =
      `IF(${aaRef}="","",LEFT(${aaRef},1)` +
      `&IFERROR(MID(${aaRef},FIND(" ",${aaRef})+1,1),"")` +
      `&IFERROR(MID(${aaRef},FIND("|",SUBSTITUTE(${aaRef}," ","|",2))+1,1),"")` +
      `&IFERROR(MID(${aaRef},FIND("|",SUBSTITUTE(${aaRef}," ","|",3))+1,1),"")` +
      `&IFERROR(MID(${aaRef},FIND("|",SUBSTITUTE(${aaRef}," ","|",4))+1,1),""))`;
    const usernameFormula = `IF(${zRef}="","",${lastWordExpr}&UPPER(${initialsExpr}))`;

    const userRef = `${usernameCol}${r}`;
    let emailFormula;
    let passwordFormula;
    if (companyCodeCol) {
      const codeRef = `${companyCodeCol}${r}`;
      emailFormula = `IF(OR(${userRef}="",TRIM(${codeRef})=""),"",${userRef}&"@"&LOWER(TRIM(${codeRef}))&".com")`;
      passwordFormula = `IF(OR(TRIM(${nameRef})="",TRIM(${codeRef})=""),"","123456"&LOWER(TRIM(${codeRef})))`;
    } else {
      const slug = fixedCompanyCodeSlug || 'company';
      emailFormula = `IF(${userRef}="","",${userRef}&"@${slug}.com")`;
      passwordFormula = `IF(TRIM(${nameRef})="","","123456${slug}")`;
    }

    ws[xRef] = { t: 's', v: '', f: xFormula };
    ws[yRef] = { t: 's', v: '', f: yFormula };
    ws[zRef] = { t: 's', v: '', f: zFormula };
    ws[aaRef] = { t: 's', v: '', f: aaFormula };
    ws[userRef] = { t: 's', v: '', f: usernameFormula };
    ws[`${emailCol}${r}`] = { t: 's', v: '', f: emailFormula };
    ws[`${passwordCol}${r}`] = { t: 's', v: '', f: passwordFormula };
  }

  ws['!ref'] = `A1:AA${lastRow}`;

  // Ensure columns from visibleColCount..26 are properly sized and X..AA (indices 23..26) are hidden
  const cols = ws['!cols'] || [];
  for (let c = visibleColCount; c < 23; c += 1) {
    if (!cols[c]) cols[c] = {};
  }
  for (let c = 23; c <= 26; c += 1) {
    cols[c] = { hidden: true, wch: 2 };
  }
  ws['!cols'] = cols;
}

function buildSheetWithWidths(rows, widths = []) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths.length > 0) {
    ws['!cols'] = widths.map((wch) => ({ wch }));
  }
  return ws;
}

/**
 * Injects native OOXML <dataValidations> dropdowns into specified worksheet XML files
 * inside the .xlsx archive using XLSX.CFB, and triggers browser download.
 */
function buildValidatedXlsxUint8Array(wb, validationsBySheetPath = {}) {
  const rawArr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const entries = Object.entries(validationsBySheetPath).filter(
    ([, list]) => Array.isArray(list) && list.length > 0
  );
  if (entries.length === 0 || !CFB) {
    return new Uint8Array(rawArr);
  }

  const zip = CFB.read(new Uint8Array(rawArr), { type: 'array' });
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();

  for (const [sheetPath, validations] of entries) {
    const entry = CFB.find(zip, sheetPath);
    if (!entry) continue;
    const xml = decoder.decode(new Uint8Array(entry.content));
    const dvItems = validations
      .map((dv) => {
        const promptAttrs = dv.promptTitle
          ? ` promptTitle="${escapeXmlAttr(dv.promptTitle)}" prompt="${escapeXmlAttr(dv.prompt || '')}"`
          : '';
        return (
          `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"${promptAttrs} sqref="${escapeXmlAttr(dv.sqref)}">` +
          `<formula1>${escapeXmlAttr(dv.formula1)}</formula1>` +
          `</dataValidation>`
        );
      })
      .join('');
    const dvBlock = `<dataValidations count="${validations.length}">${dvItems}</dataValidations>`;
    const patched = xml.includes('</sheetData>')
      ? xml.replace('</sheetData>', `</sheetData>${dvBlock}`)
      : xml.replace('</worksheet>', `${dvBlock}</worksheet>`);
    const encoded = encoder.encode(patched);
    entry.content = encoded;
    entry.size = encoded.length;
  }

  return new Uint8Array(CFB.write(zip, { type: 'array', fileType: 'zip' }));
}

function triggerFileDownload(bytes, filename) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildCompaniesTemplateBytes() {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Tên công ty (*)',
    'Mã công ty (*)',
    'Domain',
    'Lĩnh vực',
    'Gói dịch vụ (Dropdown)',
    'Màu nhận diện',
    'Họ tên Admin',
    'Tên tài khoản Admin (Tự điền)',
    'Email Admin (Tự điền)',
    'Mật khẩu Admin (Tự điền)',
  ];

  const dataSheet = buildSheetWithWidths(
    [headers],
    [28, 16, 20, 24, 22, 16, 24, 26, 30, 22]
  );
  applyAccountAutoFillFormulas(dataSheet, {
    nameCol: 'G',
    usernameCol: 'H',
    emailCol: 'I',
    passwordCol: 'J',
    companyCodeCol: 'B',
    visibleColCount: headers.length,
  });
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh_sach_cong_ty');

  const guideRows = [
    ['Cột', 'Bắt buộc', 'Mô tả & Quy tắc tự điền'],
    ['Tên công ty (*)', 'Có', 'Tên đầy đủ của công ty. VD: Phan Thang Technology Coop'],
    ['Mã công ty (*)', 'Có', 'Mã viết tắt duy nhất, viết hoa không dấu. VD: PTECH'],
    ['Domain', 'Không', 'Tên miền công ty. VD: ptech.com'],
    ['Lĩnh vực', 'Không', 'Mặc định: Công nghệ thông tin'],
    ['Gói dịch vụ (Dropdown)', 'Không', 'Chọn từ danh sách dropdown: Enterprise / Professional / Starter'],
    ['Màu nhận diện', 'Không', 'Mã màu HEX (VD: #3370FF). Để trống sẽ tự chọn'],
    ['Họ tên Admin', 'Không', 'Nhập họ tên đầy đủ (VD: Phan Đình Thắng) — 3 cột bên cạnh tự động điền'],
    ['Tên tài khoản Admin (Tự điền)', 'Tự động', 'Công thức tenVietTatHoDem (VD: Phan Đình Thắng -> thangPD)'],
    ['Email Admin (Tự điền)', 'Tự động', 'Công thức tentaikhoan@macongty.com (VD: thangPD@ptech.com)'],
    ['Mật khẩu Admin (Tự điền)', 'Tự động', 'Công thức 123456macongty (VD: 123456ptech)'],
  ];
  const guideSheet = buildSheetWithWidths(guideRows, [30, 12, 70]);
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Huong_dan');

  return buildValidatedXlsxUint8Array(wb, {
    '/xl/worksheets/sheet1.xml': [
      {
        sqref: `E2:E${TEMPLATE_ROW_COUNT + 1}`,
        formula1: '"Enterprise,Professional,Starter"',
        promptTitle: 'Chọn Gói dịch vụ',
        prompt: 'Chọn gói: Enterprise, Professional hoặc Starter',
      },
    ],
  });
}

export function downloadCompaniesTemplate() {
  const bytes = buildCompaniesTemplateBytes();
  triggerFileDownload(bytes, 'WPMES_Mau_Danh_Sach_Cong_Ty.xlsx');
}

export function buildCompanyAdminsTemplateBytes(companies = []) {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Mã công ty (*)',
    'Họ và tên (*)',
    'Tên tài khoản (Tự điền)',
    'Email đăng nhập (Tự điền)',
    'Mật khẩu (Tự điền)',
    'Chức danh',
  ];

  const dataSheet = buildSheetWithWidths([headers], [18, 26, 24, 30, 22, 26]);
  applyAccountAutoFillFormulas(dataSheet, {
    nameCol: 'B',
    usernameCol: 'C',
    emailCol: 'D',
    passwordCol: 'E',
    companyCodeCol: 'A',
    visibleColCount: headers.length,
  });
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh_sach_admin_cong_ty');

  const companyStartRow = 10;
  const guideRows = [
    ['Cột', 'Bắt buộc', 'Mô tả & Quy tắc tự điền'],
    ['Mã công ty (*)', 'Có', 'Chọn từ Dropdown mã công ty hiện có trên hệ thống (VD: PTECH)'],
    ['Họ và tên (*)', 'Có', 'Nhập họ tên đầy đủ (VD: Phan Đình Thắng) — tự động điền tên tài khoản, email, mật khẩu'],
    ['Tên tài khoản (Tự điền)', 'Tự động', 'Tự sinh theo quy tắc tenVietTatHoDem (VD: thangPD)'],
    ['Email đăng nhập (Tự điền)', 'Tự động', 'Tự sinh theo quy tắc tentaikhoan@macongty.com (VD: thangPD@ptech.com)'],
    ['Mật khẩu (Tự điền)', 'Tự động', 'Tự sinh theo quy tắc 123456macongty (VD: 123456ptech)'],
    ['Chức danh', 'Không', 'VD: Admin Công ty / HR Admin'],
    [],
    ['Danh sách Mã công ty hiện có', 'Tên công ty', 'ID'],
    ...companies.map((c) => [c.code, c.name, c.id]),
  ];
  const guideSheet = buildSheetWithWidths(guideRows, [30, 32, 48]);
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Huong_dan');

  const validations = [];
  if (companies.length > 0) {
    const endRow = companyStartRow + companies.length - 1;
    validations.push({
      sqref: `A2:A${TEMPLATE_ROW_COUNT + 1}`,
      formula1: `Huong_dan!$A$${companyStartRow}:$A$${endRow}`,
      promptTitle: 'Chọn Mã công ty',
      prompt: 'Chọn mã công ty từ danh sách công ty hiện có trên hệ thống',
    });
  }

  return buildValidatedXlsxUint8Array(wb, {
    '/xl/worksheets/sheet1.xml': validations,
  });
}

export function downloadCompanyAdminsTemplate(companies = []) {
  const bytes = buildCompanyAdminsTemplateBytes(companies);
  triggerFileDownload(bytes, 'WPMES_Mau_Admin_Cong_Ty.xlsx');
}

export function buildCompanyUsersTemplateBytes(company) {
  const wb = XLSX.utils.book_new();
  const codeSlug = normalizeCompanyCodeSlug(company?.code || 'company') || 'company';

  const headers = [
    'Họ và tên (*)',
    'Tên tài khoản (Tự điền)',
    'Email đăng nhập (Tự điền)',
    'Mật khẩu (Tự điền)',
    'Vai trò (Chọn dropdown)',
    'Chức danh',
    'Phòng ban',
  ];

  const dataSheet = buildSheetWithWidths([headers], [26, 22, 30, 20, 26, 24, 26]);
  applyAccountAutoFillFormulas(dataSheet, {
    nameCol: 'A',
    usernameCol: 'B',
    emailCol: 'C',
    passwordCol: 'D',
    fixedCompanyCodeSlug: codeSlug,
    visibleColCount: headers.length,
  });
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Danh_sach_tai_khoan');

  const guideRows = [
    ['Cột', 'Bắt buộc', 'Mô tả & Quy tắc tự điền'],
    ['Họ và tên (*)', 'Có', 'Nhập họ và tên đầy đủ (VD: Phan Đình Thắng). Khi nhập xong, 3 cột bên cạnh sẽ tự động điền!'],
    ['Tên tài khoản (Tự điền)', 'Tự động', 'Tự sinh dạng tenVietTatHoDem (VD: Phan Đình Thắng -> thangPD, Nguyễn Văn An -> anNV)'],
    ['Email đăng nhập (Tự điền)', 'Tự động', `Tự sinh dạng tentaikhoan@${codeSlug}.com (VD: thangPD@${codeSlug}.com)`],
    ['Mật khẩu (Tự điền)', 'Tự động', `Tự sinh mặc định: 123456${codeSlug}`],
    ['Vai trò (Chọn dropdown)', 'Có (Dropdown)', 'Bấm mũi tên dropdown ở từng ô cột E để chọn: Nhân viên (MEMBER) hoặc Lãnh đạo (DIRECTOR)'],
    ['Chức danh', 'Không', 'VD: Nhân viên Kỹ thuật / Giám đốc Dự án'],
    ['Phòng ban', 'Không', 'VD: Khối Kỹ thuật Phần mềm / Ban Lãnh đạo'],
    [],
    ['Lưu ý', '', `Tất cả tài khoản nhập từ file này tự động thuộc công ty: ${company?.name || ''} (${company?.code || ''}).`],
  ];
  const guideSheet = buildSheetWithWidths(guideRows, [28, 16, 76]);
  XLSX.utils.book_append_sheet(wb, guideSheet, 'Huong_dan');

  return buildValidatedXlsxUint8Array(wb, {
    '/xl/worksheets/sheet1.xml': [
      {
        sqref: `E2:E${TEMPLATE_ROW_COUNT + 1}`,
        formula1: '"Nhân viên (MEMBER),Lãnh đạo (DIRECTOR)"',
        promptTitle: 'Chọn Vai trò trong Công ty',
        prompt: 'Chọn Nhân viên (MEMBER) hoặc Lãnh đạo (DIRECTOR)',
      },
    ],
  });
}

export function downloadCompanyUsersTemplate(company) {
  const bytes = buildCompanyUsersTemplateBytes(company);
  const safeCode = (company?.code || 'CONGTY').replace(/[^A-Za-z0-9_-]/g, '');
  triggerFileDownload(bytes, `WPMES_Mau_Tai_Khoan_${safeCode}.xlsx`);
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
          const visibleCells = cells.slice(0, headerRow.length);
          const hasAnyValue = visibleCells.some((v) => String(v ?? '').trim() !== '');
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
  return rawRows
    .map((r) => {
      const name = pickField(r, ['ten cong ty', 'name', 'company name', 'cong ty']);
      const code = pickField(r, ['ma cong ty', 'code', 'company code', 'ma']).toUpperCase();
      const adminName = pickField(r, ['ho ten admin', 'ten admin', 'admin name', 'adminname']);
      const defaults = generateAccountDefaults(adminName, code);
      const adminUsername =
        pickField(r, ['ten tai khoan admin tu dien', 'ten tai khoan admin', 'admin username']) ||
        defaults.username;
      const adminEmail =
        pickField(r, ['email admin tu dien', 'email admin', 'admin email', 'adminemail']) ||
        (adminName ? defaults.email : '');
      const adminPassword =
        pickField(r, ['mat khau admin tu dien', 'mat khau admin', 'admin password', 'adminpassword']) ||
        (adminName ? defaults.password : '');

      return {
        _rowNumber: r._rowNumber,
        name,
        code,
        domain: pickField(r, ['domain', 'ten mien']),
        industry: pickField(r, ['linh vuc', 'industry', 'nganh nghe']),
        plan: pickField(r, ['goi dich vu dropdown', 'goi dich vu', 'plan', 'goi']),
        color: pickField(r, ['mau nhan dien', 'color', 'mau']),
        adminName,
        adminUsername,
        adminEmail,
        adminPassword,
      };
    })
    .filter((row) => row.name || row.code);
}

export async function parseCompanyAdminsExcel(file) {
  const rawRows = await readFirstSheetObjects(file);
  return rawRows
    .map((r) => {
      const companyCode = pickField(r, [
        'ma cong ty',
        'company code',
        'companycode',
        'company id',
        'companyid',
        'cong ty',
      ]);
      const name = pickField(r, ['ho va ten', 'ho ten', 'name', 'ten']);
      const defaults = generateAccountDefaults(name, companyCode);
      const username =
        pickField(r, ['ten tai khoan tu dien', 'ten tai khoan', 'username', 'tai khoan']) ||
        defaults.username;
      const email =
        pickField(r, ['email dang nhap tu dien', 'email dang nhap', 'email']) || defaults.email;
      const password =
        pickField(r, ['mat khau tu dien', 'mat khau', 'password', 'mat khau khoi tao']) ||
        defaults.password;

      return {
        _rowNumber: r._rowNumber,
        companyCode,
        name,
        username,
        email,
        password,
        title: pickField(r, ['chuc danh', 'title']),
      };
    })
    .filter((row) => row.name || row.companyCode || row.email);
}

export async function parseCompanyUsersExcel(file, companyCode = '') {
  const rawRows = await readFirstSheetObjects(file);
  return rawRows
    .map((r) => {
      const name = pickField(r, ['ho va ten', 'ho ten', 'name', 'ten']);
      const defaults = generateAccountDefaults(name, companyCode);
      const username =
        pickField(r, ['ten tai khoan tu dien', 'ten tai khoan', 'username', 'tai khoan']) ||
        defaults.username;
      const email =
        pickField(r, ['email dang nhap tu dien', 'email dang nhap', 'email']) || defaults.email;
      const password =
        pickField(r, ['mat khau tu dien', 'mat khau', 'password', 'mat khau khoi tao']) ||
        defaults.password;
      const rawRole =
        pickField(r, [
          'vai tro chon dropdown',
          'vai tro member director',
          'vai tro',
          'role',
        ]) || 'MEMBER';

      return {
        _rowNumber: r._rowNumber,
        name,
        username,
        email,
        password,
        role: rawRole,
        title: pickField(r, ['chuc danh', 'title']),
        department: pickField(r, ['phong ban', 'department']),
      };
    })
    .filter((row) => row.name || row.email);
}
