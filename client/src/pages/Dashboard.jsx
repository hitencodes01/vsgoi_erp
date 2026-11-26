import { useAuth } from '../auth/AuthContext.jsx';
import AdminDashboard from './dashboards/AdminDashboard.jsx';
import FacultyDashboard from './dashboards/FacultyDashboard.jsx';
import StudentDashboard from './dashboards/StudentDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  if (user.role === 'ADMIN') return <AdminDashboard />;
  if (user.role === 'TEACHER') return <FacultyDashboard />;
  return <StudentDashboard />;
}
