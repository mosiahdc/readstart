import { OPEN_LIBRARY_BASE_URL, GOOGLE_BOOKS_BASE_URL, GOOGLE_BOOKS_API_KEY } from './constants.mjs';

//
//
// HELPERS
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

export async function safeApiFetch(fetchFunction, fallbackValue = null, timeoutMs = 10000) {
  try {
    // Wrap fetch with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`API request timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return await Promise.race([fetchFunction(), timeoutPromise]);
  } catch (error) {
    console.error('API fetch failed:', error);
    return fallbackValue;
  }
}

//
//
// Open Library Fetch
//
//

// Fetch Weekly Trending Books
async function fetchWeeklyTrending(limit) {
  const url = `${OPEN_LIBRARY_BASE_URL}/trending/weekly.json?limit=${limit}`;
  const weeklyData = await fetchFromAPI(url);
  return { docs: weeklyData.works || [] };
}

// fetch Trending Books (with fallback to weekly trending if subject search fails)
export async function fetchTrendingBooks(subject = null, limit = 80) {
  try {
    // If no subject, use the trending/weekly endpoint
    if (!subject) {
      return await fetchWeeklyTrending(limit);
    }

    // If subject is specified, use search API
    const url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=${encodeURIComponent(`subject:${subject}`)}&sort=trending&limit=${limit}`;

    return await fetchFromAPI(url);

  } catch (error) {
    console.error("API Fetch failed. Attempting fallback to static trending...");
    return await fetchWeeklyTrending(limit);
  }
}

// Fetch Searched Book
export async function fetchSearchBooks(query, limit = 50) {
  const url = `${OPEN_LIBRARY_BASE_URL}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
  return fetchFromAPI(url);
}

// Search Book by Field
export async function fetchSearchByField(field, value, limit = 20) {
  const url = `${OPEN_LIBRARY_BASE_URL}/search.json?${field}=${encodeURIComponent(value)}&limit=${limit}`;
  return fetchFromAPI(url);
}

// Fetch Books by Subject (no CORS issues)
export async function fetchBooksBySubject(subject, limit = 6) {
  const url = `${OPEN_LIBRARY_BASE_URL}/subjects/${encodeURIComponent(subject.toLowerCase())}.json?limit=${limit}`;
  return fetchFromAPI(url);
}

// Fetch Book Work Details
export async function fetchWorkDetails(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}.json`;
  return fetchFromAPI(url);
}

// Fetch Book Edition Data
export async function fetchEditionData(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}/editions.json?limit=1`;
  return fetchFromAPI(url);
}

// Fetch All Book Editions (for median page count fallback)
export async function fetchAllEditions(workId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/works/${workId}/editions.json?limit=50`;
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
  return fetchFromAPI(url);
}

// Fetch Author Info
export async function fetchAuthorInfo(authorId) {
  const url = `${OPEN_LIBRARY_BASE_URL}/authors/${authorId}.json`;
  return fetchFromAPI(url);
}

// Fetch Author Books
export async function fetchAuthorWorks(authorId, limit = 50, offset = 0) {
  const url = `${OPEN_LIBRARY_BASE_URL}/authors/${authorId}/works.json?limit=${limit}&offset=${offset}`;
  return fetchFromAPI(url);
}

export async function fetchAuthorSearch(authorName) {
  const url = `${OPEN_LIBRARY_BASE_URL}/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
  return fetchFromAPI(url);
}


//
//
// Google Book Fetch
//
//

export async function fetchGoogleBooks(title, author) {
  const titleQuery = `intitle:${encodeURIComponent(title)}`;
  const authorQuery = author ? `+inauthor:${encodeURIComponent(author)}` : '';
  const url = `${GOOGLE_BOOKS_BASE_URL}?q=${titleQuery}${authorQuery}&key=${GOOGLE_BOOKS_API_KEY}&maxResults=5`;

  let result = await fetchFromAPI(url);

  // Fallback: retry with title only if no results
  if (!result?.totalItems && author) {
    const fallbackUrl = `${GOOGLE_BOOKS_BASE_URL}?q=${titleQuery}&key=${GOOGLE_BOOKS_API_KEY}&maxResults=5`;
    result = await fetchFromAPI(fallbackUrl);
  }

  return result;
}

// Fetch Author Bio from Google Books (Fallback)
export async function fetchAuthorBioFromGoogle(authorName) {
  try {
    const query = `inauthor:${encodeURIComponent(authorName)}`;
    const url = `${GOOGLE_BOOKS_BASE_URL}?q=${query}&key=${GOOGLE_BOOKS_API_KEY}&maxResults=10`;
    const result = await fetchFromAPI(url);

    if (result.items && result.items.length > 0) {
      // Try to extract author info from the first book
      const book = result.items[0];
      const volumeInfo = book.volumeInfo || {};

      return {
        bio: volumeInfo.description || null,
        authors: volumeInfo.authors || [authorName]
      };
    }
    return { bio: null, authors: [authorName] };
  } catch (error) {
    console.warn('Failed to fetch author bio from Google Books:', error);
    return { bio: null, authors: [authorName] };
  }
}

export async function fetchGoogleBookSnippet(title) {
  const url = `${GOOGLE_BOOKS_BASE_URL}?q=intitle:${encodeURIComponent(title)}&key=${GOOGLE_BOOKS_API_KEY}&maxResults=1`;
  return fetchFromAPI(url);
}

export async function fetchGoogleBookById(bookId) {
  const url = `${GOOGLE_BOOKS_BASE_URL}/${bookId}?key=${GOOGLE_BOOKS_API_KEY}`;
  return fetchFromAPI(url);
}