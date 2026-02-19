import '../css/index.css';
import '../css/home.css';
import { loadHeaderFooter } from "./utils.mjs";
import Homepage from "./homepage.mjs";

loadHeaderFooter();

// Initialize homepage
const homepage = new Homepage();
homepage.init();