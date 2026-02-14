import { loadHeaderFooter } from "./utils.mjs";
import AuthorPage from "./authorPage.mjs";

loadHeaderFooter();

const authorPage = new AuthorPage();
authorPage.init();
