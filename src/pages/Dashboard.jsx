import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title
} from 'chart.js';
import { Pie, Line, Chart } from 'react-chartjs-2'; 
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(
  ArcElement, Tooltip, Legend, CategoryScale, LinearScale, 
  BarElement, PointElement, LineElement, Title,
  MatrixController, MatrixElement,
  ChartDataLabels
);

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const MATRIX_LABELS = ['Interés', 'Ánimo', 'Sueño', 'Energía', 'Apetito', 'Autoestima', 'Concentr.', 'Lentitud', 'Riesgo', 'Total'];

function getColor(value) {
  let alpha = Math.abs(value);
  return value > 0 ? `rgba(54, 162, 235, ${alpha})` : `rgba(255, 99, 132, ${alpha})`;
}

function getCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator === 0 ? 0 : numerator / denominator;
}

function getUserRole() {
  const token = localStorage.getItem('token');
  if (!token) return 'user';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || payload.user?.role || 'user';
  } catch (e) { return 'user'; }
}

export default function Dashboard() {
  const [role, setRole] = useState('user');
  const [stats, setStats] = useState(null);
  const [paretoData, setParetoData] = useState(null);
  const [userChart, setUserChart] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const currentRole = getUserRole();
      setRole(currentRole);
      const token = localStorage.getItem('token');
      const endpoint = currentRole === 'admin' ? '/api/surveys/admin/all-responses' : '/api/me/responses';

      try {
        const res = await fetch(`${API}${endpoint}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Error al cargar datos');
        const data = await res.json();

        if (currentRole === 'admin') {
          processAdminEDA(data);
        } else {
          setHistory(data);
          processUserData(data);
        }
      } catch (err) { setError(err.message); } 
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const processAdminEDA = (data) => {
    const riskCounts = {};
    const severityCounts = {};
    const questionsData = Array.from({ length: 10 }, () => []);

    data.forEach(item => {
      const r = item.risk_level || 'Riesgo Bajo';
      riskCounts[r] = (riskCounts[r] || 0) + 1;
      const s = item.severity || 'Desconocido';
      severityCounts[s] = (severityCounts[s] || 0) + 1;

      let ans = item.answers;
      if (typeof ans === 'string') { try { ans = JSON.parse(ans); } catch (e) { ans = null; } }
      if (ans && Array.isArray(ans)) {
        ans.forEach((val, index) => { if (index < 9) questionsData[index].push(Number(val)); });
        questionsData[9].push(item.total);
      }
    });

    const matrixData = [];
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const v = getCorrelation(questionsData[x], questionsData[y]);
        matrixData.push({ x: MATRIX_LABELS[x], y: MATRIX_LABELS[y], v: v });
      }
    }

    // Lógica Pareto
    const sortedSeverity = Object.entries(severityCounts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    let cumulativeSum = 0;
    const totalItems = data.length;
    const paretoProcessed = sortedSeverity.map(item => {
      cumulativeSum += item.value;
      return {
        label: item.label,
        value: item.value,
        percentage: (cumulativeSum / totalItems) * 100
      };
    });

    setParetoData({
      labels: paretoProcessed.map(d => d.label),
      datasets: [
        {
          type: 'bar',
          label: 'Frecuencia',
          data: paretoProcessed.map(d => d.value),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          order: 2,
          yAxisID: 'y',
          datalabels: { display: true, color: 'black', anchor: 'end', align: 'top' }
        },
        {
          type: 'line',
          label: '% Acumulado',
          data: paretoProcessed.map(d => d.percentage),
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          fill: false,
          order: 1,
          yAxisID: 'y1',
          datalabels: { 
            display: true, 
            formatter: (v) => v.toFixed(1) + '%',
            align: 'top',
            color: 'red'
          }
        }
      ]
    });

    setStats({
      total: data.length,
      riskChart: {
        labels: Object.keys(riskCounts),
        datasets: [{
          label: '# Estudiantes',
          data: Object.values(riskCounts),
          backgroundColor: ['#4caf50', '#8bc34a', '#ffeb3b', '#ff9800', '#f44336'],
          datalabels: { display: false }
        }]
      },
      matrixChart: {
        datasets: [{
          label: 'Correlación',
          data: matrixData,
          backgroundColor(c) {
            const value = c.dataset.data[c.dataIndex].v;
            return getColor(value);
          },
          width: ({chart}) => (chart.chartArea || {}).width / 10 - 1,
          height: ({chart}) => (chart.chartArea || {}).height / 10 - 1
        }]
      },
      // Nuevo dataset para el gráfico de barras simple (el antiguo Severidad)
      severityChartSimple: {
        labels: Object.keys(severityCounts),
        datasets: [{ 
          label: 'Frecuencia', 
          data: Object.values(severityCounts), 
          backgroundColor: '#3f51b5',
          datalabels: { display: false }
        }]
      }
    });
  };

  const processUserData = (data) => {
    const phq9Data = data.filter(d => d.instrument === 'PHQ-9').sort((a, b) => a.ts - b.ts);
    if (phq9Data.length > 0) {
      setUserChart({
        labels: phq9Data.map(d => new Date(d.ts).toLocaleDateString()),
        datasets: [{
          label: 'Mi Evolución',
          data: phq9Data.map(d => d.total),
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.2)',
          tension: 0.4,
          fill: true,
          datalabels: { display: false }
        }]
      });
    }
  };

  if (loading) return <p style={{textAlign:'center', padding:'20px'}}>Cargando...</p>;
  if (error) return <div className="error">{error}</div>;

  // ================= VISTA ADMIN =================
  if (role === 'admin' && stats) {
    return (
      <div className="dashboard-container" style={{ padding: '20px', background: '#f5f7fa', minHeight: '100vh' }}>
        <h2 style={{ color: '#1a237e' }}>Dashboard Analítico (Admin)</h2>
        
        {/* KPI Total */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '8px', flex: 1, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h4>Muestra Total</h4>
            <h1 style={{margin:0, color:'#3f51b5'}}>{stats.total}</h1>
            <small>Encuestas procesadas</small>
          </div>
        </div>

        {/* --- CONTENEDOR PRINCIPAL DE GRÁFICOS --- */}
        <div className="charts-grid" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* 1. MATRIZ (Full Width) */}
          <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h3>Matriz de Correlación PHQ-9</h3>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ height: '450px', width: '100%', maxWidth: '800px' }}> 
                <Chart 
                  type='matrix'
                  data={stats.matrixChart}
                  options={{
                      maintainAspectRatio: false,
                      plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { title() { return ''; }, label(c) { return `${c.raw.x} vs ${c.raw.y}: ${c.raw.v.toFixed(2)}`; } } },
                          datalabels: { display: true, color: 'black', font: { size: 10, weight: 'bold' }, formatter: (v) => Math.round(v.v * 100) }
                      },
                      scales: {
                          x: { type: 'category', labels: MATRIX_LABELS, grid: {display: false}, position: 'top' },
                          y: { type: 'category', labels: MATRIX_LABELS, offset: true, grid: {display: false}, reverse: true }
                      }
                  }}
                />
              </div>
              <div style={{ marginLeft: '20px', height: '400px', width: '20px', background: 'linear-gradient(to top, rgba(255, 99, 132, 1), white, rgba(54, 162, 235, 1))', border: '1px solid #ccc', position: 'relative' }}>
                  <span style={{position:'absolute', top:'0', left:'25px', fontSize:'12px'}}>1.0</span>
                  <span style={{position:'absolute', top:'50%', left:'25px', fontSize:'12px'}}>0.0</span>
                  <span style={{position:'absolute', bottom:'0', left:'25px', fontSize:'12px'}}>-1.0</span>
              </div>
            </div>
          </div>

          {/* 2. PARETO (Full Width) */}
          {paretoData && (
            <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3>Diagrama de Pareto: Severidad (Análisis 80/20)</h3>
                <div style={{ height: '350px' }}>
                    <Chart 
                        type='bar' 
                        data={paretoData}
                        options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'top' },
                            },
                            scales: {
                                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Frecuencia' } },
                                y1: { type: 'linear', display: true, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '% Acumulado' }, ticks: { callback: (value) => value + '%' } }
                            }
                        }}
                    />
                </div>
            </div>
          )}

          {/* 3. FILA INFERIOR: RIESGOS Y SEVERIDAD (Lado a Lado) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
             <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3>Distribución de Riesgo</h3>
                <div style={{height:'300px', display:'flex', justifyContent:'center'}}><Pie data={stats.riskChart} /></div>
             </div>
             <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3>Severidad (Simple)</h3>
                <div style={{height:'300px'}}>
                    {/* Usamos 'Chart type=bar' para reutilizar la importación */}
                    <Chart type='bar' data={stats.severityChartSimple} options={{maintainAspectRatio: false}}/>
                </div>
             </div>
          </div>

        </div>
      </div>
    );
  }

  // ================= VISTA USUARIO =================
  const latest = history.length > 0 ? history[0] : null;

  return (
    <div className="dashboard-container" style={{ padding: '20px' }}>
      <h2>Mi Panel Personal</h2>
      {latest && (
        <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '20px', borderRadius: '10px', marginBottom: '30px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
          <h3>Último Resultado ({latest.instrument})</h3>
          <div style={{display:'flex', gap:'20px', alignItems:'center'}}>
            <h1 style={{margin:0}}>{latest.total}</h1>
            <div>
               <span style={{fontSize:'1.2rem'}}>{latest.risk_level || 'Bajo'}</span><br/>
               <small>{new Date(latest.ts).toLocaleDateString()}</small>
            </div>
          </div>
        </div>
      )}
      {userChart ? (
        <div className="card" style={{ padding: '20px', background: 'white', borderRadius: '8px' }}>
            <h3>Mi Evolución</h3>
            <div style={{height:'300px'}}><Line data={userChart} options={{maintainAspectRatio: false}} /></div>
        </div>
      ) : <p>Completa encuestas para ver tu progreso.</p>}
      
       <h3>Historial Completo</h3>
       <ul>
        {history.map(h => (
          <li key={h.id}><strong>{h.instrument}</strong>: {h.total} ({h.risk_level}) - {new Date(h.ts).toLocaleDateString()}</li>
        ))}
       </ul>
    </div>
  );
}