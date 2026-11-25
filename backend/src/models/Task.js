import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: 'application/octet-stream' },
    uploadedAt: { type: String, default: '' },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    // === 1. ĐỊNH DANH & LIÊN KẾT (Identity & Foreign Keys) ===
    id: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    weekId: { type: String, required: true, index: true },
    weekLabel: { type: String, default: '' },
    projectId: { type: String, required: true, index: true },
    projectCode: { type: String, default: '' },
    projectName: { type: String, default: '' },
    projectColor: { type: String, default: '#3370FF' },
    assigneeId: { type: String, required: true, index: true },
    assigneeName: { type: String, default: '' },
    assigneeAvatar: { type: String, default: 'NV' },
    assigneeTitle: { type: String, default: '' },
    assigneeColor: { type: String, default: '#3370FF' },
    assigneeProjectRole: {
      type: String,
      enum: ['PM', 'DEV', 'BA', 'TEST'],
      default: 'DEV',
    },

    // === 2. PHẦN 1: KẾ HOẠCH CÔNG VIỆC (Task Plan) ===
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'Feature' },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    deadline: { type: String, required: true },
    estimatedVolume: { type: Number, min: 0, max: 5, default: 1 },
    estimatedHours: { type: Number, default: 8 },
    actualHours: { type: Number, default: 0 },

    // === 3. PHẦN 2: THỰC TẾ HOÀN THÀNH, MINH CHỨNG & TRẠNG THÁI ===
    completedAt: { type: String, default: null },
    isDone: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
    deliverableUrl: { type: String, default: '' },
    hasEvidence: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending_review', 'completed', 'cancelled'],
      default: 'pending_review',
    },

    // === 4. NHÂN VIÊN TỰ ĐÁNH GIÁ (Self-Assessment) ===
    selfProgress: { type: Number, min: 0, max: 100, default: 0 },
    selfKpiRating: {
      type: String,
      enum: ['exceed', 'met', 'partial', 'unmet', 'pending'],
      default: 'pending',
    },
    selfScore: { type: Number, min: 0, max: 120, default: 0 },
    selfNote: { type: String, default: '' },
    selfSubmittedAt: { type: String, default: null },

    // === 5. LÃNH ĐẠO / PM ĐÁNH GIÁ & NHẬN XÉT (Director / PM Review) ===
    pmQualityRating: {
      type: String,
      enum: ['excellent', 'good', 'rework', 'poor', 'pending'],
      default: 'pending',
    },
    pmQualityScore: { type: Number, min: 0, max: 120, default: null },
    pmFeedback: { type: String, default: '' },
    pmReviewerId: { type: String, default: null },
    pmReviewerName: { type: String, default: '' },
    reworkCount: { type: Number, default: 0 },
    pmReviewedAt: { type: String, default: null },

    // === 6. TRƯỜNG TỔNG HỢP KPI & AI HỖ TRỢ CHẤM ĐIỂM ===
    deadlineStatus: {
      type: String,
      enum: ['on_time', 'due_soon', 'late_done', 'overdue', 'cancelled'],
      default: 'on_time',
    },
    daysLate: { type: Number, default: 0 },
    isLate: { type: Boolean, default: false },
    isLowQuality: { type: Boolean, default: false },
    deadlineFactor: { type: Number, default: 1 },
    qualityFactor: { type: Number, default: 1 },
    effectiveQualityScore: { type: Number, default: 0 },
    finalKpiScore: { type: Number, default: 0 },
    ratingGap: { type: Number, default: 0 },
    hasSignificantGap: { type: Boolean, default: false },
    anomalies: { type: [String], default: [] },
    aiSuggestedScore: { type: Number, default: 0 },
    aiSuggestedRating: {
      type: String,
      enum: ['excellent', 'good', 'rework', 'poor', 'pending'],
      default: 'pending',
    },
    aiGradingHint: { type: String, default: '' },
  },
  { timestamps: true }
);

const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
export default Task;
