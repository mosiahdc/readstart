import { getLocalStorage, setLocalStorage } from "./utils.mjs";

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
const SEARCH_CACHE_KEY = 'book_search_cache';
const TRENDING_CACHE_KEY = 'trending_books_cache';
const DETAILS_CACHE_KEY = 'book_details_cache';

// Check If Cache Is Still Valid
function isCacheValid(timestamp) {
  return Date.now() - timestamp < CACHE_DURATION;
}

// 
//
// TRENDING BOOKS CACHE
//
//

export function cacheTrendingBooks(books) {
  const cacheData = { books, timestamp: Date.now() };
  setLocalStorage(TRENDING_CACHE_KEY, cacheData);
  console.log('💾 Cached trending books');
}

export function getCachedTrending() {
  const cached = getLocalStorage(TRENDING_CACHE_KEY);
  if (!cached || !isCacheValid(cached.timestamp)) {
    localStorage.removeItem(TRENDING_CACHE_KEY);
    return null;
  }
  return cached.books;
}


//
//
// SEARCH RESULTS CACHE
//
//

export function cacheSearchResults(query, books) {
  const cache = getSearchCache();
  cache.searches.unshift({
    query: query.toLowerCase(),
    books,
    timestamp: Date.now()
  });
  cache.searches = cache.searches.slice(0, 50);
  setLocalStorage(SEARCH_CACHE_KEY, cache);
  console.log(`💾 Cached search: "${query}"`);
}

export function getCachedSearch(query) {
  const cache = getSearchCache();
  const cached = cache.searches?.find(
    entry => entry.query === query.toLowerCase() && isCacheValid(entry.timestamp)
  );
  
  if (cached) {
    console.log(`✅ Using cached results for "${query}"`);
  }
  return cached?.books || null;
}

function getSearchCache() {
  return getLocalStorage(SEARCH_CACHE_KEY) || { searches: [] };
}


//
//
// BOOK DETAILS CACHE
//
//

export function cacheBookDetails(bookId, details) {
  const cache = getLocalStorage(DETAILS_CACHE_KEY) || {};
  cache[bookId] = {
    data: details,
    timestamp: Date.now()
  };
  setLocalStorage(DETAILS_CACHE_KEY, cache);
}

export function getCachedBookDetails(bookId) {
  const cache = getLocalStorage(DETAILS_CACHE_KEY) || {};
  const cached = cache[bookId];
  
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data;
  }
  
  return null;
}
