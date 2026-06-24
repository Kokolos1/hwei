(function () {
  'use strict';

  var CONFIG_URL = '/api/posthog-config';
  var SECTION_SELECTOR = [
    'main > section[id]',
    'section[id]',
    '.mg-section[id]',
    '[id$="-sec"]',
    '[id^="sec-"]',
    '[data-analytics-section]'
  ].join(',');
  var FLUSH_INTERVAL_MS = 15000;
  var MIN_SECTION_SECONDS = 1;
  var visibleSections = new Map();
  var trackedSections = new Map();
  var posthogReady = false;

  function debug(message, detail) {
    try {
      if (window.localStorage && window.localStorage.getItem('hweiAnalyticsDebug') === '1') {
        console.debug('[Hwei analytics]', message, detail || '');
      }
    } catch (error) {
      // Some privacy settings block localStorage access.
    }
  }

  function sanitizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function currentPageProps() {
    return {
      page_path: window.location.pathname,
      page_title: document.title || ''
    };
  }

  function assetHost(apiHost) {
    return String(apiHost || 'https://us.i.posthog.com').replace('.i.posthog.com', '-assets.i.posthog.com');
  }

  function loadPostHog(config) {
    return new Promise(function (resolve, reject) {
      if (window.posthog && typeof window.posthog.init === 'function') {
        resolve();
        return;
      }

      var posthog = window.posthog = window.posthog || [];
      if (!posthog.__SV) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.src = assetHost(config.host) + '/static/array.js';
        script.onload = resolve;
        script.onerror = reject;
        var firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode.insertBefore(script, firstScript);

        var methods = [
          'capture',
          'identify',
          'reset',
          'init',
          'onFeatureFlags',
          'reloadFeatureFlags',
          'getFeatureFlag',
          'isFeatureEnabled'
        ];

        posthog._i = [];
        posthog.init = function (token, options, name) {
          function call(methodName) {
            var namedQueue = name ? posthog[name] : posthog;
            return function () {
              namedQueue.push([methodName].concat(Array.prototype.slice.call(arguments, 0)));
            };
          }

          var queue = posthog;
          if (name) {
            queue = posthog[name] = [];
          }

          queue.people = queue.people || [];
          methods.forEach(function (methodName) {
            queue[methodName] = call(methodName);
          });
          queue.people.set = call('people.set');
          queue.people.set_once = call('people.set_once');
          posthog._i.push([token, options, name]);
        };
        posthog.__SV = 1;
      }

      resolve();
    });
  }

  function capture(eventName, properties) {
    if (!posthogReady || !window.posthog || typeof window.posthog.capture !== 'function') return;
    window.posthog.capture(eventName, Object.assign(currentPageProps(), properties || {}));
  }

  function sectionLabel(element) {
    var explicitLabel = element.getAttribute('data-analytics-section');
    if (explicitLabel) return sanitizeText(explicitLabel);

    var heading = element.querySelector('h1, h2, h3, .section-title, .mg-section-title');
    if (heading) return sanitizeText(heading.textContent);

    return sanitizeText(element.id);
  }

  function collectSections() {
    Array.prototype.forEach.call(document.querySelectorAll(SECTION_SELECTOR), function (element) {
      if (!element.id || trackedSections.has(element.id)) return;
      trackedSections.set(element.id, {
        id: element.id,
        name: sectionLabel(element),
        totalMs: 0
      });
    });
  }

  function flushVisibleTime(now) {
    visibleSections.forEach(function (startedAt, sectionId) {
      var section = trackedSections.get(sectionId);
      if (!section) return;
      section.totalMs += Math.max(0, now - startedAt);
      visibleSections.set(sectionId, now);
    });
  }

  function sendSectionTimes(finalFlush) {
    var now = Date.now();
    flushVisibleTime(now);

    trackedSections.forEach(function (section) {
      if (section.totalMs < MIN_SECTION_SECONDS * 1000 && !finalFlush) return;

      var durationSeconds = Math.round(section.totalMs / 100) / 10;
      if (durationSeconds < MIN_SECTION_SECONDS) return;

      capture('guide_section_time_spent', {
        section_id: section.id,
        section_name: section.name,
        duration_seconds: durationSeconds,
        final: Boolean(finalFlush)
      });
      section.totalMs = 0;
    });
  }

  function startSectionTracking() {
    collectSections();
    if (!trackedSections.size || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      var now = Date.now();
      entries.forEach(function (entry) {
        var sectionId = entry.target.id;
        if (!sectionId) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          if (!visibleSections.has(sectionId)) visibleSections.set(sectionId, now);
        } else if (visibleSections.has(sectionId)) {
          var section = trackedSections.get(sectionId);
          if (section) section.totalMs += Math.max(0, now - visibleSections.get(sectionId));
          visibleSections.delete(sectionId);
        }
      });
    }, { threshold: [0, 0.35, 0.6] });

    trackedSections.forEach(function (section) {
      var element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    window.setInterval(function () {
      sendSectionTimes(false);
    }, FLUSH_INTERVAL_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') sendSectionTimes(true);
    });
    window.addEventListener('pagehide', function () {
      sendSectionTimes(true);
    });
    window.addEventListener('beforeunload', function () {
      sendSectionTimes(true);
    });
  }

  function trackClicks() {
    document.addEventListener('click', function (event) {
      var buyButton = event.target.closest('#buy-lifetime-access');
      if (buyButton) {
        capture('guide_cta_clicked', { action: 'buy_lifetime_access' });
        return;
      }

      var magicButton = event.target.closest('#magic-login-submit');
      if (magicButton) {
        capture('guide_cta_clicked', { action: 'email_magic_link' });
        return;
      }

      var patreonLink = event.target.closest('a[href*="/auth/patreon"]');
      if (patreonLink) {
        capture('guide_cta_clicked', { action: 'login_patreon' });
        return;
      }

      var navLink = event.target.closest('.nav-item, .subnav-item, nav a');
      if (navLink) {
        capture('guide_nav_clicked', {
          text: sanitizeText(navLink.textContent),
          href: navLink.getAttribute('href') || ''
        });
      }
    });
  }

  function init(config) {
    return loadPostHog(config).then(function () {
      window.posthog.init(config.key, {
        api_host: config.host,
        defaults: '2026-05-30',
        capture_pageview: true,
        autocapture: false,
        disable_session_recording: true
      });
      posthogReady = true;
      capture('guide_page_view');
      trackClicks();
      startSectionTracking();
    });
  }

  fetch(CONFIG_URL, { credentials: 'same-origin', cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Config request failed');
      return response.json();
    })
    .then(function (config) {
      if (!config || !config.enabled || !config.key) return;
      return init(config);
    })
    .catch(function (error) {
      debug('disabled', error);
    });
}());
