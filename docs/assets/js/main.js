/**
 * Main JavaScript for GitHub Security Tools Documentation
 */

// Mobile Navigation Toggle
(function initMobileNav() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (!navToggle || !navMenu) return;

  navToggle.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', !isExpanded);
    navMenu.classList.toggle('active');
  });

  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    const isClickInsideNav = navToggle.contains(event.target) || navMenu.contains(event.target);
    if (!isClickInsideNav && navMenu.classList.contains('active')) {
      navToggle.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('active');
    }
  });

  // Close menu on escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navMenu.classList.contains('active')) {
      navToggle.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('active');
      navToggle.focus();
    }
  });
})();

// Smooth scroll for anchor links
(function initSmoothScroll() {
  const anchors = document.querySelectorAll('a[href^="#"]');
  for (const anchor of anchors) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });

        // Update URL without jumping
        history.pushState(null, '', href);

        // Focus management for accessibility
        target.setAttribute('tabindex', '-1');
        target.focus();
      }
    });
  }
})();

// Add copy button to code blocks
(function initCodeCopy() {
  const codeBlocks = document.querySelectorAll('pre code');

  for (const codeBlock of codeBlocks) {
    const pre = codeBlock.parentElement;
    if (!pre) continue;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    // Create copy button
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code to clipboard');

    // Style the button
    Object.assign(button.style, {
      position: 'absolute',
      top: '0.5rem',
      right: '0.5rem',
      padding: '0.25rem 0.75rem',
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#fff',
      background: 'rgba(102, 126, 234, 0.8)',
      border: 'none',
      borderRadius: '0.25rem',
      cursor: 'pointer',
      transition: 'all 0.2s',
    });

    button.addEventListener('click', async () => {
      const code = codeBlock.textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copied!';
        button.style.background = 'rgba(72, 187, 120, 0.8)';

        setTimeout(() => {
          button.textContent = 'Copy';
          button.style.background = 'rgba(102, 126, 234, 0.8)';
        }, 2000);
      } catch (err) {
        button.textContent = 'Failed';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      }
    });

    wrapper.appendChild(button);
  }
})();

// Add header anchor links visibility on hover
(function initHeaderAnchors() {
  const headers = document.querySelectorAll('.prose h2[id], .prose h3[id], .prose h4[id]');

  for (const header of headers) {
    header.style.position = 'relative';
    header.style.cursor = 'pointer';

    header.addEventListener('click', () => {
      const id = header.getAttribute('id');
      if (id) {
        window.location.hash = id;
      }
    });
  }
})();

console.log('GitHub Security Tools Documentation - Ready');
