import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./RegisterPage.css";

// Empresas que maneja el portal. Ajusta esta lista con las empresas reales
// o cárgala desde tu API (GET /api/companies) cuando esté disponible.
const EMPRESAS = [
    "Selecciona una empresa",
    "Empresa Norte S.A. de C.V.",
    "Empresa Centro S.A. de C.V.",
    "Empresa Sur S.A. de C.V.",
];

const initialForm = {
    nombre: "",
    alias: "",
    correo: "",
    empresa: "",
    password: "",
    confirmar: "",
};

function folioAleatorio() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `REG-${n}`;
}

export default function RegisterPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState(initialForm);
    const [errores, setErrores] = useState({});
    const [enviando, setEnviando] = useState(false);
    const [mensajeServidor, setMensajeServidor] = useState(null);
    const [folio] = useState(folioAleatorio);

    const handleChange = (campo) => (e) => {
        setForm((prev) => ({ ...prev, [campo]: e.target.value }));
        setErrores((prev) => ({ ...prev, [campo]: undefined }));
    };

    function validar() {
        const nuevosErrores = {};

        if (!form.nombre.trim()) {
            nuevosErrores.nombre = "Escribe tu nombre completo.";
        }

        if (!form.alias.trim()) {
            nuevosErrores.alias = "Elige un alias para iniciar sesión.";
        } else if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(form.alias.trim())) {
            nuevosErrores.alias = "Usa 3 a 20 caracteres: letras, números, punto, guion o guion bajo.";
        }

        if (!form.correo.trim()) {
            nuevosErrores.correo = "Escribe tu correo electrónico.";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())) {
            nuevosErrores.correo = "El correo no tiene un formato válido.";
        }

        if (!form.empresa || form.empresa === EMPRESAS[0]) {
            nuevosErrores.empresa = "Selecciona la empresa a la que perteneces.";
        }

        if (!form.password) {
            nuevosErrores.password = "Escribe una contraseña.";
        } else if (form.password.length < 8) {
            nuevosErrores.password = "Debe tener al menos 8 caracteres.";
        }

        if (form.confirmar !== form.password) {
            nuevosErrores.confirmar = "Las contraseñas no coinciden.";
        }

        setErrores(nuevosErrores);
        return Object.keys(nuevosErrores).length === 0;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setMensajeServidor(null);

        if (!validar()) return;

        setEnviando(true);
        try {
            // Ajusta esta URL al endpoint real de tu backend.
            const respuesta = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nombre: form.nombre.trim(),
                    alias: form.alias.trim(),
                    correo: form.correo.trim(),
                    empresa: form.empresa,
                    password: form.password,
                }),
            });

            if (!respuesta.ok) {
                const data = await respuesta.json().catch(() => ({}));
                throw new Error(data.mensaje || "No se pudo completar el registro.");
            }

            // Registro exitoso: redirige al login.
            navigate("/login", { state: { registrado: true } });
        } catch (error) {
            setMensajeServidor(error.message || "Ocurrió un error al registrar el usuario.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="registro-fondo">
            <div className="registro-manifiesto">
                <header className="registro-encabezado">
                    <span className="registro-etiqueta">Alta de usuario</span>
                    <span className="registro-folio">{folio}</span>
                </header>

                <h1 className="registro-titulo">Portal de Inventarios</h1>
                <p className="registro-subtitulo">
                    Registra tu acceso para subir y consultar los inventarios de tu empresa.
                </p>

                {mensajeServidor && (
                    <div className="registro-alerta" role="alert">
                        {mensajeServidor}
                    </div>
                )}

                <form className="registro-form" onSubmit={handleSubmit} noValidate>
                    <div className="registro-campo">
                        <label htmlFor="nombre">
                            <span className="registro-num">01</span> Nombre completo
                        </label>
                        <input
                            id="nombre"
                            type="text"
                            placeholder="Ej. María Fernández López"
                            value={form.nombre}
                            onChange={handleChange("nombre")}
                            autoComplete="name"
                        />
                        {errores.nombre && <p className="registro-error">{errores.nombre}</p>}
                    </div>

                    <div className="registro-campo">
                        <label htmlFor="alias">
                            <span className="registro-num">02</span> Alias de usuario
                        </label>
                        <input
                            id="alias"
                            type="text"
                            placeholder="Ej. mfernandez"
                            value={form.alias}
                            onChange={handleChange("alias")}
                            autoComplete="username"
                        />
                        {errores.alias && <p className="registro-error">{errores.alias}</p>}
                    </div>

                    <div className="registro-campo">
                        <label htmlFor="correo">
                            <span className="registro-num">03</span> Correo electrónico
                        </label>
                        <input
                            id="correo"
                            type="email"
                            placeholder="nombre@empresa.com"
                            value={form.correo}
                            onChange={handleChange("correo")}
                            autoComplete="email"
                        />
                        {errores.correo && <p className="registro-error">{errores.correo}</p>}
                    </div>

                    <div className="registro-campo">
                        <label htmlFor="empresa">
                            <span className="registro-num">04</span> Empresa
                        </label>
                        <select id="empresa" value={form.empresa} onChange={handleChange("empresa")}>
                            {EMPRESAS.map((emp) => (
                                <option key={emp} value={emp}>
                                    {emp}
                                </option>
                            ))}
                        </select>
                        {errores.empresa && <p className="registro-error">{errores.empresa}</p>}
                    </div>

                    <div className="registro-fila">
                        <div className="registro-campo">
                            <label htmlFor="password">
                                <span className="registro-num">05</span> Contraseña
                            </label>
                            <input
                                id="password"
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                value={form.password}
                                onChange={handleChange("password")}
                                autoComplete="new-password"
                            />
                            {errores.password && <p className="registro-error">{errores.password}</p>}
                        </div>

                        <div className="registro-campo">
                            <label htmlFor="confirmar">
                                <span className="registro-num">06</span> Confirmar contraseña
                            </label>
                            <input
                                id="confirmar"
                                type="password"
                                placeholder="Repite la contraseña"
                                value={form.confirmar}
                                onChange={handleChange("confirmar")}
                                autoComplete="new-password"
                            />
                            {errores.confirmar && <p className="registro-error">{errores.confirmar}</p>}
                        </div>
                    </div>

                    <button type="submit" className="registro-boton" disabled={enviando}>
                        {enviando ? "Registrando..." : "Crear cuenta"}
                    </button>
                </form>

                <p className="registro-pie">
                    ¿Ya tienes cuenta?{" "}
                    <Link to="/login" className="registro-enlace">
                        Inicia sesión aquí
                    </Link>
                </p>
            </div>
        </div>
    );
}