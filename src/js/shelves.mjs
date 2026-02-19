import { getLocalStorage, setLocalStorage } from "./utils.mjs";
import { SHELF_TYPES, BOOK_PROGRESS_KEY } from './constants.mjs';

//
// UTILITIES
//

// Update Book's lastUpdated timestamp (for Recent Activity tracking)
function updateBookTimestamp(book) {
  return {
    ...book,
    lastUpdated: new Date().toISOString()
  };
}


// 
// READ FUNCTIONS
//

// Pull All Books In A Shelf
export function getBooksFromShelf(shelf) {
  return getLocalStorage(shelf) || [];
}

// Get All Shelves Withh Their Books
export function getAllShelves() {
  return {
    [SHELF_TYPES.WANT_TO_READ]: getBooksFromShelf(SHELF_TYPES.WANT_TO_READ),
    [SHELF_TYPES.CURRENTLY_READING]: getBooksFromShelf(SHELF_TYPES.CURRENTLY_READING),
    [SHELF_TYPES.FINISHED]: getBooksFromShelf(SHELF_TYPES.FINISHED)
  };
}

// Check If Book Exists In Any Shelf
export function isBookInAnyShelf(bookId) {
  const allShelves = getAllShelves();

  for (const books of Object.values(allShelves)) {
    if (books.some(b => b.id === bookId)) {
      return true;
    }
  }

  return false;
}

// Find Which Shelf A Book Is On
export function findBookShelf(bookId) {
  const allShelves = getAllShelves();

  for (const [shelfName, books] of Object.entries(allShelves)) {
    if (books.some(b => b.id === bookId)) {
      return shelfName;
    }
  }

  return null;
}


//
// WRITE FUNCTIONS
//

// Add Book To A Shelf
export function addBookToShelf(shelf, book) {
  // Check if book already exists in ANY shelf
  if (isBookInAnyShelf(book.id)) {
    return false;
  }

  const books = getBooksFromShelf(shelf);
  const bookToAdd = updateBookTimestamp({
    ...book,
    addedDate: book.addedDate || new Date().toISOString()
  });
  books.push(bookToAdd);
  setLocalStorage(shelf, books);
  return true;
}

// Remove A Book From Shelf
export function removeBookFromShelf(shelf, bookId) {
  const books = getBooksFromShelf(shelf);
  const filteredBooks = books.filter(book => book.id !== bookId);

  // Check if book was actually removed
  if (books.length === filteredBooks.length) {
    return false;
  }

  setLocalStorage(shelf, filteredBooks);
  return true;
}


//
// MOVERS
//

// Find A Book In Shelf And Remove It
function findAndRemoveFromShelf(fromShelf, bookId) {
  const books = getBooksFromShelf(fromShelf);
  const book = books.find(b => b.id === bookId);

  if (!book) {
    console.error('Book not found in source shelf');
    return null;
  }

  const removed = removeBookFromShelf(fromShelf, bookId);
  if (!removed) return null;

  return book;
}


// Move A Book To Another Shelf
export function moveBook(fromShelf, toShelf, bookId) {
  const book = findAndRemoveFromShelf(fromShelf, bookId);
  if (!book) return false;

  // Add to destination shelf with updated metadata and timestamp
  const bookToAdd = updateBookTimestamp({
    ...book,
    shelf: toShelf,
    movedDate: new Date().toISOString()
  });

  return addBookToShelf(toShelf, bookToAdd);
}

// Move A Book To Currently Reading Shelf with Reading Details
export function moveBookToCurrentlyReading(fromShelf, bookId, readingDetails = null) {
  const book = findAndRemoveFromShelf(fromShelf, bookId);
  if (!book) return false;

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Prepare reading details
  const defaultReadingDetails = {
    startDate: today,
    currentPage: 0
  };

  // Merge provided readingDetails with defaults
  const finalReadingDetails = readingDetails
    ? { ...defaultReadingDetails, ...readingDetails }
    : defaultReadingDetails;

  // Add to destination shelf with reading details and updated metadata
  const bookToAdd = updateBookTimestamp({
    ...book,
    shelf: SHELF_TYPES.CURRENTLY_READING,
    movedDate: new Date().toISOString(),
    readingDetails: finalReadingDetails
  });

  const success = addBookToShelf(SHELF_TYPES.CURRENTLY_READING, bookToAdd);

  // Also initialize progress tracking if not already provided
  if (success) {
    initializeBookProgress(bookId, bookToAdd);
  }

  return success;
}

// Initialize book progress data when a book starts being read
function initializeBookProgress(bookId, bookToAdd) {
  const progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};
  const totalPages = bookToAdd.volumeInfo?.pageCount || 0;
  const currentPage = bookToAdd.readingDetails?.currentPage || 0;

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

export function moveBookToFinished(fromShelf, bookId, readingDetails = null) {
  const book = findAndRemoveFromShelf(fromShelf, bookId);
  if (!book) return false;

  // Get today's date in YYYY-MM-DD format
  const endDate = new Date().toISOString().split('T')[0];

  // Add to destination shelf with finished details and updated metadata
  const bookToAdd = updateBookTimestamp({
    ...book,
    readingDetails: {
      ...book.readingDetails,
      endDate
    }
  });

  return addBookToShelf(SHELF_TYPES.FINISHED, bookToAdd);
}


//
// OPERATORS
//

// Remove Book From All Shelves
export function removeBookFromAllShelves(bookId) {
  const results = {
    wantToRead: false,
    currentlyReading: false,
    finished: false,
    totalRemoved: 0
  };

  // Try to remove from each shelf
  Object.values(SHELF_TYPES).forEach(shelf => {
    const removed = removeBookFromShelf(shelf, bookId);
    results[shelf] = removed;
    if (removed) results.totalRemoved++;
  });

  // Also remove progress data (notes, stats, etc.)
  if (results.totalRemoved > 0) {
    const progressData = getLocalStorage(BOOK_PROGRESS_KEY) || {};
    if (progressData[bookId]) {
      delete progressData[bookId];
      setLocalStorage(BOOK_PROGRESS_KEY, progressData);
    }
  }

  return results;
}
