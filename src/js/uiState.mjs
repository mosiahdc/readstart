import { qs } from './utils.mjs';


export class UIStateManager {
  constructor(config = {}) {
    this.loadingSelector = config.loadingSelector || '#loading-state';
    this.resultsSelector = config.resultsSelector || '#results-grid';
    this.emptySelector = config.emptySelector || '#empty-state';
    this.errorSelector = config.errorSelector || '#error-state';
    this.errorMessageSelector = config.errorMessageSelector || '#error-message';
    this.emptyMessageSelector = config.emptyMessageSelector || '#empty-state p';
  }

  hideAll() {
    [this.loadingSelector, this.resultsSelector, this.emptySelector, this.errorSelector]
      .forEach(selector => qs(selector)?.classList.add('hidden'));
  }

  showLoading() {
    this.hideAll();
    qs(this.loadingSelector)?.classList.remove('hidden');
  }

  showResults() {
    this.hideAll();
    qs(this.resultsSelector)?.classList.remove('hidden');
  }

  showEmpty(message = 'No items found') {
    this.hideAll();
    const emptyState = qs(this.emptySelector);
    emptyState?.classList.remove('hidden');
    qs(this.emptyMessageSelector).textContent = message;
  }

  showError(message = 'Unable to load data. Please try again.') {
    this.hideAll();
    const errorState = qs(this.errorSelector);
    errorState?.classList.remove('hidden');
    qs(this.errorMessageSelector).textContent = message;
  }
}
