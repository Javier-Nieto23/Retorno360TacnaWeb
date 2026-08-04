export function isAdminUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'admin' || user?.is_admin;
}

export function isInventariosUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'inventarios';
}

export function isClientUser(user) {
    const roleName = String(user?.rol_nombre || '').toLowerCase();
    return roleName === 'cliente' || roleName === 'clientes';
}

export function getLandingPath(user) {
    if (isAdminUser(user)) return '/admin';
    if (isInventariosUser(user)) return '/inventarios';
    return '/dashboard';
}

export function isCluster(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'Cluster';
}
