import { REFERENCE_DATE } from '../db/seedData.js';

function diffDays(dateStrA, dateStrB) {
  if (!dateStrA || !dateStrB) return 0;
  const d1 = new Date(`${dateStrA.slice(0, 10)}T00:00:00Z`);
  const d2 = new Date(`${dateStrB.slice(0, 10)}T00:00:00Z`);
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

export const STATUS_LABELS = {
  pending_review: 'Chờ đánh giá',
  completed: 'Đã hoàn thành',
  cancelled: 'Hủy',
};

export const SELF_RATING_LABELS = {
  exceed: 'Vượt mức (110%)',
  met: 'Đạt KPI (100%)',
  partial: 'Đạt một phần (70%)',
  unmet: 'Chưa đạt (<50%)',
  pending: 'Chưa tự chấm',
};

export const PM_QUALITY_LABELS = {
  excellent: 'Xuất sắc',
  good: 'Đạt chuẩn',
  rework: 'Cần sửa lại (Rework)',
  poor: 'Chưa đạt chất lượng',
  pending: 'Chờ đánh giá',
};

export function enrichTask(task, referenceDate = REFERENCE_DATE, maps = {}) {
  const { userMap = {}, projectMap = {}, weekMap = {} } = maps;
  const user = userMap[task.assigneeId] || null;
  const project = projectMap[task.projectId] || null;
  const week = weekMap[task.weekId] || null;

  const isCancelled = task.status === 'cancelled';
  const hasCompletedState = Boolean(task.isDone || task.status === 'completed');
  const attachments = Array.isArray(task.attachments) ? task.attachments : [];
  const hasEvidence = attachments.length > 0 || Boolean(task.deliverableUrl?.trim());
  const estVolume = Number(task.estimatedVolume ?? 1);

  let deadlineStatus = 'on_time';
  let daysLate = 0;

  if (isCancelled) {
    deadlineStatus = 'cancelled';
  } else if (hasCompletedState) {
    const compareDate = task.completedAt || referenceDate;
    const lateDays = diffDays(compareDate, task.deadline);
    if (lateDays > 0) {
      deadlineStatus = 'late_done';
      daysLate = lateDays;
    } else {
      deadlineStatus = 'on_time';
    }
  } else {
    const lateDays = diffDays(referenceDate, task.deadline);
    if (lateDays > 0) {
      deadlineStatus = 'overdue';
      daysLate = lateDays;
    } else {
      const daysRemaining = diffDays(task.deadline, referenceDate);
      deadlineStatus = daysRemaining <= 1 ? 'due_soon' : 'on_time';
    }
  }

  const isLate = !isCancelled && (deadlineStatus === 'overdue' || deadlineStatus === 'late_done');
  const isLowQuality =
    !isCancelled &&
    (task.pmQualityRating === 'poor' ||
      task.pmQualityRating === 'rework' ||
      (task.pmQualityScore !== null && task.pmQualityScore !== undefined && task.pmQualityScore < 75));

  const deadlineFactor = isLate ? Math.max(0.6, Number((1 - daysLate * 0.05).toFixed(2))) : 1.0;

  const qualityFactorMap = {
    excellent: 1.15,
    good: 1.0,
    rework: 0.75,
    poor: 0.45,
    pending: 1.0,
  };
  const qualityFactor = qualityFactorMap[task.pmQualityRating] ?? 1.0;

  const hasPmScore = task.pmQualityScore !== null && task.pmQualityScore !== undefined;
  const effectiveQualityScore = hasPmScore ? Number(task.pmQualityScore) : Number(task.selfScore || 0);
  const selfScoreNum = Number(task.selfScore || 0);

  const baseScore = selfScoreNum * 0.3 + effectiveQualityScore * 0.7;
  const finalKpiScore = isCancelled ? 0 : Math.round(baseScore * deadlineFactor);
  const ratingGap = !isCancelled && hasPmScore ? Math.round(selfScoreNum - Number(task.pmQualityScore)) : 0;
  const hasSignificantGap = !isCancelled && hasPmScore && ratingGap >= 20;

  // Anomaly detection for PM / Director review
  const anomalies = [];
  if (!isCancelled) {
    if (hasCompletedState && !hasEvidence) {
      anomalies.push('Đã tích Xong nhưng chưa đính kèm file hoặc link minh chứng');
    }
    if (hasSignificantGap) {
      anomalies.push(`Tự chấm điểm cao hơn PM/Lãnh đạo ${ratingGap} điểm (Self: ${selfScoreNum} vs Đánh giá: ${task.pmQualityScore})`);
    }
    if (isLate && !task.selfNote?.trim()) {
      anomalies.push(`Trễ hạn ${daysLate} ngày nhưng chưa có giải trình cá nhân`);
    }
    if ((task.reworkCount || 0) >= 2) {
      anomalies.push(`Task đã bị yêu cầu sửa lại (Rework) ${task.reworkCount} lần`);
    }
  }

  // AI KPI Grading Suggestion for PM & Director
  let aiSuggestedScore = 0;
  let aiSuggestedRating = 'pending';
  let aiGradingHint = '';

  if (isCancelled) {
    aiGradingHint = 'Task đã hủy, không tính vào khối lượng Est tuần và KPI.';
  } else {
    let suggested = 95;
    const hints = [];

    if (!hasCompletedState) {
      suggested -= 22;
      hints.push('Chưa tích Xong (-22đ)');
    } else {
      hints.push('Đã tích Xong');
    }

    if (isLate) {
      const penalty = Math.min(25, daysLate * 6);
      suggested -= penalty;
      hints.push(`Trễ deadline ${daysLate} ngày (-${penalty}đ)`);
    } else {
      hints.push('Đúng hạn');
    }

    if (!hasEvidence) {
      suggested -= 10;
      hints.push('Chưa đính kèm file minh chứng (-10đ)');
    } else {
      hints.push(`Có ${attachments.length || 1} minh chứng`);
    }

    if ((task.reworkCount || 0) > 0) {
      const reworkPen = Math.min(20, (task.reworkCount || 0) * 8);
      suggested -= reworkPen;
      hints.push(`Rework ${task.reworkCount} lần (-${reworkPen}đ)`);
    }

    if (hasCompletedState && !isLate && hasEvidence && (task.reworkCount || 0) === 0 && selfScoreNum >= 95) {
      suggested = Math.min(105, suggested + 5);
      hints.push('Hoàn thành xuất sắc (+5đ)');
    }

    aiSuggestedScore = Math.max(30, Math.min(105, Math.round(suggested)));
    if (aiSuggestedScore >= 95) aiSuggestedRating = 'excellent';
    else if (aiSuggestedScore >= 78) aiSuggestedRating = 'good';
    else if (aiSuggestedScore >= 58) aiSuggestedRating = 'rework';
    else aiSuggestedRating = 'poor';

    aiGradingHint = `AI gợi ý ${aiSuggestedScore}đ (${PM_QUALITY_LABELS[aiSuggestedRating]}): ${hints.join(' • ')}`;
  }

  const projectMemberEntry = (project?.members || []).find((m) => m.userId === task.assigneeId);
  const assigneeProjectRole =
    projectMemberEntry?.projectRole || (project?.pmId === task.assigneeId ? 'PM' : 'DEV');

  return {
    ...task,
    estimatedVolume: estVolume,
    endDate: task.endDate || task.deadline,
    isDone: Boolean(task.isDone),
    attachments,
    hasEvidence,
    assigneeName: user?.name || task.assigneeId,
    assigneeAvatar: user?.avatar || 'NV',
    assigneeTitle: user?.title || '',
    assigneeColor: user?.color || '#3370FF',
    assigneeProjectRole,
    projectName: project?.name || task.projectId,
    projectCode: project?.code || task.projectId,
    projectColor: project?.color || '#3370FF',
    weekLabel: week?.label || task.weekId,
    deadlineStatus,
    daysLate,
    isLate,
    isLowQuality,
    deadlineFactor,
    qualityFactor,
    effectiveQualityScore,
    finalKpiScore,
    ratingGap,
    hasSignificantGap,
    anomalies,
    aiSuggestedScore,
    aiSuggestedRating,
    aiGradingHint,
  };
}

export function buildEnrichedTasks(state, referenceDate = REFERENCE_DATE) {
  const userMap = Object.fromEntries(state.users.map((u) => [u.id, u]));
  const projectMap = Object.fromEntries(state.projects.map((p) => [p.id, p]));
  const weekMap = Object.fromEntries(state.weeks.map((w) => [w.id, w]));

  return state.tasks.map((t) =>
    enrichTask(t, referenceDate, { userMap, projectMap, weekMap })
  );
}

export function computeKpiGrade(score) {
  if (score >= 95) return { code: 'S', label: 'Xuất sắc', color: 'emerald' };
  if (score >= 85) return { code: 'A', label: 'Tốt / Đạt chuẩn', color: 'blue' };
  if (score >= 70) return { code: 'B', label: 'Trung bình / Cần cải thiện', color: 'amber' };
  return { code: 'C', label: 'Chưa đạt KPI', color: 'rose' };
}

export function buildWeeklySummary(enrichedTasks, users, projects, weekId = 'all', projectId = 'all') {
  const filteredTasks = enrichedTasks.filter((t) => {
    const matchWeek = weekId === 'all' || !weekId || t.weekId === weekId;
    const matchProject = projectId === 'all' || !projectId || t.projectId === projectId;
    return matchWeek && matchProject;
  });

  const activeFilteredTasks = filteredTasks.filter((t) => t.status !== 'cancelled');
  const members = users.filter((u) => u.role === 'MEMBER');

  const employeeSummaries = members.map((member) => {
    const mAllTasks = filteredTasks.filter((t) => t.assigneeId === member.id);
    const mTasks = mAllTasks.filter((t) => t.status !== 'cancelled');

    const totalTasks = mTasks.length;
    const cancelledTasks = mAllTasks.length - mTasks.length;
    const completedTasks = mTasks.filter((t) => t.status === 'completed' || t.isDone).length;
    const lateTasks = mTasks.filter((t) => t.isLate).length;
    const overdueTasks = mTasks.filter((t) => t.deadlineStatus === 'overdue').length;
    const lowQualityTasks = mTasks.filter((t) => t.isLowQuality).length;
    const pendingReviewTasks = mTasks.filter((t) => t.pmQualityRating === 'pending').length;
    const gapTasks = mTasks.filter((t) => t.hasSignificantGap).length;

    const weeklyEstUsed = Number(
      mTasks.reduce((acc, t) => acc + (Number(t.estimatedVolume) || 0), 0).toFixed(2)
    );
    const weeklyEstRemaining = Math.max(0, Number((5 - weeklyEstUsed).toFixed(2)));
    const totalEstHours = mTasks.reduce((acc, t) => acc + (Number(t.estimatedHours) || 0), 0);
    const totalActualHours = mTasks.reduce((acc, t) => acc + (Number(t.actualHours) || 0), 0);

    const avgSelfScore =
      totalTasks > 0
        ? Math.round(mTasks.reduce((acc, t) => acc + (Number(t.selfScore) || 0), 0) / totalTasks)
        : 0;

    const pmRatedTasks = mTasks.filter((t) => t.pmQualityScore !== null && t.pmQualityScore !== undefined);
    const avgPmScore =
      pmRatedTasks.length > 0
        ? Math.round(
            pmRatedTasks.reduce((acc, t) => acc + Number(t.pmQualityScore), 0) / pmRatedTasks.length
          )
        : null;

    const totalWeight = mTasks.reduce((acc, t) => acc + Math.max(0.5, Number(t.estimatedVolume) || 1), 0);
    const finalWeekKpi =
      totalTasks > 0 && totalWeight > 0
        ? Math.round(
            mTasks.reduce(
              (acc, t) => acc + t.finalKpiScore * Math.max(0.5, Number(t.estimatedVolume) || 1),
              0
            ) / totalWeight
          )
        : 0;

    const aiRecommendedWeekKpi =
      totalTasks > 0 && totalWeight > 0
        ? Math.round(
            mTasks.reduce(
              (acc, t) => acc + t.aiSuggestedScore * Math.max(0.5, Number(t.estimatedVolume) || 1),
              0
            ) / totalWeight
          )
        : 0;

    const projectsMap = {};
    mTasks.forEach((t) => {
      if (!projectsMap[t.projectId]) {
        projectsMap[t.projectId] = {
          projectId: t.projectId,
          projectName: t.projectName,
          projectCode: t.projectCode,
          projectColor: t.projectColor,
          taskCount: 0,
          estVolume: 0,
          hours: 0,
        };
      }
      projectsMap[t.projectId].taskCount += 1;
      projectsMap[t.projectId].estVolume = Number(
        (projectsMap[t.projectId].estVolume + (Number(t.estimatedVolume) || 0)).toFixed(2)
      );
      projectsMap[t.projectId].hours += Number(t.actualHours || t.estimatedHours || 0);
    });

    const projectRoles = projects
      .map((p) => {
        const entry = (p.members || []).find((m) => m.userId === member.id);
        if (!entry) return null;
        return {
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          projectColor: p.color,
          projectRole: entry.projectRole,
        };
      })
      .filter(Boolean);

    const projectsInvolved = Object.values(projectsMap);
    const kpiGrade = computeKpiGrade(finalWeekKpi);
    const aiRecommendedGrade = computeKpiGrade(aiRecommendedWeekKpi);

    return {
      userId: member.id,
      name: member.name,
      email: member.email,
      title: member.title,
      department: member.department,
      avatar: member.avatar,
      color: member.color,
      projectRoles,
      totalTasks,
      cancelledTasks,
      completedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      lateTasks,
      overdueTasks,
      lowQualityTasks,
      pendingReviewTasks,
      gapTasks,
      weeklyEstUsed,
      weeklyEstRemaining,
      totalEstHours,
      totalActualHours,
      avgSelfScore,
      avgPmScore,
      finalWeekKpi,
      kpiGrade,
      aiRecommendedWeekKpi,
      aiRecommendedGrade,
      projectsInvolved,
      hasQualityIssue: lowQualityTasks > 0 || (avgPmScore !== null && avgPmScore < 75),
      hasDeadlineIssue: lateTasks > 0,
      hasGapIssue: gapTasks > 0,
    };
  });

  const projectSummaries = projects.map((proj) => {
    const pTasks = activeFilteredTasks.filter((t) => t.projectId === proj.id);
    const totalTasks = pTasks.length;
    const completedTasks = pTasks.filter((t) => t.status === 'completed' || t.isDone).length;
    const lateTasks = pTasks.filter((t) => t.isLate).length;
    const lowQualityTasks = pTasks.filter((t) => t.isLowQuality).length;
    const avgKpi =
      totalTasks > 0
        ? Math.round(pTasks.reduce((acc, t) => acc + t.finalKpiScore, 0) / totalTasks)
        : 0;

    return {
      projectId: proj.id,
      code: proj.code,
      name: proj.name,
      client: proj.client,
      color: proj.color,
      totalTasks,
      completedTasks,
      lateTasks,
      lowQualityTasks,
      avgKpi,
      totalEstVolume: Number(
        pTasks.reduce((acc, t) => acc + (Number(t.estimatedVolume) || 0), 0).toFixed(2)
      ),
      totalHours: pTasks.reduce((acc, t) => acc + (Number(t.actualHours) || 0), 0),
    };
  });

  const totalTasks = activeFilteredTasks.length;
  const completedTasks = activeFilteredTasks.filter(
    (t) => t.status === 'completed' || t.isDone
  ).length;
  const lateTasks = activeFilteredTasks.filter((t) => t.isLate).length;
  const lowQualityTasks = activeFilteredTasks.filter((t) => t.isLowQuality).length;
  const pendingPmReviews = activeFilteredTasks.filter((t) => t.pmQualityRating === 'pending').length;
  const gapTasks = activeFilteredTasks.filter((t) => t.hasSignificantGap).length;

  const avgTeamKpi =
    totalTasks > 0
      ? Math.round(activeFilteredTasks.reduce((acc, t) => acc + t.finalKpiScore, 0) / totalTasks)
      : 0;

  const onTimeRate =
    totalTasks > 0 ? Math.round(((totalTasks - lateTasks) / totalTasks) * 100) : 100;

  const pmReviewed = activeFilteredTasks.filter((t) => t.pmQualityRating !== 'pending');
  const qualityPassRate =
    pmReviewed.length > 0
      ? Math.round(
          (pmReviewed.filter((t) => !t.isLowQuality).length / pmReviewed.length) * 100
        )
      : 100;

  return {
    weekId,
    projectId,
    overview: {
      totalTasks,
      completedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      lateTasks,
      lowQualityTasks,
      pendingPmReviews,
      gapTasks,
      avgTeamKpi,
      onTimeRate,
      qualityPassRate,
      employeesWithQualityIssues: employeeSummaries.filter((e) => e.hasQualityIssue).length,
      employeesWithDeadlineIssues: employeeSummaries.filter((e) => e.hasDeadlineIssue).length,
    },
    employeeSummaries: employeeSummaries.sort((a, b) => b.finalWeekKpi - a.finalWeekKpi),
    projectSummaries,
    tasks: filteredTasks,
  };
}
