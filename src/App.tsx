import { NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './routes/DashboardPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { RecordsPage } from './routes/RecordsPage';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/records', label: 'Records', end: false },
];

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">Private workspace</span>
          <strong>Business Records</strong>
        </div>
        <span className="environment-pill">Secure workspace</span>
      </header>

      <nav aria-label="Primary navigation" className="primary-nav">
        {navItems.map((item) => (
          <NavLink
            end={item.end}
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="page-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
