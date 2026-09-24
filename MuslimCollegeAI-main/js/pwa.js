/* ============================================================
   PWA — install as app + service worker registration
   ============================================================ */
'use strict';

function showInstallButton(show) {
  const btn = $('#install-btn');
  if (btn) btn.classList.toggle('hidden', !show);
}

async function installApp() {
  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    promptEvent.prompt();
    try {
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted') {
        toast('Installing Muslim College Study Agent...', 'success');
      } else {
        toast('Install cancelled.', '');
      }
    } catch (e) {
      toast('Could not start the install. Use the browser install icon in the address bar.', 'error');
    }
    return;
  }

  if (appInstalled || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) {
    toast('Muslim College Study Agent is already installed.', 'success');
    return;
  }

  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    toast('On iPhone / iPad: tap the Share button, then "Add to Home Screen".', '');
    return;
  }

  toast('Tap the install icon in the browser address bar, or Chrome menu → "Install app", to download it.', '');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallButton(true);
});

window.addEventListener('appinstalled', () => {
  appInstalled = true;
  deferredInstallPrompt = null;
  showInstallButton(false);
  toast('App installed successfully! You can now open it from your desktop or home screen.', 'success');
});