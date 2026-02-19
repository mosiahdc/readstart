import { loadHeaderFooter, qs, getParam, showNotification } from './utils.mjs';
import { getAuthorBooks, getAuthorInfo } from './BookData.mjs';
import { SHELF_TYPES } from './constants.mjs';
import { getBooksFromShelf } from './shelves.mjs';
import { renderBookCards } from './bookCard.mjs';
import { PaginationManager } from './pagination.mjs';
import { OffsetLoader } from './offsetLoader.mjs';
import * as BookCache from './cache.mjs';

export default class AuthorPage {
  constructor() {
    this.authorId = getParam('id');
    this.authorInfo = null;
    this.allBooks = [];
    this.currentResults = [];

    this.shelfBookIds = new Set();
    this.wantToReadIds = new Set();
    this.currentlyReadingIds = new Set();
    this.finishedIds = new Set();

    this.loadingStartTime = null;
    this.initialBooksLoaded = 0;
    this.loadingUpdateInterval = null;

    this.pagination = new PaginationManager({
      itemsPerPage: 10,
      onPageChange: (page) => this.handlePageChange(page)
    });

    this.offsetLoader = new OffsetLoader({
      apiLimit: 50,
      booksPerPage: 10,
      fetchFunction: (limit, offset) => getAuthorBooks(this.authorId, limit, offset, this.authorInfo),
      onBooksLoaded: (newBooks) => this.handleNewBooksLoaded(newBooks)
    });
  }


  //
  //
  // INITIALIZATION 
  //
  //

  async init() {
    await loadHeaderFooter();
    await this.pullAuthorData();
    this.setupEventListeners();
  }

  async pullAuthorData() {
    try {
      const loadingText = qs('#loading-text');
      if (loadingText) {
        loadingText.textContent = 'Loading books...';
      }

      const authorInfo = await getAuthorInfo(this.authorId);
      const booksData = await getAuthorBooks(this.authorId, 50, 0, authorInfo);

      this.authorInfo = authorInfo;
      this.allBooks = booksData.books;
      this.currentResults = booksData.books;

      this.offsetLoader.init(booksData);

      this.pagination.setTotalItems(this.allBooks.length);

      if (loadingText) {
        loadingText.textContent = `Loading ${this.offsetLoader.totalWorks} Books...`;
      }

      BookCache.cacheAuthorInfo(this.authorId, this.authorInfo);

      this.displayAuthorData();

      this.updateShelfIdCache();

      this.displayBooks();

      const loadingState = qs('#loading-state');
      const booksContent = qs('#books-content');
      if (loadingState) loadingState.style.display = 'none';
      if (booksContent) booksContent.style.display = 'block';

    } catch (error) {
      console.error('Error pulling author data:', error);
      showNotification('Failed to load author books. Please refresh.', 'error');
      const loadingState = qs('#loading-state');
      if (loadingState) loadingState.style.display = 'none';
    }
  }


  //
  //
  // DISPLAY 
  //
  //

  // Display Author Data
  displayAuthorData() {
    document.title = `ReadStart - ${this.authorInfo?.name || this.authorId}`;

    qs('#author-name').textContent = this.authorInfo?.name || 'Unknown Author';

    if (this.authorInfo) {
      const birthInfo = this.authorInfo.birthDate
        ? `Born: ${this.authorInfo.birthDate}`
        : 'Birth date unknown';

      qs('#author-birthdate').textContent = birthInfo;
      qs('#author-bio').textContent = this.authorInfo.bio || 'No biography available.';

      if (this.authorInfo.photoUrl) {
        qs('#author-image').src = this.authorInfo.photoUrl;
        qs('#author-image').alt = this.authorInfo.name;
      }
    }

    this.updateStats();
  }

  // Display Author Books with Pagination
  displayBooks() {
    const emptyState = qs('#empty-state');
    const booksContent = qs('#books-content');

    this.stopLoadingProgressTracking();

    if (this.currentResults.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (booksContent) booksContent.classList.add('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (booksContent) booksContent.classList.remove('hidden');

    const booksToShow = this.pagination.getPageItems(this.currentResults);
    renderBookCards(booksToShow, '#books-grid');
    this.renderCustomPagination();
  }


  //
  //
  // STATS  
  //
  //

  // Update Book Stats
  updateStats() {
    qs('#total-books').textContent = this.offsetLoader.totalWorks;

    const inLibrary = this.allBooks.filter(book => this.shelfBookIds.has(book.id));
    const finishedBooks = this.allBooks.filter(book => this.finishedIds.has(book.id));

    qs('#in-library').textContent = inLibrary.length;
    qs('#finished').textContent = finishedBooks.length;
  }


  //
  //
  // FILTERS  
  //
  //

  // Apply Filter to Books
  applyFilter(filter) {
    this.updateShelfIdCache();

    switch (filter) {
      case 'all':
        this.currentResults = [...this.allBooks];
        break;

      case 'inShelf':
        this.currentResults = this.allBooks.filter(book =>
          this.shelfBookIds.has(book.id)
        );
        break;

      case 'notInShelf':
        this.currentResults = this.allBooks.filter(book =>
          !this.shelfBookIds.has(book.id)
        );
        break;

      case 'currentlyReading':
        this.currentResults = this.allBooks.filter(book =>
          this.currentlyReadingIds.has(book.id)
        );
        break;
    }
  }

  // Handle Filter Changes
  async handleFilter(filter, filterButtons) {
    const shelfFilters = ['inShelf', 'notInShelf', 'currentlyReading'];
    const needsAllBooks = shelfFilters.includes(filter) && this.offsetLoader.hasMoreToLoad;

    if (needsAllBooks) {

      this.showBooksGridLoader();

      try {
        await this.offsetLoader.loadToLastPage();
      } catch (error) {
        console.error('Error loading all books for filtering:', error);
        return;
      }
    }

    this.applyFilter(filter);
    this.pagination.reset();
    this.pagination.setTotalItems(this.currentResults.length);
    this.displayBooks();

    filterButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-filter="${filter}"]`)?.classList.add('active');
  }

  // Update shelf ID cache for fast lookups
  updateShelfIdCache() {
    const { wantToRead, currentlyReading, finished } = this.getAllShelfBooks();

    this.wantToReadIds = new Set(wantToRead.map(b => b.id));
    this.currentlyReadingIds = new Set(currentlyReading.map(b => b.id));
    this.finishedIds = new Set(finished.map(b => b.id));

    this.shelfBookIds = new Set([
      ...this.wantToReadIds,
      ...this.currentlyReadingIds,
      ...this.finishedIds
    ]);
  }

  getAllShelfBooks() {
    return {
      wantToRead: getBooksFromShelf(SHELF_TYPES.WANT_TO_READ),
      currentlyReading: getBooksFromShelf(SHELF_TYPES.CURRENTLY_READING),
      finished: getBooksFromShelf(SHELF_TYPES.FINISHED)
    };
  }


  //
  //
  // PAGINATION  
  //
  //

  // Render Pagination
  renderCustomPagination() {
    const totalPagesIfAllLoaded = Math.ceil(this.offsetLoader.totalWorks / this.pagination.itemsPerPage);
    const currentLoadedPages = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);

    const container = qs('#pagination');
    const pageNumbersContainer = qs('#page-numbers');

    if (!container || !pageNumbersContainer) return;

    if (currentLoadedPages < 1) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    const { startPage, endPage } = this.calculateSmartPageNumbers(currentLoadedPages, totalPagesIfAllLoaded);
    let pageNumbers = '';

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === this.pagination.currentPage ? 'active' : '';
      pageNumbers += `<button class="page-number ${activeClass}" data-page="${i}">${i}</button>`;
    }

    pageNumbersContainer.innerHTML = pageNumbers;

    document.querySelectorAll('.page-number').forEach(button => {
      button.addEventListener('click', (e) => {
        const page = parseInt(e.target.dataset.page);
        this.handlePageChange(page);
      });
    });

    this.setupSmartNavigationButtons(currentLoadedPages, totalPagesIfAllLoaded);
  }

  // Calculate page number with smart loading
  calculateSmartPageNumbers(currentLoadedPages, totalPagesIfAllLoaded) {
    const current = this.pagination.currentPage;
    let startPage, endPage;

    const effectiveTotal = this.offsetLoader.hasMoreToLoad
      ? Math.max(currentLoadedPages, current + 1)
      : totalPagesIfAllLoaded;

    if (effectiveTotal <= 3) {
      startPage = 1;
      endPage = effectiveTotal;
    } else {
      startPage = Math.max(1, current - 1);
      endPage = Math.min(effectiveTotal, current + 1);

      if (current === 1) {
        endPage = 3;
      } else if (current === effectiveTotal) {
        startPage = effectiveTotal - 2;
      }
    }

    return { startPage, endPage };
  }

  // Navigation Buttons
  setupSmartNavigationButtons(currentTotalPages, absoluteTotalPages) {
    const firstBtn = qs('#first-page');
    const prevBtn = qs('#prev-page');
    const nextBtn = qs('#next-page');
    const lastBtn = qs('#last-page');

    if (firstBtn) {
      firstBtn.onclick = () => this.handlePageChange(1);
      firstBtn.disabled = this.pagination.currentPage === 1;
    }

    if (prevBtn) {
      prevBtn.onclick = () => this.handlePageChange(this.pagination.currentPage - 1);
      prevBtn.disabled = this.pagination.currentPage === 1;
    }

    if (nextBtn) {
      const canGoNext = this.pagination.currentPage < absoluteTotalPages || this.offsetLoader.hasMoreToLoad;
      nextBtn.disabled = !canGoNext;
      nextBtn.onclick = async () => {
        await this.handleNextPage();
      };
    }

    if (lastBtn) {
      lastBtn.disabled = !this.offsetLoader.hasMoreToLoad && this.pagination.currentPage === absoluteTotalPages;
      lastBtn.onclick = async () => {
        await this.handleLastPage();
      };
    }
  }


  //
  //
  // PAGE NAVIGATION  
  //
  //

  // Handle Page Change with Smart Offset Loading
  async handlePageChange(targetPage) {
    const currentTotalPages = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);

    if (targetPage < 1) return;

    if (targetPage > currentTotalPages && this.offsetLoader.hasMoreToLoad) {

      try {
        this.showBooksGridLoader();
        await this.offsetLoader.loadToPage(targetPage);
      } catch (error) {
        console.error('Failed to load data for page:', error);
        this.stopLoadingProgressTracking();
        showNotification('Failed to load more books. Please try again.', 'error');
        return;
      }
    }

    this.pagination.currentPage = targetPage;
    this.displayBooks();

    qs('.book-list-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  // Next Page with Smart Loading Fetching next offset
  async handleNextPage() {
    const currentTotalPages = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);
    const targetPage = this.pagination.currentPage + 1;

    if (targetPage > currentTotalPages && this.offsetLoader.hasMoreToLoad) {
      try {
        this.showBooksGridLoader();

        await this.offsetLoader.loadNext();
      } catch (error) {
        console.error('Failed to load next page:', error);
        this.stopLoadingProgressTracking();
        return;
      }
    }

    await this.handlePageChange(targetPage);
  }

  // Last Page with Smart Loading Fetching remaining offset
  async handleLastPage() {
    try {
      this.showBooksGridLoader();

      await this.offsetLoader.loadToLastPage();

      const lastPage = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);
      await this.handlePageChange(lastPage);

    } catch (error) {
      console.error('Failed to load to last page:', error);
      this.stopLoadingProgressTracking();
      showNotification('Failed to load all books. Please try again.', 'error');
    }
  }


  //
  //
  // BOOK LOADING
  //
  //

  // Load New Books
  handleNewBooksLoaded(newBooks) {
    this.allBooks = [...this.allBooks, ...newBooks];

    this.updateShelfIdCache();

    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    if (activeFilter === 'all') {
      this.currentResults = [...this.allBooks];
    } else {
      this.applyFilter(activeFilter);
    }

    this.pagination.setTotalItems(this.currentResults.length);
    this.updateStats();

    this.renderCustomPagination();
  }


  //
  //
  // HELPERS 
  //
  //

  showBooksGridLoader(message = `Loading ${this.offsetLoader.totalWorks} books...`) {
    const booksGrid = qs('#books-grid');
    if (booksGrid) {
      booksGrid.innerHTML = `
      <div class="inline-loader" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
    }
    this.startLoadingProgressTracking();
  }

  // Start tracking load time and show progress
  startLoadingProgressTracking() {
    if (this.loadingStartTime) return;

    this.loadingStartTime = Date.now();
    this.initialBooksLoaded = this.allBooks.length;

    this.loadingUpdateInterval = setInterval(() => {
      const estimatedTime = this.calculateEstimatedTimeRemaining();
      if (estimatedTime !== null) {
        const timeString = this.formatTimeRemaining(estimatedTime);
        const loadingMessage = `Loading ${this.offsetLoader.totalWorks} books... (~${timeString} remaining)`;

        const loaderElement = document.querySelector('.inline-loader p') || document.querySelector('#books-grid .inline-loader p');
        if (loaderElement && loaderElement.isConnected) {
          loaderElement.textContent = loadingMessage;
        }
      }
    }, 500);
  }

  // Stop tracking load progress
  stopLoadingProgressTracking() {
    if (this.loadingUpdateInterval) {
      clearInterval(this.loadingUpdateInterval);
      this.loadingUpdateInterval = null;
    }
    this.loadingStartTime = null;
  }

  // Format seconds into readable time string 
  formatTimeRemaining(seconds) {
    if (seconds < 0) return 'Calculating...';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  // Calculate estimated time remaining based on loading speed
  calculateEstimatedTimeRemaining() {
    if (!this.loadingStartTime || this.offsetLoader.totalWorks <= this.allBooks.length) {
      return null;
    }

    const elapsedMs = Date.now() - this.loadingStartTime;
    const booksToLoad = this.offsetLoader.totalWorks - this.initialBooksLoaded;
    const booksLoaded = this.allBooks.length - this.initialBooksLoaded;

    if (booksLoaded < 5 || elapsedMs < 1000) {
      return null;
    }

    const loadRate = booksLoaded / (elapsedMs / 1000);
    const booksRemaining = this.offsetLoader.totalWorks - this.allBooks.length;
    const estimatedSecondsRemaining = booksRemaining / loadRate;

    return Math.max(0, estimatedSecondsRemaining);
  }


  //
  //
  // EVENT LISTENERS 
  //
  //

  setupEventListeners() {
    qs('#back-btn')?.addEventListener('click', () => history.back());

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        this.handleFilter(e.target.dataset.filter, filterButtons);
      });
    });
  }

}
