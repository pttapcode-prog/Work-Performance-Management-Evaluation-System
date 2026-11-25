import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    domain: { type: String, default: '' },
    industry: { type: String, default: 'Công nghệ thông tin' },
    plan: { type: String, default: 'Enterprise' },
    color: { type: String, default: '#3370FF' },
    logoText: { type: String, default: 'CO' },
  },
  { timestamps: true }
);

const Company = mongoose.models.Company || mongoose.model('Company', companySchema);
export default Company;
