/**
 * API Fetch Operations
 * Centralized API calls to Open Library and Google Books
 */

const OPEN_LIBRARY_BASE_URL = 'https://openlibrary.org';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;

//
//
// Open Library Fetch
//
//

//Fetch with error handling
async function fetchFromAPI(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  return response.json();
}

// Fetch Trending Books
export async function fetchTrendingBooks(timeframe = 'weekly', limit = 80) {
  const url = `${OPEN_LIBRARY_BASE_URL}/trending/${timeframe}.json?limit=${limit}`;
  console.log(`📈 Fetching trending books`);
  return fetchFromAPI(url);
}

// Fetch Searched Book
export async function fetchSearchBooks(query, limit = 50) {
  const url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
  console.log(`🔍 Searching for: "${query}" - ${url}`);
  return fetchFromAPI(url);
}

// Search Book by Field
export async function fetchSearchByField(field, value, limit = 20) {
  const url = `${OPEN_LIBRARY_BASE_URL}/search.json?${field}=${encodeURIComponent(value)}&limit=${limit}`;
  console.log(`🔍 Searching ${field}: "${value}"`);
  return fetchFromAPI(url);
}

// Fetch Book Work Details
export async function fetchWorkDetails(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}.json`;
  console.log(`📖 Fetching work details: ${workId} - - ${url}`);
  return fetchFromAPI(url);
}

// Fetch Book Edition Data
export async function fetchEditionData(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}/editions.json?limit=1`;
  console.log(`Showing Edition: ${url}`)
  return fetchFromAPI(url);
}

// Fetch Book Ratings
export async function fetchBookRatings(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}/ratings.json`;
  return fetchFromAPI(url);
}

// Fetch Book Stats
export async function fetchBookStats(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}/bookshelves.json`;
  return fetchFromAPI(url);
}

// Fetch Edition Cover
export async function fetchEditionCover(editionId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${editionId}/editions.json`;
  console.log("I am inside Fetch Edition Cover");
  console.log(url);
  return fetchFromAPI(url);
}

// Fetch Author Info
export async function fetchAuthorInfo(authorId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/authors/${authorId}.json`;
  console.log(`👤 Fetching author: ${authorId} - ${url}`);
  return fetchFromAPI(url);
}

// Fetch Author Books
export async function fetchAuthorWorks(authorId, limit = 50, offset = 0) {
  const url = `${OPEN_LIBRARY_BASE_URL}/authors/${authorId}/works.json?limit=${limit}&offset=${offset}`;
  console.log(`📚 Fetching author works: ${authorId} (offset: ${offset}) - ${url}`);
  return fetchFromAPI(url);
}


//
//
// Google Book Fetch
//
//

// Fetch Google Book Data
export async function fetchGoogleBooks(title, author) {
  const query = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
  const url = `${GOOGLE_BOOKS_BASE_URL}?q=${query}&key=${GOOGLE_BOOKS_API_KEY}&maxResults=5`;
  console.log(`🔍 Google Books search: ${title} by ${author}`);
  return fetchFromAPI(url);
}


//
//
// HELPERS
//
//

export async function safeApiFetch(fetchFunction, fallbackValue = null) {
  try {
    return await fetchFunction();
  } catch (error) {
    console.error('API fetch failed:', error);
    return fallbackValue;
  }
}
