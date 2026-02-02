// js/firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyBEWaTZQjySBix_HPA0T7cY2iAOqML-zZw",
    authDomain: "iare-lake-quiz-buzz.firebaseapp.com",
    databaseURL: "https://iare-lake-quiz-buzz-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "iare-lake-quiz-buzz",
    storageBucket: "iare-lake-quiz-buzz.firebasestorage.app",
    messagingSenderId: "124373499983",
    appId: "1:124373499983:web:e3f78da78243b2c2a9ea3a",
    measurementId: "G-96RVJB66DE"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Make 'db' global so other files can use it
window.db = firebase.database();
console.log("Firebase Connected");