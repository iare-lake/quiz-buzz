const EVENT_CODE = "ASMI2026"; // CHANGE THIS CODE

document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const code = document.getElementById('eventCode').value.trim();
    if (code !== EVENT_CODE) return Swal.fire('Error', 'Invalid Event Code', 'error');

    const teamId = document.getElementById('teamId').value.trim().toUpperCase();
    const rollNo = document.getElementById('rollNo').value.trim();
    const teamName = document.getElementById('teamName').value.trim();
    const password = document.getElementById('password').value.trim();

    // Check Duplicates
    const snapshot = await window.db.ref('teams').once('value');
    const teams = snapshot.val() || {};

    if (teams[teamId]) return Swal.fire('Error', `Team ID '${teamId}' is already taken!`, 'error');

    for (let key in teams) {
        if (teams[key].name.toLowerCase() === teamName.toLowerCase()) 
            return Swal.fire('Error', 'Team Name already exists!', 'error');
        if (teams[key].rollNo === rollNo) 
            return Swal.fire('Error', `Roll No ${rollNo} is already registered!`, 'error');
    }

    // Register
    const sessionId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    
    await window.db.ref('teams/' + teamId).set({
        name: teamName,
        rollNo: rollNo,
        teammates: document.getElementById('teammates').value,
        branch: document.getElementById('branch').value,
        sem: document.getElementById('sem').value,
        section: document.getElementById('section').value,
        password: password,
        score: 0,
        sessionId: sessionId,
        lastActive: firebase.database.ServerValue.TIMESTAMP
    });

    localStorage.setItem('quiz_teamId', teamId);
    localStorage.setItem('quiz_sessionId', sessionId);
    
    Swal.fire('Success', 'Team Registered!', 'success').then(() => window.location.href = "index.html");

});
