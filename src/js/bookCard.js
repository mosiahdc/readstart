import { qs } from './utils.mjs';

export function bookCardTemplate(book) {
  const { volumeInfo = {}, id, isbn, authorId } = book;
  const {
    title = 'Unknown Title',
    author = 'Unknown Author',
    thumbnail = '../images/no-cover.jpg'
  } = volumeInfo;

  const bookDetailLink = isbn ? `book.html?id=${id}&isbn=${isbn}` : `book.html?id=${id}`;
  const authorDetailLink = `author.html?id=${authorId}`;

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
        <p class="book-card__author">
          <a href="${authorDetailLink}">${author}</a>
        </p>
      </div>
      <button class="book-card__add-btn" data-id="${id}">Add to Shelf</button>
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
  setupAddToShelfListeners();
}

function setupAddToShelfListeners() {
  document.querySelectorAll('.book-card__add-btn').forEach(button => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const bookId = event.target.dataset.id;
      console.log('Add to shelf clicked for book:', bookId);
    });
  });
}