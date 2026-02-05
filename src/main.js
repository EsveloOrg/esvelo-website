/**
 * Esvelo Website - Main JavaScript
 * Minimal JS for essential interactivity
 */

// DOM Elements
const menuToggle = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

// Mobile menu toggle
if (menuToggle && mobileMenu) {
  menuToggle.addEventListener('click', () => {
    menuToggle.classList.toggle('active');
    mobileMenu.classList.toggle('open');
  });

  // Close mobile menu when clicking a link
  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      menuToggle.classList.remove('active');
      mobileMenu.classList.remove('open');
    });
  });
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const headerOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// Console easter egg
console.log('%c🚀 Esvelo', 'font-size: 24px; font-weight: bold; color: #fff;');
console.log('%cGlobal AI Revolution - Made in Poland', 'font-size: 14px; color: #888;');
