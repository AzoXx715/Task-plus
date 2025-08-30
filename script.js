class TaskManager {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.currentView = localStorage.getItem('currentView') || 'columns';
        this.sortBy = 'category'; // category, date, name
        this.sortOrder = 'asc';
        this.editingTaskId = null;
        this.priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
        this.migrateTasks();
        this.contextTaskId = null;
        this.pendingDeleteId = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupModal();
        this.setupContextMenu();
        this.setupConfirmModal();
        this.renderTasks();
        this.setView(this.currentView);
    }

    setupEventListeners() {
        // Bouton d'ajout de tâche
        document.getElementById('add-task-btn').addEventListener('click', () => this.openModal());
        document.getElementById('view-toggle').addEventListener('click', () => this.toggleView());

        // Contrôles du tableau
        document.getElementById('sort-date-btn').addEventListener('click', () => this.sortTasks('date'));
        document.getElementById('sort-name-btn').addEventListener('click', () => this.sortTasks('name'));
    }

    setupModal() {
        const modal = document.getElementById('task-modal');
        const closeBtn = document.getElementById('modal-close');
        const cancelBtn = document.getElementById('modal-cancel');
        const form = document.getElementById('task-form');

        closeBtn.addEventListener('click', () => this.closeModal());
        cancelBtn.addEventListener('click', () => this.closeModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTask();
        });
    }

    setupContextMenu() {
        const menu = document.getElementById('context-menu');
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const card = e.target.closest('.task-card');
            this.contextTaskId = card ? card.dataset.taskId : null;
            document.getElementById('ctx-edit').style.display = this.contextTaskId ? 'block' : 'none';
            const canDelete = this.contextTaskId && (this.tasks.find(t=>t.id===this.contextTaskId)?.category==='complet');
            document.getElementById('ctx-delete').style.display = canDelete ? 'block' : 'none';
            const mW = menu.offsetWidth || 240, mH = menu.offsetHeight || 200;
            const x = Math.min(e.clientX, window.innerWidth - mW - 8);
            const y = Math.min(e.clientY, window.innerHeight - mH - 8);
            menu.style.left = x + 'px'; menu.style.top = y + 'px'; menu.style.display = 'block';
        });
        const hide = () => { menu.style.display = 'none'; };
        window.addEventListener('click', hide); window.addEventListener('resize', hide); window.addEventListener('scroll', hide, true);
        document.getElementById('ctx-new').addEventListener('click', () => this.openModal());
        document.getElementById('ctx-edit').addEventListener('click', () => this.contextTaskId && this.openModal(this.contextTaskId));
        document.getElementById('ctx-delete').addEventListener('click', () => this.contextTaskId && this.deleteTask(this.contextTaskId));
        document.querySelectorAll('#context-menu [data-move]').forEach(btn=>{
            btn.addEventListener('click', ()=> this.contextTaskId && this.moveTask(this.contextTaskId, btn.dataset.move));
        });
    }

    setupConfirmModal() {
        const overlay = document.getElementById('confirm-modal');
        const close = () => overlay.classList.remove('active');
        document.getElementById('confirm-close').addEventListener('click', close);
        document.getElementById('confirm-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
        document.getElementById('confirm-delete').addEventListener('click', () => { this.performDelete(); close(); });
    }

    openModal(taskId = null) {
        this.editingTaskId = taskId;
        const modal = document.getElementById('task-modal');
        const modalTitle = document.getElementById('modal-title');
        const form = document.getElementById('task-form');

        if (taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            modalTitle.textContent = 'Modifier la tâche';
            document.getElementById('modal-task-title').value = task.title;
            document.getElementById('modal-task-desc').value = task.description || '';
            document.getElementById('modal-task-category').value = task.category;
            document.getElementById('modal-task-priority').value = task.priority || 'none';
        } else {
            modalTitle.textContent = 'Nouvelle tâche';
            form.reset();
            document.getElementById('modal-task-category').value = 'a-lancer';
            document.getElementById('modal-task-priority').value = 'none';
        }

        modal.classList.add('active');
        document.getElementById('modal-task-title').focus();
    }

    closeModal() {
        document.getElementById('task-modal').classList.remove('active');
        this.editingTaskId = null;
    }

    saveTask() {
        const title = document.getElementById('modal-task-title').value.trim();
        const description = document.getElementById('modal-task-desc').value.trim();
        const category = document.getElementById('modal-task-category').value;
        const priority = document.getElementById('modal-task-priority').value || 'none';

        if (!title) {
            document.getElementById('modal-task-title').focus();
            return;
        }

        if (this.editingTaskId) {
            // Modification
            const task = this.tasks.find(t => t.id === this.editingTaskId);
            task.title = title;
            task.description = description;
            task.category = category;
            task.priority = priority;
        } else {
            // Création
            const task = {
                id: Date.now().toString(),
                title,
                description,
                category,
                priority,
                createdAt: new Date().toISOString()
            };
            this.tasks.push(task);
        }

        this.saveTasks();
        this.renderTasks();
        this.closeModal();
    }

    setupDragAndDrop() {
        const containers = document.querySelectorAll('.tasks-container');
        
        containers.forEach(container => {
            container.addEventListener('dragover', this.handleDragOver);
            container.addEventListener('drop', (e) => this.handleDrop(e));
            container.addEventListener('dragenter', this.handleDragEnter);
            container.addEventListener('dragleave', this.handleDragLeave);
        });
    }

    handleDragOver(e) {
        e.preventDefault();
    }

    handleDragEnter(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(e) {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        const newCategory = e.currentTarget.id.replace('tasks-', '');
        
        this.moveTask(taskId, newCategory);
        e.currentTarget.classList.remove('drag-over');
    }

    addTask() {
        const titleEl = document.getElementById('task-title');
        const descEl = document.getElementById('task-desc');
        const title = titleEl.value.trim();
        const description = (descEl.value || '').trim();
        
        if (!title) {
            this.showError('Veuillez entrer un titre');
            return;
        }

        const task = {
            id: Date.now().toString(),
            title,
            description,
            category: 'a-lancer',
            createdAt: new Date().toISOString()
        };

        this.tasks.push(task);
        this.saveTasks();
        this.renderTasks();
        titleEl.value = ''; descEl.value = '';
        document.getElementById('add-task-btn').disabled = true;
        document.querySelector('.add-task-form').classList.remove('expanded');
        
        // Animation subtile
        this.animateTask(task.id);
    }

    animateTask(taskId) {
        setTimeout(() => {
            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
            if (taskElement) {
                taskElement.style.animation = 'none';
                taskElement.offsetHeight; // Trigger reflow
                taskElement.style.animation = 'fadeIn 0.5s ease';
            }
        }, 100);
    }

    showError(message) {
        const input = document.getElementById('task-title');
        input.style.borderColor = '#ff4444';
        input.placeholder = message;
        setTimeout(() => {
            input.style.borderColor = '';
            input.placeholder = 'Titre de la tâche...';
        }, 2000);
    }

    moveTask(taskId, newCategory) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.category = newCategory;
            this.saveTasks();
            this.renderTasks();
        }
    }

    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const newTitle = prompt('Modifier le titre:', task.title);
        if (newTitle === null) return;
        const trimmedTitle = newTitle.trim();
        if (!trimmedTitle) return;
        
        const newDesc = prompt('Modifier la description:', task.description || '');
        if (newDesc === null) return;
        
        task.title = trimmedTitle;
        task.description = newDesc.trim();
        this.saveTasks();
        this.renderTasks();
    }

    deleteTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        this.pendingDeleteId = taskId;
        document.getElementById('confirm-message').textContent = `Supprimer "${task.title}" ?`;
        document.getElementById('confirm-modal').classList.add('active');
    }

    performDelete() {
        if (!this.pendingDeleteId) return;
        this.tasks = this.tasks.filter(t => t.id !== this.pendingDeleteId);
        this.saveTasks();
        this.renderTasks();
        this.pendingDeleteId = null;
    }

    changeCategoryFromTable(taskId, newCategory) {
        this.moveTask(taskId, newCategory);
    }

    sortTasks(sortBy) {
        if (this.sortBy === sortBy) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortBy = sortBy;
            this.sortOrder = 'asc';
        }
        this.renderTableView();
    }

    getSortedTasks() {
        const categoryOrder = { 'complet': 0, 'a-finir': 1, 'en-cours': 2, 'a-lancer': 3 };
        const prio = this.priorityOrder;
        return [...this.tasks].sort((a, b) => {
            if (this.sortBy === 'category') {
                const c = categoryOrder[a.category] - categoryOrder[b.category];
                if (c !== 0) return c;
                const p = (prio[a.priority ?? 'none']) - (prio[b.priority ?? 'none']);
                if (p !== 0) return p;
                return new Date(b.createdAt) - new Date(a.createdAt);
            } else if (this.sortBy === 'date') {
                const cmp = new Date(b.createdAt) - new Date(a.createdAt);
                return this.sortOrder === 'asc' ? -cmp : cmp;
            } else if (this.sortBy === 'name') {
                const cmp = a.title.localeCompare(b.title);
                return this.sortOrder === 'asc' ? cmp : -cmp;
            }
            return 0;
        });
    }

    renderTasks() {
        if (this.currentView === 'columns') {
            this.renderColumnsView();
        } else {
            this.renderTableView();
        }
    }

    renderColumnsView() {
        const categories = ['a-lancer', 'en-cours', 'a-finir', 'complet'];
        const prio = this.priorityOrder;
        categories.forEach(category => {
            const container = document.getElementById(`tasks-${category}`);
            const categoryTasks = this.tasks
                .filter(task => task.category === category)
                .sort((a, b) => (prio[a.priority ?? 'none']) - (prio[b.priority ?? 'none']) || (new Date(b.createdAt) - new Date(a.createdAt)));
            container.innerHTML = categoryTasks.map(task => `
                <div class="task-card" draggable="true" data-task-id="${task.id}" data-category="${task.category}">
                    ${task.priority && task.priority !== 'none' ? `<span class="priority-badge ${task.priority}" title="Priorité"><i class="fi fi-sr-bookmark"></i></span>` : ''}
                    <div class="task-title">${this.escapeHtml(task.title)}</div>
                    ${task.description ? `<div class="task-desc">${this.escapeHtml(task.description)}</div>` : ''}
                    <div class="task-actions">
                        <button class="edit-btn" onclick="taskManager.openModal('${task.id}')" title="Modifier">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="delete-btn" onclick="taskManager.deleteTask('${task.id}')" title="Supprimer">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');
            
            // Ajouter les événements de drag
            container.querySelectorAll('.task-card').forEach(card => {
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', card.dataset.taskId);
                    card.classList.add('dragging');
                });
                
                card.addEventListener('dragend', () => card.classList.remove('dragging'));
            });
        });
    }

    renderTableView() {
        const tbody = document.getElementById('table-body');
        const sortedTasks = this.getSortedTasks();
        
        tbody.innerHTML = sortedTasks.map(task => `
            <tr>
                <td class="title-cell">
                    ${task.priority && task.priority !== 'none' ? `<span class="priority-badge ${task.priority}" title="Priorité"><i class="fi fi-sr-bookmark"></i></span>` : ''}
                    ${this.escapeHtml(task.title)}
                </td>
                <td class="desc-cell">${task.description ? this.escapeHtml(task.description) : ''}</td>
                <td class="category-cell">
                    <span class="category-badge ${task.category}">${this.getCategoryLabel(task.category)}</span>
                </td>
                <td class="actions-cell">
                    <div class="table-actions">
                        <select class="category-select" onchange="taskManager.changeCategoryFromTable('${task.id}', this.value)">
                            <option value="a-lancer" ${task.category === 'a-lancer' ? 'selected' : ''}>À lancer</option>
                            <option value="en-cours" ${task.category === 'en-cours' ? 'selected' : ''}>En cours</option>
                            <option value="a-finir" ${task.category === 'a-finir' ? 'selected' : ''}>À finir</option>
                            <option value="complet" ${task.category === 'complet' ? 'selected' : ''}>Complet</option>
                        </select>
                        <button class="icon-btn edit" onclick="taskManager.openModal('${task.id}')" title="Modifier">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="icon-btn delete" onclick="taskManager.deleteTask('${task.id}')" title="Supprimer">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    getCategoryLabel(category) {
        const labels = {
            'a-lancer': 'À lancer',
            'en-cours': 'En cours', 
            'a-finir': 'À finir',
            'complet': 'Complet'
        };
        return labels[category] || category;
    }

    toggleView() {
        this.currentView = this.currentView === 'columns' ? 'table' : 'columns';
        this.setView(this.currentView);
        localStorage.setItem('currentView', this.currentView);
    }

    setView(view) {
        const columnsView = document.getElementById('columns-view');
        const tableView = document.getElementById('table-view');
        const toggleBtn = document.getElementById('view-toggle');

        if (view === 'columns') {
            columnsView.classList.remove('hidden');
            tableView.classList.add('hidden');
            toggleBtn.textContent = 'Mode Tableau';
        } else {
            columnsView.classList.add('hidden');
            tableView.classList.remove('hidden');
            toggleBtn.textContent = 'Mode Colonnes';
        }
        
        this.renderTasks();
    }

    saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    migrateTasks() {
        let changed = false;
        this.tasks = (this.tasks || []).map(t => {
            if (!t.title && t.text) { t.title = t.text; changed = true; }
            if (t.description === undefined) { t.description = ''; changed = true; }
            if (!t.createdAt) { t.createdAt = new Date().toISOString(); changed = true; }
            if (!t.priority) { t.priority = 'none'; changed = true; }
            delete t.text;
            return t;
        });
        if (changed) this.saveTasks();
    }

    toggleAddFormExpansion(forceExpand = false) {
        const form = document.querySelector('.add-task-form');
        const hasTitle = (document.getElementById('task-title').value || '').trim().length > 0;
        if (forceExpand || hasTitle) form.classList.add('expanded'); else form.classList.remove('expanded');
        document.getElementById('add-task-btn').disabled = !hasTitle;
    }
}

// Initialisation
const taskManager = new TaskManager();

// Gestion du redimensionnement
window.addEventListener('resize', () => {
    if (taskManager.currentView === 'columns') {
        taskManager.renderColumnsView();
    }
});