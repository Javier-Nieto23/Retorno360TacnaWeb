import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
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

const api = axios.create({
    baseURL: API_URL,
    timeout: 30000,
});

// Interceptor: agregar el identificador de usuario local a cada request
api.interceptors.request.use((config) => {
    const storedUser = localStorage.getItem('user');
    const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);
    const expiresAt = getSessionExpiresAt();

    if (!storedUser || !sessionToken) {
        return config;
    }

    if (!expiresAt || Date.now() >= expiresAt) {
        clearStoredSession();
        return config;
    }

    try {
        const user = JSON.parse(storedUser);
        if (user?.id) {
            config.headers['x-user-id'] = String(user.id);
            config.headers['x-session-token'] = sessionToken;
        }
    } catch {
        clearStoredSession();
    }
    return config;
});

// Interceptor: redirigir a login si el usuario no está autenticado
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const requestUrl = error.config?.url || '';
            const isLoginRequest = requestUrl.includes('/auth/login');

            if (!isLoginRequest) {
                clearStoredSession();
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

// Autenticación
export const authService = {
    login: (nombre_usuario, password) =>
        api.post('/auth/login', { nombre_usuario, password }),
    logout: () => api.post('/auth/logout'),
    me: () => api.get('/auth/me'),
    register: (data) => api.post('/auth/register', data),
};

// Archivos
export const fileService = {
    upload: (formData) =>
        api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    razonesSocialesDisponibles: () => api.get('/files/razones-sociales-disponibles'),
    empresasDisponibles: (params) => api.get('/files/empresas-disponibles', { params }),
    historial: (params) => api.get('/files/historial', { params }),
    resumenHistorial: (params) => api.get('/files/historial/resumen', { params }),
    dashboardSummary: (params) => api.get('/files/dashboard-summary', { params }),
    obtenerUrlDescarga: (id) => api.get(`/files/${id}/download-url`),
    eliminar: (id) => api.delete(`/files/${id}`),
    solicitarEliminacion: (id, motivo) => api.post(`/files/${id}/delete-request`, { motivo }),
    listarSolicitudesEliminacion: (params) => api.get('/files/delete-requests', { params }),
    resolverSolicitudEliminacion: (requestId, decision) => api.patch(`/files/delete-requests/${requestId}`, { decision }),
};

// Razón Social
export const razonSocialService = {
    listar: () => api.get('/razonsocial'),
    crear: (data) => api.post('/razonsocial', data),
};

// Administración
export const adminService = {
    dashboard: (params) => api.get('/admin/dashboard', { params }),
    catalogo: () => api.get('/admin/catalogo'),
    crearUsuario: (data) => api.post('/admin/users', data),
};

export default api;
