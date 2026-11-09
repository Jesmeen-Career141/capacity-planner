# Career141 Capacity Planner

A comprehensive recruitment capacity planning, talent acquisition (TA) workflow management, and candidate tracking platform built for Career141.

---

## 🌟 Features & Modules

The application provides 12 specialized recruitment modules designed for end-to-end recruitment lifecycle tracking:

1. **Dashboard**: High-level KPI visibility, position pipeline metrics, status breakdown, and recruitment performance indicators.
2. **TA Activity Dashboard**: Comprehensive recruiter productivity analytics, planned vs. actual matrices, LinkedIn sourcing metrics, follow-up tracking, and conversion funnels.
3. **Interview Tracker**: Multi-round interview lifecycle management (First, Second, Third, Final rounds), candidate journey timelines, reschedule history, and visual schedule calendar.
4. **Daily Action Board (DAB)**: Unified workspace for TA work allocation, scheduled daily assignments, flagging integration (100% Work, Follow-up, Add-on, Backup, Re-assign, Going Good), and historical activity logs.
5. **Submission Sets**: Batch candidate CV submission tracking, sourcing TA attributions, and structured client package dispatches.
6. **TA Board**: Interactive recruitment capacity allocation board with drag-and-drop / slot-based position assignments across recruiters.
7. **Positions Workspace**: Full-screen workspace with P1–P6 priority management, multi-TA assignees with compact colored chips, rich status filters, inline edits, and deep timeline activity tracking.
8. **Engaged Clients**: Client-level recruitment engagement management separating actively communicating partners from dormant clients.
9. **Strategy Tracker**: Strategic account and position roadmap tracking with active working lists and inactive toggle filters.
10. **Clients Management**: Central repository of client companies, hiring managers, and active engagements.
11. **Talent Acquisition (TAs)**: Recruiter roster management, capacity thresholds, active/departure statuses, and automated workload reassignment.
12. **Archive**: Historical positions repository, placement timestamp tracking (`placedAt`), and audit log inspection.

---

## 🛠️ Architecture & Tech Stack

### Frontend (`/client`)
- **Framework**: [React 19](https://react.dev/) with [Vite 8](https://vitejs.dev/)
- **Routing**: [React Router DOM v7](https://reactrouter.com/)
- **Server State**: [TanStack Query v5](https://tanstack.com/query)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons & Animation**: [Lucide React](https://lucide.dev/), [Framer Motion](https://www.framer.com/motion/)
- **Utilities**: [Axios](https://axios-http.com/), [JSZip](https://stuk.github.io/jszip/)

### Backend (`/server`)
- **Runtime**: [Node.js](https://nodejs.org/) (CommonJS)
- **Web Framework**: [Express 5](https://expressjs.com/)
- **Database & ODM**: [MongoDB Atlas](https://www.mongodb.com/atlas) with [Mongoose 9](https://mongoosejs.com/)
- **Object Storage**: [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/) via `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
- **File Uploads**: [Multer 2](https://github.com/expressjs/multer) with MIME & magic-byte signature validation
- **Scheduling**: [node-cron](https://github.com/node-cron/node-cron)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18.x, v20.x, or later)
- npm (v9.x or later)
- MongoDB instance (MongoDB Atlas cluster or local URI)
- Cloudflare R2 Bucket (for CV storage)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd capacity-planner
   ```

2. **Install dependencies**:
   ```bash
   # Install client dependencies
   cd client
   npm install

   # Install server dependencies
   cd ../server
   npm install
   ```

3. **Configure Environment Variables**:
   - In `client/`:
     ```bash
     cp .env.example .env
     ```
     Set `VITE_API_URL` to your backend API base URL (default: `http://localhost:5000/api`).

   - In `server/`:
     ```bash
     cp .env.example .env
     ```
     Populate the variables with your database credentials and Cloudflare R2 bucket keys (see [Environment Configuration](#environment-configuration) below).

---

## ⚙️ Environment Configuration

### Client (`client/.env`)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base URL for backend Express API endpoints | `http://localhost:5000/api` |

### Server (`server/.env`)
| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | HTTP port for Express server | `5000` |
| `MONGO_URI` | MongoDB Atlas / local connection string | `mongodb+srv://<user>:<pwd>@<cluster>.mongodb.net/...` |
| `CLIENT_URL` | Frontend origin for CORS policy | `http://localhost:5174` |
| `CAPACITY_PLANNER_READ_TOKEN` | Bearer token for secure read-only integrations | `(optional secret token)` |
| `R2_ACCOUNT_ID` | Cloudflare account identifier | `(your Cloudflare Account ID)` |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 API token Access Key | `(your R2 Access Key ID)` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 API token Secret Key | `(your R2 Secret Access Key)` |
| `R2_ENDPOINT` | Cloudflare R2 S3-compatible API endpoint | `https://<account_id>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | Destination bucket for candidate CV files | `career141-cv-vault` |
| `MAX_FILE_SIZE_BYTES` | Maximum allowed CV upload size in bytes | `10485760` (10 MB) |

> ⚠️ **Security Warning**: Real `.env` files are ignored by `.gitignore` and must never be committed to source control. Always use `.env.example` templates for configuration sharing.

---

## 📜 Available Scripts

### Root Helper Commands
From the project root directory:
```bash
# Run client in development mode (Vite)
npm run client:dev

# Build client for production
npm run client:build

# Run server in development mode (nodemon)
npm run server:dev

# Start production server
npm run server:start

# Run complete server test suite
npm run server:test
```

### Server Test Suite
The backend includes automated regression and integration test suites:
```bash
cd server
npm test
```
Tests cover:
- Salary formatting & currency parsing rules
- TA departure & position reassignment logic
- Navigation & status filtering invariants
- Cloudflare R2 upload, presigned download & atomic rollback
- Candidate submission tracking & 3-column pipeline
- 15 end-to-end recruitment lifecycle scenarios
- Bulk CV download ZIP archiving
- Candidate withdrawal workflow & reason taxonomy
- Daily Action Board & assignment lifecycle
- Multi-round interview tracking & calendar generation
- TA activity productivity aggregations

---

## 🌐 Production Deployment

### Frontend (Netlify / Static Hosting)
The client is preconfigured for [Netlify](https://www.netlify.com/) via `netlify.toml`:
- Base directory: `client`
- Build command: `npm run build`
- Publish directory: `dist`
- Single Page Application (SPA) redirects are automatically configured.

### Backend (Node.js Host)
Run on any Node.js environment (Railway, Render, AWS EC2, VPS, Docker):
```bash
cd server
npm install --omit=dev
npm start
```
Ensure all environment variables from `server/.env.example` are configured in your host environment.

---

## 📄 License
Internal proprietary application for Career141. All rights reserved.
