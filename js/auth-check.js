// js/auth-check.js
(function() {
    const teamId = localStorage.getItem('quiz_teamId');
    const sessionId = localStorage.getItem('quiz_sessionId');

    // If not logged in, kick to login page immediately
    if (!teamId || !sessionId) {
        window.location.replace("login.html");
    }
})();