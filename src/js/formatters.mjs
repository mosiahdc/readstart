
//
// ID UTILITIES
//

// Extract And Clean Ids from Open Library
export function cleanId(key, prefix = '/works/') {
  return key?.replace(prefix, '').replace('/books/', '') || 'unknown';
}

// Clean HTML Entities And Tags from Text
export function cleanHtmlText(text) {
  if (!text) return '';

  return text
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

// Remove Title Prefix From Snippet
export function removeTitlePrefix(text, title) {
  if (!text || !title) return text;

  const titleEscaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleRegex = new RegExp(`^${titleEscaped}\\s*`, 'gi');
  return text.replace(titleRegex, '');
}


//
// COVER UTILITIES
//

// Extract Valid Cover ID
export function extractCoverId(work) {
  const coverId = work.covers?.[0] || work.cover_i;
  return coverId && coverId > 0 ? coverId : null;
}

// Build Cover Image URL
export function buildCoverUrl(coverId, size = 'M') {
  if (!coverId || coverId <= 0) {
    return '../images/no-cover.jpg';
  }
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}


//
// DATA EXTRACTORS
//

// Extract ISBN From Various Formats
export function extractISBN(work) {
  if (work.isbn) {
    return Array.isArray(work.isbn) ? work.isbn[0] : work.isbn;
  }
  return null;
}

// Extract Descriptions
export function extractDescription(data) {
  if (!data.description) return '';

  if (typeof data.description === 'string') {
    return data.description;
  }

  if (data.description.value) {
    return data.description.value;
  }

  return '';
}


//
// FORMATTERS
//

// Format And Clean Snippet Text
export function formatSnippet(rawSnippet, title) {
  if (!rawSnippet) return null;

  const cleaned = cleanHtmlText(rawSnippet);
  return removeTitlePrefix(cleaned, title);
}


//
// NORMALIZERS
//

// Normalize Open Library Word Data (Trending and Search Book Results)
export function normalizeBook(work) {
  const isbn = extractISBN(work);
  const id = cleanId(work.key) || work.cover_edition_key || 'unknown';
  const authorId = cleanId(
    work.authors?.[0]?.author?.key || work.author_key?.[0],
    '/authors/'
  );
  const coverId = extractCoverId(work);

  return {
    source: 'openlibrary',
    id,
    authorId,
    isbn,
    volumeInfo: {
      title: work.title || 'Unknown Title',
      author: work.author_name?.[0] || 'Unknown Author',
      thumbnail: buildCoverUrl(coverId),
      categories: work.subjects?.slice(0, 3) || []
    }
  };
}

// Normalize Google Books Search Results (Fallback)
export function normalizeGoogleBook(book) {
  const info = book.volumeInfo || {};
  const id = book.id || 'unknown';

  const authors = Array.isArray(info.authors)
    ? info.authors
    : [info.authors || 'Unknown Author'];

  const thumbnail = info.imageLinks?.thumbnail
    ?.replace('http://', 'https://')
    || '../images/no-cover.jpg';

  const isbn = info.industryIdentifiers?.find(
    i => i.type === 'ISBN_13' || i.type === 'ISBN_10'
  )?.identifier || null;

  const description = info.description || '';

  return {
    source: 'google',
    id,
    isbn,
    authorId: 'unknown',
    volumeInfo: {
      title: info.title || 'Unknown Title',
      authors,
      authorId: 'unknown',
      imageLinks: { thumbnail },
      description: description,
      snippet: description ? description.substring(0, 200) + '...' : '',
      publishedDate: info.publishedDate || 'Unknown',
      pageCount: info.pageCount || null,
      subjects: info.categories || [],
      categories: info.categories?.slice(0, 5) || [],
      averageRating: info.averageRating || 0,
      ratingsCount: info.ratingsCount || 0,
      stats: {
        wantToRead: 0,
        currentlyReading: 0,
        alreadyRead: 0
      }
    }
  };
}


// Normalize Book Data From Book Detail Page (For Adding To Shelf)
export function normalizeProcessedBook(book) {
  const description = book.volumeInfo?.description || 'No description available.';
  const snippet = book.volumeInfo?.snippet || (description ? description.substring(0, 200) + (description.length > 200 ? '...' : '') : 'No description available.');

  return {
    source: 'openlibrary',
    id: book.id,
    authorId: book.volumeInfo?.authorId || 'unknown',
    isbn: book.isbn || null,
    volumeInfo: {
      title: book.volumeInfo?.title || 'Unknown Title',
      author: Array.isArray(book.volumeInfo?.authors)
        ? book.volumeInfo.authors[0]
        : book.volumeInfo?.author || 'Unknown Author',
      thumbnail: book.volumeInfo?.imageLinks?.thumbnail || book.volumeInfo?.thumbnail || '../images/no-cover.jpg',
      description: description,
      snippet: snippet,
      pageCount: book.volumeInfo?.pageCount || null,
      categories: book.volumeInfo?.categories?.slice(0, 3) || []
    }
  };
}


//
// BUILDERS
//

// Format Author Book
export function formatAuthorBook(work, authorId, authorName) {
  const coverId = extractCoverId(work);
  const id = cleanId(work.key);
  const description = extractDescription(work);
  const publishYear = work.first_publish_date || work.first_publish_year || '';

  return {
    id,
    authorId,
    isbn: null,
    volumeInfo: {
      title: work.title || 'Unknown Title',
      author: authorName,
      thumbnail: buildCoverUrl(coverId),
      description,
      publishedDate: publishYear.toString(),
      pageCount: work.number_of_pages || null,
      categories: work.subjects?.slice(0, 3) || [],
      averageRating: work.ratings_average || 0,
      ratingsCount: work.ratings_count || 0,
      language: work.languages?.[0]?.key?.replace('/languages/', '') || 'en'
    },
    workKey: work.key,
    coverId
  };
}

// Build Complete Book Details Object
export function buildBookDetails(data) {
  const {
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
    stats
  } = data;

  return {
    id: bookId,
    isbn,
    volumeInfo: {
      title: bookData.title || 'Unknown Title',
      authors: authors,
      authorId: authorId,
      imageLinks: { thumbnail: cover },
      description: description || 'No description available.',
      snippet: snippet || description?.substring(0, 200) + '...' || 'No description available.',
      publishedDate: publishDate || 'Unknown',
      pageCount: pageCount || null,
      subjects: bookData.subjects || [],
      categories: bookData.subjects?.slice(0, 5) || [],
      averageRating: ratings?.summary?.average ? parseFloat(ratings.summary.average) : 0,
      ratingsCount: ratings?.summary?.count ? parseInt(ratings.summary.count) : 0,
      stats: stats || { wantToRead: 0, currentlyReading: 0, alreadyRead: 0 }
    }
  };
}