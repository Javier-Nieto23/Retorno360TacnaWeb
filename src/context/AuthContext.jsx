import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);
const SESSION_TOKEN_KEY = 'session_token';
const SESSION_EXPIRES_AT_KEY = 'session_expires_at';

function clearStoredSession() {
    localStorage.removeItem('user');
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
}

function getSessionExpiresAt() {
    const rawValue = localStorage.getItem(SESSION_EXPIRES_AT_KEY);
    const parsedValue = Number.parseInt(rawValue || '', 10);
    return Number.isFinite(parsedValue) ? parsedValue : null;
}

function isSessionExpired(expiresAt) {
    return !expiresAt || Date.now() >= expiresAt;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const logout = useCallback(async () => {
        const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
        if (sessionToken) {
            try {
                await authService.logout();
            } catch {
                // Ignorar errores de logout remoto para asegurar limpieza local.
            }
        }
        clearStoredSession();
        setUser(null);
    }, []);

    // Restaurar sesión local al cargar la app
    useEffect(() => {
        async function restoreSession() {
            const storedUser = localStorage.getItem('user');
            const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
            const expiresAt = getSessionExpiresAt();

            if (!storedUser || !sessionToken || isSessionExpired(expiresAt)) {
                clearStoredSession();
                setLoading(false);
                return;
            }

            try {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);

                // Refresca datos para incluir rol actual y cambios de empresa/razón social.
                const { data } = await authService.me();
                localStorage.setItem('user', JSON.stringify(data.user));
                setUser(data.user);
            } catch {
                clearStoredSession();
                setUser(null);
            } finally {
                setLoading(false);
            }
        }

        restoreSession();
    }, []);

    useEffect(() => {
        if (!user) {
            return undefined;
        }

        const expiresAt = getSessionExpiresAt();
        if (isSessionExpired(expiresAt)) {
            logout();
            return undefined;
        }

        const timeoutMs = expiresAt - Date.now();
        const timeoutId = window.setTimeout(() => {
            logout();
        }, timeoutMs);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [user, logout]);

    const login = useCallback(async (nombre_usuario, password) => {
        const { data } = await authService.login(nombre_usuario, password);
        const sessionToken = String(data?.session?.token || '').trim();
        const sessionExpiresAt = Number.parseInt(String(data?.session?.expires_at || ''), 10);

        if (!sessionToken || !Number.isFinite(sessionExpiresAt)) {
            throw new Error('No se pudo iniciar sesión: respuesta de sesión inválida.');
        }

        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
        localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(sessionExpiresAt));
        setUser(data.user);
        return data;
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        if (import.meta.env.DEV) {
            console.error('useAuth se ejecuto sin AuthProvider. Forzando estado seguro temporal en desarrollo.');
            return {
                user: null,
                loading: false,
                login: async () => {
                    throw new Error('AuthProvider no disponible. Recarga la pagina.');
                },
                logout: () => { },
            };
        }
        throw new Error('useAuth debe usarse dentro de AuthProvider');
    }
    return ctx;
}
