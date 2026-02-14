import { getLocalStorage, setLocalStorage } from "./utils.mjs";

export function addBookToShelf(shelf, book) {
  const books = getBooksFromShelf(shelf);
  
  if (books.some(b => b.id === book.id)) {
    console.log('Book already in shelf');
    return;
  }
  
  books.push({ ...book, addedDate: new Date().toISOString() });
  setLocalStorage(shelf, books);
}

export function getBooksFromShelf(shelf) {
  return getLocalStorage(shelf) || [];
}

export function removeBookFromShelf(shelf, bookId) {
  const books = getBooksFromShelf(shelf).filter(book => book.id !== bookId);
  setLocalStorage(shelf, books);
}

export function moveBook(fromShelf, toShelf, bookId) {
  const books = getBooksFromShelf(fromShelf);
  const book = books.find(b => b.id === bookId);
  
  if (!book) {
    console.error('Book not found in source shelf');
    return;
  }
  
  removeBookFromShelf(fromShelf, bookId);
  addBookToShelf(toShelf, book);
}

export function getAllShelves() {
  return {
    wantToRead: getBooksFromShelf('wantToRead'),
    currentlyReading: getBooksFromShelf('currentlyReading'),
    finished: getBooksFromShelf('finished')
  };
}