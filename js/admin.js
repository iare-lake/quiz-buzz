let timerInterval = null; // Store timer ID to stop it later
let teamCache = {};       // Store names locally to prevent display glitches

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
    document.getElementById('buzzList').innerHTML = ''; // Clear UI immediately
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

// 1. Game State & Timer (Fixed)
window.db.ref('gameState').on('value', snap => {
    const data = snap.val();
    document.getElementById('gameStatus').innerText = data.status;
    
    // Always clear existing timer to prevent duplicates
    if (timerInterval) clearInterval(timerInterval);

    if (data.status === 'OPEN') {
        // Update immediately once
        updateTimerDisplay(data.startTime);
        
        // Start interval
        timerInterval = setInterval(() => {
            updateTimerDisplay(data.startTime);
        }, 1000);
    } else {
        document.getElementById('adminTimer').innerText = "00:00";
    }
});

function updateTimerDisplay(startTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, 180 - elapsed);
    document.getElementById('adminTimer').innerText = remaining + "s";
    
    // Auto-close if time runs out
    if (remaining <= 0) stopQuestion(); 
}

// 2. Teams Monitor (Populates Cache for Buzz List)
window.db.ref('teams').on('value', snap => {
    const teams = [];
    snap.forEach(c => {
        const val = c.val();
        teams.push({ id: c.key, ...val });
        
        // SAVE TO CACHE (Fixes the Buzz List Bug)
        teamCache[c.key] = val.name; 
    });
    
    teams.sort((a,b) => (b.score || 0) - (a.score || 0));

    // Render Scoreboard
    document.getElementById('scoreTable').innerHTML = teams.map((t, i) => `
        <tr class="border-b border-gray-700">
            <td class="p-4 text-yellow-400 font-bold">#${i+1}</td>
            <td class="p-4">${t.name}</td>
            <td class="p-4 font-bold">${t.score}</td>
        </tr>
    `).join('');
    
    // Render Team Grid
    document.getElementById('teamGrid').innerHTML = teams.map(t => {
        const isOnline = (Date.now() - t.lastActive) < 15000;
        return `
        <div class="bg-gray-700 p-3 rounded border-l-4 ${isOnline?'border-green-500':'border-red-500'}">
            <b>${t.id}</b><br>
            <span class="text-sm">${t.name}</span><br>
            <button onclick="kick('${t.id}')" class="text-red-400 text-xs underline mt-2">Kick</button>
        </div>`;
    }).join('');
});

// 3. Buzz Queue (Fixed: Synchronous Rendering)
window.db.ref('currentQuestion/buzzQueue').orderByChild('time').on('value', snap => {
    const list = document.getElementById('buzzList');
    list.innerHTML = '';
    
    let rank = 1;
    snap.forEach(child => {
        const teamId = child.key;
        // Use the CACHED name (Instant, no loading/ordering issues)
        const teamName = teamCache[teamId] || "Loading..."; 
        
        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-gray-700 p-3 rounded mb-2";
        div.innerHTML = `
            <div>
                <span class="text-yellow-400 font-bold mr-2">#${rank}</span> 
                ${teamName} <span class="text-xs text-gray-400">(${teamId})</span>
            </div>
            <div class="space-x-2">
                <button onclick="givePoints('${teamId}', 10)" class="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm font-bold">+10</button>
                <button onclick="givePoints('${teamId}', -5)" class="bg-red-600 hover:bg-red-500 px-3 py-1 rounded text-sm font-bold">-5</button>
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
    if(confirm(`Kick Team ${id} out of their session?`)) {
        window.db.ref(`teams/${id}/sessionId`).set(null); 
    }
}