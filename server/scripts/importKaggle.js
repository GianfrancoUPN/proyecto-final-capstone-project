const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { query } = require('../db');
const { predictRisk } = require('../utils/prediction');

// --- CONFIGURACIÓN ---
const CSV_FILE_PATH = path.join(__dirname, '../data/dataset.csv');
const GHOST_USER_ID = 9999;

// Función para generar respuestas [0-3] que sumen un total específico
function generateAnswersFromScore(totalScore) {
  let currentSum = 0;
  const answers = Array(9).fill(0);
  
  while (currentSum < totalScore) {
    const randomIndex = Math.floor(Math.random() * 9);
    if (answers[randomIndex] < 3) {
      answers[randomIndex]++;
      currentSum++;
    }
    if (currentSum >= 27) break;
  }
  return answers;
}

async function importData() {
  console.log('🚀 Iniciando ETL con el NUEVO Dataset...');

  try {
    await query(
      `INSERT IGNORE INTO users (id, email, password_hash, name, role) 
       VALUES (?, ?, ?, ?, ?)`, 
      [GHOST_USER_ID, 'dataset@kaggle.com', 'dummy_hash', 'Kaggle Data', 'user']
    );
    console.log('✅ Usuario Fantasma verificado.');
  } catch (e) { console.log('ℹ️ Usuario fantasma listo.'); }

  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`❌ ERROR: No se encontró ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  const results = [];

  fs.createReadStream(CSV_FILE_PATH)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`📂 Procesando ${results.length} registros nuevos...`);
      let count = 0;

      for (const row of results) {
        let totalScore = 0;

        // --- LÓGICA ADAPTADA AL NUEVO CSV ---
        // El nuevo CSV tiene una columna "Depression" que dice "Yes" o "No".
        // También tiene "Academic Pressure" (1-5) y "Study Satisfaction" (1-5).
        
        const hasDepression = row['Depression'] === 'Yes';
        const academicPressure = parseInt(row['Academic Pressure']) || 3;
        const suicidalThoughts = row['Have you ever had suicidal thoughts ?'] === 'Yes';

        if (hasDepression) {
            // Si tiene depresión, generamos un puntaje ALTO (15-27)
            // Usamos la presión académica para modularlo: más presión = más puntaje
            const baseScore = 15;
            totalScore = baseScore + academicPressure + Math.floor(Math.random() * 5);
        } else {
            // Si NO tiene depresión, puntaje BAJO (0-9)
            totalScore = Math.floor(Math.random() * 10);
        }

        // Límites
        if (totalScore > 27) totalScore = 27;
        if (totalScore < 0) totalScore = 0;

        // Generar respuestas individuales
        const dummyAnswers = generateAnswersFromScore(totalScore);
        
        // IMPORTANTE: Si el CSV dice que tiene pensamientos suicidas, 
        // forzamos la pregunta 9 (índice 8) a ser positiva.
        if (suicidalThoughts) {
            dummyAnswers[8] = Math.floor(Math.random() * 3) + 1; // 1, 2 o 3
            // Recalculamos el total para que coincida con la suma
            totalScore = dummyAnswers.reduce((a, b) => a + b, 0);
        } else {
            dummyAnswers[8] = 0; // Aseguramos que sea 0 si dice "No"
        }

        // Calcular Severidad
        let severity = 'Mínima';
        if (totalScore >= 5) severity = 'Leve';
        if (totalScore >= 10) severity = 'Moderada';
        if (totalScore >= 15) severity = 'Moderadamente severa';
        if (totalScore >= 20) severity = 'Severa';

        // Predecir Riesgo con tu IA
        const riskLevel = predictRisk('phq9', totalScore, dummyAnswers, null);

        // Generar fecha aleatoria reciente
        const randomTime = Math.floor(Math.random() * (365 * 24 * 60 * 60 * 1000));
        const fakeTs = Date.now() - randomTime;

        try {
          await query(
            `INSERT INTO responses 
            (user_id, instrument, total, max, severity, risk_level, answers, ts) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              GHOST_USER_ID, 
              'PHQ-9', 
              totalScore, 
              27, 
              severity, 
              riskLevel, 
              JSON.stringify(dummyAnswers), 
              fakeTs
            ]
          );
          count++;
          if (count % 100 === 0) process.stdout.write('.');
        } catch (err) { }
      }

      console.log(`\n✅ ¡LISTO! ${count} registros del nuevo dataset cargados.`);
      console.log('📊 Reinicia tu servidor y revisa el Dashboard.');
      process.exit();
    });
}

importData();