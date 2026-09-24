/* ============================================================
   PAGE: about — public About / Privacy / Terms page
   ============================================================ */
'use strict';

function mountAboutPage(params) {
  params = params || {};
  const loggedIn = loadSession();

  const homeLink = $('#about-home-link');
  if (homeLink) homeLink.href = loggedIn ? '#/agent' : '#/login';

  // Scroll to the requested legal section (e.g. #/about/privacy).
  const anchor = params.anchor || 'about';
  requestAnimationFrame(() => {
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  fixLogoFallback();
}