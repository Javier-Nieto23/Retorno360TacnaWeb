import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
    baseURL: API_URL,
    timeout: 30000,
});

// Interceptor: agregar el identificador de usuario local a cada request
api.interceptors.request.use((config) => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            if (user?.id) {
                config.headers['x-user-id'] = String(user.id);
            }
        } catch {
            localStorage.removeItem('user');
        }
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
                localStorage.removeItem('user');
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
    me: () => api.get('/auth/me'),
    register: (data) => api.post('/auth/register', data),
};

// Archivos
export const fileService = {
    upload: (formData) =>
        api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    historial: (params) => api.get('/files/historial', { params }),
    resumenHistorial: (params) => api.get('/files/historial/resumen', { params }),
    eliminar: (id) => api.delete(`/files/${id}`),
};

// Razón Social
export const razonSocialService = {
    listar: () => api.get('/razonsocial'),
    crear: (data) => api.post('/razonsocial', data),
};

// Empresas
export const empresaService = {
    listar: (razon_social_id) => api.get('/empresa', { params: { razon_social_id } }),
};

export default api;
