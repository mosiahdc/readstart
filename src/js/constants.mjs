export const OPEN_LIBRARY_BASE_URL = 'https://openlibrary.org';
export const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
export const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;

export const SHELF_TYPES = {
  WANT_TO_READ: 'shelf_want_to_read',
  CURRENTLY_READING: 'shelf_currently_reading',
  FINISHED: 'shelf_finished'
};

export const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
export const TRENDING_CACHE_DURATION = 60 * 60 * 1000;  // 1 hour

export const TRENDING_CACHE_KEY = 'cache_trending_books';
export const SEARCH_CACHE_KEY = 'cache_book_searches';
export const DETAILS_CACHE_KEY = 'cache_book_details';
export const AUTHOR_INFO_CACHE_KEY = 'cache_author_info';

export const READING_GOAL_KEY = 'reading_goal';

export const BOOK_PROGRESS_KEY = 'book_progress';
export const WEEKLY_STATS_KEY = 'weekly_stats';