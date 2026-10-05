/**
 * ============================================================
 *  AUDIENCES ANALYZE — Visitor Tracker for Brand_Designer
 *  Embed this script on your website (before </body>)
 * ============================================================
 */

(function () {
  'use strict';

  // ===== CONFIG =====
  // Firebase web-app config. Override with window.__AA_FIREBASE_CONFIG__ if needed.
  const DEFAULT_CONFIG = {
    apiKey: "AIzaSyAKpZygbqLHpA6MlJHXpMBzQI_RWeDZ2VE",
    authDomain: "audiences-analyze.firebaseapp.com",
    databaseURL: "https://audiences-analyze-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "audiences-analyze",
    storageBucket: "audiences-analyze.firebasestorage.app",
    messagingSenderId: "963492962298",
    appId: "1:963492962298:web:44d27cc51359cca5cc0e43",
    measurementId: "G-9D5J5F08ET"
  };
  const FIREBASE_CONFIG = window.__AA_FIREBASE_CONFIG__ || DEFAULT_CONFIG;

  // ===== SITE IDENTIFICATION =====
  // Set __AA_SITE_ID__/__AA_SITE_NAME__ before loading this script on every website.
  // Auto-detection is a fallback; explicit IDs are recommended for multi-site tracking.
  const SITE_ID_RAW = window.__AA_SITE_ID__ || autoDetectSite();
  const SITE_ID = String(SITE_ID_RAW || 'unknown').trim().toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '') || 'unknown';
  const SITE_NAME = String(window.__AA_SITE_NAME__ || SITE_ID);
  const SITE_URL = String(window.__AA_SITE_URL__ || window.location.origin);

  function autoDetectSite() {
    const host = window.location.hostname;
    const path = window.location.pathname.toLowerCase();
    // Map known sites from your Brand_Designer portfolio
    if (/counter/i.test(path) || /counter/i.test(host)) return 'counter';
    if (/converter/i.test(path) || /converter/i.test(host)) return 'converter';
    if (/run-indore|relax/i.test(path) || /run-indore/i.test(host)) return 'relax-indore';
    if (/desimuseum|desi.?museum/i.test(path) || /desimuseum/i.test(host)) return 'desi-museum';
    if (/portfolio/i.test(path) || /portfolio/i.test(host)) return 'portfolio';
    if (/brand.?designer/i.test(path) || host === 'rjsarkar83.github.io') {
      if (path === '/' || /brand.?designer/i.test(path)) return 'brand-designer';
    }
    // Fallback: hostname + first path segment
    const seg = path.split('/').filter(Boolean)[0] || '';
    return (host.replace(/\.github\.io$/, '') + '-' + seg).replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'unknown';
  }

  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 min idle = new session
  const HEARTBEAT_INTERVAL = 15 * 1000;   // 15 sec heartbeat
  const MOUSE_SAMPLE_INTERVAL = 500;       // sample mouse pos every 500ms
  const SCROLL_SAMPLE_INTERVAL = 1000;     // check scroll every 1s

  // Keep a separate session ID per site so sites on the same domain cannot overwrite
  // one another's session records. Visitor ID remains origin-scoped by the browser.
  const SESSION_STORAGE_KEY = 'aa_session_id_' + SITE_ID;
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  let visitorId = localStorage.getItem('aa_visitor_id');
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
    localStorage.setItem('aa_visitor_id', visitorId);
  }
  if (!sessionId) {
    sessionId = 's_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  const sessionStartTime = Date.now();
  let lastActivity = Date.now();
  let pageViewStart = Date.now();
  let maxScrollDepth = 0;
  let eventQueue = [];
  let pageViews = [];
  let isFirstPageView = true;
  let dbRef = null;
  let firebaseAuth = null;
  let firebaseAuthUid = '';
  let firebaseAuthUidAtStart = '';
  let firebaseReady = false;
  let mousePositions = [];
  let formInteractions = {};
  let currentPage = window.location.pathname + window.location.search + window.location.hash;

  // ===== COLLECT DEVICE / BROWSER INFO =====
  function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';
    let deviceType = 'Desktop';

    const isIPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
    if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua) || isIPadOS) {
      deviceType = 'Tablet';
    } else if (/Mobile|iPhone|iPod|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
      deviceType = 'Mobile';
    }

    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua) && !/Edg|OPR/.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && !/Chrome|Edg|OPR/.test(ua)) browser = 'Safari';
    else if (/MSIE|Trident/.test(ua)) browser = 'IE';

    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod|CPU (iPhone )?OS/i.test(ua) || isIPadOS) os = 'iOS';
    else if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    return {
      userAgent: ua,
      browser,
      browserVersion: (ua.match(new RegExp(browser + '/(\\d+\\.?\\d*)', 'i')) || [])[1] || '',
      os,
      deviceType,
      screen: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      language: navigator.language || navigator.userLanguage,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: navigator.platform,
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack || 'unknown',
      online: navigator.onLine,
      referrer: document.referrer || '(direct)',
      currentUrl: window.location.href,
      landingPage: currentPage,
      pageTitle: document.title
    };
  }

  // ===== PARSE UTM PARAMETERS =====
  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    ['source', 'medium', 'campaign', 'term', 'content'].forEach(k => {
      const v = params.get('utm_' + k);
      if (v) utm[k] = v;
    });
    // Also capture common referral params
    const fbclid = params.get('fbclid');
    const gclid = params.get('gclid');
    if (fbclid) utm.fbclid = fbclid;
    if (gclid) utm.gclid = gclid;
    return utm;
  }

  // ===== TRAFFIC SOURCE DETECTION =====
  function getTrafficSource() {
    const ref = document.referrer;
    const utm = getUTMParams();
    if (utm.source) return { source: utm.source, medium: utm.medium || '(not set)', campaign: utm.campaign || '', type: 'campaign' };
    if (!ref) return { source: '(direct)', medium: '(none)', type: 'direct' };
    try {
      const refHost = new URL(ref).hostname;
      const host = window.location.hostname;
      if (refHost === host) return { source: refHost, medium: 'internal', type: 'internal' };
      if (/google\./.test(refHost)) return { source: 'Google', medium: 'organic', type: 'search', refUrl: ref };
      if (/bing\./.test(refHost)) return { source: 'Bing', medium: 'organic', type: 'search', refUrl: ref };
      if (/yahoo\./.test(refHost)) return { source: 'Yahoo', medium: 'organic', type: 'search', refUrl: ref };
      if (/duckduckgo\./.test(refHost)) return { source: 'DuckDuckGo', medium: 'organic', type: 'search', refUrl: ref };
      if (/facebook|fb\.com/.test(refHost)) return { source: 'Facebook', medium: 'social', type: 'social', refUrl: ref };
      if (/instagram/.test(refHost)) return { source: 'Instagram', medium: 'social', type: 'social', refUrl: ref };
      if (/twitter|x\.com/.test(refHost)) return { source: 'Twitter/X', medium: 'social', type: 'social', refUrl: ref };
      if (/linkedin/.test(refHost)) return { source: 'LinkedIn', medium: 'social', type: 'social', refUrl: ref };
      if (/youtube/.test(refHost)) return { source: 'YouTube', medium: 'social', type: 'social', refUrl: ref };
      if (/whatsapp|wa\.me/.test(refHost)) return { source: 'WhatsApp', medium: 'social', type: 'social', refUrl: ref };
      if (/t\.me|telegram/.test(refHost)) return { source: 'Telegram', medium: 'social', type: 'social', refUrl: ref };
      return { source: refHost, medium: 'referral', type: 'referral', refUrl: ref };
    } catch (e) {
      return { source: ref, medium: 'referral', type: 'referral' };
    }
  }

  // ===== GEOLOCATION (free IP API) =====
  async function getGeoLocation() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const d = await res.json();
        return {
          ip: d.ip,
          city: d.city,
          region: d.region,
          country: d.country_name,
          countryCode: d.country_code,
          postal: d.postal,
          latitude: d.latitude,
          longitude: d.longitude,
          org: d.org,
          isp: d.org
        };
      }
    } catch (e) { /* silently fail */ }
    return null;
  }

  // ===== FIREBASE INIT (lazy load + anonymous tracker auth) =====
  function rotateTrackerStorageIdentity() {
    visitorId = 'v_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
    sessionId = 's_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
    localStorage.setItem('aa_visitor_id', visitorId);
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  function loadFirebaseScript(src, isReady) {
    if (isReady()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function loadFirebase() {
    if (firebaseReady) return;
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
      console.warn('[Audiences Analyze] Firebase config missing. Tracking will remain local only.');
      return;
    }
    const base = 'https://www.gstatic.com/firebasejs/9.23.0/';
    await loadFirebaseScript(base + 'firebase-app-compat.js', () => !!window.firebase);
    await loadFirebaseScript(base + 'firebase-auth-compat.js', () => !!(window.firebase && firebase.auth));
    await loadFirebaseScript(base + 'firebase-database-compat.js', () => !!(window.firebase && firebase.database));

    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    dbRef = firebase.database(app);
    firebaseAuth = firebase.auth(app);

    // Wait for Firebase Auth to restore a persisted account; otherwise create an anonymous
    // tracker identity. RTDB rules should permit this identity to write only its own records.
    let user = firebaseAuth.currentUser;
    if (!user) {
      user = await new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        unsubscribe = firebaseAuth.onAuthStateChanged(existingUser => {
          unsubscribe();
          if (existingUser) {
            resolve(existingUser);
          } else {
            firebaseAuth.signInAnonymously().then(result => resolve(result.user)).catch(reject);
          }
        }, reject);
      });
    }
    if (!user) throw new Error('Firebase Authentication did not return a user.');
    const previousAuthUid = localStorage.getItem('aa_tracker_auth_uid');
    if (user.isAnonymous && previousAuthUid && previousAuthUid !== user.uid) rotateTrackerStorageIdentity();
    firebaseAuthUid = user.uid;
    firebaseAuthUidAtStart = user.uid;
    localStorage.setItem('aa_tracker_auth_uid', user.uid);
    firebaseReady = true;

    // If the dashboard owner signs out in another tab on the same origin, restore anonymous
    // tracking and rotate local IDs so new writes cannot collide with the old auth owner's records.
    firebaseAuth.onAuthStateChanged(nextUser => {
      if (!nextUser) {
        firebaseReady = false;
        firebaseAuth.signInAnonymously().catch(error => {
          console.warn('[Audiences Analyze] Could not restore anonymous tracking:', error.code || error.message);
        });
        return;
      }
      if (nextUser.isAnonymous && firebaseAuthUidAtStart && nextUser.uid !== firebaseAuthUidAtStart) {
        firebaseAuthUid = nextUser.uid;
        firebaseAuthUidAtStart = nextUser.uid;
        localStorage.setItem('aa_tracker_auth_uid', nextUser.uid);
        rotateTrackerStorageIdentity();
        window.location.reload();
        return;
      }
      firebaseAuthUid = nextUser.uid;
      firebaseAuthUidAtStart = nextUser.uid;
      localStorage.setItem('aa_tracker_auth_uid', nextUser.uid);
    });
  }

  // ===== DATA WRITING =====
  let sessionRef = null;
  let writeBuffer = [];
  let flushTimer = null;

  function setFlatUpdatePath(updates, path, value) {
    // A queued later child update supersedes an earlier parent value. Conversely,
    // a later parent value supersedes its earlier descendants. Keeping only the
    // latest non-overlapping paths avoids RTDB's ancestor/descendant update error.
    Object.keys(updates).forEach(existing => {
      if (existing.startsWith(path + '/')) delete updates[existing];
    });
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/');
      if (Object.prototype.hasOwnProperty.call(updates, ancestor)) delete updates[ancestor];
    }
    updates[path] = value;
  }

  function flattenUpdateValue(updates, path, value) {
    // Firebase RTDB update() accepts slash-separated leaf paths, but rejects an
    // update object that includes both a parent path and any descendant path.
    // Expand objects all the way to leaves so a session record and its queued
    // events can safely be committed together without overlapping paths.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (!entries.length) {
        setFlatUpdatePath(updates, path, null);
        return;
      }
      entries.forEach(([key, childValue]) => {
        flattenUpdateValue(updates, path ? path + '/' + key : key, childValue);
      });
      return;
    }
    if (path) setFlatUpdatePath(updates, path, value);
  }

  function flushBuffer() {
    if (!firebaseReady || !dbRef || writeBuffer.length === 0) return;

    const pending = writeBuffer;
    writeBuffer = [];
    const updates = {};
    pending.forEach(item => flattenUpdateValue(updates, item.path, item.data));

    dbRef.ref().update(updates).catch(err => {
      console.warn('[Audiences Analyze] Database write denied or unavailable:', err.code || err.message);
    });
  }

  function writeData(path, data) {
    // Always keep local copy
    try {
      const key = 'aa_cache_' + sessionId;
      const cached = JSON.parse(localStorage.getItem(key) || '{}');
      const parts = path.split('/');
      let obj = cached;
      for (let i = 0; i < parts.length - 1; i++) {
        obj[parts[i]] = obj[parts[i]] || {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = data;
      localStorage.setItem(key, JSON.stringify(cached));
    } catch (e) {}

    if (!firebaseReady || !dbRef) return;
    writeBuffer.push({ path, data });
    if (!flushTimer) {
      flushTimer = setTimeout(() => { flushBuffer(); flushTimer = null; }, 2000);
    }
  }

  function getSessionPath(sub) {
    return 'sessions/' + sessionId + (sub ? '/' + sub : '');
  }

  function getSitePath(sub) {
    return 'sites/' + SITE_ID + (sub ? '/' + sub : '');
  }

  // ===== EVENT LOGGING =====
  function logEvent(type, data) {
    const evt = {
      type,
      timestamp: Date.now(),
      timeSinceStart: Math.round((Date.now() - sessionStartTime) / 1000),
      page: window.location.pathname,
      ...data
    };
    eventQueue.push(evt);
    writeData(getSessionPath('events/' + evt.timestamp + '_' + Math.random().toString(36).substr(2, 5)), evt);
  }

  // ===== PAGE VIEW =====
  function trackPageView(isInitial) {
    const pv = {
      path: window.location.pathname,
      fullUrl: window.location.href,
      title: document.title,
      referrer: isInitial ? document.referrer : currentPage,
      timestamp: Date.now(),
      timeSpent: 0
    };
    pageViews.push(pv);
    writeData(getSessionPath('pageViews/' + pv.timestamp), pv);
    logEvent('page_view', { path: pv.path, title: pv.title });
    currentPage = window.location.pathname + window.location.search + window.location.hash;
    pageViewStart = Date.now();
    maxScrollDepth = 0;
  }

  // ===== CLICK TRACKING =====
  function getElementSelector(el) {
    if (!el || el === document.body) return el ? el.tagName : 'unknown';
    const parts = [];
    let e = el;
    for (let i = 0; i < 5 && e && e !== document.body; i++) {
      let part = e.tagName.toLowerCase();
      if (e.id) { part += '#' + e.id; parts.unshift(part); break; }
      if (e.className && typeof e.className === 'string') {
        const cls = e.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) part += '.' + cls;
      }
      parts.unshift(part);
      e = e.parentElement;
    }
    return parts.join(' > ');
  }

  function handleClick(e) {
    const el = e.target.closest('a, button, [role="button"], input[type="submit"], .clickable, [onclick]');
    if (!el) return;
    const tag = el.tagName.toLowerCase();
    const clickData = {
      selector: getElementSelector(el),
      text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().substring(0, 200),
      href: el.href || '',
      tag: tag,
      classes: el.className || '',
      id: el.id || '',
      x: e.clientX,
      y: e.clientY
    };
    logEvent('click', clickData);

    // Special tracking
    if (tag === 'a' && el.href) {
      const href = el.href;
      if (/wa\.me|whatsapp|api\.whatsapp/.test(href)) {
        logEvent('whatsapp_click', { href, text: clickData.text });
      } else if (/mailto:/.test(href)) {
        logEvent('email_click', { href, text: clickData.text });
      } else if (/tel:/.test(href)) {
        logEvent('phone_click', { href, text: clickData.text });
      } else if (el.target === '_blank' || !href.includes(window.location.hostname)) {
        logEvent('outbound_click', { href, text: clickData.text });
      } else {
        logEvent('internal_link_click', { href, text: clickData.text });
      }
    }

    // Form elements
    if (tag === 'button' || el.getAttribute('type') === 'submit') {
      const form = el.closest('form');
      if (form) logEvent('form_submit_click', { formId: form.id || '', buttonText: clickData.text });
    }

    // Check for digital card / enquiry related
    const textLower = (clickData.text + ' ' + el.className).toLowerCase();
    if (/whatsapp|enquiry|contact|send|connect|let's|call|book|enroll|register|startup|brand/.test(textLower)) {
      logEvent('lead_interaction', { element: clickData.text || clickData.selector, action: 'click' });
    }
  }

  // ===== FORM TRACKING (Digital Card / Enquiry) =====
  const trackedInputs = new WeakSet();
  const trackedForms = new WeakSet();
  const trackedWhatsAppLinks = new WeakSet();

  function isSensitiveInput(input) {
    const type = (input.type || '').toLowerCase();
    const descriptor = [input.name, input.id, input.placeholder, input.autocomplete, input.getAttribute('aria-label')]
      .filter(Boolean).join(' ').toLowerCase();
    return ['password', 'file', 'hidden'].includes(type) ||
      /password|passcode|card.?number|credit.?card|cvv|cvc|otp|token|aadhaar|aadhar|social.?security|ssn|bank.?account|account.?number/.test(descriptor) ||
      /(^|\W)pin($|\W)/.test(descriptor);
  }

  function isLeadForm(form) {
    if (form.hasAttribute('data-aa-ignore-form')) return false;
    if (form.hasAttribute('data-aa-lead-form')) return true;
    const inputs = Array.from(form.querySelectorAll('input, textarea, select'));
    const description = [form.id, form.className, form.getAttribute('aria-label'), form.getAttribute('action'), form.textContent]
      .concat(inputs.flatMap(input => [input.name, input.id, input.placeholder, input.getAttribute('aria-label')]))
      .filter(Boolean).join(' ').toLowerCase();
    const hasEmail = inputs.some(input => input.type === 'email' || /email/i.test([input.name, input.id, input.placeholder].join(' ')));
    const hasContact = inputs.some(input => input.type === 'tel' || /phone|mobile|name/i.test([input.name, input.id, input.placeholder].join(' ')));
    return /contact|enquir|inquir|lead|consult|quote|brief|project request|call.?back|whatsapp/.test(description) || (hasEmail && hasContact);
  }

  function trackForms() {
    document.querySelectorAll('form').forEach(form => {
      form.querySelectorAll('input, textarea, select').forEach(input => {
        if (trackedInputs.has(input)) return;
        trackedInputs.add(input);
        input.addEventListener('focus', () => {
          const name = input.name || input.id || input.placeholder || input.type;
          formInteractions[name] = { focused: true, focusTime: Date.now() };
          logEvent('form_field_focus', { field: name, type: input.type });
        });
        input.addEventListener('blur', () => {
          const name = input.name || input.id || input.placeholder || input.type;
          if (formInteractions[name]) {
            formInteractions[name].filled = !!input.value;
            formInteractions[name].timeSpent = Date.now() - formInteractions[name].focusTime;
            formInteractions[name].valueLength = (input.value || '').length;
          }
          logEvent('form_field_blur', { field: name, filled: !!input.value, valueLength: (input.value || '').length });
        });
        input.addEventListener('change', () => {
          const name = input.name || input.id || input.placeholder || input.type;
          logEvent('form_field_change', {
            field: name,
            filled: !!input.value,
            valueLength: (input.value || '').length
          });
        });
      });

      if (!trackedForms.has(form)) {
        trackedForms.add(form);
        form.addEventListener('submit', () => {
          if (!isLeadForm(form)) {
            logEvent('form_submit_nonlead', { formId: form.id || '', fieldCount: form.querySelectorAll('input, textarea, select').length });
            return;
          }
          const formData = {};
          form.querySelectorAll('input, textarea, select').forEach(input => {
            if (isSensitiveInput(input) || input.disabled) return;
            const key = input.name || input.id || input.placeholder || input.type;
            if (!key || input.type === 'submit' || input.type === 'button' || input.type === 'reset') return;
            if ((input.type === 'checkbox' || input.type === 'radio') && !input.checked) return;
            const value = (input.value || '').trim().substring(0, 500);
            if (value) formData[key] = value;
          });
          logEvent('form_submit', { formId: form.id || '', leadForm: true, fields: Object.keys(formData), data: formData });
          writeData(getSessionPath('digitalCard/submitted'), true);
          writeData(getSessionPath('digitalCard/submitTime'), Date.now());
          writeData(getSessionPath('digitalCard/formData'), formData);
          writeData(getSessionPath('digitalCard/formInteractions'), formInteractions);
        });
      }
    });

    // WhatsApp buttons may be added dynamically, so attach once per anchor.
    document.querySelectorAll('a[href*="whatsapp"], a[href*="wa.me"]').forEach(a => {
      if (trackedWhatsAppLinks.has(a)) return;
      trackedWhatsAppLinks.add(a);
      a.addEventListener('click', () => {
        writeData(getSessionPath('digitalCard/whatsappClicked'), true);
        writeData(getSessionPath('digitalCard/clickTime'), Date.now());
        writeData(getSessionPath('digitalCard/href'), a.href);
        writeData(getSessionPath('digitalCard/context'), getElementSelector(a));
      });
    });
  }

  // ===== SCROLL TRACKING =====
  let scrollTimer = null;
  function handleScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
      if (pct > maxScrollDepth) {
        maxScrollDepth = pct;
        if (pct >= 25 && pct < 50) logEvent('scroll_depth', { depth: '25%' });
        else if (pct >= 50 && pct < 75) logEvent('scroll_depth', { depth: '50%' });
        else if (pct >= 75 && pct < 90) logEvent('scroll_depth', { depth: '75%' });
        else if (pct >= 90) logEvent('scroll_depth', { depth: '90%+' });
      }
      writeData(getSessionPath('maxScrollDepth'), maxScrollDepth);
    }, SCROLL_SAMPLE_INTERVAL);
  }

  // ===== MOUSE TRACKING (for heatmap) =====
  let lastMouseSample = 0;
  function handleMouseMove(e) {
    const now = Date.now();
    if (now - lastMouseSample < MOUSE_SAMPLE_INTERVAL) return;
    lastMouseSample = now;
    mousePositions.push({
      x: Math.round((e.clientX / window.innerWidth) * 100),
      y: Math.round((e.clientY / Math.max(document.documentElement.scrollHeight, window.innerHeight)) * 100),
      t: now
    });
    if (mousePositions.length > 500) mousePositions = mousePositions.slice(-500);
  }

  // ===== TIME TRACKING =====
  function updateActivity() {
    lastActivity = Date.now();
  }

  function sendHeartbeat() {
    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    const timeOnPage = Math.round((Date.now() - pageViewStart) / 1000);
    writeData(getSessionPath('heartbeat'), {
      lastSeen: Date.now(),
      durationSeconds: duration,
      currentPageTimeSeconds: timeOnPage,
      scrollDepth: maxScrollDepth,
      isActive: true
    });
  }

  // ===== PAGE VISIBILITY =====
  function handleVisibility() {
    if (document.hidden) {
      logEvent('page_hidden', { timeOnPage: Math.round((Date.now() - pageViewStart) / 1000) });
    } else {
      logEvent('page_visible', {});
      pageViewStart = Date.now();
    }
  }

  // ===== EXIT / UNLOAD =====
  function handleUnload() {
    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    const timeOnPage = Math.round((Date.now() - pageViewStart) / 1000);
    writeData(getSessionPath('sessionEnd'), {
      endTime: Date.now(),
      durationSeconds: duration,
      finalPageTimeSeconds: timeOnPage,
      maxScrollDepth,
      exitPage: window.location.pathname,
      totalPageViews: pageViews.length,
      totalEvents: eventQueue.length,
      mousePositionsCount: mousePositions.length
    });
    writeData(getSessionPath('isActive'), false);
    flushBuffer();
  }

  // ===== HISTORY/HASH CHANGE (SPA nav) =====
  function handleNavChange() {
    const newPage = window.location.pathname + window.location.search + window.location.hash;
    if (newPage !== currentPage) {
      // Close previous page view
      const prevPV = pageViews[pageViews.length - 1];
      if (prevPV) {
        prevPV.timeSpent = Math.round((Date.now() - pageViewStart) / 1000);
      }
      trackPageView(false);
    }
  }

  // ===== DETECT CTA / DIGITAL CARD ELEMENTS (Brand_Designer specific) =====
  function detectDigitalCard() {
    // Look for enquiry form elements
    const purposeSelect = document.querySelector('select, [placeholder*="Purpose"], [name*="purpose"], [id*="purpose"]');
    const nameInput = document.querySelector('input[placeholder*="name" i], input[name*="name" i], input[id*="name" i]');
    const phoneInput = document.querySelector('input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="number" i], input[name*="phone" i], input[type="tel"]');
    const whatsappBtn = document.querySelector('a[href*="whatsapp"], a[href*="wa.me"]')
      || Array.from(document.querySelectorAll('button, [role="button"]'))
        .find(el => /whatsapp/i.test(el.textContent || ''));
    const sendBtn = document.querySelector('[class*="send"], [class*="submit"]')
      || Array.from(document.querySelectorAll('button, input[type="submit"]'))
        .find(el => /\b(send|submit|book)\b/i.test(el.textContent || el.value || ''));

    const detected = {
      hasEnquiryForm: !!(nameInput || phoneInput || purposeSelect),
      hasWhatsAppButton: !!whatsappBtn,
      detectedElements: {
        nameField: !!nameInput,
        phoneField: !!phoneInput,
        purposeField: !!purposeSelect,
        sendButton: !!sendBtn
      },
      detectedAt: Date.now()
    };
    writeData(getSessionPath('digitalCard/detection'), detected);
    return detected;
  }

  // ===== INITIALIZE =====
  async function init() {
    // Load firebase
    await loadFirebase().catch(error => {
      console.warn('[Audiences Analyze] Firebase/Auth setup failed; events remain local only:', error.code || error.message);
    });

    // Gather initial data
    const deviceInfo = getDeviceInfo();
    const trafficSource = getTrafficSource();
    const utmParams = getUTMParams();
    const geo = await getGeoLocation();

    // Write session record
    const sessionData = {
      sessionId,
      visitorId,
      authUid: firebaseAuthUid,
      startTime: sessionStartTime,
      firstVisit: !localStorage.getItem('aa_returning'),
      device: deviceInfo,
      traffic: trafficSource,
      utm: Object.keys(utmParams).length ? utmParams : null,
      geo,
      isActive: true,
      userAgent: navigator.userAgent,
      site: window.location.hostname,
      siteId: SITE_ID,
      siteName: SITE_NAME
    };
    localStorage.setItem('aa_returning', '1');
    writeData(getSessionPath(''), sessionData);
    writeData(getSitePath('sessions/' + sessionId), true);
    writeData(getSitePath('lastActivity'), Date.now());
    writeData(getSitePath('name'), SITE_NAME);
    writeData(getSitePath('url'), SITE_URL);
    writeData(getSitePath('host'), window.location.hostname);
    writeData('visitors/' + visitorId + '/authUid', firebaseAuthUid);
    writeData('visitors/' + visitorId + '/lastSession', sessionId);
    writeData('visitors/' + visitorId + '/lastSeen', Date.now());
    writeData('visitors/' + visitorId + '/lastSite', SITE_ID);
    writeData('visitors/' + visitorId + '/totalVisits', (parseInt(localStorage.getItem('aa_visit_count') || '0') + 1));
    const visitedSites = JSON.parse(localStorage.getItem('aa_visited_sites') || '[]');
    if (!visitedSites.includes(SITE_ID)) {
      visitedSites.push(SITE_ID);
      localStorage.setItem('aa_visited_sites', JSON.stringify(visitedSites));
      writeData('visitors/' + visitorId + '/sites/' + SITE_ID, { firstVisit: Date.now() });
    } else {
      writeData('visitors/' + visitorId + '/sites/' + SITE_ID + '/lastVisit', Date.now());
    }
    writeData('visitors/' + visitorId + '/sitesVisited', visitedSites.length);
    localStorage.setItem('aa_visit_count', (parseInt(localStorage.getItem('aa_visit_count') || '0') + 1).toString());

    // Track initial page view
    trackPageView(true);

    // Detect digital card after DOM ready
    setTimeout(() => {
      detectDigitalCard();
      trackForms();
    }, 1500);
    setTimeout(() => trackForms(), 3000); // re-check for lazy-loaded forms

    // Attach listeners
    document.addEventListener('click', handleClick, true);
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('popstate', handleNavChange);
    window.addEventListener('hashchange', handleNavChange);

    // Activity listeners
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, updateActivity, { passive: true });
    });

    // Heartbeat
    setInterval(() => {
      // Check for session timeout
      if (Date.now() - lastActivity > SESSION_TIMEOUT) {
        // Session expired, create new one
        sessionId = 's_' + Math.random().toString(36).substr(2, 12) + '_' + Date.now();
        localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
        window.location.reload();
        return;
      }
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    // Detect digital card interactions - watch for specific text
    const observer = new MutationObserver(() => {
      trackForms();
      detectDigitalCard();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial log
    logEvent('session_start', {
      referrer: deviceInfo.referrer,
      trafficSource: trafficSource.source,
      deviceType: deviceInfo.deviceType,
      country: geo ? geo.country : 'unknown'
    });

    // Track portfolio interactions (for your site's slider)
    setTimeout(() => {
      document.querySelectorAll('[class*="slide"], [class*="portfolio"], [class*="gallery"], [class*="card"]').forEach(el => {
        el.addEventListener('click', () => {
          logEvent('portfolio_interaction', {
            element: getElementSelector(el),
            classes: el.className
          });
        });
      });
    }, 2000);

    console.log('%c[Audiences Analyze] Tracking active', 'color:#6c5ce7;font-weight:bold;', { sessionId, source: trafficSource.source });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual event tracking
  window.AATrack = function (eventName, data) {
    logEvent('custom_' + eventName, data || {});
  };
})();
