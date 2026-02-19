import '../css/base.css';
import '../css/header-footer.css';
import '../css/style.css';
import '../css/progress.css';
import '../css/large.css';
import { loadHeaderFooter, qs, getLocalStorage, setLocalStorage, showNotification, withTimeout } from './utils.mjs';
import { getBooksFromShelf, moveBookToFinished, removeBookFromShelf } from './shelves.mjs';
import * as Constants from './constants.mjs';
import { PaginationManager } from './pagination.mjs';

class ProgressPage {
  constructor() {
    this.books = [];
    this.progressData = getLocalStorage(Constants.BOOK_PROGRESS_KEY) || {};
    this.weeklyStats = getLocalStorage(Constants.WEEKLY_STATS_KEY) || {};

    // Initialize pagination
    this.pagination = new PaginationManager({
      itemsPerPage: 5,
      containerSelector: '#pagination',
      pageNumbersSelector: '#page-numbers',
      onPageChange: () => this.displayBooks()
    });
  }

  //
  //
  // INITIALIZATION 
  //
  //

  async init() {
    try {
      await loadHeaderFooter();
      this.loadBooks();
      this.displayBooks(true);
      this.updateStats();
      this.displayReadingTip();
    } catch (error) {
      console.error('Error initializing progress page:', error);
      showNotification('Failed to load progress page. Please refresh.', 'error');
    }
  }

  loadBooks() {
    this.books = getBooksFromShelf(Constants.SHELF_TYPES.CURRENTLY_READING);
    this.pagination.setTotalItems(this.books.length);
  }


  //
  //
  // DISPLAY 
  //
  //

  displayBooks(scrollToTop = false) {
    const listContainer = qs('#reading-books-list');
    const loadingState = qs('#loading-reading-state');
    const emptyState = qs('#empty-reading-state');
    const paginationEl = qs('#pagination');

    if (loadingState) loadingState.classList.add('hidden');

    if (this.books.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (listContainer) { listContainer.innerHTML = ''; listContainer.style.display = 'none'; }
      if (paginationEl) paginationEl.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (listContainer) listContainer.style.display = 'block';

    this.renderBooks(this.pagination.getPageItems(this.books), listContainer);
    this.pagination.render();

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      qs('.currently-reading-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  renderBooks(books, container) {
    if (!container) return;

    container.innerHTML = books.map(book => this.renderBookItem(book)).join('');
    this.setupEventListeners();
  }

  renderBookItem(book) {
    const progress = this.getBookProgress(book.id);
    const { volumeInfo = {} } = book;
    const {
      title = 'Unknown Title',
      author = 'Unknown Author',
      snippet = 'No description available',
      thumbnail = '../images/no-cover.jpg',
      pageCount = 0
    } = volumeInfo;

    const totalPages = progress.totalPages || pageCount || 0;
    const currentPage = progress.currentPage || 0;
    const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

    return `
      <div class="reading-book-item card" data-book-id="${book.id}">
        <div class="reading-book-cover">
          <img src="${thumbnail}" 
               alt="${title}" 
               onerror="this.src='../images/no-cover.jpg'">
        </div>
        <div class="reading-book-info">
          <h3 class="reading-book-title">${title}</h3>
          <p class="reading-book-author">${author}</p>
          <p class="reading-book-description">${snippet}</p>
          
          <div class="reading-book-progress">
            <div class="progress-text">
              <span>Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong></span>
              <span class="progress-percentage">${percentage}%</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
              </div>
            </div>
          </div>
          
          <div class="reading-book-controls">
            <label for="current-page-${book.id}" class="current-page-label">Current Page:</label>
            <input 
              type="number" 
              id="current-page-${book.id}"
              class="current-page-input" 
              value="${currentPage}"
              min="0"
              max="${totalPages}"
              placeholder="0"
              data-book-id="${book.id}"
            />
            <span class="auto-save-indicator">Auto Save!</span>
          </div>
          
          <div class="reading-book-actions">
            <button class="btn btn-secondary add-note-btn" data-book-id="${book.id}">Add Note</button>
            <button class="btn btn-success mark-finished-btn" data-book-id="${book.id}">Mark Finished</button>
            <button class="btn btn-danger remove-btn" data-book-id="${book.id}">Remove</button>
          </div>
        </div>
      </div>
    `;
  }

  updateBookProgressUI(bookId, currentPage, totalPages) {
    const bookItem = document.querySelector(`[data-book-id="${bookId}"]`);
    if (!bookItem) return;

    const percentage = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
    const progressText = bookItem.querySelector('.progress-text strong:first-child');
    const progressFill = bookItem.querySelector('.progress-fill');
    const percentageSpan = bookItem.querySelector('.progress-percentage');

    if (progressText) progressText.textContent = currentPage;
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (percentageSpan) percentageSpan.textContent = `${percentage}%`;
  }


  //
  //
  // PROGRESS DATA 
  //
  //

  getBookProgress(bookId) {
    return this.progressData[bookId] || {
      currentPage: 0,
      totalPages: 0,
      initialStartPage: 0,
      lastUpdated: null,
      notes: []
    };
  }

  saveBookProgress(bookId, progressData) {
    // Get previous progress BEFORE saving new data
    const prevProgress = this.progressData[bookId] || { currentPage: 0 };

    // Now save the new progress
    this.progressData[bookId] = {
      ...progressData,
      lastUpdated: new Date().toISOString()
    };
    setLocalStorage(Constants.BOOK_PROGRESS_KEY, this.progressData);

    // Update the book's lastUpdated timestamp on the shelf (for Recent Activity tracking)
    const currentlyReadingBooks = getBooksFromShelf(Constants.SHELF_TYPES.CURRENTLY_READING);
    const bookIndex = currentlyReadingBooks.findIndex(b => b.id === bookId);
    if (bookIndex !== -1) {
      currentlyReadingBooks[bookIndex].lastUpdated = new Date().toISOString();
      setLocalStorage(Constants.SHELF_TYPES.CURRENTLY_READING, currentlyReadingBooks);
    }

    // Update weekly stats with previous data for accurate calculation
    this.updateWeeklyStats(bookId, progressData, prevProgress);
  }

  updateWeeklyStats(bookId, progressData, prevProgress) {
    const today = new Date().toDateString();

    if (!this.weeklyStats[today]) {
      this.weeklyStats[today] = { pagesRead: 0, books: [] };
    }

    const pagesRead = progressData.currentPage - (prevProgress?.currentPage || 0);

    if (pagesRead !== 0) {
      // Apply the change (positive or negative)
      this.weeklyStats[today].pagesRead += pagesRead;

      // Make sure it doesn't go below 0
      if (this.weeklyStats[today].pagesRead < 0) {
        this.weeklyStats[today].pagesRead = 0;
      }

      // Add book to list if reading (pages > 0)
      if (pagesRead > 0 && !this.weeklyStats[today].books.includes(bookId)) {
        this.weeklyStats[today].books.push(bookId);
      }

      // Remove book from list if corrected to 0 for this book on this day
      if (pagesRead < 0 && this.weeklyStats[today].pagesRead === 0) {
        this.weeklyStats[today].books = this.weeklyStats[today].books.filter(id => id !== bookId);
      }
    }

    setLocalStorage(Constants.WEEKLY_STATS_KEY, this.weeklyStats);
  }

  getPagesThisWeek() {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    let totalPages = 0;
    Object.entries(this.weeklyStats).forEach(([dateStr, stats]) => {
      const date = new Date(dateStr);
      if (date >= oneWeekAgo) {
        totalPages += stats.pagesRead || 0;
      }
    });

    return totalPages;
  }

  getCurrentStreak() {
    const dates = Object.keys(this.weeklyStats).sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < dates.length; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toDateString();

      if (this.weeklyStats[dateStr] && this.weeklyStats[dateStr].pagesRead > 0) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }


  //
  //
  // STATS
  //
  //

  updateStats() {
    const pagesThisWeek = this.getPagesThisWeek();
    const currentStreak = this.getCurrentStreak();

    qs('#books-in-progress').textContent = this.books.length;
    qs('#pages-this-week').textContent = pagesThisWeek;
    qs('#current-streak').textContent = currentStreak;
  }

  updateReadingGoal() {
    const finishedBooks = getBooksFromShelf(Constants.SHELF_TYPES.FINISHED);
    const currentYear = new Date().getFullYear();
    const goalData = getLocalStorage(Constants.READING_GOAL_KEY) || {};

    if (goalData.year === currentYear && goalData.target) {
      goalData.completed = finishedBooks.length;
      setLocalStorage(Constants.READING_GOAL_KEY, goalData);
    }
  }


  //
  //
  // EVENT LISTENERS
  //
  //

  setupEventListeners() {
    try {
      document.querySelectorAll('.current-page-input').forEach(input => {
        let saveTimeout;

        input.addEventListener('input', (e) => {
          try {
            clearTimeout(saveTimeout);
            const bookId = e.target.dataset.bookId;
            let currentPage = parseInt(e.target.value) || 0;
            const maxPages = parseInt(e.target.max) || 0;

            // Validate input (#5)
            if (isNaN(currentPage) || currentPage < 0) {
              currentPage = 0;
            }

            if (currentPage > maxPages && maxPages > 0) {
              e.target.value = maxPages;
              currentPage = maxPages;
            }

            saveTimeout = setTimeout(async () => {
              try {
                const progress = this.getBookProgress(bookId);
                // Wrap with timeout (#3)
                await withTimeout(
                  Promise.resolve(this.saveBookProgress(bookId, {
                    ...progress,
                    currentPage: currentPage,
                    totalPages: maxPages
                  })),
                  5000
                );

                this.updateBookProgressUI(bookId, currentPage, maxPages);
                this.updateStats();
                showNotification('Progress saved!', 'success');
              } catch (error) {
                console.error('Error saving progress:', error);
                showNotification('Failed to save progress: ' + error.message, 'error');
              }
            }, 1000);
          } catch (error) {
            console.error('Error in input handler:', error);
          }
        });
      });

      document.querySelectorAll('.add-note-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          try {
            const bookId = e.target.dataset.bookId;
            this.handleAddNote(bookId);
          } catch (error) {
            console.error('Error adding note:', error);
            showNotification('Failed to add note: ' + error.message, 'error');
          }
        });
      });

      document.querySelectorAll('.mark-finished-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          try {
            const bookId = e.target.dataset.bookId;
            await withTimeout(
              Promise.resolve(this.handleMarkFinished(bookId)),
              5000
            );
          } catch (error) {
            console.error('Error marking book finished:', error);
            showNotification('Failed to mark finished: ' + error.message, 'error');
          }
        });
      });

      document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          try {
            const bookId = e.target.dataset.bookId;
            await withTimeout(
              Promise.resolve(this.handleRemoveBook(bookId)),
              5000
            );
          } catch (error) {
            console.error('Error removing book:', error);
            showNotification('Failed to remove book: ' + error.message, 'error');
          }
        });
      });
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }


  //
  //
  // HANDLERS
  //
  //

  handleAddNote(bookId) {
    const book = this.findBook(bookId);
    if (!book) return;
    const title = this.getBookTitle(book);
    const progress = this.getBookProgress(bookId);
    const currentPage = progress.currentPage || 0;

    // Create modal overlay
    const modalHTML = `
      <div class="modal-overlay modal-active" id="note-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Add Note</h3>
            <button class="modal-close" id="note-modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-instruction">
              Add a note for "<strong>${title}</strong>" (Page ${currentPage})
            </p>
            <textarea 
              id="note-input" 
              class="note-textarea" 
              placeholder="Write your thoughts, observations, or questions..."
              rows="5"
            ></textarea>
            <div class="modal-actions" style="display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg);">
              <button class="btn btn-secondary" id="note-cancel-btn">Cancel</button>
              <button class="btn btn-primary" id="note-save-btn">Save Note</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Get elements
    const modal = qs('#note-modal');
    const saveBtn = qs('#note-save-btn');
    const noteInput = qs('#note-input');

    // Focus on textarea
    noteInput?.focus();

    const closeModal = () => {
      modal?.remove();
    };

    this.setupModalDismiss(modal, closeModal);

    saveBtn?.addEventListener('click', () => {
      const noteText = noteInput?.value.trim();
      if (!noteText) {
        showNotification('Please enter a note', 'error');
        return;
      }

      if (!progress.notes) progress.notes = [];

      progress.notes.push({
        text: noteText,
        date: new Date().toISOString(),
        page: progress.currentPage
      });

      this.saveBookProgress(bookId, progress);
      showNotification('Note added!', 'success');
      closeModal();
    });
  }

  handleMarkFinished(bookId) {
    const book = this.findBook(bookId);
    if (!book) return;
    const title = this.getBookTitle(book);

    // Create modal overlay
    const modalHTML = `
      <div class="modal-overlay modal-active" id="confirm-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Mark as Finished</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-instruction">
              Are you ready to mark "<strong>${title}</strong>" as finished?
            </p>
            <div class="modal-actions" style="display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg);">
              <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
              <button class="btn btn-success" id="modal-confirm-btn">Yes, Mark Finished!</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup modal listeners
    const modal = qs('#confirm-modal');
    const confirmBtn = qs('#modal-confirm-btn');

    const closeModal = () => {
      modal?.remove();
    };

    this.setupModalDismiss(modal, closeModal);

    confirmBtn?.addEventListener('click', async () => {
      closeModal(); // Close modal immediately

      // Small delay to let modal close animation finish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Show loading state
      this.showListLoadingState();

      // Show notification immediately
      showNotification(`"${title}" marked as finished!`, 'success');

      // Wait 1.5 seconds
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Get the current progress and ensure currentPage = totalPages
      const currentProgress = this.progressData[bookId];
      if (currentProgress && currentProgress.totalPages > 0) {
        // If currentPage hasn't been set to totalPages yet, update it
        if (currentProgress.currentPage < currentProgress.totalPages) {
          // Save the old currentPage BEFORE modifying
          const oldCurrentPage = currentProgress.currentPage;

          // Create new progress object with updated currentPage
          const updatedProgress = {
            ...currentProgress,
            currentPage: currentProgress.totalPages
          };

          // Update in memory
          this.progressData[bookId] = {
            ...updatedProgress,
            lastUpdated: new Date().toISOString()
          };
          setLocalStorage(Constants.BOOK_PROGRESS_KEY, this.progressData);

          // Update weekly stats with old and new values
          this.updateWeeklyStats(bookId, updatedProgress, { currentPage: oldCurrentPage });
        }
      }

      const success = moveBookToFinished(
        Constants.SHELF_TYPES.CURRENTLY_READING,
        bookId
      );

      if (success) {
        this.updateReadingGoal();
        this.refreshAfterAction();
      } else {
        showNotification('Failed to mark book as finished', 'error');
        this.displayBooks();
      }
    });


  }

  handleRemoveBook(bookId) {
    const book = this.findBook(bookId);
    if (!book) return;
    const title = this.getBookTitle(book);

    // Create modal overlay
    const modalHTML = `
      <div class="modal-overlay modal-active" id="confirm-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Remove Book?</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-instruction">
              Are you sure you want to remove "<strong>${title}</strong>" from Currently Reading?
            </p>
            <div class="modal-actions" style="display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg);">
              <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
              <button class="btn btn-danger" id="modal-confirm-btn">Remove</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup modal listeners
    const modal = qs('#confirm-modal');
    const confirmBtn = qs('#modal-confirm-btn');

    const closeModal = () => {
      modal?.remove();
    };

    this.setupModalDismiss(modal, closeModal);

    confirmBtn?.addEventListener('click', async () => {
      closeModal(); // Close modal immediately

      // Small delay to let modal close animation finish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Show loading state
      this.showListLoadingState();

      // Show notification immediately
      showNotification(`"${title}" has been removed.`, 'success');

      // Wait 1.5 seconds
      await new Promise(resolve => setTimeout(resolve, 1500));

      const success = removeBookFromShelf(
        Constants.SHELF_TYPES.CURRENTLY_READING,
        bookId
      );


      if (success) {
        this.refreshAfterAction();
      } else {
        showNotification('Failed to remove book. Please try again.', 'error');
        this.displayBooks();
      }
    });


  }


  //
  //
  // HELPERS
  //
  //

  findBook(bookId) {
    return this.books.find(b => b.id === bookId) || null;
  }

  getBookTitle(book) {
    return book.volumeInfo?.title || book.title || 'Unknown Title';
  }

  showListLoadingState() {
    const listContainer = qs('#reading-books-list');
    const loadingState = qs('#loading-reading-state');
    const paginationEl = qs('#pagination');
    if (listContainer) listContainer.style.display = 'none';
    if (loadingState) loadingState.classList.remove('hidden');
    if (paginationEl) paginationEl.classList.add('hidden');
  }

  refreshAfterAction() {
    this.loadBooks();
    const totalPages = this.pagination.getTotalPages();
    if (this.pagination.currentPage > totalPages && this.pagination.currentPage > 1) {
      this.pagination.currentPage = totalPages;
    }
    this.displayBooks();
    this.updateStats();
  }

  setupModalDismiss(modal, closeModal) {
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('[id$="-cancel-btn"]');

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  displayReadingTip() {
    const tips = [
      "Set aside dedicated reading time each day, even if it's just 15 minutes.",
      "Keep a book with you at all times for unexpected reading opportunities.",
      "Join a book club to stay motivated and discover new perspectives.",
      "Take notes while reading to improve comprehension and retention.",
      "Don't be afraid to abandon a book if you're not enjoying it.",
      "Create a cozy reading space to make the experience more enjoyable.",
      "Mix up your genres to keep your reading experience fresh.",
      "Use bookmarks or notes to mark passages you want to revisit.",
      "Set realistic reading goals to maintain a consistent habit.",
      "Discuss books with friends to deepen your understanding."
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    qs('#reading-tip').textContent = randomTip;
  }

}

const progressPage = new ProgressPage();
progressPage.init()