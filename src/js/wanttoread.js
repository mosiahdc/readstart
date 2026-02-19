import { loadHeaderFooter, qs, showNotification, withTimeout } from './utils.mjs';
import { getBooksFromShelf, removeBookFromShelf, moveBookToCurrentlyReading } from './shelves.mjs';
import { SHELF_TYPES } from './constants.mjs';
import { PaginationManager } from './pagination.mjs';

class WantToReadPage {
  constructor() {
    this.allBooks = [];
    this.pagination = new PaginationManager({
      itemsPerPage: 5,
      containerSelector: '#pagination',
      pageNumbersSelector: '#page-numbers',
      onPageChange: () => this.displayBooks()
    });

    this.confirmModal = null;
    this.currentActionBook = null;
    this.currentAction = null;
  }

  //
  //
  // INITIALIZATION 
  //
  //

  async init() {
    await loadHeaderFooter();
    this.loadBooks();
    await this.displayBooks(true);
  }

  loadBooks() {
    this.allBooks = getBooksFromShelf(SHELF_TYPES.WANT_TO_READ);
    this.pagination.setTotalItems(this.allBooks.length);
  }


  //
  //
  // DISPLAY 
  //
  //

  displayBooks(scrollToTop = false) {
    const booksList = qs('#books-list');
    const loadingState = qs('#loading-state');
    const emptyState = qs('#empty-state');
    const totalCountEl = qs('#total-books-count');
    const paginationEl = qs('#pagination');

    if (loadingState) loadingState.classList.add('hidden');
    if (totalCountEl) totalCountEl.textContent = this.allBooks.length;

    if (this.allBooks.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (booksList) { booksList.innerHTML = ''; booksList.style.display = 'none'; }
      if (paginationEl) paginationEl.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (booksList) booksList.style.display = 'flex';

    this.renderBooks(this.pagination.getPageItems(this.allBooks), booksList);
    this.pagination.render();

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      qs('.shelf-header')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  renderBooks(books, container) {
    if (!container) return;

    const booksHTML = books.map(book => this.createBookItemHTML(book)).join('');
    container.innerHTML = booksHTML;

    this.attachBookActionListeners();
  }

  createBookItemHTML(book) {
    const volumeInfo = book.volumeInfo || {};
    const title = volumeInfo.title || book.title || 'Unknown Title';
    const author = volumeInfo.author || volumeInfo.authors?.[0] || 'Unknown Author';
    const authorId = book.authorId || 'unknown';
    const snippet = volumeInfo.snippet || volumeInfo.description || 'No description available.';
    const pages = volumeInfo.pageCount || '0';
    const thumbnail = volumeInfo.imageLinks?.thumbnail || volumeInfo.thumbnail || null;
    const bookId = book.id;
    const isManual = book.source === 'Manual';

    return `
      <div class="book-item" data-book-id="${bookId}">
        <div class="book-item__cover">
          ${thumbnail
        ? `<img src="${thumbnail}" alt="${title} cover">`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                 <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
               </svg>`
      }
        </div>
        <div class="book-item__details">
          <h2 class="book-item__title">
            <a href="book.html?id=${bookId}">${title}</a>
          </h2>
          <p class="book-item__author">
            ${!isManual ? `<a href="author.html?id=${authorId}">${author}</a>` : `<span style="pointer-events: none; cursor: default; opacity: 0.8;">${author}</span>`}
          </p>
          <p class="book-item__description">${this.truncateText(snippet, 200)}</p>
          <p class="book-item__meta">${pages} pages</p>
          <div class="book-item__actions">
            <button class="book-item__btn book-item__btn--primary" data-action="start-reading" data-book-id="${bookId}">
              Start Reading →
            </button>
            <button class="book-item__btn book-item__btn--secondary" data-action="remove" data-book-id="${bookId}">
              Remove
            </button>
          </div>
        </div>
      </div>
    `;
  }


  //
  //
  // MODAL 
  //
  //

  showConfirmModal(bookId, action) {
    const book = this.findBook(bookId);
    if (!book) {
      showNotification('Book not found.', 'error');
      return;
    }

    if (this.confirmModal && document.body.contains(this.confirmModal)) {
      this.confirmModal.remove();
      this.confirmModal = null;
    }

    this.currentActionBook = book;
    this.currentAction = action;

    const title = this.getBookTitle(book);
    const pageCount = book.volumeInfo?.pageCount || 0;

    this.confirmModal = document.createElement('div');
    this.confirmModal.className = 'modal-overlay modal-active';
    this.confirmModal.id = 'confirm-modal';
    this.confirmModal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">${action === 'move' ? 'Let\'s Start Reading!' : 'Remove Book?'}</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-instruction">
              ${action === 'move'
        ? `Ready to start reading "<strong>${title}</strong>"?`
        : `Are you sure you want to remove "<strong>${title}</strong>" from Queue?`
      }
            </p>
            ${action === 'move' ? `
              <div style="margin: var(--spacing-md) 0; padding: var(--spacing-md); background: var(--secondary-bg); border-radius: var(--border-radius);">
                <label for="start-page-input" style="display: block; margin-bottom: var(--spacing-sm); font-weight: 500;">What page are you starting on?</label>
                <input 
                  type="number" 
                  id="start-page-input" 
                  min="0" 
                  max="${pageCount}" 
                  value="0"
                  placeholder="0"
                  style="width: 100%; padding: var(--spacing-sm); border: 1px solid var(--border-color); border-radius: var(--border-radius);"
                />
                <small style="color: var(--text-secondary); display: block; margin-top: var(--spacing-xs);">
                  ${pageCount > 0 ? `Total pages: ${pageCount}` : 'Page count not available'}
                </small>
              </div>
            ` : ''}
            <div class="modal-actions" style="display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg);">
              <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
              <button class="btn ${action === 'move' ? 'btn-success' : 'btn-danger'}" id="modal-confirm-btn">
                ${action === 'move' ? 'Yes, I am!' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
    `;

    document.body.appendChild(this.confirmModal);

    const modal = this.confirmModal;
    const confirmBtn = qs('#modal-confirm-btn');

    const closeModal = () => {
      this.confirmModal?.remove();
      this.confirmModal = null;
      this.currentActionBook = null;
      this.currentAction = null;
    };

    this.setupModalDismiss(modal, closeModal);

    confirmBtn?.addEventListener('click', async () => {
      try {
        const bookId = this.currentActionBook.id;
        const action = this.currentAction;

        let startPage = 0;
        if (action === 'move') {
          const startPageInput = qs('#start-page-input');
          startPage = parseInt(startPageInput?.value || 0);
          if (isNaN(startPage) || startPage < 0) {
            startPage = 0;
          }
        }

        closeModal();

        if (action === 'move') {
          await this.moveToCurrentlyReading(bookId, startPage);
        } else if (action === 'remove') {
          await this.removeBook(bookId);
        }
      } catch (error) {
        console.error('Modal action error:', error);
        showNotification('Operation failed. Please try again.', 'error');
        closeModal();
      }
    });
  }


  //
  //
  // BOOK ACTIONS 
  //
  //

  async moveToCurrentlyReading(bookId, startPage = 0) {
    const book = this.findBook(bookId);
    if (!book) {
      showNotification('Book not found.', 'error');
      return;
    }

    try {
      const title = this.getBookTitle(book);

      if (isNaN(startPage) || startPage < 0) {
        startPage = 0;
      }

      showNotification(`"${title}" has been moved to Reading!`, 'success');

      const readingDetails = startPage > 0 ? { currentPage: startPage } : {};
      const success = await withTimeout(
        Promise.resolve(
          moveBookToCurrentlyReading(
            SHELF_TYPES.WANT_TO_READ,
            bookId,
            readingDetails
          )
        ),
        5000
      );

      if (success) {
        this.refreshAfterAction();
      } else {
        showNotification('Failed to move book. Please try again.', 'error');
        this.displayBooks();
      }
    } catch (error) {
      console.error('Error moving book:', error);
      showNotification('Operation failed: ' + error.message, 'error');
      this.displayBooks();
    }
  }

  async removeBook(bookId) {
    const book = this.findBook(bookId);
    if (!book) {
      showNotification('Book not found.', 'error');
      return;
    }

    try {
      const title = this.getBookTitle(book);

      showNotification(`"${title}" has been removed.`, 'success');

      const success = await withTimeout(
        Promise.resolve(removeBookFromShelf(SHELF_TYPES.WANT_TO_READ, bookId)),
        5000
      );

      if (success) {
        this.refreshAfterAction();
      } else {
        showNotification('Failed to remove book. Please try again.', 'error');
        this.displayBooks();
      }
    } catch (error) {
      console.error('Error removing book:', error);
      showNotification('Operation failed: ' + error.message, 'error');
      this.displayBooks();
    }
  }


  //
  //
  // EVENT LISTENERS
  //
  //

  attachBookActionListeners() {
    const actionButtons = document.querySelectorAll('[data-action]');

    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const bookId = e.target.dataset.bookId;

        if (action === 'start-reading') {
          this.showConfirmModal(bookId, 'move');
        } else if (action === 'remove') {
          this.showConfirmModal(bookId, 'remove');
        }
      });
    });
  }


  //
  //
  // UTILITIES
  //
  //

  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

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

  refreshAfterAction() {
    this.loadBooks();
    const totalPages = this.pagination.getTotalPages();
    if (this.pagination.currentPage > totalPages && this.pagination.currentPage > 1) {
      this.pagination.currentPage = totalPages;
    }
    this.displayBooks();
  }

}

// Initialize the page
const wantToReadPage = new WantToReadPage();
wantToReadPage.init();