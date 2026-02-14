import { getTrendingBooks, searchBooks } from './BookData.mjs';
import { getBooksFromShelf } from './shelves.js';
import { qs } from './utils.mjs';
import { renderBookCards } from './bookCard.js';
import { PaginationManager } from './pagination.mjs';
import { UIStateManager } from './uiState.mjs';

export default class Homepage {
  constructor() {
    this.searchInput = qs('#search-input');
    this.searchBtn = qs('#search-btn');
    this.resultsGrid = qs('#results-grid');
    this.resultCount = qs('#result-count');
    this.currentResults = [];
    
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

  init() {
    this.setupEventListeners();
    this.updateShelfCounts();
    this.loadTrendingBooks();
  }

  setupEventListeners() {
    this.searchBtn?.addEventListener('click', () => this.handleSearch());
    this.searchInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });
  }

  // Load Books
  async loadBooks(fetchFunction, successMessage, errorMessage) {
    this.uiState.showLoading();

    try {
      const results = await fetchFunction();
      this.currentResults = results || [];
      this.pagination.reset();
      this.pagination.setTotalItems(results.length);

      if (results.length > 0) {
        this.uiState.showResults();
        this.displayResults(results);
        this.resultCount.textContent = successMessage(results.length);
      } else {
        this.uiState.showEmpty(errorMessage);
      }
    } catch (error) {
      console.error('Error loading books:', error);
      this.uiState.showError(errorMessage);
    }
  }

  // Pull Trending Books and Load
  async loadTrendingBooks() {
    await this.loadBooks(
      () => getTrendingBooks(),
      (count) => `Trending This Week • ${count} books`,
      'No trending books available at the moment.'
    );
  }

  // Handle Search Entry
  async handleSearch() {
    const query = this.searchInput.value.trim();
    if (!query) {
      alert('Please enter a search term');
      return;
    }
    
    await this.loadBooks(
      () => searchBooks(query),
      (count) => `Search Results • ${count} results`,
      `No results found for "${query}"`
    );
  }

  // Display Book Results
  displayResults(books) {
    const booksToShow = this.pagination.getPageItems(books);
    renderBookCards(booksToShow);
    this.pagination.render();
    
    if (this.pagination.currentPage > 1) {
      qs('.results-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Update Shelf Counts
  updateShelfCounts() {
    const shelves = {
      'wantToRead': '#want-count',
      'currentlyReading': '#reading-count',
      'finished': '#finished-count'
    };

    Object.entries(shelves).forEach(([shelf, selector]) => {
      qs(selector).textContent = getBooksFromShelf(shelf).length;
    });
  }
}
