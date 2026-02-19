import '../css/index.css';
import '../css/author.css';
import { loadHeaderFooter } from './utils.mjs';
import AuthorPage from './AuthorPage.mjs';

loadHeaderFooter();

const authorPage = new AuthorPage();
authorPage.init();
