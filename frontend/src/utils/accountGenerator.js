export function stripVietnameseDiacritics(str) {
  return String(str || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeCompanyCodeSlug(companyCode) {
  return stripVietnameseDiacritics(companyCode)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Generates account username following rule: ten + VietTatHo + VietTatTenDem
 * Examples:
 * - "Phan Đình Thắng" -> "thangPD"
 * - "Nguyễn Văn An" -> "anNV"
 * - "Nguyễn Thị Thùy Tiên" -> "tienNTT"
 */
export function generateAccountUsername(fullName) {
  const cleaned = stripVietnameseDiacritics(fullName)
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);

  if (cleaned.length === 0) return '';
  const lastWord = cleaned[cleaned.length - 1].toLowerCase();
  const initials = cleaned
    .slice(0, -1)
    .map((word) => word[0].toUpperCase())
    .join('');

  return `${lastWord}${initials}`;
}

/**
 * Generates username, email, and password from full name and company code:
 * - username: tenViettathoViettattendem (e.g. thangPD)
 * - email: tentaikhoan@macongty.com (e.g. thangPD@ptech.com)
 * - password: 123456macongty (e.g. 123456ptech)
 */
export function generateAccountDefaults(fullName, companyCode) {
  const username = generateAccountUsername(fullName);
  const codeSlug = normalizeCompanyCodeSlug(companyCode);
  const email = username && codeSlug ? `${username}@${codeSlug}.com` : '';
  const password = codeSlug ? `123456${codeSlug}` : '123456';

  return { username, email, password, codeSlug };
}
