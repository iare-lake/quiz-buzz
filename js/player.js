const teamId = localStorage.getItem('quiz_teamId');
const mySession = localStorage.getItem('quiz_sessionId');

// Global timer variable
let timerInterval = null;

if (!teamId || !mySession) window.location.href = "login.html";

// 1. Session Enforcement (Kickout Logic)
window.db.ref(`teams/${teamId}`).on('value', snap => {
    const data = snap.val();
    if (!data) return; // Team deleted
    
    // Check Session
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

// 2. Game State Logic & Colors
const btn = document.getElementById('buzzerBtn');
const statusTxt = document.getElementById('statusText');

window.db.ref('gameState').on('value', snap => {
    const state = snap.val() || {};
    const status = state.status || 'WAITING';

    // --- FIXED TIMER LOGIC START ---
    
    // 1. Clear any existing timer to prevent glitches
    if (timerInterval) clearInterval(timerInterval);

    // 2. Check status
    if (status === 'OPEN') {
        const startTime = state.startTime || Date.now();
        
        // Define the update function
        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, 180 - elapsed); // 180 seconds = 3 mins
            document.getElementById('liveTimer').innerText = fmtTime(remaining);
            
            // Optional: Auto-disable button locally if time hits 0
            if (remaining === 0) {
                 // You can add local disable logic here if you want extra safety
            }
        };

        // Run immediately once, then loop
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
        
    } else {
        // If closed/waiting, reset timer text
        document.getElementById('liveTimer').innerText = "00:00";
    }
    // --- FIXED TIMER LOGIC END ---


    // Final Winner Screen
    if (status === 'ENDED') {
        document.getElementById('winnerOverlay').classList.remove('hidden');
        document.getElementById('winnerText').innerText = state.winnerName || "???";
        return;
    }

    // Buzzer State Machine
    if (status === 'WAITING') {
        setBtnState('green', 'WAIT', true);
        statusTxt.innerText = "WAITING FOR QUESTION...";
    } 
    else if (status === 'OPEN') {
        // Check if I already buzzed
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

// 3. Buzz Action (Transaction)
function buzz() {
    setBtnState('red', 'SENDING...', true); // Optimistic UI
    
    window.db.ref('currentQuestion/buzzQueue').transaction(currentQueue => {
        if (currentQueue === null) return { [teamId]: { time: firebase.database.ServerValue.TIMESTAMP } };
        
        // If team already buzzed, abort
        if (currentQueue.hasOwnProperty(teamId)) return;

        // Add team to queue
        currentQueue[teamId] = { time: firebase.database.ServerValue.TIMESTAMP };
        return currentQueue;
    }, (error, committed) => {
        if (committed) {
            statusTxt.innerText = "SUCCESS!";
        } else {
            statusTxt.innerText = "TOO LATE!"; 
        }
    });
}

// Helpers
function setBtnState(color, text, disabled) {
    btn.disabled = disabled;
    btn.innerText = text;
    btn.className = `buzzer-btn w-64 h-64 rounded-full border-8 border-gray-700 flex items-center justify-center text-3xl font-bold tracking-widest text-white transition-colors duration-200 shadow-2xl`;
    
    if (color === 'green') btn.classList.add('bg-green-700', 'shadow-green-900/50');
    if (color === 'yellow') btn.classList.add('bg-yellow-500', 'animate-pulse', 'text-black', 'border-yellow-600');
    if (color === 'red') btn.classList.add('bg-red-600', 'border-red-800');
    if (color === 'black') btn.classList.add('bg-gray-900', 'text-gray-500');
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('-translate-x-full');
}

function fmtTime(s) {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec < 10 ? '0'+sec : sec}`;
}

function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}
