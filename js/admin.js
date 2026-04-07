let timerInterval = null;
let teamCache = {}; 
let currentRound = 0;
const GAME_TIME = 100; // SYNCED TO 100s

function adminAuth() {
    if (document.getElementById('adminPass').value === "admin123") {
        document.getElementById('adminLogin').style.opacity = '0';
        setTimeout(() => document.getElementById('adminLogin').style.display = 'none', 300);
        repairScores(); 
    } else { alert("Unauthorized."); }
}

function switchTab(id) {
    ['control', 'logs', 'teams', 'scoreboard'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.add('hidden');
        document.getElementById(`btn-${t}`).classList.remove('active-tab', 'text-green-400');
        document.getElementById(`btn-${t}`).classList.add('text-gray-400');
    });
    document.getElementById(`tab-${id}`).classList.remove('hidden');
    document.getElementById(`btn-${id}`).classList.add('active-tab', 'text-green-400');
}

function repairScores() {
    window.db.ref('teams').once('value', snap => {
        snap.forEach(child => {
            let val = child.val();
            let safeScore = Number(val.score);
            if (isNaN(safeScore)) window.db.ref(`teams/${child.key}`).update({ score: 0 });
            else if (val.score !== safeScore) window.db.ref(`teams/${child.key}`).update({ score: safeScore });
        });
    });
}

// --- GAME CONTROLS ---
function startQuestion() {
    currentRound++;
    window.db.ref('gameState').update({ 
        status: 'OPEN', 
        startTime: firebase.database.ServerValue.TIMESTAMP,
        round: currentRound
    });
}

function stopQuestion() { 
    window.db.ref('gameState').update({ status: 'CLOSED' }); 
}

function resetQuestion() {
    window.db.ref('currentQuestion/buzzQueue').remove();
    window.db.ref('gameState').update({ status: 'WAITING' });
    document.getElementById('buzzList').innerHTML = '<div class="text-gray-600 italic text-sm">Waiting for buzzes...</div>'; 
}

// --- WINNER LOGIC (ONLY TOP 2) ---
function endGame() {
    Swal.fire({
        title: 'End Event?',
        text: "This will calculate the TOP 2 ranks and show winners to all participants.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#991b1b',
        confirmButtonText: 'YES, SHOW WINNERS'
    }).then((result) => {
        if (result.isConfirmed) {
            window.db.ref('teams').once('value', snap => {
                let allTeams = [];
                snap.forEach(c => {
                    let t = c.val();
                    allTeams.push({ name: t.name, score: Number(t.score) || 0 });
                });

                allTeams.sort((a, b) => b.score - a.score);
                
                let buckets = [];
                allTeams.forEach(t => {
                    if (buckets.length === 0 || buckets[buckets.length-1].score !== t.score) {
                        buckets.push({ score: t.score, names: [t.name] });
                    } else {
                        buckets[buckets.length-1].names.push(t.name);
                    }
                });

                let html = "";
                // STRICT TOP 2 BUCKETS
                for(let i=0; i < Math.min(2, buckets.length); i++) {
                    let bucket = buckets[i];
                    let rank = i + 1;
                    let names = bucket.names.join("<br>");
                    let color = rank === 1 ? "#4ade80" : "#94a3b8";
                    
                    html += `
                    <div style="border: 2px solid ${color}; background: rgba(74,222,128,0.05); border-radius: 15px; margin-bottom: 12px; padding: 20px;">
                        <div style="color:${color}; font-size: 1.8rem; font-weight: 900;">RANK ${rank}</div>
                        <div style="font-size: 1.4rem; margin: 8px 0; font-weight: 700; color: white;">${names}</div>
                        <div style="color: #6b7280; letter-spacing: 2px; font-weight:bold;">SCORE: ${bucket.score}</div>
                    </div>`;
                }
                window.db.ref('gameState').update({ status: 'ENDED', winnerName: html });
            });
        }
    });
}

function toggleEmergency() {
    window.db.ref('gameState/emergencyMode').once('value', snap => {
        const nextState = !snap.val();
        window.db.ref('gameState').update({ emergencyMode: nextState });
        Swal.fire('Mode Updated', `Manual Login is now ${nextState ? 'ENABLED' : 'DISABLED'}`, 'info');
    });
}

// --- LISTENERS ---
window.db.ref('gameState').on('value', snap => {
    const data = snap.val() || {};
    document.getElementById('gameStatus').innerText = data.status || 'WAITING';
    document.getElementById('roundText').innerText = `ROUND ${data.round || 0}`;
    currentRound = data.round || 0;

    const dot = document.getElementById('emergencyDot');
    const btn = document.getElementById('emergencyBtn');
    if(data.emergencyMode) {
        dot.style.transform = 'translateX(24px)';
        btn.classList.replace('bg-gray-700', 'bg-green-600');
    } else {
        dot.style.transform = 'translateX(0px)';
        btn.classList.replace('bg-green-600', 'bg-gray-700');
    }
    
    if (timerInterval) clearInterval(timerInterval);
    if (data.status === 'OPEN') {
        const updateTimer = () => {
    const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
    const remaining = Math.max(0, GAME_TIME - elapsed);
    
    const timerEl = document.getElementById('adminTimer');
    timerEl.innerText = remaining + "s";

    // --- DYNAMIC COLOR LOGIC ---
    if (remaining > 50) {
        timerEl.style.color = "#4ade80"; // Fresh Green (Safe)
        timerEl.style.opacity = "0.3";
    } else if (remaining > 20) {
        timerEl.style.color = "#fbbf24"; // Amber/Yellow (Warning)
        timerEl.style.opacity = "0.6";
    } else if (remaining > 0) {
        timerEl.style.color = "#f87171"; // Bright Red (Urgent)
        timerEl.style.opacity = "1";
        // Optional: add a slight pulse for the last 10 seconds
        if (remaining <= 10) timerEl.style.transform = "scale(1.05)";
    } else {
        timerEl.style.color = "#4b5563"; // Gray (Finished)
        timerEl.style.opacity = "0.2";
        timerEl.style.transform = "scale(1)";
    }

    if (remaining <= 0) stopQuestion();
};
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    } else {
        document.getElementById('adminTimer').innerText = GAME_TIME + "s";
        document.getElementById('adminTimer').style.opacity = '0.1';
    }
});

window.db.ref('teams').on('value', snap => {
    const teams = [];
    snap.forEach(c => {
        const val = c.val();
        teamCache[c.key] = val.name; 
        teams.push({ id: c.key, ...val });
    });
    
    const sortedTeams = [...teams].sort((a,b) => (Number(b.score)||0) - (Number(a.score)||0));

    document.getElementById('scoreTable').innerHTML = sortedTeams.map((t, i) => `
        <tr class="border-b border-gray-800/50">
            <td class="p-4 text-green-500 font-black">#${i+1}</td>
            <td class="p-4 font-bold text-gray-200">${t.name}</td>
            <td class="p-4 text-right font-mono font-bold text-xl">${t.score}</td>
        </tr>
    `).join('');
    
    // Stable ID-sorted grid for management
    document.getElementById('teamGrid').innerHTML = teams.sort((a,b) => a.id.localeCompare(b.id)).map(t => {
        const isOnline = (Date.now() - t.lastActive) < 15000;
        return `
        <div class="card p-4 border-l-4 ${isOnline?'border-green-500':'border-red-900'} bg-[#111827] flex flex-col gap-3">
            <div class="flex justify-between items-start">
                <div class="truncate">
                    <div class="text-[10px] text-gray-500 font-black uppercase">${t.id}</div>
                    <div class="font-bold text-white truncate">${t.name}</div>
                    <div class="text-xs text-green-400 font-mono font-black">${t.score} PTS</div>
                </div>
                <button onclick="kick('${t.id}')" class="text-red-900 hover:text-red-500"><i class="fas fa-user-slash"></i></button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="setManualPoints('${t.id}')" class="bg-gray-800 hover:bg-gray-700 text-[10px] font-bold py-1 rounded border border-gray-700">MANUAL SCORE</button>
                <button onclick="kick('${t.id}')" class="bg-red-950/20 text-red-500 text-[10px] font-bold py-1 rounded border border-red-900/30 uppercase">Logout</button>
            </div>
        </div>`;
    }).join('');
});

window.db.ref('currentQuestion/buzzQueue').orderByChild('time').on('value', snap => {
    const list = document.getElementById('buzzList');
    if (snap.numChildren() > 0) list.innerHTML = '';
    
    let rank = 1;
    snap.forEach(child => {
        if (rank > 10) return; // Only Top 10 LIFO/Time
        const teamId = child.key;
        const data = child.val();
        const teamName = teamCache[teamId] || "Loading..."; 
        
        list.innerHTML += `
            <div class="card p-4 flex justify-between items-center border-l-4 border-green-500 new-buzz">
                <div class="flex items-center">
                    <span class="w-8 h-8 rounded-full bg-green-500 text-[#0a0f1e] flex items-center justify-center font-black mr-4">${rank}</span>
                    <div>
                        <div class="font-black text-white">${teamName}</div>
                        <div class="text-[10px] text-gray-500 font-mono">${new Date(data.time).toLocaleTimeString()}</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="givePoints('${teamId}', 15)" class="bg-green-600 px-4 py-2 rounded-lg font-black text-xs hover:bg-green-500 shadow-lg shadow-green-900/20">+15</button>
                    <button onclick="givePoints('${teamId}', -10)" class="bg-red-600 px-4 py-2 rounded-lg font-black text-xs hover:bg-red-500 shadow-lg shadow-red-900/20">-10</button>
                </div>
            </div>`;

        const rowId = `log-${currentRound}-${teamId}`;
        if (!document.getElementById(rowId)) {
            const timeStr = new Date(data.time).toLocaleTimeString();
            document.getElementById('logTable').insertAdjacentHTML('afterbegin', `
                <tr id="${rowId}" class="border-b border-gray-800/50">
                    <td class="p-4 text-green-500 font-bold">#${rank}</td>
                    <td class="p-4 font-bold text-gray-200">${teamName}</td>
                    <td class="p-4 text-gray-500 text-xs font-mono">${timeStr}</td>
                    <td class="p-4"><span class="bg-gray-800 px-2 py-1 rounded text-[10px] font-bold">RD ${currentRound}</span></td>
                </tr>`);
        }
        rank++;
    });
});

// --- ACTIONS ---
function givePoints(teamId, pts) { 
    window.db.ref(`teams/${teamId}/score`).transaction(c => (Number(c)||0) + pts); 
}

function setManualPoints(teamId) {
    Swal.fire({
        title: `Edit Score: ${teamCache[teamId]}`,
        input: 'number',
        inputLabel: 'Enter absolute new score (or adjust)',
        inputValue: 0,
        showCancelButton: true,
        confirmButtonText: 'Update Marks'
    }).then((result) => {
        if (result.isConfirmed && result.value !== "") {
            window.db.ref(`teams/${teamId}/score`).set(Number(result.value));
        }
    });
}

function kick(id) { 
    Swal.fire({
        title: 'Kick Team?',
        text: `Force logout team ${id}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Kick'
    }).then(r => {
        if(r.isConfirmed) window.db.ref(`teams/${id}/sessionId`).set(null); 
    });
}

function clearLogs() {
    if(confirm("Wipe display logs?")) document.getElementById('logTable').innerHTML = '';
}
