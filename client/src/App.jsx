import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import Lectures from './pages/Lectures.jsx';
import LectureForm from './pages/LectureForm.jsx';
import MarkAttendance from './pages/MarkAttendance.jsx';
import Records from './pages/Records.jsx';
import ListPage from './pages/ListPage.jsx';
import PersonForm from './pages/PersonForm.jsx';
import { CourseForm, DepartmentForm, NoticeForm, SubjectForm } from './pages/StructureForms.jsx';
import Assignments from './pages/Assignments.jsx';
import Promote from './pages/Promote.jsx';
import SessionSettings from './pages/SessionSettings.jsx';
import ImportStudents from './pages/ImportStudents.jsx';
import NoticeBoard from './pages/NoticeBoard.jsx';
import { FeeDemandForm, FeeDetail, FeesRoute } from './pages/Fees.jsx';
import { ExamForm, ExamMarks } from './pages/Exams.jsx';
import Results from './pages/Results.jsx';
import MyClass, { MyClassStudent } from './pages/MyClass.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // A temporary password only works for choosing a new one.
  if (user.mustChangePassword && pathname !== '/settings') return <Navigate to="/settings" replace />;
  return children;
}

function Only({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

const ADMIN = ['ADMIN'];
const STAFF = ['ADMIN', 'TEACHER'];
const admin = (el) => <Only roles={ADMIN}>{el}</Only>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notices" element={<NoticeBoard />} />
        <Route path="lectures" element={<Lectures />} />
        <Route path="records" element={<Records />} />
        <Route path="fees" element={<FeesRoute />} />
        <Route path="results" element={<Only roles={['STUDENT']}><Results /></Only>} />

        {/* faculty who coordinate a class (the server checks this) */}
        <Route path="my-class" element={<Only roles={['TEACHER']}><MyClass /></Only>} />
        <Route path="my-class/students/:id" element={<Only roles={['TEACHER']}><MyClassStudent /></Only>} />

        {/* admin and faculty */}
        <Route path="lectures/new" element={<Only roles={STAFF}><LectureForm /></Only>} />
        <Route path="lectures/:id/edit" element={<Only roles={STAFF}><LectureForm /></Only>} />
        <Route path="attendance/mark/:lectureId" element={<Only roles={STAFF}><MarkAttendance /></Only>} />
        <Route path="exams" element={<Only roles={STAFF}><ListPage kind="exams" /></Only>} />
        <Route path="exams/new" element={<Only roles={STAFF}><ExamForm /></Only>} />
        <Route path="exams/:id" element={<Only roles={STAFF}><ExamMarks /></Only>} />

        {/* admin only */}
        {['students', 'faculty', 'admins', 'courses', 'departments', 'subjects'].map((k) => (
          <Route key={k} path={k} element={admin(<ListPage key={k} kind={k} />)} />
        ))}
        {['students', 'faculty', 'admins'].map((k) => (
          <Route key={`n-${k}`} path={`${k}/new`} element={admin(<PersonForm key={k} kind={k} />)} />
        ))}
        {['students', 'faculty', 'admins'].map((k) => (
          <Route key={`e-${k}`} path={`${k}/:id/edit`} element={admin(<PersonForm key={k} kind={k} />)} />
        ))}
        <Route path="courses/new" element={admin(<CourseForm />)} />
        <Route path="courses/:id/edit" element={admin(<CourseForm />)} />
        <Route path="departments/new" element={admin(<DepartmentForm />)} />
        <Route path="departments/:id/edit" element={admin(<DepartmentForm />)} />
        <Route path="subjects/new" element={admin(<SubjectForm />)} />
        <Route path="subjects/:id/edit" element={admin(<SubjectForm />)} />
        <Route path="notices/new" element={admin(<NoticeForm />)} />
        <Route path="notices/:id/edit" element={admin(<NoticeForm />)} />
        <Route path="fees/new" element={admin(<FeeDemandForm />)} />
        <Route path="fees/:id" element={admin(<FeeDetail />)} />
        <Route path="assignments" element={admin(<Assignments />)} />
        <Route path="promote" element={admin(<Promote />)} />
        <Route path="session" element={admin(<SessionSettings />)} />
        <Route path="import" element={admin(<ImportStudents />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
