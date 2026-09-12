import { useAuth } from '../context/AuthContext';
import { useNavigate, NavLink } from 'react-router-dom';
import './Navbar.css';
import { isAdminUser, isClientUser, isClusterUser, isImpUser, isInventariosUser } from '../utils/roles';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const isAdmin = isAdminUser(user);
    const isClient = isClientUser(user);
    const isCluster = isClusterUser(user);
    const isImp = isImpUser(user);
    const isInventarios = isInventariosUser(user);
    const dashboardPath = isImp ? '/dashboard' : isInventarios ? '/inventarios' : '/dashboard';

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
                {isImp && (
                    <>
                        <NavLink to={dashboardPath} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Dashboard
                        </NavLink>
                        <NavLink to="/historial" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Historial
                        </NavLink>
                    </>
                )}
                {isInventarios && (
                    <NavLink to="/inventarios" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Dashboard
                    </NavLink>
                )}
                {isClient && (
                    <>
                        <NavLink to="/archivos" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Archivos
                        </NavLink>
                        <NavLink to="/solicitud-parte" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Solicitud de parte
                        </NavLink>
                    </>
                )}
                {isAdmin && (
                    <NavLink to="/configuracion" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                        Configuración
                    </NavLink>
                )}
                {isCluster && (
                    <>
                        <NavLink to="/dashboard-calidad" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Dashboard
                        </NavLink>
                        <NavLink to="/dashboard-calidad/graficas" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Gráficas
                        </NavLink>
                    </>
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