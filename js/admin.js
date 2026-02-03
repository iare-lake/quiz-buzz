let timerInterval = null;
let teamCache = {}; 

function adminAuth() {
    if (document.getElementById('adminPass').value === "admin123") {
        document.getElementById('adminLogin').style.display = 'none';
        repairScores(); // <--- AUTO REPAIR DATA ON LOGIN
    } else { alert("Wrong Password"); }
}

function switchTab(id) {
    ['control', 'logs', 'teams', 'scoreboard'].forEach(t => document.getElementById(`tab-${t}`).classList.add('hidden'));
    document.getElementById(`tab-${id}`).classList.remove('hidden');
}

// --- DATA REPAIR (THE FIX FOR "12 > 25") ---
function repairScores() {
    console.log("Running Data Repair...");
    window.db.ref('teams').once('value', snap => {
        snap.forEach(child => {
            let val = child.val();
            let safeScore = Number(val.score);
            if (isNaN(safeScore)) safeScore = 0;
            
            // Force update to Number in DB
            if (val.score !== safeScore) {
                console.log(`Fixing Team ${val.name}: ${val.score} -> ${safeScore}`);
                window.db.ref(`teams/${child.key}`).update({ score: safeScore });
            }
        });
    });
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

// --- SIMPLIFIED WINNER LOGIC ---
function endGame() {
    if(!confirm("End entire event?")) return;
    
    window.db.ref('teams').once('value', snap => {
        let allTeams = [];
        
        // 1. Get Data
        snap.forEach(c => {
            let t = c.val();
            allTeams.push({
                name: t.name,
                score: Number(t.score) || 0 // Absolute Force Number
            });
        });

        // 2. Sort Descending (Big numbers top)
        allTeams.sort((a, b) => b.score - a.score);
        
        // DEBUG: Show Admin exactly what is happening
        console.table(allTeams); 
        alert(`Top Score Found: ${allTeams[0].score} by ${allTeams[0].name}`);

        // 3. Group by Score (Bucket Method)
        let buckets = []; // [{score: 25, names: []}, {score: 12, names: []}]
        
        allTeams.forEach(t => {
            // If this is the first team OR score is different from previous bucket
            if (buckets.length === 0 || buckets[buckets.length-1].score !== t.score) {
                buckets.push({ score: t.score, names: [t.name] });
            } else {
                // Same score as previous bucket, add name
                buckets[buckets.length-1].names.push(t.name);
            }
        });

        // 4. Generate HTML
        let html = "";
        if (buckets.length === 0) html = "No Data";
        
        // Only take Top 3 Buckets
        for(let i=0; i < Math.min(3, buckets.length); i++) {
            let bucket = buckets[i];
            let rank = i + 1;
            let names = bucket.names.join("<br>");
            
            let color = rank === 1 ? "#FFD700" : (rank === 2 ? "#C0C0C0" : "#CD7F32");
            let icon = rank === 1 ? "🏆" : (rank === 2 ? "🥈" : "🥉");
            
            html += `
            <div style="border: 2px solid ${color}; background: rgba(0,0,0,0.3); border-radius: 10px; margin-bottom: 10px; padding: 10px;">
                <div style="color:${color}; font-size: 1.5rem; font-weight: bold;">${icon} Rank ${rank}</div>
                <div style="font-size: 1.2rem; margin: 5px 0;">${names}</div>
                <div style="color: #aaa;">Score: ${bucket.score}</div>
            </div>`;
        }

        // 5. Save
        window.db.ref('gameState').update({ 
            status: 'ENDED', 
            winnerName: html 
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
    
    // Sort
    teams.sort((a,b) => (Number(b.score)||0) - (Number(a.score)||0));

    // Render Table
    document.getElementById('scoreTable').innerHTML = teams.map((t, i) => `
        <tr class="border-b border-gray-700">
            <td class="p-4 text-yellow-400 font-bold text-2xl">#${i+1}</td>
            <td class="p-4 text-xl">${t.name} <span class="text-sm text-gray-500">(${t.id})</span></td>
            <td class="p-4 font-bold text-2xl text-green-400">${t.score}</td>
        </tr>
    `).join('');
    
    // Render Grid
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
        
        // List
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
        logTable.innerHTML += `
            <tr class="border-b border-gray-700 hover:bg-gray-700">
                <td class="p-3 font-mono text-yellow-400">#${rank}</td>
                <td class="p-3">${teamName}</td>
                <td class="p-3 font-mono text-gray-300">${timeStr}</td>
            </tr>`;
        rank++;
    });
});

// --- ACTIONS ---
function givePoints(teamId, pts) { 
    window.db.ref(`teams/${teamId}/score`).transaction(c => (Number(c)||0) + pts); 
}

function kick(id) { 
    if(confirm(`Kick Team ${id}?`)) window.db.ref(`teams/${id}/sessionId`).set(null); 
}
