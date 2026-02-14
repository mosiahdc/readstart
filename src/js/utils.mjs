// wrapper for querySelector...returns matching element
export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}
// or a more concise version if you are into that sort of thing:
// export const qs = (selector, parent = document) => parent.querySelector(selector);

// retrieve data from localstorage
export function getLocalStorage(key) {
  return JSON.parse(localStorage.getItem(key));
}
// save data to local storage
export function setLocalStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
// set a listener for both touchend and click
export function setClick(selector, callback) {
  qs(selector).addEventListener("touchend", (event) => {
    event.preventDefault();
    callback();
  });
  qs(selector).addEventListener("click", callback);
}

export function getParam(param) {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const product = urlParams.get(param);
  return product
}


export function renderWithTemplate(template, parentElement, data, callback) {
  parentElement.innerHTML = template;
  if (callback) {
    callback(data);
  }
}

// This asynchronous function fetches the content of the HTML file given a path. The response to the fetch is converted to text and returns the HTML content as a string.
async function loadTemplate(path) {
  const fileContents = await fetch(path);
  const template = await fileContents.text();
  return template;
}

// Load the header and footer templates in from the partials using the loadTemplate.
// Grab the header and footer placeholder elements out of the DOM.
// Render the header and footer using renderWithTemplate.
export async function loadHeaderFooter() {
  const headerTemplate = await loadTemplate("../partials/header.html");
  const footerTemplate = await loadTemplate("../partials/footer.html");

  const headerElement = document.querySelector("#header");
  const footerElement = document.querySelector("#footer");

  renderWithTemplate(headerTemplate, headerElement);
  renderWithTemplate(footerTemplate, footerElement);

  handleHeaderShrink();
  handleHamburgerMenu();
}

// Shrink header
function handleHeaderShrink() {
  const header = document.querySelector('header');
  if (!header) return;

  let isShrunk = false;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;

    if (!isShrunk && scrollY > 120) {
      header.classList.add('shrink');
      isShrunk = true;
    } else if (isShrunk && scrollY < 70) {
      header.classList.remove('shrink');
      isShrunk = false;
    }
  }, { passive: true });
}

// Hamburger Menu for Mobile View
function handleHamburgerMenu() {
  const hamburgerBtn = document.querySelector('#hamburger-btn');
  const navMenu = document.querySelector('#nav-menu');
  const mobileOverlay = document.querySelector('.mobile-overlay');

  if (hamburgerBtn && navMenu) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      const isActive = !navMenu.classList.contains('active');

      // Toggle active class
      hamburgerBtn.classList.toggle('active', isActive);
      navMenu.classList.toggle('active', isActive);
      document.body.classList.toggle('no-scroll', isActive);

      // Update aria attributes
      hamburgerBtn.setAttribute('aria-label', isActive ? 'Close menu' : 'Open menu');
      hamburgerBtn.setAttribute('aria-expanded', isActive);
    });

    // Close menu when clicking on links
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a, .mobile-settings-btn');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        hamburgerBtn.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('no-scroll');
        hamburgerBtn.setAttribute('aria-label', 'Open menu');
        hamburgerBtn.setAttribute('aria-expanded', false);
      });
    });

    // Close menu when clicking overlay
    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => {
        hamburgerBtn.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('no-scroll');
        hamburgerBtn.setAttribute('aria-label', 'Open menu');
        hamburgerBtn.setAttribute('aria-expanded', false);
      });
    }

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        hamburgerBtn.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('no-scroll');
        hamburgerBtn.setAttribute('aria-label', 'Open menu');
        hamburgerBtn.setAttribute('aria-expanded', false);
      }
    });
  }
}