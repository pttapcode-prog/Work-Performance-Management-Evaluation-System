import { PM_QUALITY_LABELS, STATUS_LABELS } from './kpiService.js';

function classifyDelayCause(note = '') {
  const lower = note.toLowerCase();
  const objectiveKeywords = ['khách hàng', 'đối tác', 'dời lịch', 'chờ', 'sandbox', 'ban đào tạo', 'yêu cầu'];
  const subjectiveKeywords = ['chưa tối ưu', 'ước lượng', 'phân bổ', 'cá nhân', 'lỗi', 'chưa xử lý'];

  const hasObj = objectiveKeywords.some((k) => lower.includes(k));
  const hasSubj = subjectiveKeywords.some((k) => lower.includes(k));

  if (hasObj && hasSubj) return 'Hỗn hợp (Khách quan từ đối tác + Xử lý kỹ thuật nội bộ)';
  if (hasObj) return 'Khách quan (Chờ khách hàng / đối tác phản hồi)';
  if (hasSubj) return 'Chủ quan (Ước lượng thời gian / Tối ưu kỹ thuật)';
  return note.trim() ? 'Cần PM trao đổi làm rõ thêm' : 'Chưa có giải trình nguyên nhân';
}

function extractQualityAction(tasks) {
  const feedbacks = tasks.map((t) => t.pmFeedback.toLowerCase()).join(' ');
  const actions = [];
  if (feedbacks.includes('mobile') || feedbacks.includes('layout') || feedbacks.includes('giao diện')) {
    actions.push('Bắt buộc kiểm tra Responsive Mobile & Checklist UI trước khi chuyển Review');
  }
  if (feedbacks.includes('index') || feedbacks.includes('timeout') || feedbacks.includes('chậm')) {
    actions.push('Tech Lead review query & cơ chế retry/timeout trước khi merge PR');
  }
  if (feedbacks.includes('validate') || feedbacks.includes('test case') || feedbacks.includes('ngoại lệ')) {
    actions.push('Bổ sung Edge-case & Negative test cases vào Definition of Done');
  }
  if (feedbacks.includes('link') || feedbacks.includes('minh chứng')) {
    actions.push('Yêu cầu gắn link PR/tài liệu minh chứng bắt buộc khi đánh dấu 100%');
  }
  if (actions.length === 0) {
    actions.push('Yêu cầu thực hiện Rework theo góp ý PM và nghiệm thu lại trong 24h');
  }
  return actions.join('; ');
}

export function generateWatchdogReport(summary, weekLabel = 'Tuần hiện tại') {
  const { overview, employeeSummaries, tasks } = summary;

  // 1. Ai chưa đạt chất lượng
  const lowQualityUsers = employeeSummaries
    .filter((e) => e.hasQualityIssue)
    .map((emp) => {
      const failedTasks = tasks.filter((t) => t.assigneeId === emp.userId && t.isLowQuality);
      const pmFeedbackSynthesis = failedTasks
        .map(
          (t) =>
            `[${t.projectName}] "${t.title}" (${PM_QUALITY_LABELS[t.pmQualityRating]}, ${t.pmQualityScore ?? '-'}đ): ${
              t.pmFeedback || 'Chưa có nhận xét chi tiết'
            }`
        )
        .join(' | ');

      return {
        userId: emp.userId,
        name: emp.name,
        title: emp.title,
        avatar: emp.avatar,
        color: emp.color,
        avgPmScore: emp.avgPmScore,
        finalWeekKpi: emp.finalWeekKpi,
        failedCount: failedTasks.length,
        totalTasks: emp.totalTasks,
        failedTasks: failedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          projectName: t.projectName,
          projectCode: t.projectCode,
          pmQualityRating: t.pmQualityRating,
          pmQualityLabel: PM_QUALITY_LABELS[t.pmQualityRating],
          pmQualityScore: t.pmQualityScore,
          selfScore: t.selfScore,
          pmFeedback: t.pmFeedback,
          reworkCount: t.reworkCount,
        })),
        aiRootCause: pmFeedbackSynthesis,
        aiRecommendation: extractQualityAction(failedTasks),
      };
    });

  // 2. Ai chậm deadline
  const lateDeadlineUsers = employeeSummaries
    .filter((e) => e.hasDeadlineIssue)
    .map((emp) => {
      const lateTasksList = tasks.filter((t) => t.assigneeId === emp.userId && t.isLate);
      const maxDaysLate = Math.max(...lateTasksList.map((t) => t.daysLate), 0);
      const causeClassification = lateTasksList
        .map((t) => classifyDelayCause(t.selfNote))
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(' & ');

      return {
        userId: emp.userId,
        name: emp.name,
        title: emp.title,
        avatar: emp.avatar,
        color: emp.color,
        lateCount: lateTasksList.length,
        overdueCount: emp.overdueTasks,
        maxDaysLate,
        finalWeekKpi: emp.finalWeekKpi,
        causeClassification,
        lateTasks: lateTasksList.map((t) => ({
          id: t.id,
          title: t.title,
          projectName: t.projectName,
          projectCode: t.projectCode,
          deadline: t.deadline,
          completedAt: t.completedAt,
          status: t.status,
          statusLabel: STATUS_LABELS[t.status],
          deadlineStatus: t.deadlineStatus,
          daysLate: t.daysLate,
          selfNote: t.selfNote,
          causeType: classifyDelayCause(t.selfNote),
        })),
      };
    });

  // 3. Lệch đánh giá Tự chấm vs PM
  const gapAlerts = tasks
    .filter((t) => t.hasSignificantGap)
    .map((t) => ({
      taskId: t.id,
      userId: t.assigneeId,
      userName: t.assigneeName,
      projectName: t.projectName,
      title: t.title,
      selfScore: t.selfScore,
      pmQualityScore: t.pmQualityScore,
      ratingGap: t.ratingGap,
      pmQualityRating: t.pmQualityRating,
      pmQualityLabel: PM_QUALITY_LABELS[t.pmQualityRating],
      pmFeedback: t.pmFeedback,
    }));

  // 4. Executive Summary Narrative
  const topPerformer = employeeSummaries[0];
  const executiveSummary =
    overview.totalTasks === 0
      ? `Chưa có dữ liệu công việc nào được log trong ${weekLabel}.`
      : `Trong ${weekLabel}, toàn đội ngũ đã log ${overview.totalTasks} đầu việc (hoàn thành ${overview.completedTasks}/${overview.totalTasks}, đạt ${overview.completionRate}%). ` +
        `Tỷ lệ đúng hạn đạt ${overview.onTimeRate}%, tỷ lệ đạt chuẩn chất lượng PM là ${overview.qualityPassRate}%, điểm KPI trung bình toàn khối đạt ${overview.avgTeamKpi}/100. ` +
        (lowQualityUsers.length > 0
          ? `⚠️ AI phát hiện ${lowQualityUsers.length} nhân sự chưa đạt chất lượng (${lowQualityUsers.map((u) => u.name).join(', ')}). `
          : `✅ 100% nhân sự đều đạt chất lượng công việc theo yêu cầu PM. `) +
        (lateDeadlineUsers.length > 0
          ? `⏰ Có ${lateDeadlineUsers.length} nhân sự bị chậm deadline (${lateDeadlineUsers.map((u) => `${u.name} - trễ tối đa ${u.maxDaysLate} ngày`).join(', ')}). `
          : `🎯 Không có đầu việc nào bị trễ deadline. `) +
        (topPerformer && topPerformer.totalTasks > 0
          ? `🌟 Cá nhân dẫn đầu hiệu suất tuần này là ${topPerformer.name} với KPI ${topPerformer.finalWeekKpi} điểm.`
          : '');

  return {
    generatedAt: new Date().toISOString(),
    weekLabel,
    overview,
    executiveSummary,
    lowQualityReport: lowQualityUsers,
    lateDeadlineReport: lateDeadlineUsers,
    gapAlerts,
  };
}

export function generateEmployee360Report(user, allEnrichedTasks, weekId = 'all', weekLabel = 'Các tuần') {
  const userAllTasks = allEnrichedTasks.filter(
    (t) => t.assigneeId === user.id && (weekId === 'all' || !weekId || t.weekId === weekId)
  );
  const userTasks = userAllTasks.filter((t) => t.status !== 'cancelled');

  const totalTasks = userTasks.length;
  const completedTasks = userTasks.filter((t) => t.status === 'completed' || t.isDone).length;
  const lateTasks = userTasks.filter((t) => t.isLate);
  const lowQualityTasks = userTasks.filter((t) => t.isLowQuality);

  const totalEstVolume = Number(
    userTasks.reduce((acc, t) => acc + (Number(t.estimatedVolume) || 0), 0).toFixed(2)
  );
  const totalEstHours = userTasks.reduce((acc, t) => acc + (Number(t.estimatedHours) || 0), 0);
  const totalActualHours = userTasks.reduce((acc, t) => acc + (Number(t.actualHours) || 0), 0);

  const avgSelfScore =
    totalTasks > 0
      ? Math.round(userTasks.reduce((acc, t) => acc + (Number(t.selfScore) || 0), 0) / totalTasks)
      : 0;
  const pmRated = userTasks.filter((t) => t.pmQualityScore !== null && t.pmQualityScore !== undefined);
  const avgPmScore =
    pmRated.length > 0
      ? Math.round(pmRated.reduce((acc, t) => acc + Number(t.pmQualityScore), 0) / pmRated.length)
      : null;

  const totalWeight = userTasks.reduce((acc, t) => acc + Math.max(0.5, Number(t.estimatedVolume) || 1), 0);
  const finalKpi =
    totalTasks > 0 && totalWeight > 0
      ? Math.round(
          userTasks.reduce(
            (acc, t) => acc + t.finalKpiScore * Math.max(0.5, Number(t.estimatedVolume) || 1),
            0
          ) / totalWeight
        )
      : 0;

  // Group by project
  const byProjectMap = {};
  userTasks.forEach((t) => {
    if (!byProjectMap[t.projectId]) {
      byProjectMap[t.projectId] = {
        projectId: t.projectId,
        projectName: t.projectName,
        projectCode: t.projectCode,
        projectColor: t.projectColor,
        estVolume: 0,
        hours: 0,
        tasks: [],
      };
    }
    byProjectMap[t.projectId].estVolume = Number(
      (byProjectMap[t.projectId].estVolume + (Number(t.estimatedVolume) || 0)).toFixed(2)
    );
    byProjectMap[t.projectId].hours += Number(t.actualHours || t.estimatedHours || 0);
    byProjectMap[t.projectId].tasks.push(t);
  });

  const projectBreakdown = Object.values(byProjectMap).map((p) => ({
    ...p,
    percentHours:
      totalActualHours > 0
        ? Math.round((p.hours / totalActualHours) * 100)
        : Math.round((p.tasks.length / Math.max(1, totalTasks)) * 100),
  }));

  // AI Narrative evaluation
  const strengths = [];
  const risks = [];
  const nextActions = [];

  if (completedTasks === totalTasks && totalTasks > 0) {
    strengths.push(`Hoàn thành 100% đầu việc đã cam kết (${completedTasks}/${totalTasks} tasks).`);
  }
  if (lateTasks.length === 0 && totalTasks > 0) {
    strengths.push('Tuân thủ kỷ luật deadline tốt, không có task trễ hạn.');
  }
  if (avgPmScore !== null && avgPmScore >= 90) {
    strengths.push(`Chất lượng chuyên môn được PM đánh giá cao (trung bình ${avgPmScore}/100 điểm).`);
  }
  if (projectBreakdown.length >= 2) {
    strengths.push(
      `Đóng góp đa dự án (${projectBreakdown.map((p) => `${p.projectName} ${p.percentHours}%`).join(', ')}).`
    );
  }

  if (lowQualityTasks.length > 0) {
    risks.push(
      `Có ${lowQualityTasks.length} đầu việc chưa đạt chất lượng / phải sửa lại: ${lowQualityTasks
        .map((t) => `"${t.title}" (${t.pmQualityScore ?? '-'}đ)`)
        .join('; ')}.`
    );
    nextActions.push(extractQualityAction(lowQualityTasks));
  }
  if (lateTasks.length > 0) {
    risks.push(
      `Có ${lateTasks.length} đầu việc chậm deadline: ${lateTasks
        .map((t) => `"${t.title}" (trễ ${t.daysLate} ngày - ${classifyDelayCause(t.selfNote)})`)
        .join('; ')}.`
    );
    nextActions.push('Rà soát lại cách ước lượng giờ (Estimation) và báo sớm cho PM khi có vướng mắc.');
  }
  if (avgPmScore !== null && avgSelfScore - avgPmScore >= 15) {
    risks.push(
      `Độ lệch tự đánh giá cao: tự chấm trung bình ${avgSelfScore}đ nhưng PM chấm ${avgPmScore}đ (chênh +${
        avgSelfScore - avgPmScore
      }đ).`
    );
    nextActions.push('Cần bám sát tiêu chí nghiệm thu của PM trước khi tự chấm hoàn thành 100%.');
  }

  if (strengths.length === 0 && totalTasks > 0) {
    strengths.push('Đã chủ động log đầy đủ công việc và tự đánh giá KPI trên hệ thống.');
  }
  if (nextActions.length === 0 && totalTasks > 0) {
    nextActions.push('Duy trì phong độ hiện tại; có thể nhận thêm đầu việc mentor hoặc review chéo cho đồng đội.');
  }

  const aiSummaryNarrative =
    totalTasks === 0
      ? `${user.name} chưa có công việc nào được ghi nhận trong ${weekLabel}.`
      : `Trong ${weekLabel}, ${user.name} (${user.title}) tham gia ${projectBreakdown.length} dự án với tổng cộng ${totalTasks} đầu việc (Khối lượng Est: ${totalEstVolume}/5), đạt điểm KPI tổng hợp ${finalKpi}/100. ` +
        (risks.length > 0
          ? `Điểm cần lưu ý: ${risks.join(' ')}`
          : `Hiệu suất rất ổn định cả về tiến độ lẫn chất lượng nghiệm thu.`);

  return {
    user,
    weekLabel,
    metrics: {
      totalTasks,
      completedTasks,
      lateCount: lateTasks.length,
      lowQualityCount: lowQualityTasks.length,
      totalEstVolume,
      totalEstHours,
      totalActualHours,
      avgSelfScore,
      avgPmScore,
      finalKpi,
    },
    projectBreakdown,
    tasks: userAllTasks,
    aiAnalysis: {
      narrative: aiSummaryNarrative,
      strengths,
      risks,
      nextActions,
    },
  };
}

export function parseSmartTaskInput(rawText, projects, currentWeekId = '2026-W47', assigneeId = 'USR-01', referenceDate = '2026-11-20') {
  const segments = rawText
    .split(/(?:\n|;|(?:\s+và\s+))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  const dayMap = {
    'thứ 2': '2026-11-16',
    't2': '2026-11-16',
    'thứ 3': '2026-11-17',
    't3': '2026-11-17',
    'thứ 4': '2026-11-18',
    't4': '2026-11-18',
    'thứ 5': '2026-11-19',
    't5': '2026-11-19',
    'thứ 6': '2026-11-20',
    't6': '2026-11-20',
    'thứ 7': '2026-11-21',
    't7': '2026-11-21',
    'chủ nhật': '2026-11-22',
    'cn': '2026-11-22',
  };

  return segments.map((seg, index) => {
    const lower = seg.toLowerCase();

    // Detect project
    let matchedProject = projects[0];
    for (const p of projects) {
      if (
        lower.includes(p.code.toLowerCase()) ||
        lower.includes(p.name.toLowerCase()) ||
        (p.code === 'WPMES' && (lower.includes('wpmes') || lower.includes('performance'))) ||
        (p.code === 'LMS' && (lower.includes('lms') || lower.includes('đào tạo'))) ||
        (p.code === 'GOV' && (lower.includes('gov') || lower.includes('dịch vụ công'))) ||
        (p.code === 'ERP' && lower.includes('erp'))
      ) {
        matchedProject = p;
        break;
      }
    }

    // Detect est volume (0.5 - 5) or hours -> convert to est (1 est ~ 8h)
    const estMatch = seg.match(/(\d+(?:[.,]\d+)?)\s*est/i);
    const hoursMatch = seg.match(/(\d+(?:[.,]\d+)?)\s*(?:h|giờ|tiếng)/i);
    const estimatedVolume = estMatch
      ? Math.min(5, Math.max(0.5, Number(estMatch[1].replace(',', '.'))))
      : hoursMatch
      ? Math.min(5, Math.max(0.5, Number((Number(hoursMatch[1].replace(',', '.')) / 8).toFixed(1))))
      : 1.0;
    const estimatedHours = hoursMatch ? Number(hoursMatch[1].replace(',', '.')) : estimatedVolume * 8;

    // Detect deadline
    let deadline = '2026-11-21';
    const isoDateMatch = seg.match(/(202\d-\d{2}-\d{2})/);
    const vnDateMatch = seg.match(/(\d{1,2})\/(\d{1,2})(?:\/(202\d))?/);

    if (isoDateMatch) {
      deadline = isoDateMatch[1];
    } else if (vnDateMatch) {
      const dd = vnDateMatch[1].padStart(2, '0');
      const mm = vnDateMatch[2].padStart(2, '0');
      const yyyy = vnDateMatch[3] || '2026';
      deadline = `${yyyy}-${mm}-${dd}`;
    } else {
      for (const [key, dateVal] of Object.entries(dayMap)) {
        if (lower.includes(key)) {
          deadline = dateVal;
          break;
        }
      }
    }

    // Detect category
    let category = 'Feature';
    if (lower.includes('api') || lower.includes('backend') || lower.includes('db') || lower.includes('sql')) {
      category = 'Backend';
    } else if (lower.includes('ui') || lower.includes('giao diện') || lower.includes('frontend') || lower.includes('figma')) {
      category = 'Frontend';
    } else if (lower.includes('test') || lower.includes('qa') || lower.includes('kiểm thử')) {
      category = 'QA / Test';
    } else if (lower.includes('srs') || lower.includes('tài liệu') || lower.includes('khảo sát')) {
      category = 'BA / Docs';
    } else if (lower.includes('ai') || lower.includes('copilot')) {
      category = 'AI / Backend';
    }

    const priority = lower.includes('gấp') || lower.includes('khẩn') || lower.includes('ưu tiên') ? 'high' : 'medium';

    // Clean title
    let cleanTitle = seg
      .replace(/(?:dự án|project)\s+[a-zA-Z0-9À-ỹ\-_]+/gi, '')
      .replace(/(?:hạn|deadline)\s+(?:202\d-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/202\d)?|thứ\s*\d|chủ nhật|t\d|cn)/gi, '')
      .replace(/(?:hết|khoảng|tầm)?\s*\d+(?:[.,]\d+)?\s*(?:h|giờ|tiếng)/gi, '')
      .replace(/[,]+$/g, '')
      .trim();

    if (!cleanTitle) {
      cleanTitle = seg;
    }
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    return {
      tempId: `DRAFT-${index + 1}`,
      weekId: currentWeekId === 'all' ? '2026-W47' : currentWeekId,
      projectId: matchedProject.id,
      projectName: matchedProject.name,
      assigneeId,
      title: cleanTitle,
      description: `Được bóc tách tự động bởi AI Smart Logger từ ghi chú: "${seg}"`,
      category,
      priority,
      estimatedVolume,
      estimatedHours,
      actualHours: 0,
      startDate: referenceDate,
      endDate: deadline,
      deadline,
      isDone: false,
      attachments: [],
      status: 'pending_review',
      selfProgress: 0,
      selfKpiRating: 'pending',
      selfScore: 0,
      pmQualityRating: 'pending',
    };
  });
}

async function callGeminiIfKeyProvided(apiKey, systemPrompt, userPrompt) {
  if (!apiKey || !apiKey.trim()) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey.trim()
    )}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 900,
        },
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
  } catch {
    return null;
  }
}

export async function answerCopilotQuery(query, context, apiKey = '') {
  const { summary, watchdog, allEnrichedTasks, users, weekId, weekLabel } = context;
  const q = (query || '').toLowerCase();

  // 1. Check if asking about a specific employee
  const matchedUser = users.find((u) => {
    const full = u.name.toLowerCase();
    const lastWord = full.split(' ').slice(-1)[0];
    const lastTwoWords = full.split(' ').slice(-2).join(' ');
    return q.includes(full) || q.includes(lastTwoWords) || (lastWord.length >= 2 && q.includes(lastWord));
  });

  let groundTruthMarkdown = '';
  let structuredCards = [];

  if (matchedUser && matchedUser.role === 'MEMBER') {
    const emp360 = generateEmployee360Report(matchedUser, allEnrichedTasks, weekId, weekLabel);
    const { metrics, projectBreakdown, tasks, aiAnalysis } = emp360;

    groundTruthMarkdown = [
      `### 👤 Chi tiết Công việc & KPI: **${matchedUser.name}** (${matchedUser.title}) — *${weekLabel}*`,
      `- **Điểm KPI tổng hợp:** **${metrics.finalKpi}/100** | **Hoàn thành:** ${metrics.completedTasks}/${metrics.totalTasks} tasks | **Chậm deadline:** ${metrics.lateCount} | **Chưa đạt chất lượng:** ${metrics.lowQualityCount}`,
      `- **Phân bổ dự án:** ${projectBreakdown.map((p) => `${p.projectName} (${p.tasks.length} tasks, ${p.hours}h - ${p.percentHours}%)`).join(' • ') || 'Chưa có'}`,
      ``,
      `**📋 Danh sách đầu việc chi tiết:**`,
      ...tasks.map(
        (t) =>
          `- **[${t.projectCode}] ${t.title}** — Trạng thái: *${STATUS_LABELS[t.status]}* | Hạn: ${t.deadline} ${
            t.isLate ? `(🔴 Trễ ${t.daysLate} ngày)` : '(🟢 Đúng hạn)'
          } | Tự chấm: ${t.selfScore}đ | PM chấm: ${
            t.pmQualityScore !== null ? `${t.pmQualityScore}đ (${PM_QUALITY_LABELS[t.pmQualityRating]})` : 'Chờ chấm'
          }${t.pmFeedback ? `\n  *Nhận xét PM:* "${t.pmFeedback}"` : ''}`
      ),
      ``,
      `**🧠 AI Nhận xét:** ${aiAnalysis.narrative}`,
    ].join('\n');

    structuredCards = [{ type: 'employee_360', userId: matchedUser.id, userName: matchedUser.name, metrics }];
  } else if (q.includes('chất lượng') || q.includes('chưa đạt') || q.includes('rework') || q.includes('sửa lại')) {
    const items = watchdog.lowQualityReport;
    if (items.length === 0) {
      groundTruthMarkdown = `### ✅ Chất lượng Công việc (${weekLabel})\nTuyệt vời! Hiện tại **không có nhân sự nào bị đánh giá Chưa đạt chất lượng hoặc Cần sửa lại** trong ${weekLabel}.`;
    } else {
      groundTruthMarkdown = [
        `### 🚨 Danh sách Nhân sự Chưa đạt Chất lượng / Cần Rework (${weekLabel})`,
        `Phát hiện **${items.length} nhân sự** có đầu việc chưa đạt chuẩn nghiệm thu của PM:`,
        ``,
        ...items.flatMap((u) => [
          `#### 🔴 ${u.name} (${u.title}) — Điểm PM TB: **${u.avgPmScore ?? '-'}đ** | KPI tuần: **${u.finalWeekKpi}đ**`,
          ...u.failedTasks.map(
            (t) =>
              `- **[${t.projectName}] ${t.title}**: *${t.pmQualityLabel}* (**${t.pmQualityScore ?? '-'}đ** vs Tự chấm ${t.selfScore}đ) — PM nhận xét: *"${t.pmFeedback}"*`
          ),
          `- **💡 Khuyến nghị AI:** ${u.aiRecommendation}`,
          ``,
        ]),
      ].join('\n');
      structuredCards = items.map((u) => ({ type: 'quality_alert', userId: u.userId, name: u.name, count: u.failedCount }));
    }
  } else if (q.includes('deadline') || q.includes('trễ') || q.includes('chậm') || q.includes('quá hạn')) {
    const items = watchdog.lateDeadlineReport;
    if (items.length === 0) {
      groundTruthMarkdown = `### 🟢 Tiến độ Deadline (${weekLabel})\nTất cả các công việc trong ${weekLabel} đều **đúng tiến độ**, chưa ghi nhận trường hợp chậm deadline.`;
    } else {
      groundTruthMarkdown = [
        `### ⏰ Danh sách Nhân sự Chậm Deadline (${weekLabel})`,
        `Phát hiện **${items.length} nhân sự** có đầu việc quá hạn hoặc hoàn thành muộn:`,
        ``,
        ...items.flatMap((u) => [
          `#### 🟠 ${u.name} (${u.title}) — **${u.lateCount} task trễ** (tối đa ${u.maxDaysLate} ngày)`,
          `- **Phân loại nguyên nhân AI:** ${u.causeClassification}`,
          ...u.lateTasks.map(
            (t) =>
              `- **[${t.projectName}] ${t.title}**: Hạn ${t.deadline} — ${
                t.deadlineStatus === 'overdue' ? `🔴 Quá hạn ${t.daysLate} ngày (chưa xong)` : `🟠 Hoàn thành trễ ${t.daysLate} ngày`
              }\n  *Giải trình:* "${t.selfNote || 'Chưa ghi giải trình'}"`
          ),
          ``,
        ]),
      ].join('\n');
      structuredCards = items.map((u) => ({ type: 'deadline_alert', userId: u.userId, name: u.name, maxDaysLate: u.maxDaysLate }));
    }
  } else if (q.includes('dự án') || q.includes('project')) {
    groundTruthMarkdown = [
      `### 📊 Tổng hợp Hiệu suất theo Dự án (${weekLabel})`,
      ...summary.projectSummaries.map(
        (p) =>
          `- **${p.name} (${p.code})**: ${p.completedTasks}/${p.totalTasks} tasks xong | Trễ hạn: **${p.lateTasks}** | Chưa đạt chất lượng: **${p.lowQualityTasks}** | KPI TB: **${p.avgKpi}/100** (${p.totalHours}h)`
      ),
    ].join('\n');
  } else if (q.includes('lệch') || q.includes('tự chấm') || q.includes('ảo')) {
    const gaps = watchdog.gapAlerts;
    groundTruthMarkdown =
      gaps.length === 0
        ? `Trong ${weekLabel} không có sự chênh lệch lớn (>=20đ) giữa điểm tự đánh giá và điểm PM.`
        : [
            `### ⚠️ Cảnh báo Độ lệch Tự đánh giá vs PM (${weekLabel})`,
            ...gaps.map(
              (g) =>
                `- **${g.userName}** — [${g.projectName}] *"${g.title}"*: Tự chấm **${g.selfScore}đ** nhưng PM chỉ chấm **${g.pmQualityScore}đ** (Lệch **+${g.ratingGap}đ**, ${g.pmQualityLabel})`
            ),
          ].join('\n');
  } else {
    // Full Executive Overview
    groundTruthMarkdown = [
      `### 🧠 Báo cáo Tổng hợp Điều hành (${weekLabel})`,
      watchdog.executiveSummary,
      ``,
      `**1. Nhân sự chưa đạt chất lượng (${watchdog.lowQualityReport.length}):** ${
        watchdog.lowQualityReport.map((u) => `${u.name} (${u.failedCount} task)`).join(', ') || 'Không có'
      }`,
      `**2. Nhân sự chậm deadline (${watchdog.lateDeadlineReport.length}):** ${
        watchdog.lateDeadlineReport.map((u) => `${u.name} (trễ ${u.maxDaysLate} ngày)`).join(', ') || 'Không có'
      }`,
      `**3. Độ lệch Tự đánh giá vs PM (${watchdog.gapAlerts.length} task):** ${
        watchdog.gapAlerts.map((g) => `${g.userName} (+${g.ratingGap}đ)`).join(', ') || 'Không có'
      }`,
      ``,
      `📌 *Gợi ý: Bạn có thể hỏi cụ thể như "Xem chi tiết công việc của Phan Thắng", "Ai chưa đạt chất lượng?", hoặc "Ai chậm deadline?".*`,
    ].join('\n');
  }

  // Optional Gemini enhancement when API Key is provided
  let usedGemini = false;
  let finalAnswer = groundTruthMarkdown;
  if (apiKey && apiKey.trim()) {
    const systemPrompt =
      'Bạn là AI Trợ lý Quản trị Hiệu suất & Đánh giá Công việc của hệ thống WPMES (Work Performance Management and Evaluation System). Hãy trả lời câu hỏi của PM/Lãnh đạo bằng tiếng Việt chuyên nghiệp, súc tích, bám sát 100% số liệu thật được cung cấp bên dưới (tuyệt đối không bịa thêm số liệu).';
    const userPrompt = `Câu hỏi người dùng: "${query}"\n\nDữ liệu thực tế trích xuất từ MongoDB:\n${groundTruthMarkdown}`;
    const geminiReply = await callGeminiIfKeyProvided(apiKey, systemPrompt, userPrompt);
    if (geminiReply) {
      finalAnswer = geminiReply;
      usedGemini = true;
    }
  }

  return {
    answer: finalAnswer,
    usedGemini,
    structuredCards,
    matchedUserId: matchedUser?.id || null,
  };
}
