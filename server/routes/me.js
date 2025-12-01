const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db'); // Asegúrate que esta ruta sea correcta

// --- 1. OBTENER MI PERFIL ---
router.get('/', auth, async (req, res) => {
  try {
    const user = await query('SELECT id, email, name, role FROM users WHERE id = ?', [req.user.id]);
    if (!user.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user[0]);
  } catch (e) {
    console.error("Error en /api/me:", e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// --- 2. OBTENER MI HISTORIAL (ESTA ES LA QUE FALLABA) ---
/**
 * @route   GET /api/me/responses
 * @desc    Devuelve todas las encuestas que YO he respondido
 */
router.get('/responses', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`🔍 [DEBUG] Buscando historial para usuario ID: ${userId}`);

    // Consulta SQL para traer mis respuestas ordenadas por fecha
    const history = await query(
      `SELECT id, instrument, total, severity, risk_level, ts 
       FROM responses 
       WHERE user_id = ? 
       ORDER BY ts DESC`,
      [userId]
    );
    
    console.log(`✅ [DEBUG] Se encontraron ${history.length} registros.`);
    
    // Importante: Devolver un array vacío [] si no hay datos, no null.
    res.json(history || []);

  } catch (e) {
    console.error("❌ [DEBUG] Error en /api/me/responses:", e.message);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;