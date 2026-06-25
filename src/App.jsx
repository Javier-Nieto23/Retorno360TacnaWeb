import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import InventariosDashboard from './components/InventariosDashboard';
import Historial from './components/Historial';
import AdminDashboard from './components/AdminDashboard';
import './App.css';
import { getLandingPath, isAdminUser, isInventariosUser } from './utils/roles';

function DashboardRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdminUser(user)) return <Navigate to="/admin" replace />;
  if (isInventariosUser(user)) return <Navigate to="/inventarios" replace />;

  return (
    <>
      <Navbar />
      <main className="app-main"><Dashboard /></main>
    </>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <main className="app-main">{children}</main>
    </>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Cargando...</div>;
  if (user) {
    return <Navigate to={getLandingPath(user)} replace />;
  }
  return children;
}

function InventariosRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdminUser(user)) return <Navigate to="/admin" replace />;
  if (!isInventariosUser(user)) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Navbar />
      <main className="app-main">{children}</main>
    </>
  );
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const isAdmin = isAdminUser(user);
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <Navbar />
      <main className="app-main">{children}</main>
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/dashboard" element={<DashboardRoute />} />
      <Route path="/inventarios" element={<InventariosRoute><InventariosDashboard /></InventariosRoute>} />
      <Route path="/historial" element={<ProtectedRoute><Historial /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
