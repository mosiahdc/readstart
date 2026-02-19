import { getLocalStorage, setLocalStorage } from "./utils.mjs";
import * as Constants from './constants.mjs';

// Check If Cache Is Still Valid
function isCacheValid(timestamp) {
  return Date.now() - timestamp < Constants.CACHE_DURATION;
}

function isTrendingCacheValid(timestamp) {
  return Date.now() - timestamp < Constants.TRENDING_CACHE_DURATION;
}


// 
//
// TRENDING BOOKS CACHE
//
//


export function cacheTrendingBooks(books, subject = 'all') {
  const cache = getLocalStorage(Constants.TRENDING_CACHE_KEY) || {};
  cache[subject] = { books, timestamp: Date.now() };
  setLocalStorage(Constants.TRENDING_CACHE_KEY, cache);
}

export function getCachedTrending(subject = 'all') {
  const cache = getLocalStorage(Constants.TRENDING_CACHE_KEY) || {};
  const cached = cache[subject];
  if (!cached || !isTrendingCacheValid(cached.timestamp)) {
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
  setLocalStorage(Constants.SEARCH_CACHE_KEY, cache);
}

export function getCachedSearch(query) {
  const cache = getSearchCache();
  const cached = cache.searches?.find(
    entry => entry.query === query.toLowerCase() && isCacheValid(entry.timestamp)
  );

  return cached?.books || null;
}

function getSearchCache() {
  return getLocalStorage(Constants.SEARCH_CACHE_KEY) || { searches: [] };
}


//
//
// BOOK DETAILS CACHE
//
//

export function cacheBookDetails(bookId, details) {
  const cache = getLocalStorage(Constants.DETAILS_CACHE_KEY) || {};
  cache[bookId] = {
    data: details,
    timestamp: Date.now()
  };
  setLocalStorage(Constants.DETAILS_CACHE_KEY, cache);
}

export function getCachedBookDetails(bookId) {
  const cache = getLocalStorage(Constants.DETAILS_CACHE_KEY) || {};
  const cached = cache[bookId];

  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data;
  }

  return null;
}


//
//
// AUTHOR INFO CACHE
//
//

export function cacheAuthorInfo(authorId, authorInfo) {
  const cache = getLocalStorage(Constants.AUTHOR_INFO_CACHE_KEY) || {};
  cache[authorId] = {
    data: authorInfo,
    timestamp: Date.now()
  };
  setLocalStorage(Constants.AUTHOR_INFO_CACHE_KEY, cache);
}

export function getCachedAuthorInfo(authorId) {
  const cache = getLocalStorage(Constants.AUTHOR_INFO_CACHE_KEY) || {};
  const cached = cache[authorId];

  if (cached && isCacheValid(cached.timestamp)) {
    return cached.data;
  }

  return null;
}
