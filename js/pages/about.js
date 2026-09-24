/* ============================================================
   PAGE: about — institution / leadership / campuses / contact
   ============================================================ */
'use strict';

function mountAboutPage(params) {
  params = params || {};
  const loggedIn = loadSession();

  const homeLink = $('#about-home-link');
  if (homeLink) homeLink.href = loggedIn ? '#/agent' : '#/login';

  // Enable the scroll-reveal animation layer (CSS hides .reveal
  // elements only while #view-about has the .js-anim class, so the
  // page stays readable even if scripting is disabled).
  const view = document.getElementById('view-about');
  if (view) view.classList.add('js-anim');

  fixLogoFallback();

  // Scroll to the requested section (e.g. #/about#campuses).
  const anchor = params.anchor || 'about';
  requestAnimationFrame(() => {
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Smooth reveal-on-scroll for cards & sections.
  const revealEls = view ? view.querySelectorAll('.reveal') : [];
  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!revealEls.length || reduceMotion || !('IntersectionObserver' in window)) {
    // No animation needed (or not supported) — show everything.
    const all = view ? view.querySelectorAll('.reveal') : [];
    for (let i = 0; i < all.length; i++) all[i].classList.add('in-view');
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach((el) => io.observe(el));
}