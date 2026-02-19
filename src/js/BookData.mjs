import * as BookCache from './cache.mjs';
import * as Formatters from './formatters.mjs';
import * as Apis from './api.mjs';
import { SEARCH_CACHE_KEY, SHELF_TYPES } from './constants.mjs';
import { getLocalStorage } from './utils.mjs';
import { getBooksFromShelf } from './shelves.mjs';

const isGoogleBooksId = (id) => Boolean(id && !id.startsWith('OL'));
const hasNoDocs = (data) => !data.docs || data.docs.length === 0;

//
//
// UTILITIES
//
//

// Extract the trailing ID segment from an Open Library key path
function extractIdFromKey(key) {
  return key?.split('/').pop() ?? null;
}

// Normalize a raw Open Library work object into a minimal related-book shape
function normalizeRelatedWork(work) {
  const firstAuthor = work.authors?.[0];
  const authorId = firstAuthor?.key ? extractIdFromKey(firstAuthor.key) : 'unknown';

  return {
    id: extractIdFromKey(work.key),
    volumeInfo: {
      title: work.title,
      authors: work.authors?.map(a => a.name) ?? [],
      authorId,
      thumbnail: work.cover_id
        ? Formatters.buildCoverUrl(work.cover_id, 'M')
        : '../images/no-cover.jpg'
    }
  };
}

// Format bookshelf reading-status counts
function formatStats(stats) {
  return {
    wantToRead: stats.counts?.['want_to_read'] || 0,
    currentlyReading: stats.counts?.['currently_reading'] || 0,
    alreadyRead: stats.counts?.['already_read'] || 0
  };
}

// Try to find a book cover from cached search results
function getCoverFromSearchCache(bookId) {
  try {
    const searchCache = getLocalStorage(SEARCH_CACHE_KEY);

    if (!searchCache || !searchCache.searches) {
      return null;
    }

    const book = searchCache.searches
      .filter(e => Array.isArray(e.books))
      .flatMap(e => e.books)
      .find(b => b.id === bookId && b.volumeInfo?.thumbnail !== '../images/no-cover.jpg');

    if (book) {
      return book.volumeInfo.thumbnail;
    }
    return null;
  } catch (error) {
    console.warn('Error checking search cache for cover:', error);
    return null;
  }
}

//
//
// OPEN LIBRARY HELPERS
//
//

// Get Author Information from book data
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

// Calculate median page count across all editions (fallback when first edition has no page count)
async function getMedianPageCountFromEditions(bookId) {
  try {
    const editionsData = await Apis.fetchAllEditions(bookId);
    const entries = editionsData.entries || [];
    const pageCounts = entries
      .map(edition => edition.number_of_pages)
      .filter(count => typeof count === 'number' && count > 0)
      .sort((a, b) => a - b);

    if (pageCounts.length === 0) {
      console.warn('No page counts found across editions');
      return null;
    }

    const mid = Math.floor(pageCounts.length / 2);
    const median = pageCounts.length % 2 !== 0
      ? pageCounts[mid]
      : (pageCounts[mid - 1] + pageCounts[mid]) / 2;

    return Math.round(median);
  } catch (error) {
    console.warn('Could not calculate median page count:', error);
    return null;
  }
}

// Get Book Edition Data (ISBN, publish date, page count)
async function getEditionData(bookId) {
  try {
    const editionsData = await Apis.fetchEditionData(bookId);
    const firstEdition = editionsData.entries?.[0];

    if (firstEdition) {
      const isbn = firstEdition.isbn_13?.[0] || firstEdition.isbn_10?.[0] || null;
      const publishDate = firstEdition.publish_date || null;
      const pageCount = firstEdition.number_of_pages || await getMedianPageCountFromEditions(bookId);

      return { isbn, publishDate, pageCount };
    }
  } catch (error) {
    console.warn('Could not fetch edition data:', error);
  }

  return { isbn: null, publishDate: null, pageCount: null };
}

// Extract a valid cover URL from work data, falling back through editions,
async function extractValidCover(bookId, bookData) {
  const coverSources = [
    { id: bookData.covers?.[0], label: 'covers array' },
    { id: bookData.cover_i, label: 'cover_i' }
  ];
  for (const { id, label } of coverSources) {
    if (id > 0) {
      return Formatters.buildCoverUrl(id, 'L');
    }
  }

  try {
    const editionCoverData = await Apis.fetchEditionCover(bookId);

    if (editionCoverData?.entries && Array.isArray(editionCoverData.entries)) {

      const editionWithCover = editionCoverData.entries.find(e => e.covers?.[0] > 0);
      if (editionWithCover) {
        return Formatters.buildCoverUrl(editionWithCover.covers[0], 'L');
      }

    }
  } catch (error) {
    console.warn('Failed to fetch edition cover:', error);
  }

  return '../images/no-cover.jpg';
}

// Fetch books by subject/category from Open Library
async function getRelatedBySubject(subject, workId, maxResults) {
  const subjectBooks = await Apis.fetchBooksBySubject(subject, maxResults + 5);
  return (subjectBooks.works ?? [])
    .filter(work => work.key !== `/works/${workId}`)
    .slice(0, maxResults)
    .map(normalizeRelatedWork);
}


//
//
// GOOGLE BOOK HELPERS
//
//

// Fetch a text snippet for a book title from the Google Books search endpoint
async function resolveGoogleSnippet(title) {
  const data = await Apis.safeApiFetch(
    () => Apis.fetchGoogleBookSnippet(title),
    null
  );
  const raw = data?.items?.[0]?.searchInfo?.textSnippet;
  return raw ? Formatters.cleanHtmlText(raw) : null;
}

// Fetch Author ID from OL
async function resolveAuthorIdFromOpenLibrary(authorName) {
  try {
    const data = await Apis.safeApiFetch(
      () => Apis.fetchAuthorSearch(authorName),
      null
    );

    const firstResult = data?.docs?.[0];
    if (!firstResult) return null;

    const resultName = firstResult.name?.toLowerCase().trim();
    const searchName = authorName.toLowerCase().trim();
    if (!resultName?.includes(searchName) && !searchName.includes(resultName)) {
      console.warn(`⚠️ OL author name mismatch: searched "${authorName}", got "${firstResult.name}"`);
      return null;
    }

    return firstResult.key?.replace('/authors/', '') || null;
  } catch (error) {
    console.warn('Failed to resolve OL author ID:', error);
    return null;
  }
}

// Collect all author name variants from Open Library
async function collectAuthorNameVariants(author, authorId) {
  let authorNamesToTry = [author];
  if (authorId && authorId !== 'unknown') {
    try {
      const authorData = await Apis.fetchAuthorInfo(authorId);
      const alternativeNames = [
        authorData.personal_name,
        authorData.name,
        ...(authorData.alternate_names ?? [])
      ].filter(name => name && name !== author);

      authorNamesToTry = [...new Set([...alternativeNames, author])];
    } catch (e) {
      console.warn('Could not fetch author alternative names:', e);
    }
  }
  return authorNamesToTry;
}

// Search Google Books with multiple author name variants
async function searchGoogleBooksWithAuthorVariants(title, authorNamesToTry) {
  for (const authorNameToTry of authorNamesToTry) {
    const result = await Apis.fetchGoogleBooks(title, authorNameToTry);
    if (result.items && result.items.length > 0) {
      return result;
    }
  }
  return null;
}

// Find matching Google Books item by title, author, and optional publish date
function findGoogleBooksMatch(googleItems, title, authorNamesToTry, publishDate) {

  const matchesTitleAndAuthor = (item) => {
    const info = item.volumeInfo;
    const titleMatch = info.title?.toLowerCase().trim() === title.toLowerCase().trim();
    const googleAuthor = info.authors?.[0]?.toLowerCase().trim();
    return titleMatch && authorNamesToTry.some(name => googleAuthor === name.toLowerCase().trim());
  };

  let exactMatch = googleItems.find(item => {
    if (!matchesTitleAndAuthor(item)) return false;

    if (publishDate && item.volumeInfo.publishedDate) {
      const olYear = new Date(publishDate).getFullYear();
      const gbYear = new Date(item.volumeInfo.publishedDate).getFullYear();
      return Math.abs(olYear - gbYear) <= 2;
    }

    return true;
  });

  if (!exactMatch) {
    exactMatch = googleItems.find(item => matchesTitleAndAuthor(item));

    if (exactMatch) {
    }
  }

  return exactMatch || null;
}

// Extract and format description and snippet from Google Books item
function extractDescriptionAndSnippet(googleItem, currentData) {
  const book = googleItem.volumeInfo;
  const searchInfo = googleItem.searchInfo;

  let description = currentData.description;
  if (!description) {
    if (book.description) {
      description = Formatters.cleanHtmlText(book.description);
    } else if (searchInfo?.textSnippet) {
      description = Formatters.cleanHtmlText(searchInfo.textSnippet);
    } else {
      description = 'No description available.';
    }
  }

  let snippet = currentData.snippet;
  if (!snippet && searchInfo?.textSnippet) {
    snippet = Formatters.cleanHtmlText(searchInfo.textSnippet);
  }

  return { description, snippet };
}

// Enrich missing book fields (description, publishDate, pageCount) from Google Books
async function enrichWithGoogleBooks(title, author, authorId, currentData) {
  try {

    const authorNamesToTry = await collectAuthorNameVariants(author, authorId);
    const googleData = await searchGoogleBooksWithAuthorVariants(title, authorNamesToTry);

    if (!googleData?.items?.length) {
      return currentData;
    }

    const exactMatch = findGoogleBooksMatch(googleData.items, title, authorNamesToTry, currentData.publishDate);
    if (!exactMatch) {
      return currentData;
    }

    const book = exactMatch.volumeInfo;

    const enrichmentFields = [
      { gbField: 'description', olField: 'description', label: 'description' },
      { gbField: 'publishedDate', olField: 'publishDate', label: 'publish date' },
      { gbField: 'pageCount', olField: 'pageCount', label: 'page count' },
    ];

    const { description, snippet } = extractDescriptionAndSnippet(exactMatch, currentData);

    return {
      description,
      snippet: snippet || null,
      publishDate: currentData.publishDate || book.publishedDate || null,
      pageCount: currentData.pageCount || book.pageCount || null,
      categories: book.categories || []
    };
  } catch (error) {
    console.warn('Google Books enrichment failed:', error);
  }

  return currentData;
}


//
//
// BUILDER FUNCTIONS
//
//

// Fetch and build full book details from Open Library
async function getBookDetailsFromOpenLibrary(bookId) {
  const bookData = await Apis.fetchWorkDetails(bookId);

  let cover = await extractValidCover(bookId, bookData);

  if (cover === '../images/no-cover.jpg') {
    const cachedCover = getCoverFromSearchCache(bookId);
    if (cachedCover) {
      cover = cachedCover;
    }
  }

  const { authors, authorId } = await getAuthors(bookData);
  let { isbn, publishDate, pageCount } = await getEditionData(bookId, bookData);
  const ratings = await Apis.safeApiFetch(() => Apis.fetchBookRatings(bookId), { average: 0, count: 0 });
  const stats = await Apis.safeApiFetch(() => Apis.fetchBookStats(bookId), {});

  const formattedStats = formatStats(stats);

  let description = Formatters.extractDescription(bookData);

  let snippet = '';
  if (!description || !publishDate || !pageCount) {
    const enriched = await enrichWithGoogleBooks(bookData.title, authors[0], authorId, {
      description,
      publishDate,
      pageCount
    });
    ({ description, publishDate, pageCount, snippet } = enriched);

    if (enriched.categories?.length && !bookData.subjects?.length) {
      bookData.subjects = enriched.categories;
    }
  }

  const details = Formatters.buildBookDetails({
    bookId,
    isbn,
    bookData,
    cover,
    authors,
    authorId,
    description,
    snippet,
    publishDate,
    pageCount,
    ratings,
    stats: formattedStats
  });

  BookCache.cacheBookDetails(bookId, details);
  return details;
}

// Fetch and build full book details from Google Books
async function getBookDetailsFromGoogle(bookId) {
  const data = await Apis.safeApiFetch(
    () => Apis.fetchGoogleBookById(bookId),
    null
  );

  if (!data || data.error) {
    throw new Error(`Google Books fetch failed for ID: ${bookId}`);
  }

  const details = Formatters.normalizeGoogleBook(data);
  const authorName = details.volumeInfo.authors?.[0];

  const [snippet, olAuthorId] = await Promise.all([
    resolveGoogleSnippet(details.volumeInfo.title),
    authorName && authorName !== 'Unknown Author'
      ? resolveAuthorIdFromOpenLibrary(authorName)
      : Promise.resolve(null)
  ]);

  if (snippet) {
    details.volumeInfo.snippet = snippet;
  }

  if (olAuthorId) {
    details.authorId = olAuthorId;
    details.volumeInfo.authorId = olAuthorId;
  } else if (authorName) {
    console.warn(`⚠️ Could not resolve OL author ID for "${authorName}" — author page link will be unavailable`);
  }

  BookCache.cacheBookDetails(bookId, details);
  return details;
}


//
//
// WORKING FUNCTIONS
//
//

// Extract author ID from OpenLibrary work data (handles multiple data formats)
function extractAuthorIdFromWorkData(firstAuthor) {
  let authorId = firstAuthor.key
    ? extractIdFromKey(firstAuthor.key)
    : firstAuthor.author?.key
      ? extractIdFromKey(firstAuthor.author.key)
      : typeof firstAuthor === 'string'
        ? extractIdFromKey(firstAuthor)
        : null;

  if (!authorId) {
    console.warn('⚠️ Could not extract author ID from work data');
    console.warn('First author object:', JSON.stringify(firstAuthor, null, 2));
  }

  return authorId;
}

// Fetch Related Works By Same Author
async function fetchRelatedWorksByAuthor(authorId, workId, maxResults) {
  try {
    const authorWorks = await Apis.fetchAuthorWorks(authorId, maxResults + 1);

    if (authorWorks.works && authorWorks.works.length > 0) {
      const relatedBooks = authorWorks.works
        .filter(work => work.key !== `/works/${workId}`)
        .slice(0, maxResults)
        .map(work => {
          const normalized = normalizeRelatedWork(work);
          return {
            ...normalized,
            volumeInfo: { ...normalized.volumeInfo, authorId }
          };
        });

      return relatedBooks;
    }

    return null;
  } catch (error) {
    console.warn('Could not fetch author works:', error);
    return null;
  }
}

// Fetch Related Works By Same Open Library Subject
async function fetchRelatedWorksBySubjectFromOL(primarySubject, workId, maxResults) {
  try {
    const relatedBooks = await getRelatedBySubject(primarySubject, workId, maxResults);
    if (relatedBooks.length > 0) {
      return relatedBooks;
    }
    return null;
  } catch (error) {
    console.warn('Could not fetch subject-based similar books:', error);
    return null;
  }
}


async function getRelatedBooksFromCategories(categories, workId, maxResults) {
  if (!categories.length) return null;
  const primaryCategory = categories[0];
  const relatedBooks = await getRelatedBySubject(primaryCategory, workId, maxResults);
  return relatedBooks.length > 0 ? relatedBooks : null;
}

// Fetch Related Works By Google Books 
async function fetchRelatedWorksFromGoogleCategory(title, workId, maxResults) {
  try {
    const googleData = await Apis.fetchGoogleBooks(title, null);
    const categories = googleData.items?.[0]?.volumeInfo?.categories ?? [];

    // ↓ CHANGE — was 6 lines of extract + fetch + check, now one call
    const relatedBooks = await getRelatedBooksFromCategories(categories, workId, maxResults);
    if (relatedBooks) {
      return relatedBooks;
    }

    return null;
  } catch (error) {
    console.warn('Could not fetch similar books via Google Books categories:', error);
    return null;
  }
}


//
//
// PUBLIC API FUNCTIONS
//
//

// Get Trending Books With Caching
export async function getTrendingBooks(subject = 'all', maxResults = 80) {
  const cached = BookCache.getCachedTrending(subject);
  if (cached) {
    return cached;
  }

  const data = await Apis.fetchTrendingBooks(subject === 'all' ? null : subject, maxResults);

  if (hasNoDocs(data)) {
    return [];
  }

  const books = data.docs.map(Formatters.normalizeBook);

  BookCache.cacheTrendingBooks(books, subject);
  return books;
}

// Search Books With Caching and Google Books Fallback
export async function searchBooks(query, maxResults = 50) {
  const cached = BookCache.getCachedSearch(query);
  if (cached) return cached;

  const data = await Apis.fetchSearchBooks(query, maxResults);

  if (hasNoDocs(data)) {
    try {
      const googleData = await Apis.fetchGoogleBooks(query, maxResults);

      if (googleData.items && googleData.items.length > 0) {
        const books = googleData.items.map(Formatters.normalizeGoogleBook);
        BookCache.cacheSearchResults(query, books);
        return books;
      }

      return [];
    } catch (error) {
      console.error('Google Books fallback failed:', error);
      return [];
    }
  }

  const books = data.docs.map(Formatters.normalizeBook);

  BookCache.cacheSearchResults(query, books);
  return books;
}

// Search By Specific Field
export async function searchByField(field, value, maxResults = 20) {
  const data = await Apis.fetchSearchByField(field, value, maxResults);

  if (hasNoDocs(data)) return [];

  return data.docs.map(Formatters.normalizeBook);
}

// Get Detailed Book Information
// Routes to Open Library or Google Books based on ID format.
export async function getBookDetails(bookId) {
  const cached = BookCache.getCachedBookDetails(bookId);
  if (cached) {
    return cached;
  }

  if (bookId && bookId.startsWith('manual-')) {

    const manualBook = Object.values(SHELF_TYPES)
      .flatMap(shelf => getBooksFromShelf(shelf))
      .find(b => b.id === bookId);

    if (manualBook) {
      return manualBook;
    }

    console.warn('⚠️ Manual book not found in any shelf');
    throw new Error(`Manual book ${bookId} not found`);
  }

  if (isGoogleBooksId(bookId)) {
    return getBookDetailsFromGoogle(bookId);
  }

  return getBookDetailsFromOpenLibrary(bookId);
}

// Get Related Works from Open Library (Similar Books)
export async function getRelatedWorks(workId, maxResults = 5) {
  if (isGoogleBooksId(workId)) {
    try {
      const data = await Apis.safeApiFetch(
        () => Apis.fetchGoogleBookById(workId),
        null
      );

      if (!data || data.error) {
        console.warn('⚠️ Could not fetch Google Books data for related works');
        return [];
      }

      const categories = data.volumeInfo?.categories ?? [];

      const relatedBooks = await getRelatedBooksFromCategories(categories, '', maxResults);
      if (relatedBooks) {
        return relatedBooks;
      }

      return [];
    } catch (error) {
      console.error('Error fetching related works for Google Books ID:', error);
      return [];
    }
  }

  try {
    const workData = await Apis.fetchWorkDetails(workId);

    if (workData.authors && workData.authors.length > 0) {
      const firstAuthor = workData.authors[0];
      const authorId = extractAuthorIdFromWorkData(firstAuthor);

      if (authorId) {
        const relatedBooks = await fetchRelatedWorksByAuthor(authorId, workId, maxResults);
        if (relatedBooks) return relatedBooks;
      }
    }

    const primarySubject = workData.subjects?.[0];
    if (primarySubject) {
      const relatedBooks = await fetchRelatedWorksBySubjectFromOL(primarySubject, workId, maxResults);
      if (relatedBooks) return relatedBooks;
    }

    const relatedBooks = await fetchRelatedWorksFromGoogleCategory(workData.title, workId, maxResults);
    if (relatedBooks) return relatedBooks;

    return [];
  } catch (error) {
    console.error('Error fetching related works:', error);
    return [];
  }
}

// Get Author Information
export async function getAuthorInfo(authorId) {
  const cached = BookCache.getCachedAuthorInfo(authorId);
  if (cached) return cached;

  const authorData = await Apis.fetchAuthorInfo(authorId);

  if (!authorData || authorData.error) {
    console.warn(`No author found for ID: ${authorId}`);
    return null;
  }

  const hasPhoto = authorData.photos?.[0] > 0;
  const photoUrl = hasPhoto
    ? `https://covers.openlibrary.org/a/id/${authorData.photos[0]}-L.jpg`
    : '../images/no-photo.jpg';

  const NO_BIO = 'No biography available.';

  let bio = typeof authorData.bio === 'object'
    ? authorData.bio.value
    : (authorData.bio || null);

  if (!bio) {
    const googleBioData = await Apis.fetchAuthorBioFromGoogle(authorData.name);
    bio = googleBioData.bio || NO_BIO;
  }

  const authorInfo = {
    name: authorData.name,
    bio,
    birthDate: authorData.birth_date || 'Birthdate Unavailable',
    photoUrl,
    key: authorData.key || `/authors/${authorId}`
  };

  BookCache.cacheAuthorInfo(authorId, authorInfo);
  return authorInfo;
}

// Get Author's Books (paginated)
export async function getAuthorBooks(authorId, limit = 50, offset = 0, authorInfo = null) {
  let authorData = authorInfo;
  let worksData;

  if (authorInfo) {
    worksData = await Apis.fetchAuthorWorks(authorId, limit, offset);
  } else {
    [authorData, worksData] = await Promise.all([
      Apis.fetchAuthorInfo(authorId),
      Apis.fetchAuthorWorks(authorId, limit, offset)
    ]);
  }

  const authorName = authorData.name || 'Unknown Author';
  const books = worksData.entries
    .map(work => Formatters.formatAuthorBook(work, authorId, authorName))
    .filter(book => book !== null);

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