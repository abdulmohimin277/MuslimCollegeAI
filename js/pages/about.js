/* ============================================================
   PAGE: about — institution / leadership / campuses / contact
   ============================================================ */
'use strict';

function mountAboutPage(params) {
  params = params || {};
  const loggedIn = loadSession();

  const homeLink = $('#about-home-link');
  if (homeLink) homeLink.href = loggedIn ? '#/agent' : '#/login';

  // Scroll to the requested section (e.g. #/about#campuses).
  const anchor = params.anchor || 'about';
  requestAnimationFrame(() => {
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  fixLogoFallback();
}