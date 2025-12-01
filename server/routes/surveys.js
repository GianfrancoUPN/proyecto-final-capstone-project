const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin')
const { scoreByType } = require('../utils/scoring');
const { getQuestions } = require('../utils/questions');
const { predictRisk} = require('../utils/prediction')
const router = express.Router();

const SURVEY_OPTIONS={
  standard:[
    { label: 'Ningún día', value: 0 },
    { label: 'Varios días', value: 1 },
    { label: 'Más de la mitad de los días', value: 2 },
    { label: 'Casi todos los días', value: 3 },
  ],
  madrs:[
    { label: '0', value: 0 }, { label: '1', value: 1 }, { label: '2', value: 2 },
    { label: '3', value: 3 }, { label: '4', value: 4 }, { label: '5', value: 5 },
    { label: '6', value: 6 }
  ]
};
/**
 * @route   GET /api/surveys/:type/questions
 * @desc    Obtener preguntas Y OPCIONES para una encuesta
 */
router.get('/:type/questions', async (req, res) => {
  try {
    const type = (req.params.type || '').toLowerCase();
    const spec = getQuestions(type);
    if (!spec) return res.status(404).json({ error: 'Encuesta no encontrada' });
    
    const options = (type === 'madrs') ? SURVEY_OPTIONS.madrs : SURVEY_OPTIONS.standard;
    res.json({ 
      type: spec.type,
      instrument: spec.instrument,
      items:spec.items,
      options:options
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});
/**
 * @route   POST /api/surveys/:type/submit
 * @desc    Recibe un ARRAY de respuestas y las guarda
 */
router.post('/:type/submit', auth, async (req, res) => {
  try {
    const type = (req.params.type || '').toLowerCase();
    const spec = getQuestions(type);
    if (!spec) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const { answers, ts } = req.body;
    
    // --- 1. CORREGIDO: El typo (era req.user.id) ---
    const userId = req.user.id; // <-- Usamos 'userId' (minúscula) y 'req.user'

    // Validación mejorada
    if (!Array.isArray(answers) || answers.length !== spec.items.length) { 
        return res.status(400).json({ error: 'Respuestas inválidas o incompletas' });
    }

    const { total, severity } = scoreByType(type, answers);
    const riskLevel = predictRisk(type, total, answers);
    const when = Number.isFinite(ts) ? Number(ts) : Date.now();
    
    // --- 2. CORREGIDO: La consulta SQL ---
    await query(
      // 8 columnas...
      'INSERT INTO responses (user_id, instrument, total, max, severity, risk_level, answers, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      
      // ...coinciden con 8 valores.
      // Se usa 'userId' y se añade 'riskLevel'.
      [userId, spec.instrument, total, spec.max, severity, riskLevel, JSON.stringify(answers), when] // <-- ARREGLADO
    );
    
    res.json({ type, score: total, severity, riskLevel });

  } catch (e) {
    console.error(e.message); // <-- Es bueno añadir un log del error
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;

/**
 * @route
 * @desc
 * @access
 */
router.get('/admin/all-responses', [auth, admin], async (req, res) =>{
  try{
    const allData = await query(`
      SELECT
      r.id,
      r.instrument,
      r.total,
      r.severity,
      r.risk_Level,
      r.ts,
      r.answers,
      u.email
      FROM responses r 
      JOIN users u ON r.user_id = u.id
      ORDER BY r.ts DESC
    `);
    res.json(allData)
  }catch (e) {
    console.error(e.message);
    res.status(500).json({error: 'Error del servidor al obtener las estadisticas'});
  }
});
