import { getTrendingBooks, searchBooks } from './BookData.mjs';
import { getBooksFromShelf, addBookToShelf } from './shelves.mjs';
import { qs, getLocalStorage, showNotification } from './utils.mjs';
import { renderBookCards } from './BookCard.mjs';
import { PaginationManager } from './pagination.mjs';
import { UIStateManager } from './uiState.mjs';
import { READING_GOAL_KEY, SHELF_TYPES, BOOK_PROGRESS_KEY } from './constants.mjs';

export default class Homepage {
  constructor() {
    this.searchInput = qs('#search-input');
    this.searchBtn = qs('#search-btn');
    this.resultsGrid = qs('#results-grid');
    this.resultCount = qs('#result-count');
    this.currentResults = [];
    this.currentSubject = 'all';
    this.currentSort = 'relevance';

    this.trendingAbortController = null;

    this.searchErrorElement = null;

    this.lastFailedOperation = null;

    this.pagination = new PaginationManager({
      itemsPerPage: 8,
      onPageChange: () => this.displayResults(this.currentResults)
    });

    this.uiState = new UIStateManager({
      loadingSelector: '#loading-state',
      resultsSelector: '#results-grid',
      emptySelector: '#empty-state',
      errorSelector: '#error-state'
    });
  }

  async init() {
    this.setupEventListeners();
    try {
      await Promise.all([
        Promise.resolve(this.refreshWidgets()),
        this.loadTrendingBooks()
      ]);
    } catch (error) {
      console.error('Error during homepage initialization:', error);
    }
  }

  setupEventListeners() {
    this.searchBtn?.addEventListener('click', () => this.handleSearch());
    this.searchInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });

    qs('#retry-btn')?.addEventListener('click', () => {
      this.retryLastOperation();
    });

    const addBookBtn = qs('#add-book-manually-btn');
    if (addBookBtn) {
      addBookBtn.addEventListener('click', () => {
        this.showAddBookModal();
      });
    } else {
      console.warn('Add Book Manually button not found in DOM');
    }

    document.addEventListener('bookAddedToShelf', () => this.refreshWidgets());

    document.querySelectorAll('.genre-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const genre = btn.dataset.genre;
        this.currentSubject = genre;

        document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        this.loadTrendingBooks(genre);
      });
    });

    // Sort filter listener
    qs('#sort-filter')?.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.displayResults(this.currentResults);
    });
  }


  //
  //
  // HELPERS FUNCTIONS
  //
  //

  // Clear Inline Search Error
  clearSearchError() {
    if (this.searchErrorElement) {
      this.searchErrorElement.remove();
      this.searchErrorElement = null;
    }
    this.searchInput?.classList.remove('search-input--error');
  }

  // Show Inline Search Error
  showSearchError(message) {
    this.clearSearchError();

    const errorEl = document.createElement('div');
    errorEl.className = 'search-error-message';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = message;

    this.searchInput?.parentElement?.appendChild(errorEl);
    this.searchInput?.focus();
    this.searchInput?.classList.add('search-input--error');
    this.searchErrorElement = errorEl;

    setTimeout(() => this.clearSearchError(), 5000);
  }

  // Display Book Results
  displayResults(books) {
    // Apply sorting based on current sort selection
    const sortedBooks = this.applySorting(books);

    const booksToShow = this.pagination.getPageItems(sortedBooks);
    renderBookCards(booksToShow);
    this.pagination.render();

    qs('.results-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  // Apply sorting based on current sort option
  applySorting(books) {
    const sorted = [...books];

    switch (this.currentSort) {
      case 'title':
        return sorted.sort((a, b) => {
          const titleA = (a.volumeInfo?.title || '').toLowerCase();
          const titleB = (b.volumeInfo?.title || '').toLowerCase();
          return titleA.localeCompare(titleB);
        });

      case 'author':
        return sorted.sort((a, b) => {
          const authorA = (a.volumeInfo?.author || a.volumeInfo?.authors?.[0] || '').toLowerCase();
          const authorB = (b.volumeInfo?.author || b.volumeInfo?.authors?.[0] || '').toLowerCase();
          return authorA.localeCompare(authorB);
        });

      case 'relevance':
      default:
        return books;
    }
  }

  // Update Shelf Counts
  updateShelfCounts() {
    const shelves = {
      [SHELF_TYPES.WANT_TO_READ]: '#want-count',
      [SHELF_TYPES.CURRENTLY_READING]: '#reading-count',
      [SHELF_TYPES.FINISHED]: '#finished-count'
    };

    Object.entries(shelves).forEach(([shelf, selector]) => {
      const el = qs(selector);
      if (el) el.textContent = getBooksFromShelf(shelf).length;
    });
  }

  // Display Reading Goal In Widget
  displayGoalWidget() {
    const noGoalState = qs('#no-goal-state');
    const withGoalState = qs('#with-goal-state');

    if (!noGoalState || !withGoalState) return;

    const setGoalUIState = (hasGoal) => {
      noGoalState.classList.toggle('hidden', hasGoal);
      withGoalState.classList.toggle('hidden', !hasGoal);
    };

    const savedGoal = getLocalStorage(READING_GOAL_KEY);
    const allFinishedBooks = getBooksFromShelf(SHELF_TYPES.FINISHED);

    const booksThisYear = allFinishedBooks.filter(book => {
      const endDate = book.readingDetails?.endDate;
      if (!endDate) return false;

      const finishYear = new Date(endDate).getFullYear();
      const currentYear = new Date().getFullYear();

      return finishYear === currentYear;
    }).length;

    // If no goal is set
    if (!savedGoal || savedGoal.target === 0) {
      setGoalUIState(false);
      return;
    }

    // Goal is set, show progress
    const progressPercentage = (booksThisYear / savedGoal.target) * 100;

    const completedEl = qs('#widget-goal-completed');
    const targetEl = qs('#widget-goal-target');
    const progressFill = qs('#widget-progress-fill');
    const progressText = qs('#widget-progress-percentage');
    const goalLabel = qs('#widget-goal-label');

    if (completedEl) completedEl.textContent = booksThisYear;
    if (targetEl) targetEl.textContent = savedGoal.target;

    if (progressFill) {
      progressFill.style.width = `${Math.min(progressPercentage, 100)}%`;
    }
    if (progressText) {
      progressText.textContent = `${progressPercentage.toFixed(1)}%`;
    }

    // Update label based on goal achievement
    if (goalLabel) {
      goalLabel.textContent = progressPercentage >= 100 ? 'Goal Achieved!' : 'Books Completed';
    }

    setGoalUIState(true);
  }

  // Display Books in Reading
  displayProgressBooks() {
    const progressContainer = qs('#progress-books-list');
    if (!progressContainer) return;
    try {

      // Get books from currently reading shelf
      const readingBooks = getBooksFromShelf(SHELF_TYPES.CURRENTLY_READING);

      if (!readingBooks || readingBooks.length === 0) {
        progressContainer.innerHTML = '<p class="progress-widget-empty">Ready for a new chapter?</p>';
        return;
      }

      // Get progress data
      const progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};

      const booksWithProgress = readingBooks
        .filter(book => (progressData[book.id]?.currentPage || 0) > 0)
        .map(book => {
          const currentPage = progressData[book.id]?.currentPage || 0;
          const pageCount = book.volumeInfo?.pageCount || 0;
          const progressPercentage = pageCount > 0 ? (currentPage / pageCount) * 100 : 0;
          return {
            id: book.id,
            title: book.volumeInfo?.title || 'Unknown Title',
            currentPage: currentPage,
            pageCount: pageCount,
            pagesLeft: Math.max(0, pageCount - currentPage),
            progressPercentage: progressPercentage
          };
        })
        .sort((a, b) => b.progressPercentage - a.progressPercentage);

      const topThreeBooks = booksWithProgress.slice(0, 3);

      // Create HTML for the list
      const booksHTML = topThreeBooks.map(book => `
        <div class="progress-book-item">
          <div class="progress-book-title">${book.title}</div>
          <div class="progress-book-pages">${book.pagesLeft} page${book.pagesLeft !== 1 ? 's' : ''} left</div>
        </div>
      `).join('');

      progressContainer.innerHTML = booksHTML || '<p class="progress-widget-empty">Ready for a new chapter?</p>';
    } catch (error) {
      console.error('Error displaying progress books:', error);
      progressContainer.innerHTML = '<p class="progress-widget-empty">Error loading progress</p>';
    }
  }

  // Refresh All Widgets
  refreshWidgets() {
    this.updateShelfCounts();
    this.displayGoalWidget();
    this.displayProgressBooks();
  }


  //
  //
  // LOADER
  //
  //

  // Load Books with timeout protection
  async loadBooks(fetchFunction, successMessage, errorMessage, timeoutMs = 10000) {
    this.lastFailedOperation = {
      fetchFunction,
      successMessage,
      errorMessage,
      timeoutMs
    };

    this.uiState.showLoading();

    try {
      const results = (await Promise.race([fetchFunction(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      )
      ]));

      this.currentResults = results;
      this.currentSort = 'relevance';
      const sortFilter = qs('#sort-filter');
      if (sortFilter) sortFilter.value = 'relevance';
      this.pagination.reset();
      this.pagination.setTotalItems(results.length);

      if (results.length > 0) {
        this.uiState.showResults();
        this.displayResults(results);
        this.resultCount.textContent = successMessage(results.length);
        // Clear the last operation on success
        this.lastFailedOperation = null;
      } else {
        this.uiState.showEmpty(errorMessage);
      }
    } catch (error) {
      console.error('Error loading books:', error);
      const displayMessage = error.message === 'Request timeout'
        ? `${errorMessage} (Request took too long)`
        : errorMessage;
      this.uiState.showError(displayMessage);
    }
  }


  //
  //
  // FETCHING FUNCTIONS
  //
  //

  // Retry the last failed operation
  async retryLastOperation() {
    if (!this.lastFailedOperation) {
      console.warn('No previous operation to retry');
      return;
    }

    const { fetchFunction, successMessage, errorMessage, timeoutMs } = this.lastFailedOperation;
    await this.loadBooks(fetchFunction, successMessage, errorMessage, timeoutMs);
  }

  // Pull Trending Books and Load
  async loadTrendingBooks(subject = 'all') {
    // Cancel previous request and create new abort controller
    if (this.trendingAbortController) {
      this.trendingAbortController.abort();
    }

    this.trendingAbortController = new AbortController();
    const signal = this.trendingAbortController.signal;

    // Wrap getTrendingBooks to handle abort signal
    const fetchWithSignal = async () => {
      const result = await getTrendingBooks(subject);
      if (signal.aborted) {
        throw new Error('Request was cancelled');
      }
      return result;
    };

    await this.loadBooks(
      fetchWithSignal,
      (count) => `Trending This Week • ${count} books`,
      'No trending books available at the moment.',
      8000
    );
  }

  // Handle Search Entry with validation
  async handleSearch() {
    const query = this.searchInput?.value.trim();

    // Search input validation
    const validationRules = [
      { test: !query, message: 'Please enter a search term' },
      { test: query.length < 2, message: 'Search term must be at least 2 characters' },
      { test: query.length > 100, message: 'Search term is too long (max 100 characters)' },
    ];

    for (const { test, message } of validationRules) {
      if (test) {
        showNotification(message, 'error');
        return;
      }
    }

    // Clear any previous error
    this.searchInput?.classList.remove('search-input--error');

    await this.loadBooks(
      () => searchBooks(query),
      (count) => `Search Results • ${count} results`,
      `No results found for "${query}"`,
      10000
    );
  }


  //
  //
  // WRITE FUNCTIONS
  //
  //

  showAddBookModal() {
    try {
      // Remove existing modal if present
      const existingModal = document.getElementById('add-book-modal');
      if (existingModal) {
        existingModal.remove();
      }

      const modalHTML = `
      <div id="add-book-modal" class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Add Book Manually</h3>
            <button class="modal-close" aria-label="Close modal">&times;</button>
          </div>
          <div class="modal-body">
            <form id="add-book-form" class="add-book-form">
              <div class="form-group">
                <label for="book-title" class="form-label">Book Title <span class="required">*</span></label>
                <input 
                  type="text" 
                  id="book-title" 
                  name="title" 
                  class="form-input" 
                  placeholder="Enter book title"
                  required
                />
              </div>
              <div class="form-group">
                <label for="book-author" class="form-label">Author <span class="required">*</span></label>
                <input 
                  type="text" 
                  id="book-author" 
                  name="author" 
                  class="form-input" 
                  placeholder="Enter author name"
                  required
                />
              </div>
              <div class="form-group">
                <label for="book-description" class="form-label">Description</label>
                <textarea 
                  id="book-description" 
                  name="description" 
                  class="form-input" 
                  placeholder="Enter book description (optional)"
                  rows="4"
                ></textarea>
              </div>
              <div class="form-group">
                <label for="book-page-count" class="form-label">Page Count <span class="required">*</span></label>
                <input 
                  type="number" 
                  id="book-page-count" 
                  name="pageCount" 
                  class="form-input" 
                  placeholder="Enter total number of pages"
                  min="1"
                  required
                />
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button id="modal-cancel-btn" class="btn-secondary">Cancel</button>
            <button id="modal-save-btn" class="btn btn-success">Add Book</button>
          </div>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', modalHTML);
      const modal = document.getElementById('add-book-modal');

      if (!modal) {
        console.error('Modal element not created');
        return;
      }

      // Add active class to make modal visible
      modal.classList.add('modal-active');

      // Close modal handlers
      const closeBtn = modal.querySelector('.modal-close');
      const cancelBtn = modal.querySelector('#modal-cancel-btn');

      const closeModal = () => {
        modal.classList.remove('modal-active');
        setTimeout(() => modal.remove(), 300);
      };

      closeBtn?.addEventListener('click', closeModal);
      cancelBtn?.addEventListener('click', closeModal);

      // Form submission handler
      const form = modal.querySelector('#add-book-form');
      const saveBtn = modal.querySelector('#modal-save-btn');

      saveBtn?.addEventListener('click', async (e) => {
        e.preventDefault();

        const title = form.querySelector('#book-title').value.trim();
        const author = form.querySelector('#book-author').value.trim();
        const description = form.querySelector('#book-description').value.trim();
        const pageCountStr = form.querySelector('#book-page-count').value.trim();
        const pageCount = parseInt(pageCountStr, 10);
        const shelf = SHELF_TYPES.WANT_TO_READ;

        // Validate required fields
        if (!title || !author || isNaN(pageCount) || pageCount < 1) {
          showNotification('Please fill in all required fields. Page count must be at least 1.', 'error');
          return;
        }

        try {
          // Create a book object with basic info
          const manualBook = {
            id: `manual-${Date.now()}`,
            source: 'Manual',
            volumeInfo: {
              title: title,
              author: author,
              authors: [author],
              description: description || '',
              canDownload: false,
              pageCount: pageCount,
              imageLinks: {
                thumbnail: '/images/placeholder.jpg'
              }
            },
            addedDate: new Date().toISOString()
          };

          const added = addBookToShelf(shelf, manualBook);

          if (added) {
            document.dispatchEvent(new CustomEvent('bookAddedToShelf'));
            closeModal();
            showNotification(`"${title}" has been added to your shelf!`, 'success');

            const shelfPageMap = {
              [SHELF_TYPES.WANT_TO_READ]: 'wanttoread.html',
              [SHELF_TYPES.CURRENTLY_READING]: 'progress.html',
              [SHELF_TYPES.FINISHED]: 'timeline.html'
            };

            const pageUrl = shelfPageMap[shelf];
            if (pageUrl) {
              setTimeout(() => {
                window.location.href = pageUrl;
              }, 500);
            }
          }

        } catch (error) {
          console.error('Error adding book manually:', error);
          showNotification('Error adding book. Please try again.', 'error');
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

    } catch (error) {
      console.error('Error showing Add Book modal:', error);
      showNotification('Error opening modal. Check console for details.', 'error');
    }
  }

}
