let timerInterval = null;
let teamCache = {}; // Cache for instant name lookup

// --- AUTH ---
function adminAuth() {
    if (document.getElementById('adminPass').value === "admin123") {
        document.getElementById('adminLogin').style.display = 'none';
    } else { alert("Wrong Password"); }
}

function switchTab(id) {
    ['control', 'logs', 'teams', 'scoreboard'].forEach(t => document.getElementById(`tab-${t}`).classList.add('hidden'));
    document.getElementById(`tab-${id}`).classList.remove('hidden');
}

// --- GAME CONTROLS ---

function startQuestion() {
    window.db.ref('gameState').update({ status: 'OPEN', startTime: firebase.database.ServerValue.TIMESTAMP });
}

function stopQuestion() { 
    window.db.ref('gameState').update({ status: 'CLOSED' }); 
}

function resetQuestion() {
    window.db.ref('currentQuestion/buzzQueue').remove();
    window.db.ref('gameState').update({ status: 'WAITING' });
    document.getElementById('buzzList').innerHTML = ''; 
}

function endGame() {
    if(!confirm("End entire event?")) return;
    window.db.ref('teams').orderByChild('score').limitToLast(1).once('value', snap => {
        const data = snap.val();
        if(!data) return;
        const winnerId = Object.keys(data)[0];
        window.db.ref('gameState').update({ status: 'ENDED', winnerName: data[winnerId].name });
    });
}

// --- LISTENERS ---

// 1. Timer Logic (Prevent Glitches)
window.db.ref('gameState').on('value', snap => {
    const data = snap.val();
    document.getElementById('gameStatus').innerText = data.status;
    
    if (timerInterval) clearInterval(timerInterval);

    if (data.status === 'OPEN') {
        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
            const remaining = Math.max(0, 180 - elapsed);
            document.getElementById('adminTimer').innerText = remaining + "s";
            if (remaining <= 0) stopQuestion();
        };
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    } else {
        document.getElementById('adminTimer').innerText = "00:00";
    }
});

// 2. Teams Monitor & Scoreboard (Auto-Sorts by Score)
window.db.ref('teams').on('value', snap => {
    const teams = [];
    snap.forEach(c => {
        const val = c.val();
        teams.push({ id: c.key, ...val });
        teamCache[c.key] = val.name; // Cache name
    });
    
    // Sort Highest Score First
    teams.sort((a,b) => (b.score || 0) - (a.score || 0));

    // Render Scoreboard (Projector View)
    document.getElementById('scoreTable').innerHTML = teams.map((t, i) => `
        <tr class="border-b border-gray-700">
            <td class="p-4 text-yellow-400 font-bold text-2xl">#${i+1}</td>
            <td class="p-4 text-xl">${t.name} <span class="text-sm text-gray-500">(${t.id})</span></td>
            <td class="p-4 font-bold text-2xl text-green-400">${t.score}</td>
        </tr>
    `).join('');
    
    // Render Team Grid (Admin Monitor)
    document.getElementById('teamGrid').innerHTML = teams.map(t => {
        const isOnline = (Date.now() - t.lastActive) < 15000;
        return `
        <div class="bg-gray-700 p-3 rounded border-l-4 ${isOnline?'border-green-500':'border-red-500'} flex justify-between items-center">
            <div>
                <b class="text-yellow-400">${t.id}</b>
                <div class="text-xs text-white truncate w-24">${t.name}</div>
                <div class="text-xs text-gray-400 mt-1">Score: ${t.score}</div>
            </div>
            <button onclick="kick('${t.id}')" class="text-red-400 text-xs underline hover:text-red-200">Kick</button>
        </div>`;
    }).join('');
});

// 3. Buzz Queue (Updated with +15, +10, +7, -4)
window.db.ref('currentQuestion/buzzQueue').orderByChild('time').on('value', snap => {
    const list = document.getElementById('buzzList');
    list.innerHTML = '';
    
    let rank = 1;
    snap.forEach(child => {
        const teamId = child.key;
        const teamName = teamCache[teamId] || "Loading..."; 
        
        const div = document.createElement('div');
        div.className = "flex flex-col bg-gray-700 p-3 rounded mb-2 border border-gray-600";
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="text-lg">
                    <span class="text-yellow-400 font-bold mr-2">#${rank}</span> 
                    ${teamName}
                </div>
                <span class="text-xs text-gray-400 font-mono">${teamId}</span>
            </div>
            
            <!-- SCORING BUTTONS GRID -->
            <div class="grid grid-cols-4 gap-2">
                <button onclick="givePoints('${teamId}', 15)" class="bg-purple-600 hover:bg-purple-500 py-1 rounded font-bold text-sm shadow">+15</button>
                <button onclick="givePoints('${teamId}', 10)" class="bg-green-600 hover:bg-green-500 py-1 rounded font-bold text-sm shadow">+10</button>
                <button onclick="givePoints('${teamId}', 5)" class="bg-blue-600 hover:bg-blue-500 py-1 rounded font-bold text-sm shadow">+5</button>
                <button onclick="givePoints('${teamId}', -5)" class="bg-red-600 hover:bg-red-500 py-1 rounded font-bold text-sm shadow">-5</button>
            </div>`;
        list.appendChild(div);
        rank++;
    });
});

// --- ACTIONS ---

function givePoints(teamId, pts) { 
    window.db.ref(`teams/${teamId}/score`).transaction(c => (c||0) + pts); 
}

function kick(id) { 
    if(confirm(`Kick Team ${id}? They will be logged out.`)) {
        window.db.ref(`teams/${id}/sessionId`).set(null); 
    }
}
