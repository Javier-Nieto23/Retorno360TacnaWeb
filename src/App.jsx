import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Historial from './components/Historial';
import AdminDashboard from './components/AdminDashboard';
import DashboardCalidad from './components/DashboardCalidad';
import ConfiguracionUsuarios from './components/ConfiguracionUsuarios';
import './App.css';
import ArchivosCliente from './components/ArchivosCliente';
import SolicitudParte from './components/SolicitudParte';
import InventariosDashboard from './components/InventariosDashboard';
import { getLandingPath, isAdminUser, isClientUser, isInventariosUser } from './utils/roles';

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

function ClientRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isClientUser(user)) return <Navigate to={getLandingPath(user)} replace />;

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
      <Route path="/archivos" element={<ClientRoute><ArchivosCliente /></ClientRoute>} />
      <Route path="/solicitud-parte" element={<ClientRoute><SolicitudParte /></ClientRoute>} />
      <Route path="/inventarios" element={<InventariosRoute><InventariosDashboard /></InventariosRoute>} />
      <Route path="/contabilidad" element={<InventariosRoute><InventariosDashboard view="contabilidad" /></InventariosRoute>} />
      <Route path="/historial" element={<ProtectedRoute><Historial /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      <Route path="/dashboard-calidad" element={<AdminRoute><DashboardCalidad /></AdminRoute>} />
      <Route path="/configuracion" element={<AdminRoute><ConfiguracionUsuarios /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <div className="app-credit">Portal desarrollado por Javier Nieto ©2026</div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
