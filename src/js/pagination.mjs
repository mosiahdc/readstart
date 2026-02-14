import { qs } from './utils.mjs';

/**
 * Pagination helper class for managing page state and UI
 */
export class PaginationManager {
  constructor(config = {}) {
    this.currentPage = 1;
    this.itemsPerPage = config.itemsPerPage || 10;
    this.totalItems = 0;
    this.containerSelector = config.containerSelector || '#pagination';
    this.pageNumbersSelector = config.pageNumbersSelector || '#page-numbers';
    this.onPageChange = config.onPageChange || (() => {});
  }

  getTotalPages() {
    return Math.ceil(this.totalItems / this.itemsPerPage);
  }

  getPageItems(items) {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return items.slice(startIndex, endIndex);
  }

  getPageNumbersToShow() {
    const totalPages = this.getTotalPages();
    let startPage, endPage;

    if (totalPages <= 3) {
      startPage = 1;
      endPage = totalPages;
    } else {
      startPage = Math.max(1, this.currentPage - 1);
      endPage = Math.min(totalPages, this.currentPage + 1);

      if (this.currentPage === 1) {
        endPage = 3;
      } else if (this.currentPage === totalPages) {
        startPage = totalPages - 2;
      }
    }

    return { startPage, endPage, totalPages };
  }

  render() {
    const totalPages = this.getTotalPages();
    const container = qs(this.containerSelector);
    const pageNumbersContainer = qs(this.pageNumbersSelector);

    if (!container || !pageNumbersContainer) return;

    // Hide if only 1 page
    if (totalPages <= 1) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    // Render page numbers (3 max)
    const { startPage, endPage } = this.getPageNumbersToShow();
    let pageNumbers = '';

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === this.currentPage ? 'active' : '';
      pageNumbers += `<button class="page-number ${activeClass}" data-page="${i}">${i}</button>`;
    }

    pageNumbersContainer.innerHTML = pageNumbers;

    // Add click listeners to page numbers
    document.querySelectorAll('.page-number').forEach(button => {
      button.addEventListener('click', (e) => {
        const page = parseInt(e.target.dataset.page);
        this.goToPage(page);
      });
    });

    // Setup navigation buttons
    this.setupNavigationButtons(totalPages);
  }

  setupNavigationButtons(totalPages) {
    const firstBtn = qs('#first-page');
    const prevBtn = qs('#prev-page');
    const nextBtn = qs('#next-page');
    const lastBtn = qs('#last-page');

    if (firstBtn) {
      firstBtn.onclick = () => this.goToPage(1);
      firstBtn.disabled = this.currentPage === 1;
    }

    if (prevBtn) {
      prevBtn.onclick = () => this.goToPage(this.currentPage - 1);
      prevBtn.disabled = this.currentPage === 1;
    }

    if (nextBtn) {
      nextBtn.onclick = () => this.goToPage(this.currentPage + 1);
      nextBtn.disabled = this.currentPage === totalPages;
    }

    if (lastBtn) {
      lastBtn.onclick = () => this.goToPage(totalPages);
      lastBtn.disabled = this.currentPage === totalPages;
    }
  }

  goToPage(pageNumber) {
    const totalPages = this.getTotalPages();
    if (pageNumber < 1 || pageNumber > totalPages) return;
    
    this.currentPage = pageNumber;
    this.onPageChange(pageNumber);
    this.render();
  }

  setTotalItems(count) {
    this.totalItems = count;
  }

  reset() {
    this.currentPage = 1;
  }
}
