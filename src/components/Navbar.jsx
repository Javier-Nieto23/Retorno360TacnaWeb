import { useAuth } from '../context/AuthContext';
import { useNavigate, NavLink } from 'react-router-dom';
import './Navbar.css';
import { isAdminUser, isClientUser, isInventariosUser } from '../utils/roles';
// barra de navegación que se muestra en todas las páginas después de iniciar sesión. Muestra enlaces según el rol del usuario y permite cerrar sesión.
export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const isAdmin = isAdminUser(user);
    const isInventarios = isInventariosUser(user);
    const isClient = isClientUser(user);
    const dashboardPath = isAdmin ? '/admin' : isInventarios ? '/inventarios' : '/dashboard';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <img src="/logo.png" alt="Retorno360 Tacna Logo" width="180" height="170" />
            </div>

            <div className="navbar-links">
                <NavLink to={dashboardPath} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Dashboard
                </NavLink>
                {isInventarios && (
                    <NavLink to="/contabilidad" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Contabilidad
                    </NavLink>
                )}
                {isClient && (
                    <NavLink to="/archivos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Archivos
                    </NavLink>
                )}
                {isClient && (
                    <NavLink to="/solicitud-parte" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Solicitud de parte
                    </NavLink>
                )}
                <NavLink to="/historial" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Historial
                </NavLink>
                {isAdmin && (
                    <NavLink to="/configuracion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Configuración
                    </NavLink>
                )}
                {isAdmin && (
                    <NavLink to="/dashboard-calidad" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Analytics Tacna
                    </NavLink>
                )}
            </div>

            <div className="navbar-user">
                <div className="user-info">
                    <span className="user-alias">{user?.alias}</span>
                    <span className="user-rs">
                        {user?.rol_nombre ? `${user.rol_nombre} · ` : ''}
                        {user?.razon_social_nombre}
                    </span>
                </div>
                <button className="btn-logout" onClick={handleLogout} title="Cerrar sesión">
                    Salir
                </button>
            </div>
        </nav>
    );
}
