import '../css/index.css';
import '../css/timeline.css';
import { loadHeaderFooter, qs, getLocalStorage, setLocalStorage, showNotification, withTimeout } from './utils.mjs';
import { getBooksFromShelf, removeBookFromShelf } from './shelves.mjs';
import { SHELF_TYPES, BOOK_PROGRESS_KEY, WEEKLY_STATS_KEY } from './constants.mjs';
import { PaginationManager } from './pagination.mjs';

class TimelinePage {
  constructor() {
    this.allBooks = [];
    this.filteredBooks = [];
    this.progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};
    this.selectedFilter = 'all';
    this.selectedYear = '';
    this.selectedMonth = '';
    this.cachedGroupedBooks = null;
    this.dateCache = new Map();

    this.pagination = new PaginationManager({
      itemsPerPage: 10,
      containerSelector: '#timeline-pagination',
      pageNumbersSelector: '#timeline-page-numbers',
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
      this.setupFilterOptions();
      this.displayBooks(true)
      this.updateStats();
    } catch (error) {
      console.error('Error initializing timeline page:', error);
      showNotification('Failed to load timeline page. Please refresh.', 'error');
    }
  }

  loadBooks() {
    this.allBooks = getBooksFromShelf(SHELF_TYPES.FINISHED);
    this.allBooks = this.allBooks.filter(book => book.readingDetails?.endDate);

    this.allBooks.sort((a, b) => {
      const dateA = new Date(a.readingDetails?.endDate || 0);
      const dateB = new Date(b.readingDetails?.endDate || 0);
      return dateB - dateA;
    });

    this.filteredBooks = [...this.allBooks];
    this.pagination.setTotalItems(this.filteredBooks.length);
  }


  //
  //
  // FILTERS  
  //
  //

  setupFilterOptions() {
    const filterSelect = qs('#timeline-filter');
    if (!filterSelect) return;

    filterSelect.innerHTML = `
      <option value="all">All Time</option>
      <option value="year-month">By Year and Month</option>
      <option value="year">By Year</option>
      <option value="month">By Month</option>
    `;

    const years = new Set();
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    this.allBooks.forEach(book => {
      const date = new Date(book.readingDetails?.endDate);
      years.add(date.getFullYear());
    });

    this.createSecondaryFilters(Array.from(years).sort((a, b) => b - a), months);

    filterSelect.addEventListener('change', (e) => {
      this.selectedFilter = e.target.value;
      this.handleFilterChange();
    });
  }

  createSecondaryFilters(years, months) {
    const filterSection = qs('.timeline-filter-section');
    if (!filterSection) return;

    const existingSecondary = filterSection.querySelector('.secondary-filters');
    if (existingSecondary) existingSecondary.remove();

    const secondaryContainer = document.createElement('div');
    secondaryContainer.className = 'secondary-filters hidden';
    secondaryContainer.style.cssText = 'display: flex; gap: var(--spacing-sm); align-items: center; margin-left: var(--spacing-md);';

    const yearSelect = document.createElement('select');
    yearSelect.id = 'year-filter';
    yearSelect.className = 'timeline-filter';
    yearSelect.innerHTML = '<option value="">Select Year</option>' +
      years.map(year => `<option value="${year}">${year}</option>`).join('');

    const monthSelect = document.createElement('select');
    monthSelect.id = 'month-filter';
    monthSelect.className = 'timeline-filter';
    monthSelect.innerHTML = '<option value="">Select Month</option>' +
      months.map((month, index) => `<option value="${index}">${month}</option>`).join('');

    const yearLabel = document.createElement('label');
    yearLabel.htmlFor = 'year-filter';
    yearLabel.className = 'filter-label';
    yearLabel.textContent = 'Year:';
    yearLabel.style.marginLeft = '0';

    const monthLabel = document.createElement('label');
    monthLabel.htmlFor = 'month-filter';
    monthLabel.className = 'filter-label';
    monthLabel.textContent = 'Month:';
    monthLabel.style.marginLeft = '0';

    yearSelect.addEventListener('change', (e) => {
      this.selectedYear = e.target.value;
      this.applyFilter();
    });

    monthSelect.addEventListener('change', (e) => {
      this.selectedMonth = e.target.value;
      this.applyFilter();
    });

    secondaryContainer.appendChild(yearLabel);
    secondaryContainer.appendChild(yearSelect);
    secondaryContainer.appendChild(monthLabel);
    secondaryContainer.appendChild(monthSelect);
    filterSection.appendChild(secondaryContainer);
  }

  handleFilterChange() {
    const secondaryFilters = qs('.secondary-filters');
    const yearFilter = qs('#year-filter');
    const monthFilter = qs('#month-filter');
    const yearLabel = secondaryFilters?.querySelector('label[for="year-filter"]');
    const monthLabel = secondaryFilters?.querySelector('label[for="month-filter"]');

    if (!secondaryFilters) return;

    this.selectedYear = '';
    this.selectedMonth = '';
    if (yearFilter) yearFilter.value = '';
    if (monthFilter) monthFilter.value = '';

    switch (this.selectedFilter) {
      case 'all':
        secondaryFilters.classList.add('hidden');
        break;

      case 'year-month':
        secondaryFilters.classList.remove('hidden');
        if (yearFilter) yearFilter.style.display = 'block';
        if (monthFilter) monthFilter.style.display = 'block';
        if (yearLabel) yearLabel.style.display = 'inline-block';
        if (monthLabel) monthLabel.style.display = 'inline-block';
        break;

      case 'year':
        secondaryFilters.classList.remove('hidden');
        if (yearFilter) yearFilter.style.display = 'block';
        if (monthFilter) monthFilter.style.display = 'none';
        if (yearLabel) yearLabel.style.display = 'inline-block';
        if (monthLabel) monthLabel.style.display = 'none';
        break;

      case 'month':
        secondaryFilters.classList.remove('hidden');
        if (yearFilter) yearFilter.style.display = 'none';
        if (monthFilter) monthFilter.style.display = 'block';
        if (yearLabel) yearLabel.style.display = 'none';
        if (monthLabel) monthLabel.style.display = 'inline-block';
        break;
    }

    this.applyFilter();
  }

  applyFilter() {
    try {
      this.cachedGroupedBooks = null;

      if (this.selectedFilter === 'all') {
        this.filteredBooks = [...this.allBooks];
      } else if (this.selectedFilter === 'year-month') {
        if (this.selectedYear && this.selectedMonth) {
          this.filteredBooks = this.allBooks.filter(book => {
            const date = this.getCachedDate(book);
            return date.getFullYear().toString() === this.selectedYear &&
              date.getMonth().toString() === this.selectedMonth;
          });
        } else if (this.selectedYear) {
          this.filteredBooks = this.allBooks.filter(book => {
            const date = this.getCachedDate(book);
            return date.getFullYear().toString() === this.selectedYear;
          });
        } else if (this.selectedMonth) {
          this.filteredBooks = this.allBooks.filter(book => {
            const date = this.getCachedDate(book);
            return date.getMonth().toString() === this.selectedMonth;
          });
        } else {
          this.filteredBooks = [...this.allBooks];
        }
      } else if (this.selectedFilter === 'year') {
        if (this.selectedYear) {
          this.filteredBooks = this.allBooks.filter(book => {
            const date = this.getCachedDate(book);
            return date.getFullYear().toString() === this.selectedYear;
          });
        } else {
          this.filteredBooks = [...this.allBooks];
        }
      } else if (this.selectedFilter === 'month') {
        if (this.selectedMonth) {
          this.filteredBooks = this.allBooks.filter(book => {
            const date = this.getCachedDate(book);
            return date.getMonth().toString() === this.selectedMonth;
          });
        } else {
          this.filteredBooks = [...this.allBooks];
        }
      }

      this.pagination.reset();
      this.pagination.setTotalItems(this.filteredBooks.length);
      this.displayBooks();
      this.updateStats();
    } catch (error) {
      console.error('Error applying filter:', error);
      showNotification('Failed to apply filter: ' + error.message, 'error');
    }
  }


  //
  //
  // DISPLAY   
  //
  //

  displayBooks(scrollToTop = false) {
    try {
      const timelineContent = qs('#timeline-content');
      const emptyState = qs('#timeline-empty-state');
      const paginationEl = qs('#timeline-pagination');

      if (this.filteredBooks.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (timelineContent) { timelineContent.innerHTML = ''; timelineContent.style.display = 'none'; }
        if (paginationEl) paginationEl.classList.add('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');
      if (timelineContent) timelineContent.style.display = 'block';

      const booksToDisplay = this.pagination.getPageItems(this.filteredBooks);
      const groupedBooks = this.groupBooksByPeriod(booksToDisplay);
      this.renderTimeline(groupedBooks, timelineContent);
      this.pagination.render();

      if (scrollToTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        qs('.timeline-stats')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (error) {
      console.error('Error displaying books:', error);
      const emptyState = qs('#timeline-empty-state');
      if (emptyState) {
        emptyState.innerHTML = '<p>Failed to display books. Please try again.</p>';
        emptyState.classList.remove('hidden');
      }
    }
  }

  groupBooksByPeriod(books) {
    const grouped = {};

    books.forEach(book => {
      const date = this.getCachedDate(book);
      const periodKey = `${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`;

      if (!grouped[periodKey]) {
        grouped[periodKey] = [];
      }

      grouped[periodKey].push(book);
    });

    return grouped;
  }

  renderTimeline(groupedBooks, container) {
    if (!container) return;

    let html = '';

    Object.entries(groupedBooks).forEach(([period, books]) => {
      html += `
        <div class="timeline-period">
          <h2 class="timeline-period-header">${period}</h2>
          <div class="timeline-items">
            ${books.map(book => this.createTimelineItemHTML(book)).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.attachBookActionListeners();
  }

  createTimelineItemHTML(book) {
    const volumeInfo = book.volumeInfo || {};
    const title = volumeInfo.title || book.title || 'Unknown Title';
    const author = volumeInfo.author || volumeInfo.authors?.[0] || 'Unknown Author';
    const authorId = book.authorId || 'unknown';
    const pages = volumeInfo.pageCount || '300';
    const thumbnail = volumeInfo.imageLinks?.thumbnail || volumeInfo.thumbnail || null;
    const bookId = book.id;

    const finishDate = new Date(book.readingDetails?.endDate);
    const day = finishDate.getDate();
    const month = finishDate.toLocaleString('en-US', { month: 'short' });

    const progress = this.progressData[bookId] || {};
    const notes = progress.notes || [];
    const readTime = this.calculateReadTime(book);

    return `
      <div class="timeline-item" data-book-id="${bookId}">
        <div class="timeline-date">
          <div class="timeline-day">${day}</div>
          <div class="timeline-month">${month}</div>
        </div>

        <div class="timeline-book-cover">
          ${thumbnail
        ? `<img src="${thumbnail}" alt="${title} cover">`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                 <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
               </svg>`
      }
        </div>

        <div class="timeline-book-info">
          <h3 class="timeline-book-title">
            <a href="book.html?id=${bookId}">${title}</a>
          </h3>
          <p class="timeline-book-author">
            <a href="author.html?id=${authorId}">${author}</a>
          </p>
          <div class="timeline-book-meta">
            <span>${pages} Pages</span>
            <span>Finished in ${readTime} days</span>
            ${notes.length > 0 ? `<span>${notes.length} Note${notes.length > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="timeline-book-actions">
            <button class="timeline-btn" data-action="view-details" data-book-id="${bookId}">
              View Details
            </button>
            <button class="timeline-btn" data-action="edit-dates" data-book-id="${bookId}">
              Edit Dates
            </button>
            ${notes.length > 0 ? `
              <button class="timeline-btn timeline-btn-secondary" data-action="view-notes" data-book-id="${bookId}">
                Notes
              </button>
            ` : ''}
            <button class="timeline-btn timeline-btn-danger" data-action="remove-book" data-book-id="${bookId}">
              Remove
            </button>
          </div>
        </div>
      </div>
    `;
  }


  //
  //
  // STATS    
  //
  //

  updateStats() {
    const totalBooks = this.filteredBooks.length;
    const totalPages = this.filteredBooks.reduce((sum, book) => {
      const pageCount = book.volumeInfo?.pageCount || 0;
      return sum + pageCount;
    }, 0);

    const avgReadTime = this.calculateAverageReadTime();

    qs('#total-books-finished').textContent = totalBooks;
    qs('#total-pages-read').textContent = totalPages.toLocaleString();
    qs('#avg-read-time').textContent = avgReadTime !== '—' ? `${avgReadTime} Days` : '—';
  }

  calculateAverageReadTime() {
    if (this.filteredBooks.length === 0) return '—';

    let totalDays = 0;
    let booksWithData = 0;

    this.filteredBooks.forEach(book => {
      const readTime = this.calculateReadTime(book);
      if (readTime !== '—') {
        totalDays += parseInt(readTime);
        booksWithData++;
      }
    });

    return booksWithData > 0 ? Math.round(totalDays / booksWithData) : '—';
  }

  calculateReadTime(book) {
    const readingDetails = book.readingDetails;
    if (!readingDetails || !readingDetails.startDate || !readingDetails.endDate) {
      return '—';
    }

    const startDate = new Date(readingDetails.startDate);
    const endDate = new Date(readingDetails.endDate);
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    return daysDiff > 0 ? daysDiff : 1;
  }


  //
  //
  // EVENT LISTENERS    
  //
  //

  attachBookActionListeners() {
    try {
      const actionButtons = document.querySelectorAll('[data-action]');

      actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          try {
            const action = e.target.dataset.action;
            const bookId = e.target.dataset.bookId;

            if (action === 'view-details') {
              window.location.href = `book.html?id=${bookId}`;
            } else if (action === 'edit-dates') {
              this.showEditDatesModal(bookId);
            } else if (action === 'view-notes') {
              this.showNotesModal(bookId);
            } else if (action === 'remove-book') {
              this.showConfirmModal(bookId);
            }
          } catch (error) {
            console.error('Error handling book action:', error);
            showNotification('Failed to perform action: ' + error.message, 'error');
          }
        });
      });
    } catch (error) {
      console.error('Error setting up book action listeners:', error);
    }
  }


  //
  //
  // MODALS   
  //
  //

  showConfirmModal(bookId) {
    const book = this.findBook(bookId);
    if (!book) return;
    const title = this.getBookTitle(book);

    const modalHTML = `
      <div class="modal-overlay modal-active" id="confirm-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Remove Book?</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-instruction">
              Are you sure you want to remove "<strong>${title}</strong>" from your reading history?
            </p>
            <div class="modal-actions" style="display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg);">
              <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
              <button class="btn btn-danger" id="modal-confirm-btn">Remove</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = qs('#confirm-modal');
    const confirmBtn = qs('#modal-confirm-btn');

    const closeModal = () => {
      modal?.remove();
    };

    this.setupModalDismiss(modal, closeModal);

    confirmBtn?.addEventListener('click', async () => {
      try {
        closeModal();

        const pageCount = book.volumeInfo?.pageCount || 0;
        const endDate = book.readingDetails?.endDate;
        const finishDateStr = endDate ? new Date(endDate).toDateString() : null;

        await withTimeout(
          Promise.resolve(removeBookFromShelf(SHELF_TYPES.FINISHED, bookId)),
          5000
        );

        const progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};
        if (progressData[bookId]) {
          delete progressData[bookId];
          setLocalStorage(BOOK_PROGRESS_KEY, progressData);
        }

        if (pageCount > 0 && finishDateStr) {
          const weeklyStats = getLocalStorage(WEEKLY_STATS_KEY) || {};
          if (weeklyStats[finishDateStr]) {
            weeklyStats[finishDateStr].pagesRead -= pageCount;

            if (weeklyStats[finishDateStr].pagesRead < 0) {
              weeklyStats[finishDateStr].pagesRead = 0;
            }

            weeklyStats[finishDateStr].books = weeklyStats[finishDateStr].books.filter(id => id !== bookId);

            setLocalStorage(WEEKLY_STATS_KEY, weeklyStats);
          }
        }

        this.allBooks = this.allBooks.filter(b => b.id !== bookId);
        this.filteredBooks = this.filteredBooks.filter(b => b.id !== bookId);
        this.dateCache.delete(bookId);

        this.pagination.setTotalItems(this.filteredBooks.length);

        this.displayBooks();
        this.updateStats();

        showNotification(`Removed "${title}" from reading history.`, 'success');
      } catch (error) {
        console.error('Error removing book:', error);
        showNotification('Failed to remove book: ' + error.message, 'error');
      }
    });
  }

  showEditDatesModal(bookId) {
    const book = this.findBook(bookId);
    if (!book) return;
    const title = this.getBookTitle(book);
    const startDate = book.readingDetails?.startDate || '';
    const endDate = book.readingDetails?.endDate || '';

    // Get today's date in YYYY-MM-DD format for max attribute
    const today = new Date();
    const maxDate = today.toISOString().split('T')[0];

    const modalHTML = `
      <div class="modal-overlay modal-active" id="edit-dates-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Edit Reading Dates</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-instruction">Update the start and end dates for "<strong>${title}</strong>":</p>
            <form id="edit-dates-form" class="details-form">
              <div class="form-group">
                <label for="start-date" class="form-label">Start Date <span class="required">*</span></label>
                <input 
                  type="date" 
                  id="start-date" 
                  name="startDate" 
                  class="form-input" 
                  value="${startDate}"
                  max="${maxDate}"
                  required
                />
              </div>
              <div class="form-group">
                <label for="end-date" class="form-label">End Date <span class="required">*</span></label>
                <input 
                  type="date" 
                  id="end-date" 
                  name="endDate" 
                  class="form-input" 
                  value="${endDate}"
                  max="${maxDate}"
                  required
                />
              </div>
              <div class="modal-actions" style="display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg);">
                <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-primary">Update Dates</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = qs('#edit-dates-modal');
    const form = qs('#edit-dates-form');

    const closeModal = () => {
      modal?.remove();
    };



    this.setupModalDismiss(modal, closeModal);

    form?.addEventListener('submit', async (e) => {
      try {
        e.preventDefault();

        const formData = new FormData(form);
        const newStartDate = formData.get('startDate');
        const newEndDate = formData.get('endDate');

        if (!newStartDate || !newEndDate) {
          showNotification('Please fill in all date fields', 'error');
          return;
        }

        const startDateObj = new Date(newStartDate);
        const endDateObj = new Date(newEndDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (startDateObj > today) {
          showNotification('Start date cannot be in the future', 'error');
          return;
        }

        if (endDateObj > today) {
          showNotification('End date cannot be in the future', 'error');
          return;
        }

        if (endDateObj < startDateObj) {
          showNotification('End date cannot be before start date', 'error');
          return;
        }

        closeModal();

        await withTimeout(
          Promise.resolve().then(() => {
            const updatedBook = {
              ...book,
              readingDetails: {
                ...book.readingDetails,
                startDate: newStartDate,
                endDate: newEndDate
              }
            };

            const bookIndex = this.allBooks.findIndex(b => b.id === bookId);
            if (bookIndex !== -1) {
              this.allBooks[bookIndex] = updatedBook;
            }

            const filteredIndex = this.filteredBooks.findIndex(b => b.id === bookId);
            if (filteredIndex !== -1) {
              this.filteredBooks[filteredIndex] = updatedBook;
            }

            const finishedBooks = getBooksFromShelf(SHELF_TYPES.FINISHED);
            const shelfBookIndex = finishedBooks.findIndex(b => b.id === bookId);
            if (shelfBookIndex !== -1) {
              finishedBooks[shelfBookIndex] = updatedBook;
              setLocalStorage(SHELF_TYPES.FINISHED, finishedBooks);
            }

            this.dateCache.delete(bookId);

            this.displayBooks();
            showNotification(`Updated reading dates for "${title}"`, 'success');
          }),
          5000
        );
      } catch (error) {
        console.error('Error updating reading dates:', error);
        showNotification('Failed to update dates: ' + error.message, 'error');
      }
    });
  }

  showNotesModal(bookId) {
    const progress = this.progressData[bookId];
    if (!progress || !progress.notes || progress.notes.length === 0) {
      showNotification('No notes available for this book.', 'error');
      return;
    }

    const book = this.findBook(bookId);
    const title = this.getBookTitle(book);

    let notesHTML = progress.notes.map((note, index) => {
      const date = new Date(note.date).toLocaleDateString();
      return `
        <div class="note-item" style="padding: var(--spacing-sm); border-bottom: 1px solid var(--secondary-bg); margin-bottom: var(--spacing-sm);">
          <p style="margin: 0 0 var(--spacing-xs) 0; color: var(--text-primary);">${note.text}</p>
          <small style="color: var(--text-secondary);">Page ${note.page} • ${date}</small>
        </div>
      `;
    }).join('');

    const modalHTML = `
      <div class="modal-overlay modal-active" id="notes-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Notes for "${title}"</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 60vh; overflow-y: auto;">
            ${notesHTML}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = qs('#notes-modal');

    const closeModal = () => {
      modal?.remove();
    };

    this.setupModalDismiss(modal, closeModal);
  }


  //
  //
  // HELPERS    
  //
  //

  findBook(bookId) {
    return this.allBooks.find(b => b.id === bookId) || null;
  }

  getBookTitle(book) {
    return book.volumeInfo?.title || book.title || 'Unknown Title';
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

  getCachedDate(book) {
    if (!this.dateCache.has(book.id)) {
      const date = new Date(book.readingDetails?.endDate || 0);
      this.dateCache.set(book.id, date);
    }
    return this.dateCache.get(book.id);
  }

}

// Initialize the page
const timelinePage = new TimelinePage();
timelinePage.init();