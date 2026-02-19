import '../css/base.css';
import '../css/header-footer.css';
import '../css/style.css';
import '../css/home.css';
import '../css/large.css';
import { loadHeaderFooter } from "./utils.mjs";
import Homepage from "./homepage.mjs";

loadHeaderFooter();

// Initialize homepage
const homepage = new Homepage();
homepage.init();