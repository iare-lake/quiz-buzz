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

// --- FINAL WINNER LOGIC (SANITIZED) ---
function endGame() {
    if(!confirm("End entire event? This will display the winners.")) return;
    
    console.clear();
    console.log("--- STARTING SCORE CALCULATION ---");

    window.db.ref('teams').once('value', snap => {
        const rawTeams = [];
        snap.forEach(c => rawTeams.push({ id: c.key, ...c.val() }));

        // 1. SANITIZE DATA (The Fix)
        // We force every score to be a real Number. If it's garbage, it becomes 0.
        const cleanTeams = rawTeams.map(t => {
            let rawScore = t.score;
            let finalScore = 0;

            // Try parsing
            if (typeof rawScore === 'number') {
                finalScore = rawScore;
            } else if (typeof rawScore === 'string') {
                finalScore = parseFloat(rawScore);
            }
            
            // If invalid (NaN), set to 0
            if (isNaN(finalScore)) finalScore = 0;

            console.log(`Team: ${t.name} | Raw: ${rawScore} | Parsed: ${finalScore}`);
            
            return {
                name: t.name,
                id: t.id,
                score: finalScore
            };
        });

        // 2. GROUP BY SCORE
        // Map: Score (Number) -> Array of Names
        let scoreMap = {};
        cleanTeams.forEach(t => {
            if (!scoreMap[t.score]) scoreMap[t.score] = [];
            scoreMap[t.score].push(t.name);
        });

        // 3. GET UNIQUE SCORES & SORT DESCENDING
        // This is the step that was failing before. We manually sort the keys.
        let uniqueScores = Object.keys(scoreMap).map(Number); // Convert keys back to numbers
        uniqueScores.sort((a, b) => b - a); // 25, 12, 10...

        console.log("Final Ranked Scores:", uniqueScores);

        // 4. GENERATE HTML
        let htmlOutput = "";
        
        if (uniqueScores.length === 0) {
            htmlOutput = "<div style='color:white'>No scores recorded.</div>";
        } else {
            // Loop Top 3
            for (let i = 0; i < Math.min(uniqueScores.length, 3); i++) {
                let currentScore = uniqueScores[i];
                let namesArray = scoreMap[currentScore]; // Get names for this score
                let rank = i + 1;
                
                let namesStr = namesArray.join(" <br> "); 

                // Styling
                let color = "#fff";
                let medal = "";
                let bg = "rgba(255,255,255,0.05)";
                let size = "1rem";

                if (rank === 1) { color = "#FFD700"; medal = "🏆"; bg = "rgba(255, 215, 0, 0.2)"; size="1.8rem"; }
                if (rank === 2) { color = "#C0C0C0"; medal = "🥈"; bg = "rgba(192, 192, 192, 0.2)"; size="1.5rem"; }
                if (rank === 3) { color = "#CD7F32"; medal = "🥉"; bg = "rgba(205, 127, 50, 0.2)"; size="1.3rem"; }

                htmlOutput += `
                <div style="
                    background: ${bg}; 
                    border: 2px solid ${color}; 
                    border-radius: 15px; 
                    margin-bottom: 15px; 
                    padding: 20px; 
                    text-align: center;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
                    
                    <div style="color:${color}; font-size:${size}; font-weight:900; letter-spacing:2px; margin-bottom:10px;">
                        ${medal} RANK ${rank}
                    </div>
                    
                    <div style="color:white; font-size:1.5rem; font-weight:bold; line-height:1.4;">
                        ${namesStr}
                    </div>
                    
                    <div style="color:#ddd; font-size:1.1rem; margin-top:10px; font-family:monospace; background:rgba(0,0,0,0.3); display:inline-block; padding:2px 10px; rounded:4px;">
                        SCORE: ${currentScore}
                    </div>
                </div>`;
            }
        }

        // 5. SAVE TO DB
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
    
    // Display sorting (Visual only)
    teams.sort((a,b) => (parseFloat(b.score)||0) - (parseFloat(a.score)||0));

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

// 3. Buzz Queue
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
        
        // Control Panel List
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

        // Logs
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
    window.db.ref(`teams/${teamId}/score`).transaction(c => (Number(c)||0) + pts); 
}

function kick(id) { 
    if(confirm(`Kick Team ${id}?`)) {
        window.db.ref(`teams/${id}/sessionId`).set(null); 
    }
}
