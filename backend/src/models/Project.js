import mongoose from 'mongoose';

const projectMemberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    projectRole: {
      type: String,
      enum: ['PM', 'DEV', 'BA', 'TEST'],
      default: 'DEV',
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    client: { type: String, default: 'Nội bộ' },
    pmId: { type: String, default: '' },
    members: { type: [projectMemberSchema], default: [] },
    memberIds: { type: [String], default: [] },
    status: { type: String, default: 'active' },
    color: { type: String, default: '#3370FF' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

const Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
export default Project;
