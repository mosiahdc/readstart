import { loadHeaderFooter, qs, getParam } from './utils.mjs';
import { getAuthorBooks, getAuthorInfo } from './BookData.mjs';
import { getBooksFromShelf } from './shelves.js';
import { renderBookCards } from './bookCard.js';
import { PaginationManager } from './pagination.mjs';
import { OffsetLoader } from './offsetLoader.mjs';

export default class AuthorPage {
  constructor() {
    this.authorId = getParam('id');
    this.authorInfo = null;
    this.allBooks = [];
    this.currentResults = [];
    
    // Pagination manager
    this.pagination = new PaginationManager({
      itemsPerPage: 10,
      onPageChange: (page) => this.handlePageChange(page)
    });

    // Offset loader for API pagination
    this.offsetLoader = new OffsetLoader({
      apiLimit: 50,
      booksPerPage: 10,
      fetchFunction: (limit, offset) => getAuthorBooks(this.authorId, limit, offset),
      onBooksLoaded: (newBooks) => this.handleNewBooksLoaded(newBooks)
    });
  }

  async init() {
    await loadHeaderFooter();
    await this.pullAuthorData();
    this.setupEventListeners();
  }

  // Fetch Author Data and Initial Books (Fetch First Offset)
  async pullAuthorData() {
    try {
      qs('#books-grid').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading books...</p></div>';

      const [authorInfo, booksData] = await Promise.all([
        getAuthorInfo(this.authorId),
        getAuthorBooks(this.authorId, 50, 0)
      ]);

      this.authorInfo = authorInfo;
      this.allBooks = booksData.books;
      this.currentResults = booksData.books;

      // Initialize offset loader with first batch data
      this.offsetLoader.init(booksData);

      // Initialize pagination
      this.pagination.setTotalItems(this.allBooks.length);

      console.log(`📚 Loaded ${this.allBooks.length} of ${this.offsetLoader.totalWorks} total works`);

      this.displayAuthorData();
      this.displayBooks();

    } catch (error) {
      console.error('Error pulling author data:', error);
      qs('#books-grid').innerHTML = '<div class="error-state"><p>Failed to load author books.</p></div>';
    }
  }

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

  // Update Book Stats
  updateStats() {
    qs('#total-books').textContent = this.offsetLoader.totalWorks;

    const wantToRead = getBooksFromShelf('wantToRead');
    const currentlyReading = getBooksFromShelf('currentlyReading');
    const finished = getBooksFromShelf('finished');

    const allShelves = [...wantToRead, ...currentlyReading, ...finished];
    const inLibrary = this.allBooks.filter(book =>
      allShelves.some(shelfBook => shelfBook.id === book.id)
    );

    const finishedBooks = this.allBooks.filter(book =>
      finished.some(shelfBook => shelfBook.id === book.id)
    );

    qs('#in-library').textContent = inLibrary.length;
    qs('#finished').textContent = finishedBooks.length;
  }

  // Display Author Books with Pagination
  displayBooks() {
    const booksToShow = this.pagination.getPageItems(this.currentResults);
    renderBookCards(booksToShow, '#books-grid');
    this.renderCustomPagination();
  }

  // Render Pagination
  renderCustomPagination() {
    // Calculate pages based on TOTAL works, not just loaded
    const totalPagesIfAllLoaded = Math.ceil(this.offsetLoader.totalWorks / this.pagination.itemsPerPage);
    const currentLoadedPages = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);
    
    const container = qs('#pagination');
    const pageNumbersContainer = qs('#page-numbers');

    if (!container || !pageNumbersContainer) return;

    // Always show pagination if there are books
    if (currentLoadedPages < 1) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    // Calculate which 3 page numbers to show - with awareness of unloaded pages
    const { startPage, endPage } = this.calculateSmartPageNumbers(currentLoadedPages, totalPagesIfAllLoaded);
    let pageNumbers = '';

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === this.pagination.currentPage ? 'active' : '';
      pageNumbers += `<button class="page-number ${activeClass}" data-page="${i}">${i}</button>`;
    }

    pageNumbersContainer.innerHTML = pageNumbers;

    // Add click listeners to page numbers
    document.querySelectorAll('.page-number').forEach(button => {
      button.addEventListener('click', (e) => {
        const page = parseInt(e.target.dataset.page);
        this.handlePageChange(page);
      });
    });

    // Setup navigation buttons with smart loading
    this.setupSmartNavigationButtons(currentLoadedPages, totalPagesIfAllLoaded);
  }

  // Calculate page number with smart loading
  calculateSmartPageNumbers(currentLoadedPages, totalPagesIfAllLoaded) {
    const current = this.pagination.currentPage;
    let startPage, endPage;

    // If we have more books to load, we can show next pages even if not loaded yet
    const effectiveTotal = this.offsetLoader.hasMoreToLoad 
      ? Math.max(currentLoadedPages, current + 1)
      : currentLoadedPages;

    if (effectiveTotal <= 3) {
      // Less than 3 pages total, show all
      startPage = 1;
      endPage = effectiveTotal;
    } else {
      // Show current page in the middle with 1 on each side
      startPage = Math.max(1, current - 1);
      endPage = Math.min(effectiveTotal, current + 1);

      // Adjust if at the start or end
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
      // Enable if we can go to next page OR if there's more data to load
      const canGoNext = this.pagination.currentPage < currentTotalPages || this.offsetLoader.hasMoreToLoad;
      nextBtn.disabled = !canGoNext;
      nextBtn.onclick = async () => {
        await this.handleNextPage();
      };
    }

    if (lastBtn) {
      // Always enable if we have more data to load
      lastBtn.disabled = !this.offsetLoader.hasMoreToLoad && this.pagination.currentPage === currentTotalPages;
      lastBtn.onclick = async () => {
        await this.handleLastPage();
      };
    }
  }

  // Next Page with Smart Loading Fetching next offset
  async handleNextPage() {
    const currentTotalPages = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);
    const targetPage = this.pagination.currentPage + 1;

    // If we need more data, load it
    if (targetPage > currentTotalPages && this.offsetLoader.hasMoreToLoad) {
      try {
        // Clear current books and show loading spinner
        const booksGrid = qs('#books-grid');
        booksGrid.innerHTML = '<div class="inline-loader"><div class="spinner"></div><p>Loading next page...</p></div>';

        await this.offsetLoader.loadNext();
      } catch (error) {
        console.error('Failed to load next page:', error);
        return;
      }
    }

    await this.handlePageChange(targetPage);
  }

  // Last Page with Smart Loading Fetching remaining offset
  async handleLastPage() {
    try {
      // Clear current books and show loading spinner
      const booksGrid = qs('#books-grid');
      booksGrid.innerHTML = '<div class="inline-loader"><div class="spinner"></div><p>Loading last page...</p></div>';

      // Load all remaining data
      console.log('🎯 Loading to last page...');
      await this.offsetLoader.loadToLastPage();

      // Calculate the actual last page now that all data is loaded
      const lastPage = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);
      await this.handlePageChange(lastPage);

    } catch (error) {
      console.error('Failed to load to last page:', error);
      alert('Failed to load all books. Please try again.');
    }
  }

  // Handle Page Change with Smart Offset Loading
  async handlePageChange(targetPage) {
    const currentTotalPages = Math.ceil(this.currentResults.length / this.pagination.itemsPerPage);
    
    // Validate page number
    if (targetPage < 1) return;

    // Check if we need to load more data
    if (targetPage > currentTotalPages && this.offsetLoader.hasMoreToLoad) {
      console.log(`🔄 Page ${targetPage} needs more data, loading...`);
      
      try {
        // Clear current books and show loading spinner
        const booksGrid = qs('#books-grid');
        booksGrid.innerHTML = '<div class="inline-loader"><div class="spinner"></div><p>Loading more books...</p></div>';

        await this.offsetLoader.loadToPage(targetPage);
      } catch (error) {
        console.error('Failed to load data for page:', error);
        alert('Failed to load more books. Please try again.');
        return;
      }
    }

    // Now set the page and display
    this.pagination.currentPage = targetPage;
    this.displayBooks();
    
    // Smooth scroll to book list section on page change (except page 1)
    if (this.pagination.currentPage > 1) {
      qs('.book-list-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Load New Books
  handleNewBooksLoaded(newBooks) {
    this.allBooks = [...this.allBooks, ...newBooks];
    
    // Update currentResults based on active filter
    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    if (activeFilter === 'all') {
      this.currentResults = [...this.allBooks];
    } else {
      this.applyFilter(activeFilter);
    }

    this.pagination.setTotalItems(this.currentResults.length);
    this.updateStats();
  }

  // Setup Event Listeners
  setupEventListeners() {
    qs('#back-btn')?.addEventListener('click', () => history.back());

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        this.handleFilter(e.target.dataset.filter);
        filterButtons.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  }

  // Handle Filter Changes
  handleFilter(filter) {
    this.applyFilter(filter);
    this.pagination.reset();
    this.pagination.setTotalItems(this.currentResults.length);
    this.displayBooks();
  }

  // Apply Filter to Books
  applyFilter(filter) {
    const wantToRead = getBooksFromShelf('wantToRead');
    const currentlyReading = getBooksFromShelf('currentlyReading');
    const finished = getBooksFromShelf('finished');

    switch (filter) {
      case 'all':
        this.currentResults = [...this.allBooks];
        break;

      case 'inLibrary':
        const allShelves = [...wantToRead, ...currentlyReading, ...finished];
        this.currentResults = this.allBooks.filter(book =>
          allShelves.some(shelfBook => shelfBook.id === book.id)
        );
        break;

      case 'notInLibrary':
        const inLibraryShelves = [...wantToRead, ...currentlyReading, ...finished];
        this.currentResults = this.allBooks.filter(book =>
          !inLibraryShelves.some(shelfBook => shelfBook.id === book.id)
        );
        break;

      case 'currentlyReading':
        this.currentResults = this.allBooks.filter(book =>
          currentlyReading.some(shelfBook => shelfBook.id === book.id)
        );
        break;
    }
  }

  // async loadMoreBooks() {
  //   try {
  //     await this.offsetLoader.loadNext();
  //     this.displayBooks();
  //   } catch (error) {
  //     console.error('Error loading more books:', error);
  //     alert('Failed to load more books. Please try again.');
  //   }
  // }
}
