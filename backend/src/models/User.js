import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    username: { type: String, default: '' },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, default: '123456' },
    role: {
      type: String,
      enum: ['SYSTEM_ADMIN', 'COMPANY_ADMIN', 'DIRECTOR', 'MEMBER'],
      default: 'MEMBER',
    },
    title: { type: String, default: '' },
    department: { type: String, default: 'Khối Công nghệ' },
    avatar: { type: String, default: '' },
    color: { type: String, default: '#3370FF' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
