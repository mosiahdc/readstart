import { loadHeaderFooter, qs, getParam, withTimeout } from './utils.mjs';
import { getBookDetails, searchByField, getRelatedWorks } from './BookData.mjs';
import { showShelfSelectionModal } from './ShelfModal.mjs';
import { renderBookCards } from './bookCard.mjs';
import { isBookInAnyShelf, findBookShelf } from './shelves.mjs';
import { SHELF_TYPES } from './constants.mjs';

export default class BookDetail {
    constructor() {
        this.bookId = getParam('id');
        this.isbn = getParam('isbn');
        this.currentBook = null;
        this.authorBookIds = new Set();
    }


    //
    //
    // Initialization
    //
    //

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

            const isManual = book.source === 'Manual';

            if (!isManual) {
                const author = book.volumeInfo?.authors?.[0];
                const promises = [];

                if (author) {
                    promises.push(this.displayAuthorBooks(author));
                }
                promises.push(this.displaySimilarBooks(book));

                await Promise.all(promises);
            } else {
                const authorSection = document.querySelector('.more-by-author');
                const similarSection = document.querySelector('.similar-books');
                if (authorSection) authorSection.style.display = 'none';
                if (similarSection) similarSection.style.display = 'none';
            }
        } catch (error) {
            console.error('Error pulling book data:', error);
        }
    }


    //
    //
    // DISPLAY 
    //
    //

    // Display Book Data
    displayBookData(book) {

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
        const isManual = book.source === 'Manual';

        document.title = `ReadStart - ${title}`;
        qs('#book-cover').src = thumbnail;
        qs('#book-cover').alt = title;
        qs('#book-title').textContent = title;
        qs('#book-short-desc').textContent = snippet;
        qs('#book-author').textContent = authors;

        const authorLink = qs('#book-author');
        if (!isManual) {
            authorLink.href = `author.html?id=${authorId}`;
            authorLink.style.pointerEvents = 'auto';
            authorLink.style.cursor = 'pointer';
            authorLink.style.opacity = '1';
            authorLink.onclick = null;
        } else {
            authorLink.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
            authorLink.href = '#';
            authorLink.style.cursor = 'default';
            authorLink.style.opacity = '0.8';
            authorLink.style.color = 'inherit';
            authorLink.style.textDecoration = 'none';
            authorLink.style.pointerEvents = 'none';
        }

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

        if (isManual) {
            const communityStatsSection = document.querySelector('.community-stats');
            const ratingSection = document.querySelector('.book-rating');
            const publishedElement = qs('#book-published');
            const isbnElement = qs('#book-isbn');

            if (communityStatsSection) communityStatsSection.style.display = 'none';
            if (ratingSection) ratingSection.style.display = 'none';
            if (publishedElement) publishedElement.style.display = 'none';
            if (isbnElement) isbnElement.style.display = 'none';
        }

        this.renderStars(averageRating);
        this.renderGenres(categories);
        this.updateShelfButton();
    }

    // Display Books from the Same Author
    async displayAuthorBooks(author) {
        try {
            if (!author || typeof author !== 'string' || author.trim().length === 0) {
                this.showGridMessage('#author-books-grid', 'No author information available.');
                return;
            }

            const cleanedAuthor = author.trim().substring(0, 100);

            const books = await withTimeout(searchByField('author', cleanedAuthor, 6), 8000);

            const filtered = books
                .filter(book => book.id !== this.bookId)
                .slice(0, 5);

            if (filtered.length === 0) {
                this.showGridMessage('#author-books-grid', 'No other books by this author found.');
                return;
            }

            this.authorBookIds = new Set(filtered.map(b => b.id));
            renderBookCards(filtered, '#author-books-grid');
        } catch (error) {
            console.error('Error loading author books:', error);
            if (error.message.includes('timed out')) {
                this.showGridMessage('#author-books-grid', 'Author books took too long to load. Please try again.');
            } else {
                this.showGridMessage('#author-books-grid', 'Unable to load author books.');
            }
        }
    }

    // Display Similar Books (deduplicated from author books)
    async displaySimilarBooks(book) {
        try {
            const relatedBooks = await withTimeout(getRelatedWorks(this.bookId, 6), 8000);

            if (!relatedBooks || relatedBooks.length === 0) {
                this.showGridMessage('#similar-books-grid', 'No similar books found.');
                return;
            }

            const uniqueRelated = relatedBooks
                .filter(book => book.id !== this.bookId && !this.authorBookIds.has(book.id))
                .slice(0, 5);

            if (uniqueRelated.length === 0) {
                this.showGridMessage('#similar-books-grid', 'No similar books found.');
                return;
            }

            renderBookCards(uniqueRelated, '#similar-books-grid');
        } catch (error) {
            console.error('Error loading similar books:', error);
            if (error.message.includes('timed out')) {
                this.showGridMessage('#similar-books-grid', 'Similar books took too long to load. Please try again.');
            } else {
                this.showGridMessage('#similar-books-grid', 'Unable to load similar books.');
            }
        }
    }


    //
    //
    // SHELF  
    //
    //

    // Sync the Add to Shelf button with the current shelf state
    updateShelfButton() {
        const btn = qs('#add-to-shelf-btn');
        if (!btn || !this.currentBook) return;

        const shelfNames = {
            [SHELF_TYPES.WANT_TO_READ]: 'Queue',
            [SHELF_TYPES.CURRENTLY_READING]: 'Reading',
            [SHELF_TYPES.FINISHED]: 'Archive'
        };

        const isInShelf = isBookInAnyShelf(this.currentBook.id);
        const currentShelf = isInShelf ? findBookShelf(this.currentBook.id) : null;

        if (isInShelf && currentShelf) {
            btn.textContent = `In ${shelfNames[currentShelf]}`;
            btn.disabled = true;
            btn.classList.add('btn--disabled');
        } else {
            btn.textContent = '+ Add to Shelf';
            btn.disabled = false;
            btn.classList.remove('btn--disabled');
        }
    }

    // Add to Shelf Option - Now using modal
    async showShelfSelection() {
        if (this.currentBook) {
            const wasAdded = await showShelfSelectionModal(this.currentBook);
            if (wasAdded) {
                this.updateShelfButton();
            }
        } else {
            console.error('No book data available');
        }
    }


    //
    //
    // HELPERS  
    //
    //

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

    showGridMessage(selector, message) {
        const grid = qs(selector);
        if (grid) grid.innerHTML = `<p>${message}</p>`;
    }


    //
    //
    // EVENT LISTENERS  
    //
    //

    setupEventListeners() {
        qs('#back-btn').addEventListener('click', () => history.back());
        qs('#add-to-shelf-btn').addEventListener('click', () => this.showShelfSelection());
    }

}