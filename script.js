import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(
    'https://rlxlnmcesiagglmajzwh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseGxubWNlc2lhZ2dsbWFqendoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNjU3NTAsImV4cCI6MjA4ODY0MTc1MH0.KVawKGf8JOUymKP5DkjIRNawrkV-VraFDdFVasKhyrE'
);

// Global state
let currentUser = null;
let userSettings = null;
let notes = [];
let folders = [];
let currentNote = null;
let currentView = 'all';
let currentFolder = null;
let saveTimeout = null;
let authMode = 'login';

// Templates
const templates = {
    'Class Notes': '<h1>Class Notes</h1><h2>Date:</h2><h2>Topic:</h2><h2>Key Points:</h2><ul><li></li></ul><h2>Questions:</h2>',
    'Meeting Notes': '<h1>Meeting Notes</h1><h2>Date:</h2><h2>Attendees:</h2><h2>Agenda:</h2><h2>Action Items:</h2><ul><li></li></ul>',
    'To-Do List': '<h1>To-Do List</h1><h2>Today:</h2><ul><li></li></ul><h2>This Week:</h2><ul><li></li></ul>',
    'Study Guide': '<h1>Study Guide</h1><h2>Subject:</h2><h2>Key Concepts:</h2><ul><li></li></ul><h2>Practice Questions:</h2>',
    'Blank': ''
};

// Initialize
async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserData();
        showApp();
    }
    setupEventListeners();
}

function setupEventListeners() {
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            authMode = tab.dataset.tab;
            document.getElementById('schoolGroup').style.display = authMode === 'signup' ? 'block' : 'none';
            document.getElementById('authSubmit').textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
        });
    });

    // Auth form
    document.getElementById('authForm').addEventListener('submit', handleAuth);
    document.getElementById('signoutBtn').addEventListener('click', signOut);
    
    // Sidebar navigation
    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentView = item.dataset.view;
            currentFolder = null;
            renderView();
        });
    });

    // Buttons
    document.getElementById('newNoteBtn').addEventListener('click', () => createNewNote());
    document.getElementById('newFolderBtn').addEventListener('click', createFolder);
    document.getElementById('darkModeBtn').addEventListener('click', toggleDarkMode);
    document.getElementById('templateBtn').addEventListener('click', showTemplateModal);
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    
    // Editor
    document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
    document.getElementById('editorTitle').addEventListener('input', handleEditorChange);
    document.getElementById('editorContent').addEventListener('input', handleEditorChange);
    document.getElementById('editorFolder').addEventListener('change', handleEditorChange);
    document.getElementById('editorDueDate').addEventListener('change', handleEditorChange);
    document.getElementById('pinNoteBtn').addEventListener('click', togglePin);
    document.getElementById('deleteNoteBtn').addEventListener('click', deleteCurrentNote);
    document.getElementById('exportBtn').addEventListener('click', exportNote);
    
    // Modal
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
            
            // Create user settings
            await supabase.from('user_settings').insert([{
                user_id: data.user.id,
                school: school,
                dark_mode: false
            }]);
            
            alert('Check your email to confirm your account!');
        } else {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            await loadUserData();
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
    // Load settings
    let { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();
    
    if (!settings) {
        const { data } = await supabase
            .from('user_settings')
            .insert([{ user_id: currentUser.id, school: 'salesianum', dark_mode: false }])
            .select()
            .single();
        settings = data;
    }
    
    userSettings = settings;
    
    // Apply dark mode
    if (userSettings.dark_mode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('darkModeBtn').classList.add('active');
    }
    
    // Load folders
    const { data: foldersData } = await supabase
        .from('folders')
        .select('*')
        .order('created_at', { ascending: true });
    folders = foldersData || [];
    
    // Load notes
    await loadNotes();
}

async function loadNotes() {
    const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
    
    if (!error) {
        notes = data || [];
    }
}

function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appContainer').classList.add('active');
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').textContent = currentUser.email[0].toUpperCase();
    
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
    
    if (folders.length === 0) {
        container.innerHTML = '<div style="opacity: 0.5; font-size: 0.9rem; padding: 0.5rem 1rem;">No folders yet</div>';
    } else {
        container.innerHTML = folders.map(folder => `
            <div class="sidebar-item" data-folder="${folder.id}" onclick="selectFolder('${folder.id}')">
                <span class="sidebar-item-icon" style="color: ${folder.color}">📁</span>
                <span>${folder.name}</span>
                <span class="sidebar-item-count">${notes.filter(n => n.folder_id === folder.id).length}</span>
            </div>
        `).join('');
    }
    
    editorSelect.innerHTML = '<option value="">No Folder</option>' + 
        folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
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
        .insert([{ user_id: currentUser.id, name, color }])
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
                return `
                    <div class="note-card ${note.is_pinned ? 'pinned' : ''}" onclick="openNote('${note.id}')">
                        <h3 class="note-title">${note.title || 'Untitled'}</h3>
                        <div class="note-preview">${getPreview(note.content)}</div>
                        <div class="note-meta">
                            <span class="note-date">${formatDate(note.updated_at)}</span>
                            ${folder ? `<span class="note-folder-tag" style="background: ${folder.color}22; color: ${folder.color}">${folder.name}</span>` : ''}
                            ${note.due_date ? `<span class="note-due">📅 ${formatDate(note.due_date)}</span>` : ''}
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
    
    let calendarHTML = `
        <div class="calendar-container">
            <div class="calendar-header">
                <h2>${monthNames[month]} ${year}</h2>
            </div>
            <div class="calendar-grid">
    `;
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        calendarHTML += `<div style="font-weight: 700; padding: 1rem; text-align: center;">${day}</div>`;
    });
    
    const startDay = firstDay.getDay();
    for (let i = 0; i < startDay; i++) {
        calendarHTML += '<div></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayNotes = notes.filter(n => n.due_date && n.due_date.startsWith(dateStr));
        
        calendarHTML += `
            <div class="calendar-day">
                <div class="calendar-day-number">${day}</div>
                ${dayNotes.map(n => `<div class="calendar-day-note" onclick="openNote('${n.id}')">${n.title}</div>`).join('')}
            </div>
        `;
    }
    
    calendarHTML += '</div></div>';
    container.innerHTML = calendarHTML;
}

function renderStats(container) {
    const totalNotes = notes.length;
    const pinnedNotes = notes.filter(n => n.is_pinned).length;
    const notesWithDueDates = notes.filter(n => n.due_date).length;
    const foldersCount = folders.length;
    
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const notesThisWeek = notes.filter(n => new Date(n.created_at) > thisWeek).length;
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${totalNotes}</div>
                <div class="stat-label">Total Notes</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${foldersCount}</div>
                <div class="stat-label">Folders</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${pinnedNotes}</div>
                <div class="stat-label">Pinned</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${notesThisWeek}</div>
                <div class="stat-label">This Week</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${notesWithDueDates}</div>
                <div class="stat-label">With Due Dates</div>
            </div>
        </div>
        
        <div style="margin-top: 3rem;">
            <h2 style="margin-bottom: 1.5rem;">Recent Activity</h2>
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
            folder_id: currentFolder 
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
    document.getElementById('editorDueDate').value = currentNote.due_date ? currentNote.due_date.split('T')[0] : '';
    document.getElementById('pinNoteBtn').classList.toggle('active', currentNote.is_pinned);
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
    const dueDate = document.getElementById('editorDueDate').value;
    currentNote.due_date = dueDate ? new Date(dueDate).toISOString() : null;
    
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
            due_date: currentNote.due_date,
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
        getPreview(note.content).toLowerCase().includes(query)
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

// Start the app
init();
