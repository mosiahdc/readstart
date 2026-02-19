
export class OffsetLoader {
  constructor(config = {}) {
    this.apiLimit = config.apiLimit || 50;
    this.booksPerPage = config.booksPerPage || 10;
    this.totalWorks = 0;
    this.loadedCount = 0;
    this.currentOffset = 0;
    this.hasMoreToLoad = true;
    this.isLoading = false;
    this.onBooksLoaded = config.onBooksLoaded || (() => { });
    this.fetchFunction = config.fetchFunction;
  }

  // Calculate Total UI Pages Based On Total Works
  getTotalPages() {
    return Math.ceil(this.totalWorks / this.booksPerPage);
  }

  // Calculate How Many UI Pages Already Loaded
  getLoadedPages() {
    return Math.ceil(this.loadedCount / this.booksPerPage);
  }

  // Check If It Is Needed To Load More Data
  needsLoadForPage(targetPage) {
    const requiredBooks = targetPage * this.booksPerPage;
    return requiredBooks > this.loadedCount && this.hasMoreToLoad;
  }

  // Calculate Offsets Needed for Target Page
  calculateOffsetsNeeded(targetPage) {
    const requiredBooks = targetPage * this.booksPerPage;
    const booksToLoad = requiredBooks - this.loadedCount;
    const offsetCallsNeeded = Math.ceil(booksToLoad / this.apiLimit);

    const offsets = [];
    for (let i = 0; i < offsetCallsNeeded; i++) {
      offsets.push(this.currentOffset + (i * this.apiLimit));
    }

    return offsets;
  }

  // Load Single Batch with Specific Offset
  async loadBatch(offset, timeoutMs = 10000) {
    if (!this.fetchFunction) {
      throw new Error('Fetch function not configured');
    }

    try {
      // Wrap fetch with timeout protection
      const result = await Promise.race([
        this.fetchFunction(this.apiLimit, offset),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Book load timeout')), timeoutMs)
        )
      ]);

      this.currentOffset = result.nextOffset || offset + this.apiLimit;
      this.hasMoreToLoad = result.hasNext;
      this.loadedCount += result.books.length;

      return result.books;
    } catch (error) {
      if (error.message === 'Book load timeout') {
        console.error(`⏱️ Timeout loading books at offset ${offset}`);
      }
      throw error;
    }
  }

  // Loaded Multiple Batches To Reach Target Page
  async loadToPage(targetPage) {
    try {
      const batchesNeeded = Math.ceil((targetPage * this.booksPerPage - this.loadedCount) / this.apiLimit);

      for (let i = 0; i < batchesNeeded; i++) {
        if (!this.hasMoreToLoad) break;
        const books = await this.loadBatch(this.currentOffset);
        this.onBooksLoaded(books);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('❌ Error loading batches:', error);
      throw error;
    }
  }

  // Load To Last Page
  async loadToLastPage() {
    while (this.hasMoreToLoad) {
      const books = await this.loadBatch(this.currentOffset);
      this.onBooksLoaded(books);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Load Next
  async loadNext() {
    if (!this.hasMoreToLoad || this.isLoading) return [];

    this.isLoading = true;

    try {
      const books = await this.loadBatch(this.currentOffset);
      this.onBooksLoaded(books);
      return books;
    } finally {
      this.isLoading = false;
    }
  }

  init(initialData) {
    this.totalWorks = initialData.totalWorks;
    this.loadedCount = initialData.books.length;
    this.currentOffset = initialData.nextOffset || this.apiLimit;
    this.hasMoreToLoad = initialData.hasNext;
  }

  // Get Loading Progress Info
  getProgress() {
    return {
      loaded: this.loadedCount,
      total: this.totalWorks,
      percentage: Math.round((this.loadedCount / this.totalWorks) * 100),
      hasMore: this.hasMoreToLoad,
      isLoading: this.isLoading
    };
  }
}
