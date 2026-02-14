import { getLocalStorage, setLocalStorage } from "./utils.mjs";

export const SHELF_TYPES = {
  WANT_TO_READ: 'wantToRead',
  CURRENTLY_READING: 'currentlyReading',
  FINISHED: 'finished'
};

// Add Book To A Shelf
export function addBookToShelf(shelf, book) {
  const books = getBooksFromShelf(shelf);

  if (books.some(b => b.id === book.id)) {
    console.log('Book already in shelf');
    return;
  }

  books.push({ ...book, addedDate: new Date().toISOString() });
  setLocalStorage(shelf, books);
}

// Pull All Books In A Shelf
export function getBooksFromShelf(shelf) {
  return getLocalStorage(shelf) || [];
}

// Remove A Book From Shelf
export function removeBookFromShelf(shelf, bookId) {
  const books = getBooksFromShelf(shelf);
  const filteredBooks = books.filter(book => book.id !== bookId);

  // Check if book was actually removed
  if (books.length === filteredBooks.length) {
    console.log('Book not found in shelf');
    return false;
  }

  setLocalStorage(shelf, filteredBooks);
  return true;
}

// Move A Book To Another Shelf
export function moveBook(fromShelf, toShelf, bookId) {
  const books = getBooksFromShelf(fromShelf);
  const book = books.find(b => b.id === bookId);

  if (!book) {
    console.error('Book not found in source shelf');
    return false;
  }

  // Remove from source shelf
  const removed = removeBookFromShelf(fromShelf, bookId);
  if (!removed) return false;

  // Add to destination shelf with updated metadata
  const bookToAdd = {
    ...book,
    shelf: toShelf,
    movedDate: new Date().toISOString()
  };

  return addBookToShelf(toShelf, bookToAdd);
}

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
  
  return results;
}

// Get All Shelves Withh Their Books
export function getAllShelves() {
  return {
    wantToRead: getBooksFromShelf(SHELF_TYPES.WANT_TO_READ),
    currentlyReading: getBooksFromShelf(SHELF_TYPES.CURRENTLY_READING),
    finished: getBooksFromShelf(SHELF_TYPES.FINISHED)
  };
}
