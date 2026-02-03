let timerInterval = null;
let teamCache = {}; 

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
    document.getElementById('logTable').innerHTML = ''; 
}

// --- FIXED WINNER LOGIC (Robust Grouping) ---
function endGame() {
    if(!confirm("End entire event? This will display the winners.")) return;
    
    window.db.ref('teams').once('value', snap => {
        const teams = [];
        snap.forEach(c => teams.push({ id: c.key, ...c.val() }));
        
        // 1. Sort by Score Descending (Ensure Numbers)
        teams.sort((a,b) => (Number(b.score) || 0) - (Number(a.score) || 0));

        // 2. Group by Score (Dense Ranking)
        // Result will be: [ {score: 25, names: ['A', 'B']}, {score: 20, names: ['C']} ... ]
        let leaderboard = [];
        
        teams.forEach(t => {
            let s = Number(t.score) || 0;
            // Check if this score is already the last one added (grouping)
            if (leaderboard.length > 0 && leaderboard[leaderboard.length - 1].score === s) {
                leaderboard[leaderboard.length - 1].names.push(t.name);
            } else {
                // New distinct score
                leaderboard.push({ score: s, names: [t.name] });
            }
        });

        // 3. Generate HTML for Top 3 Ranks
        let htmlOutput = "";
        let limit = Math.min(leaderboard.length, 3);

        for (let i = 0; i < limit; i++) {
            let group = leaderboard[i];
            let rank = i + 1;
            let namesStr = group.names.join(" & "); // Join ties with "&"

            let color = "#fff";
            let medal = "";
            let size = "1rem";
            let bg = "transparent";

            if (rank === 1) { 
                color = "#FFD700"; medal = "🏆"; size = "1.5rem"; bg = "rgba(255, 215, 0, 0.1)";
            } else if (rank === 2) { 
                color = "#C0C0C0"; medal = "🥈"; size = "1.2rem"; bg = "rgba(192, 192, 192, 0.1)";
            } else if (rank === 3) { 
                color = "#CD7F32"; medal = "🥉"; size = "1.1rem"; bg = "rgba(205, 127, 50, 0.1)";
            }

            htmlOutput += `
            <div style="background: ${bg}; margin-bottom: 12px; padding: 15px; border-radius: 10px; border: 1px solid ${color};">
                <div style="color: ${color}; font-size: ${size}; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">
                    ${medal} Rank ${rank}
                </div>
                <div style="color: white; font-size: 1.3rem; font-weight: bold; margin: 5px 0; line-height: 1.2;">
                    ${namesStr}
                </div>
                <div style="color: #ccc; font-family: monospace; font-size: 1rem;">
                    Total Score: <span style="color:white; font-weight:bold">${group.score}</span>
                </div>
            </div>`;
        }

        if (htmlOutput === "") htmlOutput = "<div style='color:white'>No scores recorded.</div>";

        // 4. Update Database
        window.db.ref('gameState').update({ 
            status: 'ENDED', 
            winnerName: htmlOutput 
        });
    });
}

// --- LISTENERS ---

// 1. Timer
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

// 2. Teams Monitor & Scoreboard
window.db.ref('teams').on('value', snap => {
    const teams = [];
    snap.forEach(c => {
        const val = c.val();
        teams.push({ id: c.key, ...val });
        teamCache[c.key] = val.name; 
    });
    
    teams.sort((a,b) => (b.score || 0) - (a.score || 0));

    // Scoreboard
    document.getElementById('scoreTable').innerHTML = teams.map((t, i) => `
        <tr class="border-b border-gray-700">
            <td class="p-4 text-yellow-400 font-bold text-2xl">#${i+1}</td>
            <td class="p-4 text-xl">${t.name} <span class="text-sm text-gray-500">(${t.id})</span></td>
            <td class="p-4 font-bold text-2xl text-green-400">${t.score}</td>
        </tr>
    `).join('');
    
    // Admin Grid (Kick Button)
    document.getElementById('teamGrid').innerHTML = teams.map(t => {
        const isOnline = (Date.now() - t.lastActive) < 15000;
        return `
        <div class="bg-gray-700 p-3 rounded border-l-4 ${isOnline?'border-green-500':'border-red-500'} flex justify-between items-center">
            <div>
                <b class="text-yellow-400">${t.id}</b>
                <div class="text-xs text-white truncate w-24">${t.name}</div>
                <div class="text-xs text-gray-400">${t.score} pts</div>
            </div>
            <button onclick="kick('${t.id}')" class="bg-red-900 text-red-200 px-2 py-1 text-xs rounded hover:bg-red-700">Kick</button>
        </div>`;
    }).join('');
});

// 3. Buzz Queue & Logs
window.db.ref('currentQuestion/buzzQueue').orderByChild('time').on('value', snap => {
    const list = document.getElementById('buzzList');
    const logTable = document.getElementById('logTable');
    
    list.innerHTML = '';
    logTable.innerHTML = ''; 
    
    let rank = 1;
    snap.forEach(child => {
        const teamId = child.key;
        const data = child.val();
        const teamName = teamCache[teamId] || "Loading..."; 
        
        // A. Populate Control Panel List
        const div = document.createElement('div');
        div.className = "flex flex-col bg-gray-700 p-3 rounded mb-2 border border-gray-600";
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="text-lg"><span class="text-yellow-400 font-bold mr-2">#${rank}</span> ${teamName}</div>
                <span class="text-xs text-gray-400 font-mono">${teamId}</span>
            </div>
            <div class="grid grid-cols-4 gap-2">
                <button onclick="givePoints('${teamId}', 3)" class="bg-purple-600 hover:bg-purple-500 py-1 rounded font-bold text-sm shadow">x3</button>
                <button onclick="givePoints('${teamId}', 2)" class="bg-green-600 hover:bg-green-500 py-1 rounded font-bold text-sm shadow">x2</button>
                <button onclick="givePoints('${teamId}', 1)" class="bg-blue-600 hover:bg-blue-500 py-1 rounded font-bold text-sm shadow">x1</button>
                <button onclick="givePoints('${teamId}', -1)" class="bg-red-600 hover:bg-red-500 py-1 rounded font-bold text-sm shadow">-1</button>
            </div>`;
        list.appendChild(div);

        // B. Populate Logs Tab
        const date = new Date(data.time);
        const timeStr = date.toLocaleTimeString('en-US', { hour12: false }) + "." + date.getMilliseconds();
        
        const row = `
            <tr class="border-b border-gray-700 hover:bg-gray-700">
                <td class="p-3 font-mono text-yellow-400">#${rank}</td>
                <td class="p-3">${teamName} <span class="text-xs text-gray-500">(${teamId})</span></td>
                <td class="p-3 font-mono text-gray-300">${timeStr}</td>
            </tr>`;
        logTable.innerHTML += row;

        rank++;
    });
});

// --- ACTIONS ---

function givePoints(teamId, pts) { 
    window.db.ref(`teams/${teamId}/score`).transaction(c => (c||0) + pts); 
}

function kick(id) { 
    if(confirm(`Kick Team ${id}? They will be forced to logout.`)) {
        window.db.ref(`teams/${id}/sessionId`).set(null); 
    }
}
