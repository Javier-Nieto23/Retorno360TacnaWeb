const pool = require('../config/database');

// GET /api/empresa?razon_social_id=ID
async function listarEmpresas(req, res) {
    const razonSocialId = req.query.razon_social_id;
    if (!razonSocialId) {
        return res.status(400).json({ error: 'razon_social_id es requerido' });
    }
    try {
        const result = await pool.query(
            'SELECT id, nombre, carpeta FROM empresa WHERE razon_social_id = $1 ORDER BY nombre',
            [razonSocialId]
        );
        res.json({ empresas: result.rows });
    } catch (err) {
        console.error('Error al listar empresas:', err);
        res.status(500).json({ error: 'Error al listar empresas' });
    }
}

module.exports = { listarEmpresas };