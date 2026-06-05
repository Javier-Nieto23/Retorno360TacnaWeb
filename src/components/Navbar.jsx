import { useAuth } from '../context/AuthContext';
import { useNavigate, NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <span className="navbar-icon">📊</span>
                <span className="navbar-title">Retorno360 Tacna</span>
            </div>

            <div className="navbar-links">
                <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Dashboard
                </NavLink>
                <NavLink to="/historial" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Historial
                </NavLink>
            </div>

            <div className="navbar-user">
                <div className="user-info">
                    <span className="user-alias">{user?.alias}</span>
                    <span className="user-rs">{user?.razon_social_nombre}</span>
                </div>
                <button className="btn-logout" onClick={handleLogout} title="Cerrar sesión">
                    Salir
                </button>
            </div>
        </nav>
    );
}
