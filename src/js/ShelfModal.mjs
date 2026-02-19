import { addBookToShelf, findBookShelf } from './shelves.mjs';
import { SHELF_TYPES, BOOK_PROGRESS_KEY } from './constants.mjs';
import { getBookDetails } from './BookData.mjs';
import { normalizeProcessedBook } from './formatters.mjs';
import { getLocalStorage, setLocalStorage, showNotification } from './utils.mjs';

const SHELF_NAMES = {
  [SHELF_TYPES.WANT_TO_READ]: 'Queue',
  [SHELF_TYPES.CURRENTLY_READING]: 'Reading',
  [SHELF_TYPES.FINISHED]: 'Archive'
};

//
//
// UTILITIES
//
//

// Closes Modal
function closeModal(modal) {
  modal.classList.remove('modal-active');
  setTimeout(() => {
    modal.remove();
  }, 300);
}

// Validate Date Range in Finished Modal
function validateDateRange(startDateInput, endDateInput) {
  const isInvalid = new Date(endDateInput.value) < new Date(startDateInput.value);
  endDateInput.setCustomValidity(isInvalid ? 'End date cannot be before start date' : '');
}

// Gets Today's Date In YYYY-MM-DD Format
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

//
//
// DRY HELPERS FUNCTIONS
//
//

// Notify User Book Is Already On A Shelf
function notifyAlreadyOnShelf(bookTitle, bookId) {
  const currentShelf = findBookShelf(bookId);
  const shelfDisplayName = SHELF_NAMES[currentShelf] || 'another';
  showNotification(`"${bookTitle}" is already on ${shelfDisplayName} shelf!`, 'error');
}

// Sets Up Modal Close Listeners For Both Modals
function setupModalCloseListeners(modal, cancelBtnId, resolveHandler) {
  let isSubmitting = false;
  const closeBtn = modal.querySelector('.modal-close');
  const cancelBtn = modal.querySelector(cancelBtnId);

  const dismiss = () => {
    if (isSubmitting) return;
    closeModal(modal);
    resolveHandler(false);
  };

  closeBtn.addEventListener('click', dismiss);
  cancelBtn.addEventListener('click', dismiss);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) dismiss();
  });

  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      dismiss();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  return { escapeHandler, setSubmitting: (val) => { isSubmitting = val; } };
}

// Sets Loading State On Form Submit Button
function setSubmitLoading(form) {
  const btn = form.querySelector('button[type="submit"]');
  btn.classList.add('btn-loading');
  btn.disabled = true;
  return btn;
}

// Resets Loading State On Form Submit Button
function resetSubmitLoading(btn) {
  btn.classList.remove('btn-loading');
  btn.disabled = false;
}

// Resolves Shelf Result With Appropriate Notification
function resolveShelfResult(success, bookTitle, normalizedBookId, successMessage, resolveHandler, submitBtn) {
  if (success) {
    showNotification(successMessage, 'success');
    resolveHandler(true);
  } else {
    notifyAlreadyOnShelf(bookTitle, normalizedBookId);
    resolveHandler(false);
  }
}

// Handles Errors When Adding Book To Shelf
function handleShelfError(error, context, resolveHandler, submitBtn = null) {
  console.error(`Error showing ${context} details modal:`, error);
  if (submitBtn) resetSubmitLoading(submitBtn);
  showNotification('Failed to open details form. Please try again.', 'error');
  resolveHandler(false);
}


//
//
// MODAL BUILDERS
//
//

// Creates Modal HTML for Currently Reading and Finished Forms
function createModalHTML(id, title, formId, fieldsHTML, submitLabel, cancelBtnId) {
  const today = getTodayDate();
  return `
    <div id="${id}" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body">
          <form id="${formId}" class="details-form">
            <div class="form-group">
              <label for="start-date" class="form-label">Start Date <span class="required">*</span></label>
              <input type="date" id="start-date" name="startDate" class="form-input" value="${today}" max="${today}" required />
            </div>
            ${fieldsHTML}
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" id="${cancelBtnId}">Cancel</button>
              <button type="submit" class="btn btn-primary">${submitLabel}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

// Create And Returns Modal
function createModal() {
  // Remove existing modal if present
  const existingModal = document.getElementById('shelf-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modalHTML = `
    <div id="shelf-modal" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Add to Shelf</h3>
          <button class="modal-close" aria-label="Close modal">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-instruction">Select a shelf for this book:</p>
          <div class="shelf-options">
            <button class="shelf-option" data-shelf="${SHELF_TYPES.WANT_TO_READ}">
              <svg class="shelf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
              <div class="shelf-option-text">
                <span class="shelf-option-title">Queue</span>
                <span class="shelf-option-desc">Books you plan to read</span>
              </div>
            </button>
            <button class="shelf-option" data-shelf="${SHELF_TYPES.CURRENTLY_READING}">
              <svg class="shelf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              <div class="shelf-option-text">
                <span class="shelf-option-title">Reading</span>
                <span class="shelf-option-desc">Books you're currently reading</span>
              </div>
            </button>
            <button class="shelf-option" data-shelf="${SHELF_TYPES.FINISHED}">
              <svg class="shelf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <div class="shelf-option-text">
                <span class="shelf-option-title">Archive</span>
                <span class="shelf-option-desc">Books you've completed</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  return document.getElementById('shelf-modal');
}

// Create Reading Details Form Modal
function createCurrentlyReadingModal() {
  const fieldsHTML = `
    <div class="form-group">
      <label for="current-page" class="form-label">Current Page <span class="required">*</span></label>
      <input type="number" id="current-page" name="currentPage" class="form-input" value="0" min="0" required />
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend',
    createModalHTML('reading-details-modal', 'Reading Details', 'reading-details-form', fieldsHTML, 'Add to Reading', 'cancel-btn')
  );
  return document.getElementById('reading-details-modal');
}

// Create Finished Details Form Modal
function createFinishedModal() {
  const today = getTodayDate();
  const fieldsHTML = `
    <div class="form-group">
      <label for="end-date" class="form-label">End Date <span class="required">*</span></label>
      <input type="date" id="end-date" name="endDate" class="form-input" value="${today}" max="${today}" required />
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend',
    createModalHTML('finished-details-modal', 'Finished Book Details', 'finished-details-form', fieldsHTML, 'Add to Archive', 'cancel-finished-btn')
  );
  return document.getElementById('finished-details-modal');
}


//
//
// DATA HELPERS FUNCTIONS
//
//

// Enriches Book Data
async function enrichBookWithDetails(book) {
  try {
    // If book already has all required data, return as is
    if (book.volumeInfo?.categories && book.volumeInfo.categories.length > 0 &&
      book.volumeInfo?.description && book.volumeInfo?.pageCount) {
      return book;
    }

    // Fetch full details to get categories, description, and page count
    const fullDetails = await getBookDetails(book.id);

    // Merge the additional data into the book object
    return {
      ...book,

      volumeInfo: {
        ...book.volumeInfo,
        authorId: book.authorId || fullDetails.authorId || 'unknown',
        categories: fullDetails.volumeInfo?.categories || [],
        description: fullDetails.volumeInfo?.description || book.volumeInfo?.description || 'No description available.',
        pageCount: fullDetails.volumeInfo?.pageCount || book.volumeInfo?.pageCount || null
      }
    };
  } catch (error) {
    console.warn('Could not enrich book with details:', error);
    // Return original book if enrichment fails
    return book;
  }
}

async function prepareBookForShelf(book) {
  const enrichedBook = await enrichBookWithDetails(book);
  return normalizeProcessedBook(enrichedBook);
}

// Initializes Book Progress Data
function initializeBookProgress(bookId, book, currentPage) {
  const progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};
  const totalPages = book.volumeInfo?.pageCount || 0;

  if (!progressData[bookId]) {
    progressData[bookId] = {
      currentPage: currentPage,
      totalPages: totalPages,
      initialStartPage: currentPage,
      lastUpdated: new Date().toISOString(),
      notes: []
    };

    setLocalStorage(BOOK_PROGRESS_KEY, progressData);
  }
}


//
//
// HANDLERS
//
//

// Handles Queue Shelf
async function handleWantToRead(book, modal) {
  try {
    const normalizedBook = await prepareBookForShelf(book);
    const success = addBookToShelf(SHELF_TYPES.WANT_TO_READ, normalizedBook);

    closeModal(modal);

    const bookTitle = book.volumeInfo?.title || 'Unknown Title';

    if (success) {
      showNotification(`"${bookTitle}" added to Queue`, 'success');
    } else {
      notifyAlreadyOnShelf(bookTitle, normalizedBook.id);
    }
  } catch (error) {
    console.error('Error adding book to Queue:', error);
    showNotification('Failed to add book to shelf. Please try again.', 'error');
  }
}

// Handles Reading Shelf
async function handleCurrentlyReading(book, modal) {
  return new Promise((resolveHandler) => {
    try {
      closeModal(modal);

      const detailsModal = createCurrentlyReadingModal();

      requestAnimationFrame(() => {
        detailsModal.classList.add('modal-active');
      });

      const { escapeHandler, setSubmitting } = setupModalCloseListeners(detailsModal, '#cancel-btn', resolveHandler);

      const form = detailsModal.querySelector('#reading-details-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const startDate = formData.get('startDate');
        const currentPage = parseInt(formData.get('currentPage'), 10);

        const submitBtn = setSubmitLoading(form);
        setSubmitting(true);

        try {
          const enrichedBook = await enrichBookWithDetails(book);
          const normalizedBook = normalizeProcessedBook(enrichedBook);

          const bookTitle = book.volumeInfo?.title || 'Unknown Title';

          const bookWithDetails = {
            ...normalizedBook,
            readingDetails: {
              startDate,
              currentPage
            }
          };

          const success = addBookToShelf(SHELF_TYPES.CURRENTLY_READING, bookWithDetails);

          closeModal(detailsModal);
          document.removeEventListener('keydown', escapeHandler);

          if (success) initializeBookProgress(normalizedBook.id, enrichedBook, currentPage);
          resolveShelfResult(success, bookTitle, normalizedBook.id, `"${bookTitle}" added to Reading`, resolveHandler);
        } catch (error) {
          setSubmitting(false);
          handleShelfError(error, 'Reading', resolveHandler, submitBtn);
        }
      });

    } catch (error) {
      handleShelfError(error, 'Reading', resolveHandler);
    }
  });
}

// Handles Finished Shelf
async function handleFinished(book, modal) {
  return new Promise((resolveHandler) => {
    try {
      closeModal(modal);

      const detailsModal = createFinishedModal();

      requestAnimationFrame(() => {
        detailsModal.classList.add('modal-active');
      });

      const { escapeHandler, setSubmitting } = setupModalCloseListeners(detailsModal, '#cancel-finished-btn', resolveHandler);

      const startDateInput = detailsModal.querySelector('#start-date');
      const endDateInput = detailsModal.querySelector('#end-date');

      endDateInput.addEventListener('change', () => validateDateRange(startDateInput, endDateInput));
      startDateInput.addEventListener('change', () => validateDateRange(startDateInput, endDateInput));

      const form = detailsModal.querySelector('#finished-details-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        const today = getTodayDate();

        if (startDate > today || endDate > today) {
          showNotification('Dates cannot be in the future.', 'error');
          return;
        }

        if (new Date(endDate) < new Date(startDate)) {
          showNotification('End date cannot be before start date', 'error');
          return;
        }

        const submitBtn = setSubmitLoading(form);
        setSubmitting(true);

        try {
          const normalizedBook = await prepareBookForShelf(book);

          const bookTitle = book.volumeInfo?.title || 'Unknown Title';

          const bookWithDetails = {
            ...normalizedBook,
            readingDetails: {
              startDate,
              endDate
            }
          };

          const success = addBookToShelf(SHELF_TYPES.FINISHED, bookWithDetails);

          closeModal(detailsModal);
          document.removeEventListener('keydown', escapeHandler);

          resolveShelfResult(success, bookTitle, normalizedBook.id, `"${bookTitle}" added to Archive!`, resolveHandler);
        } catch (error) {
          setSubmitting(false);
          handleShelfError(error, 'Archive', resolveHandler, submitBtn);
        }
      });

    } catch (error) {
      handleShelfError(error, 'Archive', resolveHandler);
    }
  });
}


//
//
// EXPORT
//
//

export function showShelfSelectionModal(book) {
  return new Promise((resolve) => {
    const modal = createModal();

    let isProcessing = false;
    let bookWasAdded = false;

    requestAnimationFrame(() => {
      modal.classList.add('modal-active');
    });

    const closeAndResolve = () => {
      closeModal(modal);
      resolve(bookWasAdded);
    };

    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
      if (!isProcessing) {
        closeAndResolve();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal && !isProcessing) {
        closeAndResolve();
      }
    });

    const escapeHandler = (e) => {
      if (e.key === 'Escape' && !isProcessing) {
        closeAndResolve();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    const shelfOptions = modal.querySelectorAll('.shelf-option');
    shelfOptions.forEach(option => {
      option.addEventListener('click', async () => {
        const shelfType = option.dataset.shelf;
        const selectedOption = option;

        isProcessing = true;

        shelfOptions.forEach(opt => {
          opt.disabled = true;
          opt.style.cursor = 'not-allowed';
          opt.style.opacity = '0.6';
        });

        selectedOption.classList.add('shelf-option-loading');

        try {
          let wasAdded = false;

          switch (shelfType) {
            case SHELF_TYPES.WANT_TO_READ:
              await handleWantToRead(book, modal);
              wasAdded = true;
              break;
            case SHELF_TYPES.CURRENTLY_READING:
              wasAdded = await handleCurrentlyReading(book, modal);
              break;
            case SHELF_TYPES.FINISHED:
              wasAdded = await handleFinished(book, modal);
              break;
            default:
              throw new Error(`Unknown shelf type: ${shelfType}`);
          }

          document.removeEventListener('keydown', escapeHandler);

          resolve(wasAdded);
        } catch (error) {
          console.error('Error handling shelf selection:', error);

          isProcessing = false;

          shelfOptions.forEach(opt => {
            opt.disabled = false;
            opt.style.cursor = 'pointer';
            opt.style.opacity = '1';
          });
          selectedOption.classList.remove('shelf-option-loading');

          showNotification('An error occurred. Please try again.', 'error');

          resolve(false);
        }
      });
    });
  });
}