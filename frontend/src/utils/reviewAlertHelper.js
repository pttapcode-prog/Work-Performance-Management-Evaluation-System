/**
 * Quy tắc cảnh báo đánh giá Task tuần của WPMES:
 * - Luôn tính theo CHỦ NHẬT CỦA ĐÚNG TUẦN CÓ TASK ĐÓ (dựa trên ngày deadline / endDate / startDate của task).
 * - Hạn chót phải đánh giá xong: 12:00 Trưa Chủ Nhật của tuần có task đó.
 * - Bắt đầu phát cảnh báo khẩn cấp từ: 19:00 (7h tối) Thứ 7 của tuần có task đó.
 */

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

function fmtDDMM(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDDMMYYYY(dt) {
  return `${fmtDDMM(dt)}/${dt.getFullYear()}`;
}

function fmtYYYYMMDD(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Từ một ngày bất kỳ (YYYY-MM-DD), trả về đúng tuần Thứ 2 -> Chủ Nhật chứa ngày đó,
 * kèm mốc bắt đầu cảnh báo (19:00 Thứ 7) và hạn chót đánh giá (12:00 Trưa Chủ Nhật).
 */
export function getCalendarWeekWindowFromDate(dateStr) {
  const anchor = parseLocalDate(dateStr);
  if (!anchor) return null;

  // getDay(): 0 = Chủ Nhật, 1 = Thứ 2, ..., 6 = Thứ 7
  const day = anchor.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const offsetToSunday = day === 0 ? 0 : 7 - day;

  const monday = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + offsetToMonday,
    0,
    0,
    0,
    0
  );

  // 12:00 Trưa Chủ Nhật của đúng tuần chứa ngày này
  const sunday = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + offsetToSunday,
    12,
    0,
    0,
    0
  );

  // 19:00 (7h tối) Thứ 7 ngay trước Chủ Nhật đó
  const warningStart = new Date(
    sunday.getFullYear(),
    sunday.getMonth(),
    sunday.getDate() - 1,
    19,
    0,
    0,
    0
  );

  const mondayKey = fmtYYYYMMDD(monday);
  const sundayKey = fmtYYYYMMDD(sunday);

  return {
    weekKey: `${mondayKey}_${sundayKey}`,
    mondayDateStr: mondayKey,
    sundayKey,
    label: `Tuần (${fmtDDMM(monday)} - ${fmtDDMMYYYY(sunday)})`,
    warningStart,
    evalDeadline: sunday,
    sundayDateStr: fmtDDMMYYYY(sunday),
    saturdayDateStr: fmtDDMM(warningStart),
  };
}

/**
 * Xác định cửa sổ đánh giá của một Task:
 * ƯU TIÊN ngày thực tế của Task (deadline -> endDate -> startDate) để lấy đúng Chủ Nhật
 * của tuần có task đó; chỉ fallback sang weekObj.endDate nếu task không có ngày hợp lệ.
 */
export function getTaskEvaluationWindow(task, weeks = []) {
  const taskDateStr = task?.deadline || task?.endDate || task?.startDate || '';
  if (taskDateStr) {
    const winFromTask = getCalendarWeekWindowFromDate(taskDateStr);
    if (winFromTask) {
      const matchedWeek = (weeks || []).find(
        (w) => w.startDate === winFromTask.mondayDateStr || w.endDate === winFromTask.sundayKey
      );
      return {
        ...winFromTask,
        weekId: matchedWeek?.id || winFromTask.weekKey,
        label: matchedWeek?.label || winFromTask.label,
      };
    }
  }

  const weekObj = (weeks || []).find((w) => w.id === task?.weekId);
  if (weekObj?.endDate || weekObj?.startDate) {
    const winFromWeek = getCalendarWeekWindowFromDate(weekObj.endDate || weekObj.startDate);
    if (winFromWeek) {
      return {
        ...winFromWeek,
        weekId: weekObj.id,
        label: weekObj.label || winFromWeek.label,
      };
    }
  }
  return null;
}

export function getWeekEvaluationWindow(week, fallbackDateStr = '') {
  return getCalendarWeekWindowFromDate(fallbackDateStr || week?.endDate || week?.startDate);
}

export function isTaskNeedingReview(task) {
  if (!task || task.status === 'cancelled') return false;
  const unrated =
    !task.pmQualityRating ||
    task.pmQualityRating === 'pending' ||
    (task.status === 'pending_review' &&
      (task.pmQualityScore === null || task.pmQualityScore === undefined));
  return unrated;
}

/**
 * Trả về mức cảnh báo đánh giá của một task cụ thể tại thời điểm `now`:
 * - 'overdue': Đã qua 12:00 trưa Chủ Nhật của tuần có task đó mà chưa đánh giá (chấm đỏ nhấp nháy)
 * - 'urgent': Từ 19:00 tối Thứ 7 đến trước 12:00 trưa Chủ Nhật của tuần có task đó (chấm cam nhấp nháy)
 * - 'pending': Cần đánh giá nhưng chưa tới 19:00 Thứ 7 của tuần có task đó (chấm vàng chờ đánh giá)
 * - 'none': Đã đánh giá xong hoặc đã hủy
 */
export function getTaskReviewAlert(task, weeks = [], now = new Date()) {
  if (!isTaskNeedingReview(task)) {
    return {
      needsReview: false,
      isWarningActive: false,
      level: 'none',
      label: '',
      shortLabel: '',
      hoursLeft: null,
      window: null,
    };
  }

  const win = getTaskEvaluationWindow(task, weeks);
  if (!win) {
    return {
      needsReview: true,
      isWarningActive: false,
      level: 'pending',
      label: 'Chờ đánh giá',
      shortLabel: 'Chờ đánh giá',
      hoursLeft: null,
      window: null,
    };
  }

  const nowMs = now.getTime();
  if (nowMs >= win.evalDeadline.getTime()) {
    return {
      needsReview: true,
      isWarningActive: true,
      level: 'overdue',
      label: `Quá hạn đánh giá (hạn 12:00 Trưa CN ${win.sundayDateStr})`,
      shortLabel: `Quá hạn (${win.sundayDateStr})`,
      hoursLeft: 0,
      window: win,
    };
  }

  if (nowMs >= win.warningStart.getTime()) {
    const hoursLeft = Math.max(1, Math.ceil((win.evalDeadline.getTime() - nowMs) / (1000 * 60 * 60)));
    return {
      needsReview: true,
      isWarningActive: true,
      level: 'urgent',
      label: `Cảnh báo từ 19:00 T7 (${win.saturdayDateStr}) • Còn ${hoursLeft}h tới 12:00 Trưa CN (${win.sundayDateStr})`,
      shortLabel: `Gấp • Còn ${hoursLeft}h`,
      hoursLeft,
      window: win,
    };
  }

  return {
    needsReview: true,
    isWarningActive: false,
    level: 'pending',
    label: `Cần đánh giá (bắt đầu cảnh báo 19:00 T7 ${win.saturdayDateStr}, hạn 12:00 Trưa CN ${win.sundayDateStr})`,
    shortLabel: `Chờ chấm (hạn CN ${win.sundayDateStr.slice(0, 5)})`,
    hoursLeft: null,
    window: win,
  };
}

export function summarizeReviewAlerts(tasks = [], weeks = [], now = new Date()) {
  let totalNeedingReview = 0;
  let overdueCount = 0;
  let urgentCount = 0;
  let pendingCount = 0;

  for (const t of tasks) {
    const alert = getTaskReviewAlert(t, weeks, now);
    if (!alert.needsReview) continue;
    totalNeedingReview += 1;
    if (alert.level === 'overdue') overdueCount += 1;
    else if (alert.level === 'urgent') urgentCount += 1;
    else pendingCount += 1;
  }

  return {
    totalNeedingReview,
    overdueCount,
    urgentCount,
    pendingCount,
    activeWarningCount: overdueCount + urgentCount,
  };
}
