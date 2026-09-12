
export function isAdminUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'admin' || user?.is_admin;
}

export function isInventariosUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'inventarios';
}

export function isImpUser(user) {
    const roleName = String(user?.rol_nombre || '').toLowerCase().trim();
    return roleName === 'imp' || roleName === 'importacion' || roleName === 'import';
}

export function isClientUser(user) {
    const roleName = String(user?.rol_nombre || '').toLowerCase();
    return roleName === 'cliente' || roleName === 'clientes';
}

export function isClusterUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'cluster';
}

export function getLandingPath(user) {
    if (isAdminUser(user)) return '/admin';
    if (isInventariosUser(user)) return '/inventarios';
    if (isImpUser(user)) return '/dashboard';
    if (isClientUser(user)) return '/archivos';
    if (isClusterUser(user)) return '/dashboard-calidad';
    return '/login';
}

