import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

export default function Login() {
    const { login, user } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({ nombre_usuario: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (user) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, navigate]);

    const handleChange = (e) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const nombreUsuario = form.nombre_usuario.trim();
        const password = form.password.trim();

        if (!nombreUsuario || !password) {
            setError('Ingrese usuario y contraseña.');
            return;
        }
        setLoading(true);
        try {
            await login(nombreUsuario, password);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al iniciar sesión.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <span className="logo-icon">📊</span>
                    </div>
                    <h1 className="login-title">Retorno360 Tacna</h1>
                    <p className="login-subtitle">Gestión de archivos Excel</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form" noValidate>
                    <div className="form-group">
                        <label htmlFor="nombre_usuario">Usuario</label>
                        <input
                            id="nombre_usuario"
                            name="nombre_usuario"
                            type="text"
                            autoComplete="username"
                            placeholder="Nombre de usuario"
                            value={form.nombre_usuario}
                            onChange={handleChange}
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Contraseña</label>
                        <div className="password-wrapper">
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                placeholder="Contraseña"
                                value={form.password}
                                onChange={handleChange}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword((v) => !v)}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    {error && <div className="login-error" role="alert">{error}</div>}

                    <button type="submit" className="btn-login" disabled={loading}>
                        {loading ? <span className="spinner" /> : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
