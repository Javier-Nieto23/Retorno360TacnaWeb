import { useEffect, useMemo, useState } from 'react';
import { adminService } from '../services/api';
import './ConfiguracionUsuarios.css';

const CREATE_INITIAL = {
    nombre_usuario: '',
    alias: '',
    password: '',
    confirm_password: '',
    rol_id: '',
    razon_social_id: '',
    empresa_id: '',
};

const EDIT_INITIAL = {
    id: null,
    nombre_usuario: '',
    alias: '',
    password: '',
    confirm_password: '',
    rol_id: '',
    razon_social_id: '',
    empresa_id: '',
};

function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ConfiguracionUsuarios() {
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingUserId, setDeletingUserId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [usuarios, setUsuarios] = useState([]);
    const [catalogo, setCatalogo] = useState({ roles: [], razones_sociales: [], empresas: [] });
    const [createForm, setCreateForm] = useState(CREATE_INITIAL);
    const [editForm, setEditForm] = useState(EDIT_INITIAL);

    const empresasCreate = useMemo(() => {
        if (!createForm.razon_social_id) return [];
        return catalogo.empresas.filter((e) => String(e.razon_social_id) === String(createForm.razon_social_id));
    }, [catalogo.empresas, createForm.razon_social_id]);

    const empresasEdit = useMemo(() => {
        if (!editForm.razon_social_id) return [];
        return catalogo.empresas.filter((e) => String(e.razon_social_id) === String(editForm.razon_social_id));
    }, [catalogo.empresas, editForm.razon_social_id]);

    const cargarDatos = async () => {
        setLoading(true);
        setError('');
        try {
            const [catalogoRes, usuariosRes] = await Promise.all([
                adminService.catalogo(),
                adminService.listarUsuarios(),
            ]);

            const catalogoData = catalogoRes.data || { roles: [], razones_sociales: [], empresas: [] };
            const usuariosData = usuariosRes.data?.usuarios || [];

            setCatalogo(catalogoData);
            setUsuarios(usuariosData);

            const defaultRole = catalogoData.roles.find((r) => String(r.nombrerol || '').toLowerCase() !== 'admin') || catalogoData.roles[0];
            setCreateForm((prev) => ({
                ...prev,
                rol_id: prev.rol_id || (defaultRole ? String(defaultRole.id) : ''),
            }));
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cargar la configuración de usuarios.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, []);

    const onCreateChange = (event) => {
        const { name, value } = event.target;
        setError('');
        setSuccess('');

        if (name === 'razon_social_id') {
            setCreateForm((prev) => ({ ...prev, razon_social_id: value, empresa_id: '' }));
            return;
        }

        setCreateForm((prev) => ({ ...prev, [name]: value }));
    };

    const onEditChange = (event) => {
        const { name, value } = event.target;
        setError('');
        setSuccess('');

        if (name === 'razon_social_id') {
            setEditForm((prev) => ({ ...prev, razon_social_id: value, empresa_id: '' }));
            return;
        }

        setEditForm((prev) => ({ ...prev, [name]: value }));
    };

    const onCreateSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (!createForm.nombre_usuario || !createForm.alias || !createForm.password || !createForm.confirm_password || !createForm.rol_id || !createForm.empresa_id) {
            setError('Completa todos los campos requeridos para crear el usuario.');
            return;
        }

        if (createForm.password !== createForm.confirm_password) {
            setError('La confirmación de contraseña no coincide.');
            return;
        }

        setCreating(true);
        try {
            await adminService.crearUsuario({
                nombre_usuario: createForm.nombre_usuario.trim(),
                alias: createForm.alias.trim(),
                password: createForm.password,
                confirm_password: createForm.confirm_password,
                rol_id: Number(createForm.rol_id),
                empresa_id: Number(createForm.empresa_id),
            });

            setSuccess('Usuario creado correctamente.');
            setCreateForm((prev) => ({
                ...CREATE_INITIAL,
                rol_id: prev.rol_id,
                razon_social_id: prev.razon_social_id,
            }));
            await cargarDatos();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo crear el usuario.');
        } finally {
            setCreating(false);
        }
    };

    const startEdit = (usuario) => {
        setError('');
        setSuccess('');
        setEditForm({
            id: usuario.id,
            nombre_usuario: usuario.nombre_usuario || '',
            alias: usuario.alias || '',
            password: '',
            confirm_password: '',
            rol_id: String(usuario.rol_id || ''),
            razon_social_id: String(usuario.razon_social_id || ''),
            empresa_id: String(usuario.empresa_id || ''),
        });
    };

    const cancelEdit = () => {
        setEditForm(EDIT_INITIAL);
    };

    const onEditSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (!editForm.id) {
            setError('Selecciona un usuario para editar.');
            return;
        }

        if (!editForm.nombre_usuario || !editForm.alias || !editForm.rol_id || !editForm.empresa_id) {
            setError('Completa los campos requeridos para editar el usuario.');
            return;
        }

        if ((editForm.password || editForm.confirm_password) && editForm.password !== editForm.confirm_password) {
            setError('La confirmación de contraseña no coincide.');
            return;
        }

        setSavingEdit(true);
        try {
            await adminService.actualizarUsuario(editForm.id, {
                nombre_usuario: editForm.nombre_usuario.trim(),
                alias: editForm.alias.trim(),
                rol_id: Number(editForm.rol_id),
                empresa_id: Number(editForm.empresa_id),
                password: editForm.password || undefined,
                confirm_password: editForm.confirm_password || undefined,
            });

            setSuccess('Usuario actualizado correctamente.');
            cancelEdit();
            await cargarDatos();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo actualizar el usuario.');
        } finally {
            setSavingEdit(false);
        }
    };

    const onDeleteUser = async (usuario) => {
        const ok = window.confirm(`¿Desea eliminar al usuario "${usuario.alias}"? Esta acción no se puede deshacer.`);
        if (!ok) return;

        setDeletingUserId(usuario.id);
        setError('');
        setSuccess('');
        try {
            await adminService.eliminarUsuario(usuario.id);
            setSuccess('Usuario eliminado correctamente.');
            if (Number(editForm.id) === Number(usuario.id)) {
                cancelEdit();
            }
            await cargarDatos();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo eliminar el usuario.');
        } finally {
            setDeletingUserId(null);
        }
    };

    return (
        <div className="config-page">
            <header className="config-header">
                <h1>Configuración de usuarios</h1>
                <p>Administra usuarios registrados: crear, editar y eliminar.</p>
            </header>

            {error && <div className="config-alert config-alert-error">{error}</div>}
            {success && <div className="config-alert config-alert-success">{success}</div>}

            {loading ? (
                <div className="config-loading">Cargando configuración...</div>
            ) : (
                <div className="config-grid">
                    <section className="config-card">
                        <h2>Crear usuario</h2>
                        <form className="config-form" onSubmit={onCreateSubmit}>
                            <div className="config-row">
                                <label>Usuario*</label>
                                <input name="nombre_usuario" value={createForm.nombre_usuario} onChange={onCreateChange} required />
                            </div>
                            <div className="config-row">
                                <label>Alias*</label>
                                <input name="alias" value={createForm.alias} onChange={onCreateChange} required />
                            </div>
                            <div className="config-row">
                                <label>Rol*</label>
                                <select name="rol_id" value={createForm.rol_id} onChange={onCreateChange} required>
                                    <option value="">Seleccione rol</option>
                                    {catalogo.roles.map((rol) => (
                                        <option key={rol.id} value={rol.id}>{rol.nombrerol}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="config-row">
                                <label>Razón social*</label>
                                <select name="razon_social_id" value={createForm.razon_social_id} onChange={onCreateChange} required>
                                    <option value="">Seleccione razón social</option>
                                    {catalogo.razones_sociales.map((rs) => (
                                        <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="config-row">
                                <label>Empresa*</label>
                                <select name="empresa_id" value={createForm.empresa_id} onChange={onCreateChange} required>
                                    <option value="">Seleccione empresa</option>
                                    {empresasCreate.map((empresa) => (
                                        <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="config-row">
                                <label>Contraseña*</label>
                                <input type="password" name="password" value={createForm.password} onChange={onCreateChange} required />
                            </div>
                            <div className="config-row">
                                <label>Confirmar contraseña*</label>
                                <input type="password" name="confirm_password" value={createForm.confirm_password} onChange={onCreateChange} required />
                            </div>
                            <button className="config-btn" type="submit" disabled={creating}>{creating ? 'Creando...' : 'Crear usuario'}</button>
                        </form>
                    </section>

                    <section className="config-card">
                        <h2>Usuarios registrados</h2>
                        {usuarios.length === 0 ? (
                            <p className="config-empty">No hay usuarios registrados.</p>
                        ) : (
                            <div className="config-table-wrap">
                                <table className="config-table">
                                    <thead>
                                        <tr>
                                            <th>Usuario</th>
                                            <th>Alias</th>
                                            <th>Rol</th>
                                            <th>Razón social</th>
                                            <th>Empresa</th>
                                            <th>Creado</th>
                                            <th>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usuarios.map((usuario) => (
                                            <tr key={usuario.id}>
                                                <td>{usuario.nombre_usuario}</td>
                                                <td>{usuario.alias}</td>
                                                <td>{usuario.rol_nombre || '—'}</td>
                                                <td>{usuario.razon_social_nombre || '—'}</td>
                                                <td>{usuario.empresa_nombre || '—'}</td>
                                                <td>{formatDateTime(usuario.created_at)}</td>
                                                <td>
                                                    <div className="config-actions">
                                                        <button
                                                            type="button"
                                                            className="config-btn config-btn-secondary"
                                                            onClick={() => startEdit(usuario)}
                                                            disabled={savingEdit || deletingUserId === usuario.id}
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="config-btn config-btn-danger"
                                                            onClick={() => onDeleteUser(usuario)}
                                                            disabled={savingEdit || deletingUserId === usuario.id}
                                                        >
                                                            {deletingUserId === usuario.id ? 'Eliminando...' : 'Eliminar'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {editForm.id && (
                            <form className="config-form config-edit-form" onSubmit={onEditSubmit}>
                                <h3>Editar usuario</h3>
                                <div className="config-form-grid">
                                    <div className="config-row">
                                        <label>Usuario*</label>
                                        <input name="nombre_usuario" value={editForm.nombre_usuario} onChange={onEditChange} required />
                                    </div>
                                    <div className="config-row">
                                        <label>Alias*</label>
                                        <input name="alias" value={editForm.alias} onChange={onEditChange} required />
                                    </div>
                                    <div className="config-row">
                                        <label>Rol*</label>
                                        <select name="rol_id" value={editForm.rol_id} onChange={onEditChange} required>
                                            <option value="">Seleccione rol</option>
                                            {catalogo.roles.map((rol) => (
                                                <option key={rol.id} value={rol.id}>{rol.nombrerol}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="config-row">
                                        <label>Razón social*</label>
                                        <select name="razon_social_id" value={editForm.razon_social_id} onChange={onEditChange} required>
                                            <option value="">Seleccione razón social</option>
                                            {catalogo.razones_sociales.map((rs) => (
                                                <option key={rs.id} value={rs.id}>{rs.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="config-row">
                                        <label>Empresa*</label>
                                        <select name="empresa_id" value={editForm.empresa_id} onChange={onEditChange} required>
                                            <option value="">Seleccione empresa</option>
                                            {empresasEdit.map((empresa) => (
                                                <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="config-row">
                                        <label>Nueva contraseña</label>
                                        <input type="password" name="password" value={editForm.password} onChange={onEditChange} placeholder="Opcional" />
                                    </div>
                                    <div className="config-row">
                                        <label>Confirmar nueva contraseña</label>
                                        <input type="password" name="confirm_password" value={editForm.confirm_password} onChange={onEditChange} placeholder="Opcional" />
                                    </div>
                                </div>
                                <div className="config-actions-row">
                                    <button className="config-btn" type="submit" disabled={savingEdit}>{savingEdit ? 'Guardando...' : 'Guardar cambios'}</button>
                                    <button className="config-btn config-btn-secondary" type="button" onClick={cancelEdit} disabled={savingEdit}>Cancelar</button>
                                </div>
                            </form>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}