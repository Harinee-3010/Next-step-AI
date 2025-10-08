import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// ADDED: Import Firestore functions
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Note: firebaseConfig and geminiApiKey are now loaded from config.js

const { jsPDF } = window.jspdf;
const pageLogin = document.getElementById('page-login');
const pageInput = document.getElementById('page-input');
const pageRoadmap = document.getElementById('page-roadmap');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authButton = document.getElementById('auth-button');
const authToggleLink = document.getElementById('auth-toggle-link');
const authPromptText = document.getElementById('auth-prompt-text');
const authError = document.getElementById('auth-error');
const signOutButton = document.getElementById('sign-out-button');
const careerForm = document.getElementById('career-form');
const formError = document.getElementById('form-error');
const roadmapOutput = document.getElementById('roadmap-output');
const startOverButton = document.getElementById('start-over-button');
const clearButton = document.getElementById('clear-button');
const submitButton = document.getElementById('submit-button');
const downloadButton = document.getElementById('download-button');
let isSignUp = false;

// Initialize Firebase with the config from config.js
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// ADDED: Initialize Firestore
const db = getFirestore(app);

function showPage(pageId) {
    pageLogin.classList.toggle('hidden', pageId !== 'page-login');
    pageInput.classList.toggle('hidden', pageId !== 'page-input');
    pageRoadmap.classList.toggle('hidden', pageId !== 'page-roadmap');
}

onAuthStateChanged(auth, user => user ? showPage('page-input') : showPage('page-login'));

authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    authTitle.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    authButton.textContent = isSignUp ? 'Create Account' : 'Sign In';
    authPromptText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    authToggleLink.textContent = isSignUp ? 'Sign In' : 'Sign Up';
    authError.classList.add('hidden');
    authForm.reset();
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authForm.email.value;
    const password = authForm.password.value;
    authError.classList.add('hidden');
    try {
        if (isSignUp) await createUserWithEmailAndPassword(auth, email, password);
        else await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        authError.textContent = error.message;
        authError.classList.remove('hidden');
    }
});

signOutButton.addEventListener('click', () => signOut(auth));

let skillChartRadarInstance, futureScopeChartInstance, skillChartPieInstance;
function destroyCharts() {
    if (skillChartRadarInstance) skillChartRadarInstance.destroy();
    if (futureScopeChartInstance) futureScopeChartInstance.destroy();
    if (skillChartPieInstance) skillChartPieInstance.destroy();
}
clearButton.addEventListener('click', () => { careerForm.reset(); formError.classList.add('hidden'); });
startOverButton.addEventListener('click', () => { careerForm.reset(); roadmapOutput.innerHTML = ''; destroyCharts(); showPage('page-input'); });

careerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.classList.add('hidden');
    if (!careerForm.checkValidity()) {
        formError.textContent = 'Please fill out all fields with valid information.';
        formError.classList.remove('hidden');
        return;
    }
    showPage('page-roadmap');
    submitButton.disabled = true;
    roadmapOutput.innerHTML = `<div class="flex flex-col items-center justify-center pt-10"><div class="loader"></div><p class="mt-4 text-gray-600">Generating roadmap...</p></div>`;
    destroyCharts();
    
    // CORRECTED: More forceful prompt for the AI
    const userPrompt = `
        Given the following user profile:
        - Current Role: ${document.getElementById('current-role').value}
        - Experience: ${document.getElementById('experience').value} years
        - Current Skills: ${document.getElementById('skills').value}
        - Career Goal: ${document.getElementById('goal').value}
        Generate a crisp and detailed career roadmap formatted as clean HTML.
        The tone should be encouraging and professional. Structure the response into specific sections using <h3> for each title: "Strategic Overview", "Key Skills to Develop", "Project-Based Learning Ideas", and "Networking and Growth Strategy".
        Provide actionable advice in bullet points using <ul> and <li> tags. Use <strong> tags for emphasis on key terms instead of markdown asterisks. The total text should be concise yet detailed, around 10-15 lines. Do NOT use generic headings like "Phase 1".
        
        IMPORTANT: Your response MUST include the following four machine-readable HTML comments for data extraction, formatted exactly as shown:
        <!-- SKILLS_EXISTING: Skill A, Skill B -->
        <!-- SKILLS_TO_ACQUIRE: Skill C, Skill D -->
        <!-- SKILL_CATEGORIES: Technical:2, Soft Skills:3 -->
        <!-- FUTURE_SCOPE: Year 1:80000, Year 3:120000, Year 5:180000 -->`;

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;
        const payload = { contents: [{ parts: [{ text: userPrompt }] }] };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API request failed: ${(await response.json()).error.message}`);
        const result = await response.json();
        const roadmapHtml = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!roadmapHtml) throw new Error("No valid content received from API.");

        roadmapOutput.innerHTML = roadmapHtml;

        const existingSkillsMatch = roadmapHtml.match(/<!-- SKILLS_EXISTING: (.*?) -->/);
        const skillsToAcquireMatch = roadmapHtml.match(/<!-- SKILLS_TO_ACQUIRE: (.*?) -->/);
        const futureScopeMatch = roadmapHtml.match(/<!-- FUTURE_SCOPE: (.*?) -->/);
        const skillCategoriesMatch = roadmapHtml.match(/<!-- SKILL_CATEGORIES: (.*?) -->/);
        
        if (existingSkillsMatch && skillsToAcquireMatch) renderSkillRadarChart(existingSkillsMatch[1], skillsToAcquireMatch[1]);
        if (futureScopeMatch) renderFutureScopeChart(futureScopeMatch[1]);
        if (skillCategoriesMatch) renderSkillPieChart(skillCategoriesMatch[1]);

        // CORRECTED: Save data to Firestore only AFTER successful generation and rendering
        await saveRoadmapToFirestore(roadmapHtml);
        
    } catch (error) {
        console.error("Error:", error);
        roadmapOutput.innerHTML = `<div class="text-center"><p class="text-red-500">Error generating roadmap. ${error.message}</p></div>`;
    } finally {
        submitButton.disabled = false;
    }
});

// ADDED: Function to save roadmap data to Firestore
async function saveRoadmapToFirestore(roadmapHtml) {
    const user = auth.currentUser;
    if (!user) return; // Only save if a user is logged in

    try {
        const docRef = await addDoc(collection(db, "userRoadmaps"), {
            userId: user.uid,
            userEmail: user.email,
            createdAt: serverTimestamp(),
            formData: {
                currentRole: document.getElementById('current-role').value,
                experience: document.getElementById('experience').value,
                skills: document.getElementById('skills').value,
                goal: document.getElementById('goal').value
            },
            generatedRoadmap: roadmapHtml
        });
        console.log("Roadmap saved to Firestore with ID: ", docRef.id);
    } catch (e) {
        console.error("Error adding document to Firestore: ", e);
    }
}

downloadButton.addEventListener('click', async () => {
    const content = document.getElementById('report-content');
    const button = document.getElementById('download-button');
    const originalText = button.textContent;
    button.textContent = 'Generating...';
    button.disabled = true;
    content.classList.add('bg-white');
    try {
        const canvas = await html2canvas(content, { 
            scale: 2, 
            logging: false, 
            useCORS: true,
            windowWidth: content.scrollWidth,
            windowHeight: content.scrollHeight
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save('Career-Roadmap-Report.pdf');
    } catch (error) {
        console.error("Failed to generate PDF:", error);
        alert("Sorry, there was an error creating the PDF report.");
    } finally {
        content.classList.remove('bg-white');
        button.textContent = originalText;
        button.disabled = false;
    }
});

// --- CHART RENDERING FUNCTIONS ---
function renderSkillRadarChart(existingStr, toAcquireStr) {
    const existing = existingStr.split(',').map(s => s.trim());
    const toAcquire = toAcquireStr.split(',').map(s => s.trim());
    const ctx = document.getElementById('skillChartRadar').getContext('2d');
    const allSkills = [...new Set([...existing, ...toAcquire])];
    const data = {
        labels: allSkills,
        datasets: [
            { label: 'Current Skills', data: allSkills.map(s => existing.includes(s) ? 10 : 0), backgroundColor: 'rgba(79, 70, 229, 0.2)', borderColor: 'rgba(79, 70, 229, 1)', borderWidth: 2 },
            { label: 'Skills to Develop', data: allSkills.map(s => toAcquire.includes(s) ? 5 : 0), backgroundColor: 'rgba(219, 39, 119, 0.2)', borderColor: 'rgba(219, 39, 119, 1)', borderWidth: 2 }
        ]
    };
    skillChartRadarInstance = new Chart(ctx, { type: 'radar', data, options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { title: { display: true, text: 'Skills Profile' } },
        scales: { r: { pointLabels: { font: { size: 13 } }, grid: { circular: true } } }
    } });
}
function renderFutureScopeChart(scopeData) {
    const ctx = document.getElementById('futureScopeChart').getContext('2d');
    const points = scopeData.split(',').map(p => p.trim().split(':'));
    const data = {
        labels: points.map(p => p[0]),
        datasets: [{ label: 'Projected Growth (e.g., Salary)', data: points.map(p => p[1]), fill: true, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1 }]
    };
    futureScopeChartInstance = new Chart(ctx, { type: 'line', data, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Future Career Scope' } } } });
}
function renderSkillPieChart(categoryData) {
    const ctx = document.getElementById('skillChartPie').getContext('2d');
    const categories = categoryData.split(',').map(c => c.trim().split(':'));
    const data = {
        labels: categories.map(c => c[0]),
        datasets: [{ label: 'Skill Categories', data: categories.map(c => c[1]), backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)', 'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)'] }]
    };
    skillChartPieInstance = new Chart(ctx, { type: 'pie', data, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Needed Skill Categories' } } } });
}

