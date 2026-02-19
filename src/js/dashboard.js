import '../css/index.css';
import '../css/dashboard.css';
import { loadHeaderFooter, qs, getLocalStorage, setLocalStorage, showNotification, withTimeout } from './utils.mjs';
import { getBooksFromShelf } from './shelves.mjs';
import { READING_GOAL_KEY, SHELF_TYPES, BOOK_PROGRESS_KEY } from './constants.mjs';


class Dashboard {
    constructor() {
        this.currentYear = new Date().getFullYear();
        this.readingGoal = {
            target: 0,
            completed: 0
        };
        this.cachedShelfData = null;
        this.cachedInsights = {};
        this.goalModal = null;

        const savedGoal = getLocalStorage(READING_GOAL_KEY);
        if (savedGoal && typeof savedGoal.target === 'number' && savedGoal.target > 0) {
            this.readingGoal = savedGoal;
        }
    }

    //
    //
    // INITIALIZATION 
    //
    //

    async init() {
        await loadHeaderFooter();
        this.setupEventListeners();
        await this.loadDashboardData();
    }

    async loadDashboardData() {
        try {
            this.showLoadingState('#top-authors-content');
            this.showLoadingState('#trending-genre-content');
            this.showLoadingState('#recent-activity-content');

            const shelfData = await this.getShelfData();

            this.updateGoalDisplay();
            await this.updateLibraryStats();

            await Promise.all([
                withTimeout(
                    Promise.resolve(this.displayTopAuthors(shelfData)),
                    5000
                ).catch(err => this.handleInsightError('#top-authors-content', err)),
                withTimeout(
                    Promise.resolve(this.displayTopGenres(shelfData)),
                    5000
                ).catch(err => this.handleInsightError('#trending-genre-content', err)),
                withTimeout(
                    Promise.resolve(this.displayRecentActivity(shelfData)),
                    5000
                ).catch(err => this.handleInsightError('#recent-activity-content', err))
            ]);
        } catch (error) {
            console.error('❌ Dashboard loading error:', error);
            this.handleDashboardError(error);
        }
    }

    async getShelfData() {
        if (this.cachedShelfData) return this.cachedShelfData;

        this.cachedShelfData = {
            wantToRead: getBooksFromShelf(SHELF_TYPES.WANT_TO_READ),
            currentlyReading: getBooksFromShelf(SHELF_TYPES.CURRENTLY_READING),
            finished: getBooksFromShelf(SHELF_TYPES.FINISHED),
            all: []
        };
        this.cachedShelfData.all = [
            ...this.cachedShelfData.wantToRead,
            ...this.cachedShelfData.currentlyReading,
            ...this.cachedShelfData.finished
        ];
        return this.cachedShelfData;
    }


    //
    //
    // EVENT LISTENERS 
    //
    //

    setupEventListeners() {
        const editGoalBtn = qs('#edit-goal-btn');
        const saveGoalBtn = qs('#save-goal-btn');
        const cancelGoalBtn = qs('#cancel-goal-btn');

        editGoalBtn?.addEventListener('click', () => this.showGoalModal());
        saveGoalBtn?.addEventListener('click', () => this.saveGoal());
        cancelGoalBtn?.addEventListener('click', () => this.hideGoalEditor());

        const goalInput = qs('#goal-input');
        goalInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveGoal();
        });

        const goalDisplay = qs('#goal-display');
        goalDisplay?.addEventListener('click', (e) => {
            if (e.target?.id === 'add-goal-btn') {
                this.showGoalModal();
            }
        });
    }


    //
    //
    // GOAL MANAGEMENT 
    //
    //

    showGoalModal() {
        if (this.goalModal && document.body.contains(this.goalModal)) {
            this.goalModal.remove();
        }

        this.goalModal = document.createElement('div');
        this.goalModal.className = 'goal-modal-overlay';
        this.goalModal.id = 'goal-modal';
        this.goalModal.innerHTML = `
        <div class="goal-modal">
            <div class="goal-modal-header">
                <h2>Set Your Reading Goal</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="goal-modal-content">
                <label for="modal-goal-input">How many books do you want to read this year?</label>
                <input id="modal-goal-input" type="number" min="1" value="${this.readingGoal.target}" class="goal-input">
            </div>
            <div class="goal-modal-actions">
                <button id="modal-save-btn" class="btn btn-success">Save Goal</button>
                <button id="modal-cancel-btn" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `;

        document.body.appendChild(this.goalModal);

        const closeBtn = qs('.modal-close');
        const cancelBtn = qs('#modal-cancel-btn');
        const saveBtn = qs('#modal-save-btn');
        const modalInput = qs('#modal-goal-input');

        const closeModal = () => {
            this.goalModal?.remove();
            this.goalModal = null;
        };

        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);

        saveBtn?.addEventListener('click', () => {
            const newTarget = parseInt(modalInput.value);
            if (newTarget && newTarget > 0) {
                this.readingGoal.target = newTarget;
                setLocalStorage(READING_GOAL_KEY, this.readingGoal);

                closeModal();

                const goalDisplay = qs('#goal-display');
                if (goalDisplay) {
                    goalDisplay.innerHTML = this.renderGoalDisplayHTML();
                }

                this.updateGoalDisplay();
            } else {
                showNotification('Please enter a valid number greater than 0', 'error');
            }
        });

        this.goalModal.addEventListener('click', (e) => {
            if (e.target === this.goalModal) {
                closeModal();
            }
        });
    }

    saveGoal() {
        const goalInput = qs('#goal-input');
        const newTarget = parseInt(goalInput.value);

        if (newTarget && newTarget > 0) {
            this.readingGoal.target = newTarget;
            setLocalStorage(READING_GOAL_KEY, this.readingGoal);
            this.updateGoalDisplay();
            this.hideGoalEditor();
        } else {
            showNotification('Please enter a valid number greater than 0', 'error');
        }
    }

    hideGoalEditor() {
        const goalDisplay = qs('#goal-display');
        const goalEditor = qs('#goal-editor');

        if (goalDisplay && goalEditor) {
            goalEditor.classList.add('hidden');
            goalDisplay.classList.remove('hidden');
        }
    }

    updateGoalDisplay() {
        if (!this.readingGoal || typeof this.readingGoal.target !== 'number') {
            this.readingGoal = { target: 0, completed: 0 };
        }

        const allFinishedBooks = this.cachedShelfData?.finished || getBooksFromShelf(SHELF_TYPES.FINISHED);

        const booksThisYear = allFinishedBooks.filter(book => {
            const endDate = book.readingDetails?.endDate;
            if (!endDate) return false;

            const finishYear = new Date(endDate).getFullYear();

            return finishYear === this.currentYear;
        });

        this.readingGoal.completed = booksThisYear.length;

        const completedEl = qs('#goal-completed');
        const targetEl = qs('#goal-target');
        const goalYearEl = qs('#goal-year');
        const goalDisplay = qs('#goal-display');
        const goalEditor = qs('#goal-editor');
        const editGoalBtn = qs('#edit-goal-btn');
        const progressFill = qs('#progress-fill');
        const progressText = qs('#progress-percentage');

        if (goalYearEl) {
            goalYearEl.textContent = `${this.currentYear} Reading Goal`;
        }

        if (this.readingGoal.target === 0) {
            if (goalDisplay) {
                goalDisplay.innerHTML = `
            <p class="no-goal-tagline">Chart your course: How many stories will you explore this year? Add a goal now.</p>
            <button id="add-goal-btn" class="btn btn-primary">Add Goal</button>
        `;
            }
            if (editGoalBtn) editGoalBtn.classList.add('hidden');
            if (progressFill) progressFill.parentElement?.classList.add('hidden');
            if (progressText) progressText.parentElement?.classList.add('hidden');
            return;
        }

        if (editGoalBtn) editGoalBtn.classList.remove('hidden');
        if (progressFill) progressFill.parentElement?.classList.remove('hidden');
        if (progressText) progressText.parentElement?.classList.remove('hidden');

        if (completedEl) completedEl.textContent = this.readingGoal.completed;
        if (targetEl) targetEl.textContent = this.readingGoal.target;

        const progressPercentage = (this.readingGoal.completed / this.readingGoal.target) * 100;

        if (progressFill) {
            progressFill.style.width = `${Math.min(progressPercentage, 100)}%`;
        }
        if (progressText) {
            progressText.textContent = `${progressPercentage.toFixed(1)}%`;
        }
    }

    renderGoalDisplayHTML() {
        return `
        <div class="goal-numbers">
            <span id="goal-completed" class="goal-current">0</span>
            <span class="goal-separator">/</span>
            <span id="goal-target" class="goal-target">0</span>
        </div>
        <p class="goal-label">Books Completed</p>
        
        <div class="progress-bar-container">
            <div class="progress-bar">
                <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
            </div>
        </div>
        <p id="progress-percentage" class="progress-percentage">0%</p>
    `;
    }


    //
    //
    // STATS 
    //
    //

    async updateLibraryStats() {

        const shelfData = await this.getShelfData();

        const progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};
        let totalNotes = 0;
        Object.values(progressData).forEach(progress => {
            if (progress.notes && Array.isArray(progress.notes)) {
                totalNotes += progress.notes.length;
            }
        });

        const stats = {
            wantToRead: shelfData.wantToRead.length,
            currentlyReading: shelfData.currentlyReading.length,
            finished: shelfData.finished.length,
            notes: totalNotes
        };

        qs('#want-to-read-count').textContent = stats.wantToRead;
        qs('#currently-reading-count').textContent = stats.currentlyReading;
        qs('#finished-count').textContent = stats.finished;
        qs('#notes-count').textContent = stats.notes;
    }


    //
    //
    // INSIGHTS 
    //
    //

    displayTopAuthors(shelfData) {
        const container = qs('#top-authors-content');
        if (!container) return;

        this.safeDisplayInsight(() => {
            const relevantBooks = this.getRelevantBooks(shelfData);

            const authorCounts = {};
            relevantBooks.forEach(book => {
                const author = book.volumeInfo?.author || 'Unknown Author';
                authorCounts[author] = (authorCounts[author] || 0) + 1;
            });

            const topAuthors = Object.entries(authorCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (topAuthors.length === 0) {
                this.showEmptyState(container, 'Start reading to see your top authors!');
                return;
            }

            container.innerHTML = this.renderInsightList(topAuthors);
        }, '#top-authors-content', 'Error displaying top authors');
    }

    displayTopGenres(shelfData) {
        const container = qs('#trending-genre-content');
        if (!container) return;

        this.safeDisplayInsight(() => {
            const relevantBooks = this.getRelevantBooks(shelfData);

            const genreCounts = {};
            relevantBooks.forEach(book => {
                const categories = book.volumeInfo?.categories || [];
                categories.forEach(category => {
                    genreCounts[category] = (genreCounts[category] || 0) + 1;
                });
            });

            const topGenres = Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (topGenres.length === 0) {
                this.showEmptyState(container, 'Start reading to see your favorite genres!');
                return;
            }

            container.innerHTML = this.renderInsightList(topGenres);
        }, '#trending-genre-content', 'Error displaying top genres');
    }

    displayRecentActivity(shelfData) {
        const container = qs('#recent-activity-content');
        if (!container) return;

        this.safeDisplayInsight(() => {
            const allBooks = shelfData?.all || [];

            const recentBooks = allBooks
                .sort((a, b) => {
                    const dateA = new Date(b.lastUpdated || b.addedDate || 0);
                    const dateB = new Date(a.lastUpdated || a.addedDate || 0);
                    return dateA - dateB;
                })
                .slice(0, 3);

            if (recentBooks.length === 0) {
                this.showEmptyState(container, 'No recent activity yet!');
                return;
            }

            const listHtml = `
          <ul class="insight-list">
            ${recentBooks.map(book => {
                const lastInteraction = book.lastUpdated || book.addedDate;
                const author = book.volumeInfo?.author || book.volumeInfo?.authors?.[0] || 'Unknown Author';
                return `
              <li class="insight-item activity-item">
                <div class="activity-info">
                  <span class="activity-title">${book.volumeInfo?.title || book.title || 'Unknown'}</span>
                  <span class="activity-author">${author}</span>
                </div>
                <span class="activity-date">${this.formatDate(lastInteraction)}</span>
              </li>
            `;
            }).join('')}
          </ul>
        `;

            container.innerHTML = listHtml;
        }, '#recent-activity-content', 'Error displaying recent activity');
    }


    //
    //
    // HELPERS 
    //
    //

    showLoadingState(containerId) {
        const container = qs(containerId);
        if (container) {
            container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
        }
    }

    hideLoadingState(containerId) {
        const container = qs(containerId);
        if (container) {
            const spinner = container.querySelector('.loading-state');
            if (spinner) spinner.remove();
        }
    }

    showEmptyState(container, message) {
        container.innerHTML = `<p class="empty-state">${message}</p>`;
    }

    showErrorState(container, message) {
        container.innerHTML = `<p class="error-state">${message}</p>`;
    }

    renderInsightList(items) {
        return `
    <ul class="insight-list">
      ${items.map(([name, count], index) => `
        <li class="insight-item">
          <span class="insight-rank">${index + 1}.</span>
          <span class="insight-name">${name}</span>
          <span class="insight-count">${count} book${count !== 1 ? 's' : ''}</span>
        </li>
      `).join('')}
    </ul>
  `;
    }

    getRelevantBooks(shelfData) {
        return [
            ...(shelfData?.currentlyReading || []),
            ...(shelfData?.finished || [])
        ];
    }

    safeDisplayInsight(displayFunc, containerId, errorMessage) {
        try {
            displayFunc();
        } catch (error) {
            console.error(errorMessage, error);
            const container = qs(containerId);
            if (container) {
                this.showErrorState(container, `Failed to load ${containerId.replace('#', '').replace('-content', '')}`);
            }
        }
    }


    //
    //
    // HANDLERS 
    //
    //

    handleInsightError(containerId, error) {
        const container = qs(containerId);
        if (container) {
            container.innerHTML = `<p class="error-state">Failed to load. Please refresh to try again.</p>`;
        }
        console.error(`Error loading ${containerId}:`, error.message);
    }

    handleDashboardError(error) {
        showNotification(`Dashboard loading error: ${error.message}`, 'error');
    }


    //
    //
    // UTILITIES 
    //
    //

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

}

// Initialize dashboard
const dashboard = new Dashboard();
dashboard.init();