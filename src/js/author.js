import '../css/base.css';
import '../css/header-footer.css';
import '../css/style.css';
import '../css/author.css';
import '../css/large.css';
import { loadHeaderFooter } from './utils.mjs';
import AuthorPage from './AuthorPage.mjs';

loadHeaderFooter();

const authorPage = new AuthorPage();
authorPage.init();
