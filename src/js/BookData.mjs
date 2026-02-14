import * as BookCache from './cache.mjs';
import * as Formatters from './formatters.mjs';
import * as Apis from './api.mjs';

// Get Trending Books With Caching
export async function getTrendingBooks(timeframe = 'weekly', maxResults = 80) {
  const cached = BookCache.getCachedTrending();
  if (cached) {
    console.log('✅ Using cached trending books');
    return cached;
  }

  const data = await Apis.fetchTrendingBooks(timeframe, maxResults);

  if (!data.works || data.works.length === 0) {
    console.log('No trending books found');
    return [];
  }

  const books = data.works.map(Formatters.normalizeBook);
  console.log(`✅ Got ${books.length} trending books`);

  BookCache.cacheTrendingBooks(books);
  return books;
}

// Search Books With Caching
export async function searchBooks(query, maxResults = 50) {
  const cached = BookCache.getCachedSearch(query);
  if (cached) {
    return cached;
  }

  const data = await Apis.fetchSearchBooks(query, maxResults);

  if (!data.docs || data.docs.length === 0) {
    console.log('No results found');
    return [];
  }

  const books = data.docs.map(Formatters.normalizeBook);
  console.log(`✅ Found ${books.length} books`);

  BookCache.cacheSearchResults(query, books);
  return books;
}

// Search By Specific Field
export async function searchByField(field, value, maxResults = 20) {
  const data = await Apis.fetchSearchByField(field, value, maxResults);

  if (!data.docs || data.docs.length === 0) {
    return [];
  }

  return data.docs.map(Formatters.normalizeBook);
}

// Get Detailed Book Information
export async function getBookDetails(bookId) {
  const cached = BookCache.getCachedBookDetails(bookId);
  if (cached) {
    console.log('✅ Using cached book details');
    return cached;
  }

  const bookData = await Apis.fetchWorkDetails(bookId);
  console.log("Checking bookData");
  console.log(bookData);
  const cover = await extractValidCover(bookId, bookData);
  console.log("Checking Valid Cover");
  console.log(cover);

  const { authors, authorId } = await getAuthors(bookData);
  const { isbn, publishDate, pageCount } = await getEditionData(bookId, bookData);
  // const ratings = await Apis.safeApiFetch(() => Apis.fetchBookRatings(bookId), { average: 0, count: 0 });
  // const stats = await Apis.safeApiFetch(() => Apis.fetchBookStats(bookId), {});
  const ratings = await Apis.safeApiFetch(() => Apis.fetchBookRatings(bookId), { average: 0, count: 0 });
  const stats = await Apis.safeApiFetch(() => Apis.fetchBookStats(bookId), {});
  console.log("Stats fetched:", stats);

  const formattedStats = formatStats(stats);
  console.log("Formatted Stats:", formattedStats);

  let description = Formatters.extractDescription(bookData);

  // Enrich with Google Books if needed
  if (!description || !publishDate || !pageCount) {
    const enriched = await enrichWithGoogleBooks(bookData.title, authors[0], {
      description,
      publishDate,
      pageCount
    });
    description = enriched.description;
  }

  const details = Formatters.buildBookDetails({
    bookId,
    isbn,
    bookData,
    cover,
    authors,
    authorId,
    description,
    publishDate,
    pageCount,
    ratings,
    stats: formattedStats
  });

  BookCache.cacheBookDetails(bookId, details);
  return details;
}

// Get Author Information
export async function getAuthorInfo(authorId) {
  const authorData = await Apis.fetchAuthorInfo(authorId);

  if (!authorData || authorData.error) {
    console.warn(`No author found for ID: ${authorId}`);
    return null;
  }

  return {
    name: authorData.name,
    bio: typeof authorData.bio === 'object'
      ? authorData.bio.value
      : (authorData.bio || 'No biography available.'),
    birthDate: authorData.birth_date || null,
    deathDate: authorData.death_date || null,
    photoUrl: authorData.photos?.[0] && authorData.photos[0] > 0
      ? `https://covers.openlibrary.org/a/id/${authorData.photos[0]}-L.jpg`
      : `https://covers.openlibrary.org/a/olid/${authorId}-L.jpg?default=false`,
    wikipediaUrl: authorData.wikipedia || null,
    key: authorData.key || `/authors/${authorId}`
  };
}

// Get Author's Books
export async function getAuthorBooks(authorId, limit = 50, offset = 0) {
  const [authorData, worksData] = await Promise.all([
    Apis.fetchAuthorInfo(authorId),
    Apis.fetchAuthorWorks(authorId, limit, offset)
  ]);

  const authorName = authorData.name || 'Unknown Author';
  const books = worksData.entries.map(work =>
    Formatters.formatAuthorBook(work, authorId, authorName)
  ).filter(book => book !== null);

  return {
    books,
    totalWorks: worksData.size || 0,
    currentCount: worksData.entries?.length || 0,
    offset,
    limit,
    hasNext: !!worksData.links?.next,
    hasPrev: offset > 0,
    nextOffset: worksData.links?.next ? offset + limit : null,
    prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
    links: worksData.links || {}
  };
}


//
//
// HELPERS
//
//

// Extract Valid Cover
async function extractValidCover(bookId, bookData) {
  const coverId = bookData.covers?.[0];
  if (coverId && coverId > 0) {
    return Formatters.buildCoverUrl(coverId, 'L');
  }

  if (bookData.cover_i && bookData.cover_i > 0) {
    return Formatters.buildCoverUrl(bookData.cover_i, 'L');
  }

  if (!bookData.cover_i) {
    const editionCoverData = await Apis.fetchEditionCover(bookId);
    if (editionCoverData > 0) {
      return Formatters.buildCoverUrl(editionCoverData.entries[0].covers[0], 'L');
    }

    return '../images/no-cover.jpg';
  }
}

// Get Authors From Book Data
async function getAuthors(bookData) {
  let authors = ['Unknown Author'];
  let authorId = 'unknown';

  if (bookData.authors && bookData.authors.length > 0) {
    try {
      const firstAuthorRef = bookData.authors[0];
      if (firstAuthorRef.author && firstAuthorRef.author.key) {
        const authorData = await Apis.fetchAuthorInfo(
          Formatters.cleanId(firstAuthorRef.author.key, '/authors/')
        );
        authors = [authorData.name || 'Unknown Author'];
        authorId = Formatters.cleanId(authorData?.key, '/authors/') || 'unknown';
      }
    } catch (e) {
      console.warn('Error fetching author name:', e);
    }
  }

  return { authors, authorId };
}

// Get Book Edition Data
async function getEditionData(bookId) {
  try {
    const editionsData = await Apis.fetchEditionData(bookId);

    const firstEdition = editionsData.entries?.[0];

    if (firstEdition) {
      return {
        isbn: firstEdition.isbn_13?.[0] || firstEdition.isbn_10?.[0] || null,
        publishDate: firstEdition.publish_date || null,
        pageCount: firstEdition.number_of_pages || null
      };
    }
  } catch (error) {
    console.warn('Could not fetch edition data:', error);
  }

  return { isbn: null, publishDate: null, pageCount: null };
}

// Enrich Book Data with Google Books Data
async function enrichWithGoogleBooks(title, author, currentData) {
  try {
    const googleData = await Apis.fetchGoogleBooks(title, author);

    if (!googleData.items || googleData.items.length === 0) {
      return currentData;
    }

    const matchingBook = googleData.items.find(item => {
      const info = item.volumeInfo;
      return info.title?.toLowerCase().trim() === title.toLowerCase().trim() &&
        info.authors?.[0]?.toLowerCase().trim() === author.toLowerCase().trim();
    });

    if (matchingBook) {
      const book = matchingBook.volumeInfo;
      return {
        description: currentData.description || book.description || null,
        publishDate: currentData.publishDate || book.publishedDate || null,
        pageCount: currentData.pageCount || book.pageCount || null
      };
    }
  } catch (error) {
    console.warn('Google Books enrichment failed:', error);
  }

  return currentData;
}

// Format Bookshelves Stats
function formatStats(stats) {
  return {
    wantToRead: stats.counts?.['want_to_read'] || 0,
    currentlyReading: stats.counts?.['currently_reading'] || 0,
    alreadyRead: stats.counts?.['already_read'] || 0
  };
}