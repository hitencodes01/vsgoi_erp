import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import logo from "../assets/vsgoi.jpeg"

// Plain strings are group headings; arrays are [path, label].
const NAV = {
  ADMIN: [
    ['/', 'Dashboard'],
    'People', ['/students', 'Students'], ['/faculty', 'Faculty'], ['/admins', 'Admins'],
    'Academics', ['/courses', 'Courses'], ['/departments', 'Departments'], ['/subjects', 'Subjects'], ['/assignments', 'Faculty assignment'], ['/lectures', 'Lectures'],
    'Records', ['/records', 'Attendance'], ['/exams', 'Exams'], ['/fees', 'Fees'], ['/notices', 'Notices'],
    'Tools', ['/import', 'Import students'], ['/promote', 'Promote students'], ['/session', 'Session & settings'],
    ['/settings', 'My settings'],
  ],
  TEACHER: [['/', 'Dashboard'], ['/lectures', 'My lectures'], ['/records', 'Attendance'], ['/exams', 'Exams & marks'], ['/notices', 'Notices'], ['/settings', 'Settings']],
  STUDENT: [['/', 'Dashboard'], ['/lectures', 'Timetable'], ['/records', 'My attendance'], ['/results', 'Results'], ['/fees', 'Fees'], ['/notices', 'Notices'], ['/settings', 'Settings']],
};

export default function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <aside className="side">
        <div className="logo"> <img src={logo} height={50} width={100} alt="" /></div>
        <nav aria-label="Main">
          {(NAV[user.role] || NAV.STUDENT).map((item) =>
            typeof item === 'string' ? (
              <div key={item} className="nav-head">{item}</div>
            ) : (
              <NavLink key={item[0]} to={item[0]} end={item[0] === '/'}>{item[1]}</NavLink>
            )
          )}
        </nav>
        <div className="me">
          <div><strong>{user.name}</strong><small>{user.role.toLowerCase()}</small></div>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="view"><Outlet /></main>
    </div>
  );
}
