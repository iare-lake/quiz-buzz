const teamId = localStorage.getItem('quiz_teamId');
const mySession = localStorage.getItem('quiz_sessionId');

// 1. Session Listener
window.db.ref(`teams/${teamId}`).on('value', snap => {
    const data = snap.val();
    if (!data) return; // Team deleted
    
    // Security Kick
    if (data.sessionId && data.sessionId !== mySession) {
        alert("Logged in from another device!");
        localStorage.clear();
        window.location.href = "login.html";
    }

    // Update Sidebar
    document.getElementById('teamDetails').innerHTML = `
        <p><span class="text-gray-500">ID:</span> <span class="text-white font-bold">${teamId}</span></p>
        <p><span class="text-gray-500">Name:</span> <span class="text-white">${data.name}</span></p>
        <p><span class="text-gray-500">Score:</span> <span class="text-green-400 font-bold text-xl">${data.score}</span></p>
    `;
});

// Heartbeat
setInterval(() => {
    window.db.ref(`teams/${teamId}`).update({ lastActive: firebase.database.ServerValue.TIMESTAMP });
}, 5000);

// 2. Game State Logic
const btn = document.getElementById('buzzerBtn');
const statusTxt = document.getElementById('statusText');

window.db.ref('gameState').on('value', snap => {
    const state = snap.val() || {};
    const status = state.status || 'WAITING';

    // Timer
    if (status === 'OPEN') {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const remaining = Math.max(0, 180 - elapsed);
        document.getElementById('liveTimer').innerText = fmtTime(remaining);
    } else {
        document.getElementById('liveTimer').innerText = "00:00";
    }

    // Winner
    if (status === 'ENDED') {
        document.getElementById('winnerOverlay').classList.remove('hidden');
        document.getElementById('winnerText').innerText = state.winnerName || "???";
        return;
    }

    // Button States
    if (status === 'WAITING') {
        setBtnState('green', 'WAIT', true);
        statusTxt.innerText = "WAITING FOR QUESTION...";
    } 
    else if (status === 'OPEN') {
        // Check if buzzed
        window.db.ref('currentQuestion/buzzQueue').child(teamId).once('value', s => {
            if (s.exists()) {
                setBtnState('red', 'BUZZED', true);
                statusTxt.innerText = "YOU HAVE BUZZED";
            } else {
                setBtnState('yellow', 'BUZZ!', false);
                statusTxt.innerText = "HIT IT FAST!";
            }
        });
    } 
    else if (status === 'CLOSED') {
        setBtnState('black', 'LOCKED', true);
        statusTxt.innerText = "ROUND CLOSED";
    }
});

function buzz() {
    setBtnState('red', 'SENDING...', true);
    
    window.db.ref('currentQuestion/buzzQueue').transaction(currentQueue => {
        if (currentQueue === null) return { [teamId]: { time: firebase.database.ServerValue.TIMESTAMP } };
        if (currentQueue.hasOwnProperty(teamId)) return; // Already in queue
        
        currentQueue[teamId] = { time: firebase.database.ServerValue.TIMESTAMP };
        return currentQueue;
    }, (error, committed) => {
        if (committed) statusTxt.innerText = "SUCCESS!";
        else statusTxt.innerText = "TOO LATE!"; // Shouldn't happen often in this logic
    });
}

function setBtnState(color, text, disabled) {
    btn.disabled = disabled;
    btn.innerText = text;
    btn.className = `buzzer-btn w-64 h-64 rounded-full border-8 border-gray-700 flex items-center justify-center text-3xl font-bold tracking-widest text-white transition-colors duration-200 shadow-2xl`;
    
    if (color === 'green') btn.classList.add('bg-green-700', 'shadow-green-900/50');
    if (color === 'yellow') btn.classList.add('bg-yellow-500', 'animate-pulse', 'text-black', 'border-yellow-600');
    if (color === 'red') btn.classList.add('bg-red-600', 'border-red-800');
    if (color === 'black') btn.classList.add('bg-gray-900', 'text-gray-500');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }
function fmtTime(s) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
function logout() { localStorage.clear(); window.location.href = "login.html"; }