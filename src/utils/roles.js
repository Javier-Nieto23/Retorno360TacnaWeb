export function isAdminUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'admin' || user?.is_admin;
}

export function isInventariosUser(user) {
    return String(user?.rol_nombre || '').toLowerCase() === 'inventarios';
}

export function getLandingPath(user) {
    if (isAdminUser(user)) return '/admin';
    if (isInventariosUser(user)) return '/inventarios';
    return '/dashboard';
}