
export function isAdminUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'admin' || user?.is_admin;
}

export function isInventariosUser(user) {
    const roleName = String(user?.rol_nombre || '').toLowerCase().trim();
    return roleName === 'inventarios' || roleName.includes('inventario');
}

export function isImpUser(user) {
    const roleName = String(user?.rol_nombre || '').toLowerCase().trim();
    return roleName === 'imp' || roleName === 'importacion' || roleName === 'import';
}

export function isExpUser(user) {
    const roleName = String(user?.rol_nombre || '').toLowerCase().trim();
    return roleName === 'exp' || roleName === 'exportacion' || roleName === 'export';
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
    if (isExpUser(user)) return '/exp-dashboard';
    if (isClientUser(user)) return '/archivos';
    if (isClusterUser(user)) return '/dashboard-calidad';
    return '/login';
}

