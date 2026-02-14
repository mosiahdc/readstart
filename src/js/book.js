import { loadHeaderFooter, qs, getParam } from './utils.mjs';
import { getBookDetails, searchByField } from './BookData.mjs';
import { addBookToShelf, SHELF_TYPES } from './shelves.js';
import { renderBookCards } from './bookCard.js';

export default class BookDetail {
  constructor() {
    this.bookId = getParam('id');
    this.isbn = getParam('isbn');
    this.currentBook = null;
  }

  async init() {
    await loadHeaderFooter();
    await this.pullBookData();
    this.setupEventListeners();
  }

  async pullBookData() {
    try {
      const book = await getBookDetails(this.bookId);
      this.currentBook = book;
      this.displayBookData(book);

      const author = book.volumeInfo?.authors?.[0];
      if (author) this.displayAuthorBooks(author);
      this.displaySimilarBooks(book);
    } catch (error) {
      console.error('Error pulling book data:', error);
    }
  }

  // Display Book Data
  displayBookData(book) {
    console.log("I am inside Display Book Data")
    console.log(book);
    console.log("Checking volumeInfo:", book.volumeInfo);
    console.log("Checking averageRating:", book.volumeInfo?.averageRating);
    console.log("Checking ratingsCount:", book.volumeInfo?.ratingsCount);

    const info = book.volumeInfo;
    const title = info?.title || 'Unknown Title';
    const authors = info?.authors?.join(', ') || 'Unknown Author';
    const authorId = info?.authorId || 'unknown';
    const thumbnail = info?.imageLinks?.thumbnail || '../images/no-cover.jpg';
    const snippet = info?.snippet || 'No description available.';
    const description = info?.description || 'No description available.';
    const pageCount = info?.pageCount || 'N/A';
    const publishedDate = info?.publishedDate || 'N/A';
    const displayIsbn = book.isbn ||
      info?.isbn ||
      info?.industryIdentifiers?.find(id => id.type.includes('ISBN'))?.identifier ||
      'N/A';
    const categories = info?.categories || info?.subjects || [];
    const averageRating = info?.averageRating || 0;
    const ratingsCount = info?.ratingsCount || 0;
    const stats = info?.stats || {};

    document.title = `ReadStart - ${title}`;
    qs('#book-cover').src = thumbnail;
    qs('#book-cover').alt = title;
    qs('#book-title').textContent = title;
    qs('#book-short-desc').textContent = snippet;
    qs('#book-author').textContent = authors;
    qs('#book-author').href = `author.html?id=${authorId}`;
    qs('#book-description').innerHTML = description;
    qs('#book-pages').textContent = `${pageCount} pages`;
    qs('#book-published').textContent = `Published: ${publishedDate}`;
    qs('#book-isbn').textContent = `ISBN: ${displayIsbn}`;
    qs('#book-rating-value').textContent = (parseFloat(averageRating) || 0).toFixed(2);
    qs('#book-rating-count').textContent = `(${ratingsCount} ratings)`;
    qs('#more-by-author-title').textContent = `More by ${authors.split(',')[0]}`;
    qs('#stat-want').textContent = stats.wantToRead || 0;
    qs('#stat-reading').textContent = stats.currentlyReading || 0;
    qs('#stat-read').textContent = stats.alreadyRead || 0;

    this.renderStars(averageRating);
    this.renderGenres(categories);
  }

  // Render Star Ratings
  renderStars(rating) {
    const fullStars = Math.floor(rating);
    const stars = Array.from({ length: 5 }, (_, i) => i < fullStars ? '★' : '☆').join('');
    qs('#book-stars').textContent = stars;
  }

  // Render Genres
  renderGenres(categories) {
    qs('#book-genres').innerHTML = categories
      .map(genre => `<span class="genre-tag">${genre}</span>`)
      .join('');
  }

  setupEventListeners() {
    qs('#back-btn').addEventListener('click', () => history.back());
    qs('#add-to-shelf-btn').addEventListener('click', () => this.showShelfSelection());
  }

  // Add to Shelf Option
  showShelfSelection() {
    const shelf = prompt('Select a shelf:\n1. Want to Read\n2. Currently Reading\n3. Finished\n\nEnter number:');
    const shelfMap = {
      '1': SHELF_TYPES.WANT_TO_READ,
      '2': SHELF_TYPES.CURRENTLY_READING,
      '3': SHELF_TYPES.FINISHED
    };

    if (shelfMap[shelf] && this.currentBook) {
      addBookToShelf(shelfMap[shelf], this.currentBook);
      alert('Book added to shelf!');
    }
  }

  // Display Books from the Same Author
  async displayAuthorBooks(author) {
    try {
      const books = await searchByField('author', author, 6);
      const filtered = books.filter(book => book.id !== this.bookId).slice(0, 5);
      renderBookCards(filtered, '#author-books-grid');
    } catch (error) {
      console.error('Error loading author books:', error);
    }
  }

  // Display Similar Books
  async displaySimilarBooks(book) {
    try {
      const subjects = book.volumeInfo?.subjects || [];
      const query = subjects[0] || book.volumeInfo?.categories?.[0] || 'Fiction';
      const books = await searchByField('subject', query, 6);
      const filtered = books.filter(b => b.id !== this.bookId).slice(0, 5);
      renderBookCards(filtered, '#similar-books-grid');
    } catch (error) {
      console.error('Error loading similar books:', error);
      const grid = qs('#similar-books-grid');
      if (grid) grid.innerHTML = '<p>No similar books found.</p>';
    }
  }
}

const bookDetail = new BookDetail();
bookDetail.init();