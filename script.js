import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
    'https://rlxlnmcesiagglmajzwh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseGxubWNlc2lhZ2dsbWFqendoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjU3NTAsImV4cCI6MjA4ODY0MTc1MH0.KVawKGf8JOUymKP5DkjIRNawrkV-VraFDdFVasKhyrE'
);

// Global state
const OPENROUTER_API_KEY = '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';
let currentUser = null;
let userSettings = null;
let notes = [];
let folders = [];
let tasks = [];
let quizzes = [];
let grades = [];
let currentNote = null;
let currentView = 'all';
let currentFolder = null;
let saveTimeout = null;
let authMode = 'login';
let timerInterval = null;
let timerSeconds = 25 * 60;
let isTimerRunning = false;
let currentAffirmation = '';

// Templates
const templates = {
    'Class Notes': '<h1>Class Notes</h1><h2>Date:</h2><h2>Topic:</h2><h2>Key Points:</h2><ul><li></li></ul><h2>Questions:</h2>',
    'Meeting Notes': '<h1>Meeting Notes</h1><h2>Date:</h2><h2>Attendees:</h2><h2>Agenda:</h2><h2>Action Items:</h2><ul><li></li></ul>',
    'To-Do List': '<h1>To-Do List</h1><h2>Today:</h2><ul><li></li></ul><h2>This Week:</h2><ul><li></li></ul>',
    'Study Guide': '<h1>Study Guide</h1><h2>Subject:</h2><h2>Key Concepts:</h2><ul><li></li></ul><h2>Practice Questions:</h2>',
    'Blank': ''
};

// Affirmations
const affirmations = [
    "Your brain is literally growing right now 🧠",
    "Small steps every day = massive results 📈",
    "You're building discipline, not just knowledge 💪",
    "Future you is grateful for present you 🙏",
    "Mistakes are data points, not failures 📊",
    "Consistency beats perfection every time ⚡",
    "Your effort today shapes your tomorrow 🌟",
    "Every master was once a beginner 🎯",
    "Focus is a superpower you're training 🎮",
    "You're literally investing in yourself 💎"
];

function getRandomAffirmation() {
    return affirmations[Math.floor(Math.random() * affirmations.length)];
}

// Initialize
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserData();
        await updateStreak();
        showApp();
    }
    setupEventListeners();
}

function setupEventListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            authMode = tab.dataset.tab;
            document.getElementById('schoolGroup').style.display = authMode === 'signup' ? 'block' : 'none';
            document.getElementById('authSubmit').textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
        });
    });

    document.getElementById('authForm').addEventListener('submit', handleAuth);
    document.getElementById('signoutBtn').addEventListener('click', signOut);
    
    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentView = item.dataset.view;
            currentFolder = null;
            renderView();
        });
    });

    document.getElementById('newNoteBtn').addEventListener('click', () => createNewNote());
    document.getElementById('newFolderBtn').addEventListener('click', createFolder);
    document.getElementById('darkModeBtn').addEventListener('click', toggleDarkMode);
    document.getElementById('templateBtn').addEventListener('click', showTemplateModal);
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    
    document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
    document.getElementById('editorTitle').addEventListener('input', handleEditorChange);
    document.getElementById('editorContent').addEventListener('input', handleEditorChange);
    document.getElementById('editorFolder').addEventListener('change', handleEditorChange);
    document.getElementById('pinNoteBtn').addEventListener('click', togglePin);
    document.getElementById('deleteNoteBtn').addEventListener('click', deleteCurrentNote);
    document.getElementById('exportBtn').addEventListener('click', exportNote);
    document.getElementById('shareBtn').addEventListener('click', shareNote);
    
    document.getElementById('modalCancel').addEventListener('click', () => closeModal());
    document.getElementById('editorModal').addEventListener('click', (e) => {
        if (e.target.id === 'editorModal') closeEditor();
    });
}

async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const school = document.getElementById('school').value;

    try {
        if (authMode === 'signup') {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            
            await supabase.from('user_settings').insert([{
                user_id: data.user.id,
                school: school,
                dark_mode: false,
                current_streak: 0,
                longest_streak: 0,
                last_login_date: new Date().toISOString().split('T')[0]
            }]);
            
            alert('Check your email to confirm your account!');
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            await loadUserData();
            await updateStreak();
            showApp();
        }
    } catch (error) {
        alert(error.message);
    }
}

async function signOut() {
    await supabase.auth.signOut();
    currentUser = null;
    notes = [];
    folders = [];
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appContainer').classList.remove('active');
}

async function loadUserData() {
    let { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();
    
    if (!settings) {
        const { data } = await supabase
            .from('user_settings')
            .insert([{ 
                user_id: currentUser.id, 
                school: 'salesianum', 
                dark_mode: false,
                current_streak: 0,
                longest_streak: 0,
                last_login_date: new Date().toISOString().split('T')[0]
            }])
            .select()
            .single();
        settings = data;
    }
    
    userSettings = settings;
    
    if (userSettings.dark_mode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('darkModeBtn').classList.add('active');
    }
    
    const { data: foldersData } = await supabase
        .from('folders')
        .select('*')
        .order('position', { ascending: true });
    folders = foldersData || [];
    
    const { data: tasksData } = await supabase
        .from('planner_tasks')
        .select('*')
        .order('due_date', { ascending: true });
    tasks = tasksData || [];
    
    const { data: quizzesData } = await supabase
        .from('quizzes')
        .select('*')
        .order('created_at', { ascending: false });
    quizzes = quizzesData || [];
    
    const { data: gradesData } = await supabase
        .from('grades')
        .select('*')
        .order('due_date', { ascending: true });
    grades = gradesData || [];
    
    await loadNotes();
}

async function loadNotes() {
    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('position', { ascending: true })
        .order('updated_at', { ascending: false });
    
    if (!error) {
        notes = data || [];
    }
}

async function updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = userSettings.last_login_date;
    
    if (lastLogin === today) {
        return; // Already logged in today
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let newStreak = userSettings.current_streak;
    
    if (lastLogin === yesterdayStr) {
        newStreak += 1;
    } else if (lastLogin !== today) {
        newStreak = 1;
    }
    
    const longestStreak = Math.max(newStreak, userSettings.longest_streak);
    
    await supabase
        .from('user_settings')
        .update({
            current_streak: newStreak,
            longest_streak: longestStreak,
            last_login_date: today
        })
        .eq('user_id', currentUser.id);
    
    userSettings.current_streak = newStreak;
    userSettings.longest_streak = longestStreak;
    
    document.getElementById('streakNumber').textContent = newStreak;
}

function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appContainer').classList.add('active');
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').textContent = currentUser.email[0].toUpperCase();
    document.getElementById('streakNumber').textContent = userSettings.current_streak;
    
    const schoolNames = {
        'salesianum': 'Salesianum School',
        'stpeter': 'St. Peter Cathedral'
    };
    document.getElementById('userSchool').textContent = schoolNames[userSettings.school] || '';
    
    renderFolders();
    renderView();
    updateCounts();
}

function renderFolders() {
    const container = document.getElementById('foldersList');
    const editorSelect = document.getElementById('editorFolder');
    
    const topLevelFolders = folders.filter(f => !f.parent_id);
    
    if (topLevelFolders.length === 0) {
        container.innerHTML = '<div style="opacity: 0.5; font-size: 0.9rem; padding: 0.5rem 1rem;">No folders yet</div>';
    } else {
        container.innerHTML = renderFolderTree(topLevelFolders);
    }
    
    editorSelect.innerHTML = '<option value="">No Folder</option>' + 
        folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
}

function renderFolderTree(folderList, depth = 0) {
    return folderList.map(folder => {
        const subfolders = folders.filter(f => f.parent_id === folder.id);
        const noteCount = notes.filter(n => n.folder_id === folder.id).length;
        
        return `
            <div class="sidebar-item folder-item" data-folder="${folder.id}" onclick="selectFolder('${folder.id}')" style="padding-left: ${1 + depth}rem;">
                <span class="sidebar-item-icon" style="color: ${folder.color}">📁</span>
                <span>${folder.name}</span>
                <span class="sidebar-item-count">${noteCount}</span>
            </div>
            ${subfolders.length > 0 ? renderFolderTree(subfolders, depth + 1) : ''}
        `;
    }).join('');
}

window.selectFolder = function(folderId) {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-folder="${folderId}"]`)?.classList.add('active');
    currentView = 'folder';
    currentFolder = folderId;
    renderView();
};

async function createFolder() {
    const name = prompt('Folder name:');
    if (!name) return;
    
    const colors = ['#D97757', '#6B8E7F', '#C85846', '#A4C3B2', '#E8DCC4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const { data, error } = await supabase
        .from('folders')
        .insert([{ user_id: currentUser.id, name, color, position: folders.length }])
        .select()
        .single();
    
    if (!error) {
        folders.push(data);
        renderFolders();
        updateCounts();
    }
}

function renderView() {
    const mainView = document.getElementById('mainView');
    
    if (currentView === 'calendar') {
        renderCalendar(mainView);
    } else if (currentView === 'stats') {
        renderStats(mainView);
    } else if (currentView === 'timer') {
        renderTimer(mainView);
    } else if (currentView === 'quizzes') {
        renderQuizzes(mainView);
    } else if (currentView === 'grades') {
        renderGrades(mainView);
    } else if (currentView === 'ai-search') {
        renderAISearch(mainView);
    } else {
        renderNotes(mainView);
    }
}

function renderNotes(container) {
    let filteredNotes = notes;
    
    if (currentView === 'pinned') {
        filteredNotes = notes.filter(n => n.is_pinned);
    } else if (currentView === 'folder' && currentFolder) {
        filteredNotes = notes.filter(n => n.folder_id === currentFolder);
    }
    
    if (filteredNotes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <h3>No notes here</h3>
                <p>Create your first note to get started</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="notes-grid">
            ${filteredNotes.map(note => {
                const folder = folders.find(f => f.id === note.folder_id);
                const tags = note.tags || [];
                return `
                    <div class="note-card ${note.is_pinned ? 'pinned' : ''}" onclick="openNote('${note.id}')">
                        <h3 class="note-title">${note.title || 'Untitled'}</h3>
                        <div class="note-preview">${getPreview(note.content)}</div>
                        ${tags.length > 0 ? `
                            <div class="note-tags">
                                ${tags.map(tag => `<span class="note-tag">${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                        <div class="note-meta">
                            <span class="note-date">${formatDate(note.updated_at)}</span>
                            ${folder ? `<span class="note-folder-tag" style="background: ${folder.color}22; color: ${folder.color}">${folder.name}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderCalendar(container) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h2>Planner & Calendar</h2>
            <button class="btn-primary" onclick="addTask()">+ Add Task</button>
        </div>
        <div class="calendar-container">
            <div class="calendar-header">
                <h2>${monthNames[month]} ${year}</h2>
            </div>
            <div class="calendar-grid">
    `;
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        html += `<div style="font-weight: 700; padding: 1rem; text-align: center;">${day}</div>`;
    });
    
    const startDay = firstDay.getDay();
    for (let i = 0; i < startDay; i++) {
        html += '<div></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayTasks = tasks.filter(t => t.due_date === dateStr);
        
        html += `
            <div class="calendar-day" onclick="addTaskForDate('${dateStr}')">
                <div class="calendar-day-number">${day}</div>
                ${dayTasks.map(t => `
                    <div class="calendar-task ${t.completed ? 'completed' : ''}" onclick="event.stopPropagation(); toggleTask('${t.id}')">
                        ${t.title}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    html += '</div></div>';
    
    // Upcoming tasks
    const upcomingTasks = tasks.filter(t => !t.completed).slice(0, 10);
    if (upcomingTasks.length > 0) {
        html += `
            <div style="margin-top: 3rem;">
                <h2 style="margin-bottom: 1.5rem;">Upcoming Tasks</h2>
                <div style="display: grid; gap: 1rem;">
                    ${upcomingTasks.map(t => `
                        <div class="note-card" style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <h3 class="note-title">${t.title}</h3>
                                <p style="opacity: 0.7;">${t.subject || 'No subject'} • ${formatDate(t.due_date)}</p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-secondary" onclick="editTask('${t.id}')">Edit</button>
                                <button class="btn-secondary" onclick="deleteTask('${t.id}')">Delete</button>
                                <button class="btn-secondary" onclick="toggleTask('${t.id}')">
                                    ${t.completed ? 'Undo' : 'Complete'}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

window.addTask = function() {
    const today = new Date().toISOString().split('T')[0];
    addTaskForDate(today);
};

window.addTaskForDate = function(dateStr) {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Title</label>
            <input type="text" id="taskTitle" placeholder="Homework assignment">
        </div>
        <div class="form-group">
            <label>Subject</label>
            <input type="text" id="taskSubject" placeholder="Math">
        </div>
        <div class="form-group">
            <label>Due Date</label>
            <input type="date" id="taskDate" value="${dateStr}">
        </div>
        <div class="form-group">
            <label>Due Time</label>
            <input type="time" id="taskTime">
        </div>
        <div class="form-group">
            <label>Description</label>
            <input type="text" id="taskDesc" placeholder="Optional">
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Add Task';
    document.getElementById('modalConfirm').onclick = async () => {
        const title = document.getElementById('taskTitle').value;
        const subject = document.getElementById('taskSubject').value;
        const date = document.getElementById('taskDate').value;
        const time = document.getElementById('taskTime').value;
        const desc = document.getElementById('taskDesc').value;
        
        if (!title || !date) {
            alert('Title and date are required!');
            return;
        }
        
        const { data, error } = await supabase
            .from('planner_tasks')
            .insert([{
                user_id: currentUser.id,
                title,
                subject,
                due_date: date,
                due_time: time || null,
                description: desc,
                completed: false
            }])
            .select()
            .single();
        
        if (!error) {
            tasks.push(data);
            closeModal();
            renderView();
        }
    };
    
    document.getElementById('modal').classList.add('active');
};

window.toggleTask = async function(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.completed = !task.completed;
    
    await supabase
        .from('planner_tasks')
        .update({ completed: task.completed })
        .eq('id', taskId);
    
    if (task.completed) {
        createConfetti();
    }
    
    renderView();
};

function renderTimer(container) {
    currentAffirmation = getRandomAffirmation();
    
    container.innerHTML = `
        <div class="timer-widget">
            <h2>Focus Timer (Pomodoro)</h2>
            <div class="timer-display" id="timerDisplay">${formatTime(timerSeconds)}</div>
            <div class="timer-controls">
                <button class="btn-primary" id="startTimerBtn" onclick="startTimer()">Start</button>
                <button class="btn-secondary" id="pauseTimerBtn" onclick="pauseTimer()" style="display: none;">Pause</button>
                <button class="btn-secondary" onclick="resetTimer()">Reset</button>
            </div>
            <div class="affirmation">${currentAffirmation}</div>
        </div>
        
        <div style="margin-top: 2rem;">
            <h3 style="margin-bottom: 1rem;">Quick Tips</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <p>Break big tasks into 25-min chunks. Your brain loves small wins! 🎯</p>
                </div>
                <div class="stat-card">
                    <p>Use breaks to actually rest. Scrolling ≠ resting. Walk, stretch, hydrate! 💧</p>
                </div>
                <div class="stat-card">
                    <p>Study the same time each day. Your brain will start focusing automatically 🧠</p>
                </div>
            </div>
        </div>
    `;
}

window.startTimer = function() {
    if (isTimerRunning) return;
    
    isTimerRunning = true;
    document.getElementById('startTimerBtn').style.display = 'none';
    document.getElementById('pauseTimerBtn').style.display = 'inline-block';
    
    timerInterval = setInterval(() => {
        timerSeconds--;
        document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
        
        if (timerSeconds <= 0) {
            pauseTimer();
            alert('🎉 Focus session complete! Time for a 5-minute break.');
            createConfetti();
            timerSeconds = 5 * 60; // 5 min break
            currentAffirmation = getRandomAffirmation();
            renderView();
        }
    }, 1000);
};

window.pauseTimer = function() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    document.getElementById('startTimerBtn').style.display = 'inline-block';
    document.getElementById('pauseTimerBtn').style.display = 'none';
};

window.resetTimer = function() {
    pauseTimer();
    timerSeconds = 25 * 60;
    document.getElementById('timerDisplay').textContent = formatTime(timerSeconds);
};

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function renderQuizzes(container) {
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h2>Quizzes</h2>
            <button class="btn-primary" onclick="createQuiz()">+ Create Quiz</button>
        </div>
        
        ${quizzes.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <h3>No quizzes yet</h3>
                <p>Create a quiz to test your knowledge</p>
            </div>
        ` : `
            <div class="quiz-list">
                ${quizzes.map(quiz => `
                    <div class="quiz-card" onclick="takeQuiz('${quiz.id}')">
                        <h3 class="quiz-title">${quiz.title}</h3>
                        <p class="quiz-meta">${quiz.description || 'No description'}</p>
                    </div>
                `).join('')}
            </div>
        `}
    `;
}

window.createQuiz = function() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Quiz Title</label>
            <input type="text" id="quizTitle" placeholder="Math Chapter 5">
        </div>
        <div class="form-group">
            <label>Description</label>
            <input type="text" id="quizDesc" placeholder="Practice problems">
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Create Quiz';
    document.getElementById('modalConfirm').onclick = async () => {
        const title = document.getElementById('quizTitle').value;
        const desc = document.getElementById('quizDesc').value;
        
        if (!title) {
            alert('Title is required!');
            return;
        }
        
        const { data, error } = await supabase
            .from('quizzes')
            .insert([{
                user_id: currentUser.id,
                title,
                description: desc
            }])
            .select()
            .single();
        
        if (!error) {
            quizzes.unshift(data);
            closeModal();
            addQuizQuestions(data.id);
        }
    };
    
    document.getElementById('modal').classList.add('active');
};

async function addQuizQuestions(quizId) {
    const quiz = quizzes.find(q => q.id === quizId);
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <p style="margin-bottom: 1rem;">Add questions to "${quiz.title}"</p>
        <div class="form-group">
            <label>Question Type</label>
            <select id="qType">
                <option value="multiple">Multiple Choice</option>
                <option value="truefalse">True/False</option>
                <option value="fill">Fill in the Blank</option>
                <option value="matching">Matching</option>
            </select>
        </div>
        <div class="form-group">
            <label>Question</label>
            <input type="text" id="qText" placeholder="What is 2+2?">
        </div>
        <div class="form-group">
            <label>Correct Answer</label>
            <input type="text" id="qAnswer" placeholder="4">
        </div>
        <div class="form-group" id="optionsGroup">
            <label>Options (comma-separated)</label>
            <input type="text" id="qOptions" placeholder="2, 3, 4, 5">
        </div>
    `;
    
    document.getElementById('qType').addEventListener('change', (e) => {
        const optionsGroup = document.getElementById('optionsGroup');
        optionsGroup.style.display = e.target.value === 'multiple' ? 'block' : 'none';
    });
    
    document.getElementById('modalTitle').textContent = 'Add Question';
    document.getElementById('modalConfirm').onclick = async () => {
        const qType = document.getElementById('qType').value;
        const qText = document.getElementById('qText').value;
        const qAnswer = document.getElementById('qAnswer').value;
        const qOptions = document.getElementById('qOptions').value;
        
        if (!qText || !qAnswer) {
            alert('Question and answer are required!');
            return;
        }
        
        let options = null;
        if (qType === 'multiple') {
            options = qOptions.split(',').map(o => o.trim());
        }
        
        await supabase
            .from('quiz_questions')
            .insert([{
                quiz_id: quizId,
                question_type: qType,
                question: qText,
                correct_answer: qAnswer,
                options: options
            }]);
        
        const addAnother = confirm('Question added! Add another?');
        if (addAnother) {
            document.getElementById('qText').value = '';
            document.getElementById('qAnswer').value = '';
            document.getElementById('qOptions').value = '';
        } else {
            closeModal();
            renderView();
        }
    };
    
    document.getElementById('modal').classList.add('active');
}

window.takeQuiz = async function(quizId) {
    const quiz = quizzes.find(q => q.id === quizId);
    
    const { data: questions } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('position', { ascending: true });
    
    if (!questions || questions.length === 0) {
        alert('No questions in this quiz yet!');
        return;
    }
    
    let currentQ = 0;
    let score = 0;
    
    function showQuestion() {
        const q = questions[currentQ];
        const mainView = document.getElementById('mainView');
        
        mainView.innerHTML = `
            <div class="quiz-container">
                <h2>${quiz.title}</h2>
                <p style="opacity: 0.6; margin-bottom: 2rem;">Question ${currentQ + 1} of ${questions.length}</p>
                
                <div class="question-card">
                    <div class="question-text">${q.question}</div>
                    ${renderQuestionInput(q)}
                </div>
                
                <button class="btn-primary" id="submitAnswer" style="margin-top: 2rem;">Submit Answer</button>
            </div>
        `;
        
        document.getElementById('submitAnswer').onclick = checkAnswer;
    }
    
    function renderQuestionInput(q) {
        if (q.question_type === 'multiple') {
            return `
                <div class="question-options">
                    ${q.options.map((opt, i) => `
                        <button class="option-btn" data-answer="${opt}">${opt}</button>
                    `).join('')}
                </div>
            `;
        } else if (q.question_type === 'truefalse') {
            return `
                <div class="question-options">
                    <button class="option-btn" data-answer="True">True</button>
                    <button class="option-btn" data-answer="False">False</button>
                </div>
            `;
        } else if (q.question_type === 'fill') {
            return `<input type="text" id="fillAnswer" style="width: 100%; padding: 1rem; border: 2px solid var(--stroke); border-radius: 12px; font-size: 1.1rem; margin-top: 1rem;">`;
        }
    }
    
    function checkAnswer() {
        const q = questions[currentQ];
        let userAnswer = '';
        
        if (q.question_type === 'fill') {
            userAnswer = document.getElementById('fillAnswer').value.trim();
        } else {
            const selected = document.querySelector('.option-btn.selected');
            if (!selected) {
                alert('Please select an answer!');
                return;
            }
            userAnswer = selected.dataset.answer;
        }
        
        const correct = userAnswer.toLowerCase() === q.correct_answer.toLowerCase();
        
        if (correct) {
            score++;
            createConfetti();
            const affirmation = getRandomAffirmation();
            alert(`✅ BRILLIANT! 🎉\n\n${affirmation}`);
        } else {
            alert(`❌ Not quite... 😬\n\nThe correct answer was: ${q.correct_answer}`);
            document.body.style.animation = 'shake 0.5s';
            setTimeout(() => document.body.style.animation = '', 500);
        }
        
        currentQ++;
        
        if (currentQ < questions.length) {
            showQuestion();
        } else {
            showResults();
        }
    }
    
    function showResults() {
        const percentage = Math.round((score / questions.length) * 100);
        
        supabase
            .from('quiz_results')
            .insert([{
                quiz_id: quizId,
                user_id: currentUser.id,
                score,
                total: questions.length
            }]);
        
        const mainView = document.getElementById('mainView');
        mainView.innerHTML = `
            <div class="quiz-container" style="text-align: center;">
                <h2>Quiz Complete!</h2>
                <div class="quiz-score">${score} / ${questions.length}</div>
                <p style="font-size: 1.5rem; margin: 2rem 0;">${percentage}%</p>
                <p style="font-size: 1.2rem; margin-bottom: 2rem;">${percentage >= 70 ? '🎉 Great job!' : '📚 Keep practicing!'}</p>
                <button class="btn-primary" onclick="location.reload()">Back to Quizzes</button>
            </div>
        `;
        
        if (percentage >= 70) {
            createConfetti();
        }
    }
    
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('option-btn')) {
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            e.target.style.background = 'var(--sand)';
        }
    });
    
    showQuestion();
};

function renderStats(container) {
    const totalNotes = notes.length;
    const pinnedNotes = notes.filter(n => n.is_pinned).length;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.completed).length;
    const foldersCount = folders.length;
    const quizzesCount = quizzes.length;
    
    container.innerHTML = `
        <h2 style="margin-bottom: 2rem;">Your Stats</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${userSettings.current_streak}</div>
                <div class="stat-label">🔥 Current Streak</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${userSettings.longest_streak}</div>
                <div class="stat-label">🏆 Longest Streak</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalNotes}</div>
                <div class="stat-label">📝 Total Notes</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${foldersCount}</div>
                <div class="stat-label">📁 Folders</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${completedTasks}/${totalTasks}</div>
                <div class="stat-label">✅ Tasks Done</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${quizzesCount}</div>
                <div class="stat-label">🎯 Quizzes Created</div>
            </div>
        </div>
        
        <div style="margin-top: 3rem;">
            <h3 style="margin-bottom: 1.5rem;">Recent Notes</h3>
            <div class="notes-grid">
                ${notes.slice(0, 6).map(note => {
                    const folder = folders.find(f => f.id === note.folder_id);
                    return `
                        <div class="note-card ${note.is_pinned ? 'pinned' : ''}" onclick="openNote('${note.id}')">
                            <h3 class="note-title">${note.title || 'Untitled'}</h3>
                            <div class="note-preview">${getPreview(note.content)}</div>
                            <div class="note-meta">
                                <span class="note-date">${formatDate(note.updated_at)}</span>
                                ${folder ? `<span class="note-folder-tag" style="background: ${folder.color}22; color: ${folder.color}">${folder.name}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function updateCounts() {
    document.getElementById('allNotesCount').textContent = notes.length;
    document.getElementById('pinnedCount').textContent = notes.filter(n => n.is_pinned).length;
}

function getPreview(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    return text || 'Empty note';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
        return hours < 1 ? 'Just now' : `${Math.floor(hours)}h ago`;
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function createNewNote(template = '') {
    const { data, error } = await supabase
        .from('notes')
        .insert([{ 
            user_id: currentUser.id, 
            title: 'Untitled', 
            content: template,
            folder_id: currentFolder,
            position: notes.length
        }])
        .select()
        .single();
    
    if (!error) {
        notes.unshift(data);
        currentNote = data;
        openEditorModal();
        updateCounts();
    }
}

window.openNote = function(noteId) {
    currentNote = notes.find(n => n.id === noteId);
    openEditorModal();
};

function openEditorModal() {
    document.getElementById('editorTitle').value = currentNote.title || '';
    document.getElementById('editorContent').innerHTML = currentNote.content || '';
    document.getElementById('editorFolder').value = currentNote.folder_id || '';
    document.getElementById('pinNoteBtn').classList.toggle('active', currentNote.is_pinned);
    
    // Find backlinks
    const backlinks = notes.filter(n => 
        n.content && n.content.includes(`[[${currentNote.title}]]`)
    );
    
    if (backlinks.length > 0) {
        document.getElementById('backlinksPanel').style.display = 'block';
        document.getElementById('backlinksList').innerHTML = backlinks.map(n => 
            `<div style="margin-top: 0.5rem; cursor: pointer;" onclick="openNote('${n.id}')">${n.title}</div>`
        ).join('');
    } else {
        document.getElementById('backlinksPanel').style.display = 'none';
    }
    
    document.getElementById('editorModal').classList.add('active');
    document.getElementById('editorTitle').focus();
}

function closeEditor() {
    document.getElementById('editorModal').classList.remove('active');
    currentNote = null;
    renderView();
}

function handleEditorChange() {
    if (!currentNote) return;
    
    currentNote.title = document.getElementById('editorTitle').value || 'Untitled';
    currentNote.content = document.getElementById('editorContent').innerHTML;
    currentNote.folder_id = document.getElementById('editorFolder').value || null;
    
    // Extract tags
    const tagRegex = /#(\w+)/g;
    const tags = [...currentNote.content.matchAll(tagRegex)].map(m => m[1]);
    currentNote.tags = [...new Set(tags)];
    
    document.getElementById('saveStatus').innerHTML = '<span class="loading"></span> Saving...';
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveNote, 800);
}

async function saveNote() {
    if (!currentNote) return;
    
    const { error } = await supabase
        .from('notes')
        .update({
            title: currentNote.title,
            content: currentNote.content,
            folder_id: currentNote.folder_id,
            tags: currentNote.tags,
            updated_at: new Date().toISOString()
        })
        .eq('id', currentNote.id);
    
    if (!error) {
        document.getElementById('saveStatus').textContent = 'Saved ✓';
        await loadNotes();
        renderFolders();
        updateCounts();
    }
}

async function togglePin() {
    if (!currentNote) return;
    
    currentNote.is_pinned = !currentNote.is_pinned;
    document.getElementById('pinNoteBtn').classList.toggle('active', currentNote.is_pinned);
    
    await supabase
        .from('notes')
        .update({ is_pinned: currentNote.is_pinned })
        .eq('id', currentNote.id);
    
    await loadNotes();
    updateCounts();
}

async function deleteCurrentNote() {
    if (!currentNote || !confirm('Delete this note?')) return;
    
    await supabase
        .from('notes')
        .delete()
        .eq('id', currentNote.id);
    
    notes = notes.filter(n => n.id !== currentNote.id);
    closeEditor();
    renderView();
    updateCounts();
}

function exportNote() {
    if (!currentNote) return;
    
    const content = `# ${currentNote.title}\n\n${document.getElementById('editorContent').innerText}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentNote.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    
    if (!query) {
        renderView();
        return;
    }
    
    const filtered = notes.filter(note => 
        (note.title || '').toLowerCase().includes(query) ||
        getPreview(note.content).toLowerCase().includes(query) ||
        (note.tags || []).some(tag => tag.toLowerCase().includes(query))
    );
    
    const mainView = document.getElementById('mainView');
    
    if (filtered.length === 0) {
        mainView.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No results found</h3>
                <p>Try a different search term</p>
            </div>
        `;
        return;
    }
    
    mainView.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;">Search Results (${filtered.length})</h2>
        <div class="notes-grid">
            ${filtered.map(note => {
                const folder = folders.find(f => f.id === note.folder_id);
                const tags = note.tags || [];
                return `
                    <div class="note-card ${note.is_pinned ? 'pinned' : ''}" onclick="openNote('${note.id}')">
                        <h3 class="note-title">${note.title || 'Untitled'}</h3>
                        <div class="note-preview">${getPreview(note.content)}</div>
                        ${tags.length > 0 ? `
                            <div class="note-tags">
                                ${tags.map(tag => `<span class="note-tag">${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                        <div class="note-meta">
                            <span class="note-date">${formatDate(note.updated_at)}</span>
                            ${folder ? `<span class="note-folder-tag" style="background: ${folder.color}22; color: ${folder.color}">${folder.name}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        document.getElementById('darkModeBtn').classList.remove('active');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('darkModeBtn').classList.add('active');
    }
    
    await supabase
        .from('user_settings')
        .update({ dark_mode: !isDark })
        .eq('user_id', currentUser.id);
}

function showTemplateModal() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.8rem;">
            ${Object.keys(templates).map(name => `
                <button class="btn-secondary" style="text-align: left; width: 100%;" onclick="useTemplate('${name}')">
                    ${name}
                </button>
            `).join('')}
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Choose a Template';
    document.getElementById('modalConfirm').style.display = 'none';
    document.getElementById('modal').classList.add('active');
}

window.useTemplate = function(templateName) {
    closeModal();
    createNewNote(templates[templateName]);
};

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    document.getElementById('modalConfirm').style.display = 'block';
}

// Formatting functions
window.format = function(command) {
    document.execCommand(command, false, null);
    document.getElementById('editorContent').focus();
    handleEditorChange();
};

window.insertHeading = function(level) {
    const selection = window.getSelection();
    const text = selection.toString() || 'Heading';
    document.execCommand('insertHTML', false, `<h${level}>${text}</h${level}>`);
    handleEditorChange();
};

window.insertQuote = function() {
    const selection = window.getSelection();
    const text = selection.toString() || 'Quote text';
    document.execCommand('insertHTML', false, `<blockquote>${text}</blockquote>`);
    handleEditorChange();
};

window.insertCode = function() {
    const selection = window.getSelection();
    const text = selection.toString() || 'code';
    if (text.includes('\n')) {
        document.execCommand('insertHTML', false, `<pre>${text}</pre>`);
    } else {
        document.execCommand('insertHTML', false, `<code>${text}</code>`);
    }
    handleEditorChange();
};

window.insertTable = function() {
    const html = `
        <table>
            <tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr>
            <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
            <tr><td>Cell 4</td><td>Cell 5</td><td>Cell 6</td></tr>
        </table>
    `;
    document.execCommand('insertHTML', false, html);
    handleEditorChange();
};

window.insertLink = function() {
    const noteTitles = notes.map(n => n.title).filter(t => t !== 'Untitled');
    
    if (noteTitles.length === 0) {
        alert('Create more notes first!');
        return;
    }
    
    const title = prompt('Link to note:\n' + noteTitles.join('\n'));
    if (title) {
        document.execCommand('insertHTML', false, `<span class="note-link">[[${title}]]</span>`);
        handleEditorChange();
    }
};

window.insertTag = function() {
    const tag = prompt('Tag name:');
    if (tag) {
        document.execCommand('insertHTML', false, `<span style="color: var(--terracotta);">#${tag}</span> `);
        handleEditorChange();
    }
};

function createConfetti() {
    const colors = ['#D97757', '#6B8E7F', '#C85846', '#A4C3B2', '#feca57', '#ff6b6b'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
    }
}

// ========== NEW FEATURES ==========

// 1. Edit/Delete Tasks (Planner Upgrade)
window.editTask = async function(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Title</label>
            <input type="text" id="taskTitle" value="${task.title}">
        </div>
        <div class="form-group">
            <label>Subject</label>
            <input type="text" id="taskSubject" value="${task.subject || ''}">
        </div>
        <div class="form-group">
            <label>Due Date</label>
            <input type="date" id="taskDate" value="${task.due_date}">
        </div>
        <div class="form-group">
            <label>Due Time</label>
            <input type="time" id="taskTime" value="${task.due_time || ''}">
        </div>
        <div class="form-group">
            <label>Description</label>
            <input type="text" id="taskDesc" value="${task.description || ''}">
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Edit Task';
    document.getElementById('modalConfirm').onclick = async () => {
        const { error } = await supabase
            .from('planner_tasks')
            .update({
                title: document.getElementById('taskTitle').value,
                subject: document.getElementById('taskSubject').value,
                due_date: document.getElementById('taskDate').value,
                due_time: document.getElementById('taskTime').value || null,
                description: document.getElementById('taskDesc').value
            })
            .eq('id', taskId);
        
        if (!error) {
            await loadUserData();
            closeModal();
            renderView();
        }
    };
    
    document.getElementById('modal').classList.add('active');
};

window.deleteTask = async function(taskId) {
    if (!confirm('Delete this task?')) return;
    
    await supabase
        .from('planner_tasks')
        .delete()
        .eq('id', taskId);
    
    tasks = tasks.filter(t => t.id !== taskId);
    renderView();
};

// 2. AI Study Assistant
async function callAI(prompt, systemPrompt = '') {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-exp:free',
                messages: [
                    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                    { role: 'user', content: prompt }
                ]
            })
        });
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('AI Error:', error);
        alert('AI request failed. Please try again.');
        return null;
    }
}

window.aiSummarize = async function() {
    if (!currentNote || !currentNote.content) {
        alert('No content to summarize!');
        return;
    }
    
    const text = document.getElementById('editorContent').innerText;
    const affirmation = getRandomAffirmation();
    
    document.getElementById('saveStatus').innerHTML = '<span class="loading"></span> AI thinking...';
    
    const summary = await callAI(
        `Summarize this note in 3-5 bullet points:\n\n${text}`,
        'You are a helpful study assistant. Be concise and clear.'
    );
    
    if (summary) {
        document.getElementById('editorContent').innerHTML += `<h2>AI Summary</h2><p>${summary}</p><p><em>${affirmation}</em></p>`;
        document.getElementById('saveStatus').textContent = 'Summary added! ✓';
        handleEditorChange();
        createConfetti();
    }
};

window.aiGenerateQuiz = async function() {
    if (!currentNote || !currentNote.content) {
        alert('No content to generate quiz from!');
        return;
    }
    
    const text = document.getElementById('editorContent').innerText;
    
    if (text.length < 100) {
        alert('Note is too short to generate a quiz. Add more content!');
        return;
    }
    
    document.getElementById('saveStatus').innerHTML = '<span class="loading"></span> Generating quiz...';
    
    const quizData = await callAI(
        `Generate 5 multiple choice questions based on this content. Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": "Option A"
    }
  ]
}

Content:
${text}`,
        'You are a quiz generator. Return ONLY valid JSON, no other text.'
    );
    
    if (!quizData) return;
    
    try {
        const parsed = JSON.parse(quizData.replace(/```json|```/g, ''));
        
        // Create quiz
        const { data: quiz } = await supabase
            .from('quizzes')
            .insert([{
                user_id: currentUser.id,
                title: `Quiz: ${currentNote.title}`,
                description: 'Auto-generated by AI'
            }])
            .select()
            .single();
        
        // Add questions
        for (let i = 0; i < parsed.questions.length; i++) {
            const q = parsed.questions[i];
            await supabase
                .from('quiz_questions')
                .insert([{
                    quiz_id: quiz.id,
                    question_type: 'multiple',
                    question: q.question,
                    correct_answer: q.correct,
                    options: q.options,
                    position: i
                }]);
        }
        
        quizzes.unshift(quiz);
        document.getElementById('saveStatus').textContent = 'Quiz created! ✓';
        createConfetti();
        alert(`✨ Created quiz with ${parsed.questions.length} questions!`);
    } catch (e) {
        alert('Failed to parse AI response. Try again!');
        console.error(e);
    }
};

window.aiFormat = async function() {
    if (!currentNote || !currentNote.content) {
        alert('No content to format!');
        return;
    }
    
    const text = document.getElementById('editorContent').innerText;
    
    document.getElementById('saveStatus').innerHTML = '<span class="loading"></span> AI formatting...';
    
    const formatted = await callAI(
        `Format this into a professional document with proper headings, structure, and fix any grammar/spelling errors. Return as clean HTML using only: h1, h2, h3, p, ul, li, strong, em. No code blocks or markdown.

Content:
${text}`,
        'You are a professional document formatter. Return clean HTML only.'
    );
    
    if (formatted) {
        const clean = formatted.replace(/```html|```/g, '').trim();
        document.getElementById('editorContent').innerHTML = clean;
        document.getElementById('saveStatus').textContent = 'Formatted! ✓';
        handleEditorChange();
        createConfetti();
        
        // Also export as docx
        exportAsDocx();
    }
};

function exportAsDocx() {
    const title = currentNote.title || 'Untitled';
    const content = document.getElementById('editorContent').innerHTML;
    
    // Create simple Word-compatible HTML
    const docHTML = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${title}</title></head>
        <body>${content}</body>
        </html>
    `;
    
    const blob = new Blob(['\ufeff', docHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.doc`;
    a.click();
    URL.revokeObjectURL(url);
}

// 4. Smart AI Search
function renderAISearch(container) {
    container.innerHTML = `
        <div style="max-width: 700px; margin: 0 auto;">
            <h2 style="margin-bottom: 1.5rem;">🔮 Smart AI Search</h2>
            <p style="opacity: 0.7; margin-bottom: 2rem;">Search your notes by meaning, not just keywords. Ask questions like "What did I learn about photosynthesis?" or "Show me my chemistry notes"</p>
            
            <div class="form-group">
                <input type="text" id="aiSearchInput" placeholder="Ask anything about your notes..." style="width: 100%; padding: 1.2rem; font-size: 1.1rem; border: 3px solid var(--stroke); border-radius: 16px;">
            </div>
            
            <button class="btn-primary" onclick="performAISearch()" style="margin-top: 1rem;">Search with AI</button>
            
            <div id="aiSearchResults" style="margin-top: 3rem;"></div>
        </div>
    `;
    
    document.getElementById('aiSearchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performAISearch();
    });
}

window.performAISearch = async function() {
    const query = document.getElementById('aiSearchInput').value;
    if (!query) return;
    
    const resultsDiv = document.getElementById('aiSearchResults');
    resultsDiv.innerHTML = '<div class="loading" style="margin: 2rem auto;"></div>';
    
    // Get all notes content
    const notesContext = notes.map(n => `Title: ${n.title}\nContent: ${getPreview(n.content)}`).join('\n\n---\n\n');
    
    const response = await callAI(
        `Based on these notes, answer this question: "${query}"

Notes:
${notesContext}

Provide a helpful answer and list which note titles are most relevant.`,
        'You are a helpful study assistant analyzing notes.'
    );
    
    if (response) {
        resultsDiv.innerHTML = `
            <div style="background: white; border: 3px solid var(--stroke); border-radius: 16px; padding: 2rem;">
                <h3 style="margin-bottom: 1rem;">AI Answer:</h3>
                <div style="line-height: 1.8; white-space: pre-wrap;">${response}</div>
            </div>
        `;
    }
};

// 5. Share Notes
async function shareNote() {
    if (!currentNote) return;
    
    if (currentNote.is_shared && currentNote.share_token) {
        const url = `${window.location.origin}/share/${currentNote.share_token}`;
        
        navigator.clipboard.writeText(url);
        alert(`📋 Share link copied!\n\n${url}\n\nAnyone with this link can view this note (read-only).`);
        return;
    }
    
    // Generate share token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const { error } = await supabase
        .from('notes')
        .update({
            is_shared: true,
            share_token: token
        })
        .eq('id', currentNote.id);
    
    if (!error) {
        currentNote.is_shared = true;
        currentNote.share_token = token;
        
        const url = `${window.location.origin}/share/${token}`;
        navigator.clipboard.writeText(url);
        alert(`✅ Note is now shared!\n\n📋 Link copied to clipboard:\n${url}\n\nAnyone with this link can view this note (read-only).`);
        createConfetti();
    }
}

// 6. Grade Calculator
function renderGrades(container) {
    const classes = [...new Set(grades.map(g => g.class_name))];
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h2>📈 Grade Calculator</h2>
            <button class="btn-primary" onclick="addGrade()">+ Add Grade</button>
        </div>
        
        ${classes.length === 0 ? `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3>No grades yet</h3>
                <p>Add your assignments to track your GPA</p>
            </div>
        ` : classes.map(className => {
            const classGrades = grades.filter(g => g.class_name === className);
            const total = classGrades.reduce((sum, g) => sum + (g.grade || 0) * g.weight, 0);
            const totalWeight = classGrades.reduce((sum, g) => sum + g.weight, 0);
            const avg = totalWeight > 0 ? (total / totalWeight).toFixed(2) : 0;
            
            return `
                <div style="background: white; border: 3px solid var(--stroke); border-radius: 16px; padding: 2rem; margin-bottom: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h3>${className}</h3>
                        <div style="font-size: 2rem; font-weight: 900; color: ${avg >= 90 ? '#A4C3B2' : avg >= 80 ? '#6B8E7F' : avg >= 70 ? '#D97757' : '#C85846'}">${avg}%</div>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: var(--sand); font-weight: 700;">
                            <th style="padding: 0.8rem; text-align: left; border: 2px solid var(--stroke);">Assignment</th>
                            <th style="padding: 0.8rem; text-align: center; border: 2px solid var(--stroke);">Grade</th>
                            <th style="padding: 0.8rem; text-align: center; border: 2px solid var(--stroke);">Weight</th>
                            <th style="padding: 0.8rem; text-align: center; border: 2px solid var(--stroke);">Actions</th>
                        </tr>
                        ${classGrades.map(g => `
                            <tr>
                                <td style="padding: 0.8rem; border: 2px solid var(--stroke);">${g.assignment_name}</td>
                                <td style="padding: 0.8rem; text-align: center; border: 2px solid var(--stroke);">${g.grade ? `${g.grade}/${g.total}` : 'Not graded'}</td>
                                <td style="padding: 0.8rem; text-align: center; border: 2px solid var(--stroke);">${g.weight}x</td>
                                <td style="padding: 0.8rem; text-align: center; border: 2px solid var(--stroke);">
                                    <button class="btn-secondary" onclick="editGrade('${g.id}')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Edit</button>
                                    <button class="btn-secondary" onclick="deleteGrade('${g.id}')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Delete</button>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                    
                    <div style="margin-top: 1.5rem; padding: 1rem; background: var(--sand); border-radius: 12px;">
                        <strong>What you need on the final:</strong>
                        <p style="margin-top: 0.5rem; opacity: 0.8;">Enter your final exam weight and desired grade to calculate what score you need!</p>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

window.addGrade = function() {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Class Name</label>
            <input type="text" id="gradeClass" placeholder="Math 101">
        </div>
        <div class="form-group">
            <label>Assignment Name</label>
            <input type="text" id="gradeAssignment" placeholder="Quiz 1">
        </div>
        <div class="form-group">
            <label>Your Score</label>
            <input type="number" id="gradeScore" placeholder="85">
        </div>
        <div class="form-group">
            <label>Total Points</label>
            <input type="number" id="gradeTotal" placeholder="100">
        </div>
        <div class="form-group">
            <label>Weight (1x = normal, 2x = double weighted)</label>
            <input type="number" step="0.1" id="gradeWeight" value="1">
        </div>
        <div class="form-group">
            <label>Category</label>
            <input type="text" id="gradeCategory" placeholder="Quiz">
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Add Grade';
    document.getElementById('modalConfirm').onclick = async () => {
        const { data, error } = await supabase
            .from('grades')
            .insert([{
                user_id: currentUser.id,
                class_name: document.getElementById('gradeClass').value,
                assignment_name: document.getElementById('gradeAssignment').value,
                grade: parseFloat(document.getElementById('gradeScore').value),
                total: parseFloat(document.getElementById('gradeTotal').value),
                weight: parseFloat(document.getElementById('gradeWeight').value),
                category: document.getElementById('gradeCategory').value
            }])
            .select()
            .single();
        
        if (!error) {
            grades.push(data);
            closeModal();
            renderView();
        }
    };
    
    document.getElementById('modal').classList.add('active');
};

window.editGrade = async function(gradeId) {
    const grade = grades.find(g => g.id === gradeId);
    if (!grade) return;
    
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Your Score</label>
            <input type="number" id="gradeScore" value="${grade.grade || ''}">
        </div>
        <div class="form-group">
            <label>Total Points</label>
            <input type="number" id="gradeTotal" value="${grade.total}">
        </div>
    `;
    
    document.getElementById('modalTitle').textContent = 'Edit Grade';
    document.getElementById('modalConfirm').onclick = async () => {
        const { error } = await supabase
            .from('grades')
            .update({
                grade: parseFloat(document.getElementById('gradeScore').value) || null,
                total: parseFloat(document.getElementById('gradeTotal').value)
            })
            .eq('id', gradeId);
        
        if (!error) {
            await loadUserData();
            closeModal();
            renderView();
        }
    };
    
    document.getElementById('modal').classList.add('active');
};

window.deleteGrade = async function(gradeId) {
    if (!confirm('Delete this grade?')) return;
    
    await supabase
        .from('grades')
        .delete()
        .eq('id', gradeId);
    
    grades = grades.filter(g => g.id !== gradeId);
    renderView();
};

// Start the app
init();
