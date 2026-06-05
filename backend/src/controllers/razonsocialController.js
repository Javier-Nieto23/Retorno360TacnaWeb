const pool = require('../config/database');

// GET /api/razonsocial
async function listar(req, res) {
    try {
        const result = await pool.query('SELECT id, nombre, r2_folder, created_at FROM razon_social ORDER BY nombre');
        res.json({ razon_social: result.rows });
    } catch (err) {
        console.error('Error al listar razón social:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

// POST /api/razonsocial
async function crear(req, res) {
    const { nombre, r2_folder } = req.body;
    if (!nombre || !r2_folder) {
        return res.status(400).json({ error: 'nombre y r2_folder son requeridos.' });
    }

    // Normalizar la carpeta: sin espacios, termina en /
    const folder = r2_folder.trim().replace(/\s+/g, '-').replace(/\/*$/, '/');

    try {
        const result = await pool.query(
            'INSERT INTO razon_social (nombre, r2_folder) VALUES ($1, $2) RETURNING *',
            [nombre.trim(), folder]
        );
        res.status(201).json({ razon_social: result.rows[0] });
    } catch (err) {
        console.error('Error al crear razón social:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
}

module.exports = { listar, crear };
