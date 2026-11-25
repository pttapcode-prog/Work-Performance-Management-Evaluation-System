# WPMES — Work Performance Management and Evaluation System

Ứng dụng Web Full-stack kiến trúc **Frontend / Backend tách biệt** xây dựng bằng **React + Node.js (Express) + MongoDB (Mongoose)** quản trị hiệu suất và đánh giá công việc theo tuần & dự án **WPMES**, tích hợp **AI Watchdog & AI Copilot**.

## Cấu trúc Thư mục
```text
Thay_Hung/
├── backend/              # Node.js + Express + MongoDB (Mongoose) REST API (Port 5000)
│   ├── package.json
│   ├── .env
│   └── src/
│       ├── index.js      # Entry point Backend Server
│       ├── app.js        # Cấu hình Express & CORS
│       ├── models/       # Mongoose Schemas (Project, User, Week, Task)
│       ├── db/           # Kết nối MongoDB + Seed Data + Fallback JSON Store
│       ├── services/     # KPI Formula Engine & AI Watchdog / Copilot Engine
│       └── routes/       # REST API (/api/bootstrap, /api/tasks, /api/ai/*)
├── frontend/             # React 18 + Vite + Tailwind CSS (Port 5173)
│   ├── package.json
│   ├── vite.config.js    # Cấu hình Vite & Proxy /api -> http://localhost:5000
│   ├── .env              # VITE_API_BASE_URL=http://localhost:5000/api
│   └── src/
│       ├── api/          # API Client gọi sang Backend
│       └── components/   # LarkBaseView, SelfAssessmentView, PMQualityReviewView, AIAnalyticsDashboard, EmployeeDetailModal, AICopilotDrawer
├── ARCHITECTURE.md       # Tài liệu đặc tả thiết kế hệ thống & ERD
└── README.md
```

## Tính năng chính (Đăng nhập thực tế, Phân cấp Quản trị 2 Tầng & RBAC)
1. **Xác thực Đăng nhập & Token Session (`LoginView` + Bearer Auth)**:
   - Người dùng đăng nhập bằng Email & Mật khẩu (`POST /api/auth/login`), không cho phép chọn nhanh tài khoản trên thanh điều hướng sau khi vào hệ thống.
   - Mỗi tài khoản chỉ giữ **1 vai trò duy nhất** và gắn cố định với hệ thống hoặc 1 công ty cụ thể.
2. **Tầng 1 — Quản trị Hệ thống (`SYSTEM_ADMIN` / `SystemAdminView`)**:
   - Tạo và quản lý các Công ty (`CMP-TRINAM`, `CMP-VIETCLOUD`...).
   - Tạo, khóa/mở, đặt lại mật khẩu và quản lý tài khoản **Admin của từng Công ty (`COMPANY_ADMIN`)**.
3. **Tầng 2 — Admin Công ty (`COMPANY_ADMIN` / `CompanyAdminView`)**:
   - Tài khoản Admin công ty **chỉ quản lý tài khoản của công ty mình** (tạo, sửa vai trò, khóa/mở, đổi mật khẩu, xóa); **không quản lý dự án hay công việc (task)** (bị ẩn hoàn toàn trên UI và chặn `HTTP 403` ở Backend).
   - Khi tạo tài khoản nghiệp vụ trong công ty, chỉ cấp 2 vai trò: **`DIRECTOR` (Lãnh đạo)** hoặc **`MEMBER` (Nhân viên)** (tự động gắn theo công ty của Admin đó).
4. **Không gian Nghiệp vụ Công ty & Phân quyền theo Dự án (`PM`, `DEV`, `BA`, `TEST`)**:
   - **Cấp Dự án**: Lãnh đạo (`DIRECTOR`) hoặc nhân viên giữ vai trò **`PM`** trong dự án thêm nhân viên công ty vào dự án và chia riêng role: **`PM`**, **`DEV`**, **`BA`**, **`TEST`** (`PATCH /api/projects/:id/members`).
   - **Chỉ Lãnh đạo (`DIRECTOR`) & nhân viên giữ vai trò `PM` trong dự án** mới xem được **AI Tổng hợp Trực quan**, sử dụng **AI Chatbot Copilot**, tạo dự án mới và chấm chất lượng đầu ra.
   - Nhân viên chỉ giữ các role **`DEV` / `BA` / `TEST`** bị ẩn AI & Chatbot trên UI và chặn `HTTP 403` ở Backend, tập trung log task tuần theo dự án được giao và tự đánh giá KPI cuối tuần.

## Hướng dẫn Cài đặt & Chạy Riêng Biệt

### 1. Yêu cầu môi trường
- **Node.js** >= 18.x (đã kiểm tra với v20.20.2)
- **MongoDB** chạy tại `mongodb://127.0.0.1:27017/wpmes` (hoặc MongoDB Atlas) *(Nếu chưa kết nối được MongoDB, Backend tự động kích hoạt chế độ Fallback JSON Store tại `backend/src/db/data.json` để bạn vẫn chạy demo được ngay lập tức)*.

### 2. Chạy Backend (Terminal 1 - Cổng 5000)
```bash
cd backend
npm install
npm run dev
```
Backend API chạy tại: `http://localhost:5000` (Kiểm tra sức khỏe API tại `http://localhost:5000/api/health`).

### 3. Chạy Frontend (Terminal 2 - Cổng 5173)
```bash
cd frontend
npm install
npm run dev
```
Frontend React chạy tại: `http://localhost:5173`.
