// Javascript Corporativo AutaMedica — Twitch Panel Extension
// Consulta en tiempo real de Supabase la tabla juegos_leaderboard

const SUPABASE_URL = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4ampycGtzbXd3cm11Ymh2amV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTA0NjgsImV4cCI6MjA4Nzk2NjQ2OH0.Cnb_sTp_C3FYFF19YQfHTfyMiFFMN0aw2Xj0hUU-aa0';

const listContainer = document.getElementById('leaderboard-list');

// Inicializa Twitch Extension Helper si está disponible
if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized((auth) => {
        // En extensiones de Twitch, podemos usar la información de autorización si es necesario
        // Por ahora, cargamos de forma libre ya que el leaderboard es público
        loadLeaderboard();
    });
} else {
    // Modo de previsualización local fuera de Twitch iframe
    loadLeaderboard();
}

async function loadLeaderboard() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/juegos_leaderboard?juego_id=eq.trivia-twitch&select=nombre,tiempo_segundos`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const rows = await response.json();
        renderLeaderboard(rows);
    } catch (error) {
        console.error('Error cargando leaderboard de Supabase:', error);
        listContainer.innerHTML = `
            <div class="empty-state">
                <span>⚠️</span>
                <p>Error de conexión con el servidor.</p>
            </div>
        `;
    }
}

function renderLeaderboard(rows) {
    // 1. Agrupar y sumar puntos en memoria
    const userTotals = {};
    for (const row of rows) {
        // Limpiamos arroba del nombre de usuario si existe
        const cleanName = row.nombre.startsWith('@') ? row.nombre.slice(1) : row.nombre;
        userTotals[cleanName] = (userTotals[cleanName] || 0) + row.tiempo_segundos;
    }

    // 2. Convertir a Array y ordenar
    const sortedPlayers = Object.entries(userTotals)
        .map(([username, points]) => ({ username, points }))
        .sort((a, b) => b.points - a.points);

    // 3. Renderizar filas
    if (sortedPlayers.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <span>🎮</span>
                <p>¡Aún no hay puntuaciones!</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = ''; // Limpiamos cargando

    sortedPlayers.forEach((player, index) => {
        const isTop1 = index === 0;
        const isTop2 = index === 1;
        const isTop3 = index === 2;

        let posBadge = '';
        if (isTop1) posBadge = '<span class="pos-badge gold">🥇</span>';
        else if (isTop2) posBadge = '<span class="pos-badge silver">🥈</span>';
        else if (isTop3) posBadge = '<span class="pos-badge bronze">🥉</span>';
        else posBadge = `<span class="pos-badge other">${index + 1}</span>`;

        const rowDiv = document.createElement('div');
        rowDiv.className = `player-row ${isTop1 ? 'top-1' : ''}`;
        
        rowDiv.innerHTML = `
            ${posBadge}
            <span class="username-cell">${player.username}</span>
            <span class="points-cell">${player.points} <span class="points-unit">pts</span></span>
        `;
        
        listContainer.appendChild(rowDiv);
    });
}

// Auto-refresh cada 30 segundos si el panel sigue abierto
setInterval(loadLeaderboard, 30000);
