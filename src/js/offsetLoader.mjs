
export class OffsetLoader {
  constructor(config = {}) {
    this.apiLimit = config.apiLimit || 50;  // Books per API call
    this.booksPerPage = config.booksPerPage || 10;  // Books per UI page
    this.totalWorks = 0;  // Total books available
    this.loadedCount = 0;  // Books loaded so far
    this.currentOffset = 0;  // Current API offset
    this.hasMoreToLoad = true;
    this.isLoading = false;
    this.onBooksLoaded = config.onBooksLoaded || (() => {});
    this.fetchFunction = config.fetchFunction;  // API fetch function
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
  async loadBatch(offset) {
    if (!this.fetchFunction) {
      throw new Error('Fetch function not configured');
    }

    const result = await this.fetchFunction(this.apiLimit, offset);
    
    this.currentOffset = result.nextOffset || offset + this.apiLimit;
    this.hasMoreToLoad = result.hasNext;
    this.loadedCount += result.books.length;
    
    return result.books;
  }

  // Loaded Multiple Batches To Reach Target Page
  async loadToPage(targetPage) {
    if (this.isLoading) {
      console.log('⏳ Already loading, please wait...');
      return [];
    }

    if (!this.needsLoadForPage(targetPage)) {
      console.log('✅ Already have enough books loaded');
      return [];
    }

    this.isLoading = true;
    const offsets = this.calculateOffsetsNeeded(targetPage);
    const allNewBooks = [];

    console.log(`📥 Loading ${offsets.length} batch(es) to reach page ${targetPage}`);

    try {
      for (const offset of offsets) {
        console.log(`📖 Loading offset ${offset}...`);
        const books = await this.loadBatch(offset);
        allNewBooks.push(...books);
        
        // Stop if no more books available
        if (!this.hasMoreToLoad) break;
      }

      console.log(`✅ Loaded ${allNewBooks.length} books. Total: ${this.loadedCount}/${this.totalWorks}`);
      
      // Callback with new books
      this.onBooksLoaded(allNewBooks);
      
      return allNewBooks;

    } catch (error) {
      console.error('❌ Error loading batches:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  // Load To Last Page
  async loadToLastPage() {
    const lastPage = this.getTotalPages();
    return await this.loadToPage(lastPage);
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
