/* ============================================================
   SPA ROUTER — hash-based, no full page reloads between views.
   Routes:
     #/login          login screen
     #/agent          AI agent chat (+ ?new=1 / ?chat=<id>)
     #/tools          tools page
     #/settings       settings hub
     #/admin          admin panel
     #/debug          debug page
     #/about          about page (optional /about/<anchor>)
   The whole app lives in one index.html shell. The router shows
   the right .screen and runs the matching page mount so moving
   between pages feels instant (like a React SPA).
   ============================================================ */
'use strict';

const SPA = (() => {
  // Dashboard (logged-in) routes vs public routes.
  const DASHBOARD_ROUTES = ['agent', 'tools', 'settings', 'admin', 'debug'];
  const PUBLIC_ROUTES = ['login', 'about'];
  const DEFAULT_HEADING = {
    tools: 'Tools &amp; Settings',
    settings: 'Settings',
    admin: 'Admin Panel',
    debug: 'Debug &amp; Diagnostics',
  };

  /*
   * Parses location.hash into { route, params }.
   *   '#/agent?chat=c1abc'  -> { route:'agent', params:{ chat:'c1abc' } }
   *   '#/about/privacy'     -> { route:'about', params:{ anchor:'privacy' } }
   */
  function parse() {
    const hash = location.hash.replace(/^#\/?/, ''); // strip leading '#/'
    const [pathPart, queryPart] = hash.split('?');
    const segs = pathPart ? pathPart.split('/').filter(Boolean) : [];
    const route = segs[0] || '';
    const params = {};

    if (queryPart) {
      new URLSearchParams(queryPart).forEach((value, key) => {
        params[key] = value;
      });
    }
    if (segs.length > 1) params.anchor = segs.slice(1).join('/');

    return { route, params };
  }

  /*
   * Boot: pick the default route for a fresh visit.
   * A saved session goes straight to the agent; otherwise login.
   */
  function defaultRoute() {
    return loadSession() ? 'agent' : 'login';
  }

  /*
   * Route guard. Public/about pages load regardless of session.
   * Dashboard pages need a full session, else redirect to login.
   */
  function resolve(route) {
    if (DASHBOARD_ROUTES.indexOf(route) !== -1) {
      return loadSession() ? route : 'login';
    }
    if (PUBLIC_ROUTES.indexOf(route) !== -1) return route;
    return defaultRoute();
  }

  /*
   * Sets the shared panel-topbar heading + nav active state
   * for dashboard pages (agent has its own header instead).
   */
  function updateShellShell(route) {
    const topbar = document.getElementById('panel-topbar');
    if (topbar) topbar.classList.toggle('hidden', route === 'agent');

    const title = document.getElementById('panel-topbar-title');
    if (title && DEFAULT_HEADING[route]) title.innerHTML = DEFAULT_HEADING[route];

    setNavActive(route === 'about' ? 'about' : route === 'settings' ? 'settings' : '');
  }

  /*
   * Toggles visibility of the top-level screens, then calls the
   * per-route mount.
   */
  function render() {
    const { route, params } = parse();
    const target = resolve(route);

    if (route !== target) {
      // Guard bounced us to another route — update the hash cleanly.
      location.replace('#/' + target + buildQuery(params));
      return;
    }

    const login = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');
    const about = document.getElementById('view-about');

    const showLogin = target === 'login';
    const showDashboard = DASHBOARD_ROUTES.indexOf(target) !== -1;
    const showAbout = target === 'about';

    if (login) login.classList.toggle('hidden', !showLogin);
    if (dashboard) dashboard.classList.toggle('hidden', !showDashboard);
    if (about) about.classList.toggle('hidden', !showAbout);

    // Close any open mobile drawer when navigating.
    const shell = document.getElementById('app-shell');
    if (shell) shell.classList.remove('sidebar-open');
    $$('.sidebar-toggle').forEach((b) => b.setAttribute('aria-expanded', 'false'));

    if (showDashboard) {
      // Only the active tab-panel is visible inside the dashboard shell.
      DASHBOARD_ROUTES.forEach((name) => {
        const panel = document.getElementById('tab-' + name);
        if (panel) panel.classList.toggle('hidden', name !== target);
      });
      updateShellShell(target);
    } else if (showAbout) {
      setNavActive('about');
    }

    // Fire the route's render callback.
    const runner = RUNNERS[target];
    if (runner && typeof runner === 'function') runner(params);
    window.scrollTo(0, 0);
  }

  function buildQuery(params) {
    const keys = Object.keys(params || {}).filter((k) => k !== 'anchor');
    if (!keys.length) return '';
    return '?' + keys.map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  }

  /* Route render runners: named page mounts (declared in js/pages/*.js). */
  const RUNNERS = {
    login: (params) => mountLoginPage(params),
    agent: (params) => mountAgentPage(params),
    tools: (params) => mountToolsPage(params),
    settings: (params) => mountSettingsPage(params),
    admin: (params) => mountAdminPage(params),
    debug: (params) => mountDebugPage(params),
    about: (params) => mountAboutPage(params),
  };

  /*
   * Programmatic navigation: SPA.go('agent', { chat:'c1abc' }).
   */
  function go(route, params) {
    const p = { ...(params || {}) };
    delete p.anchor;
    const q = buildQuery(p);
    const target = '#/' + route + q;
    if (location.hash === target) {
      render();
    } else {
      location.hash = target;
    }
  }

  window.addEventListener('hashchange', render);

  // Start the SPA once the DOM is ready.
  function start() {
    render();
    registerServiceWorker();
  }

  return { go, render, start };
})();