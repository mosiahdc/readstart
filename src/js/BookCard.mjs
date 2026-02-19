import { qs } from './utils.mjs';
import { showShelfSelectionModal } from './ShelfModal.mjs';
import { isBookInAnyShelf, findBookShelf } from './shelves.mjs';
import { SHELF_TYPES } from './constants.mjs';

// Helper function to convert shelf key to readable name
function getReadableShelfName(shelfKey) {
  const shelfNames = {
    [SHELF_TYPES.WANT_TO_READ]: 'Queue',
    [SHELF_TYPES.CURRENTLY_READING]: 'Reading',
    [SHELF_TYPES.FINISHED]: 'Archive'
  };
  return shelfNames[shelfKey] || shelfKey;
}

export function bookCardTemplate(book) {
  const { volumeInfo = {}, id, authorId: topLevelAuthorId, source } = book;
  const {
    title = 'Unknown Title',
    author,
    authors,
    authorId: volumeInfoAuthorId,
    thumbnail: flatThumbnail,
    imageLinks
  } = volumeInfo;

  const authorId = topLevelAuthorId || volumeInfoAuthorId;
  const displayAuthor = author || authors?.[0] || 'Unknown Author';
  const thumbnail = flatThumbnail || imageLinks?.thumbnail || '../images/no-cover.jpg';

  const bookDetailLink = `book.html?id=${id}`;
  const authorDetailLink = `author.html?id=${authorId}`;

  const isInShelf = isBookInAnyShelf(id);
  const currentShelf = isInShelf ? findBookShelf(id) : null;
  const readableShelfName = currentShelf ? getReadableShelfName(currentShelf) : '';

  const buttonText = isInShelf ? `In ${readableShelfName}` : '+ Add to Shelf';
  const buttonDisabled = isInShelf ? 'disabled' : '';
  const buttonClass = isInShelf ? 'book-card__add-btn book-card__add-btn--disabled' : 'book-card__add-btn';

  const isManual = source === 'Manual';

  // ↓ CHANGE: resolved here so the template stays clean
  const authorDisplay = (!isManual && authorId && authorId !== 'unknown' && displayAuthor !== 'Unknown Author')
    ? `<a href="${authorDetailLink}">${displayAuthor}</a>`
    : `<span style="pointer-events: none; cursor: default; opacity: 0.8;">${displayAuthor}</span>`;

  return `
    <div class="book-card" data-id="${id}">
      <a href="${bookDetailLink}" class="book-card__image">
        <img src="${thumbnail}" 
             alt="${title}" 
             loading="lazy"
             onerror="this.src='../images/no-cover.jpg'">
      </a>
      <div class="book-card__info">
        <a href="${bookDetailLink}">
          <h3 class="book-card__title">${title}</h3>
        </a>
        <p class="book-card__author">${authorDisplay}</p>
      </div>
      <button class="${buttonClass}" data-book-id="${id}" ${buttonDisabled}>${buttonText}</button>
    </div>
  `;
}

export function renderBookCards(books, selector = '#results-grid') {
  const grid = qs(selector);
  if (!grid) {
    console.warn(`Grid element ${selector} not found`);
    return;
  }

  grid.innerHTML = books.map(bookCardTemplate).join('');
  setupAddToShelfListeners(books, grid);
}

function setupAddToShelfListeners(books, grid) {
  grid.querySelectorAll('.book-card__add-btn').forEach(button => {
    if (button.hasAttribute('disabled')) return;

    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const bookId = event.target.dataset.bookId;
      const book = books.find(b => b.id === bookId);

      if (book) {
        const wasAdded = await showShelfSelectionModal(book);

        if (wasAdded) {
          const cardElement = event.target.closest('.book-card');
          reRenderBookCard(book, cardElement);
          document.dispatchEvent(new CustomEvent('bookAddedToShelf', { detail: { book } }));
        }
      } else {
        console.error('Book not found:', bookId);
      }
    });
  });
}

// Helper function to re-render a single book card
function reRenderBookCard(book, cardElement) {
  if (!cardElement) return;

  const parser = document.createElement('div');
  parser.innerHTML = bookCardTemplate(book);
  cardElement.replaceWith(parser.firstElementChild);
}


