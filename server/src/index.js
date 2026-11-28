import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import metaRoutes from './routes/meta.js';
import peopleRoutes from './routes/people.js';
import structureRoutes from './routes/structure.js';
import lectureRoutes from './routes/lectures.js';
import attendanceRoutes from './routes/attendance.js';
import dashboardRoutes from './routes/dashboard.js';
import importRoutes from './routes/import.js';
import feeRoutes from './routes/fees.js';
import examRoutes from './routes/exams.js';
import noticeRoutes from './routes/notices.js';
import coordinatorRoutes from './routes/coordinator.js';

const app = express();
app.set('trust proxy', 1); // behind Nginx on the VPS, so rate limits see the real visitor IP
app.use(helmet());
const allowedOrigins = [
  "https://vsgoi-erp-client.vercel.app",
  "https://vsgoi-erp.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/structure', structureRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/coordinator', coordinatorRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`VSGOI ERP API running on http://localhost:${port}`));
