/**
 * ============================================
 *  AUDIENCES ANALYZE — Dashboard Logic
 * ============================================
 */

(function () {
  'use strict';

  let db = null;
  let auth = null;
  let firebaseApp = null;
  let authStateUnsubscribe = null;
  let listenersStarted = false;
  let dashboardRenderTimer = null;
  let allSessions = {};
  let allVisitors = {};
  let allSites = {};
  let activeListeners = [];
  let eventStream = [];
  const MAX_EVENTS = 100;

  function getSessionSiteId(session) {
    // Older records were collected only from Brand_Designer before site IDs were added.
    return session?.siteId || 'brand-designer';
  }

  function getSessionSiteName(session) {
    const id = getSessionSiteId(session);
    return session?.siteName || allSites[id]?.name || (id === 'brand-designer' ? 'Brand Designer' : id);
  }

  function registerSiteFromSession(session) {
    const id = getSessionSiteId(session);
    allSites[id] = {
      ...(allSites[id] || {}),
      id,
      name: session?.siteName || allSites[id]?.name || (id === 'brand-designer' ? 'Brand Designer' : id),
      url: session?.site || allSites[id]?.url || ''
    };
    updateSiteOptions();
  }

  function updateSiteOptions() {
    const select = document.getElementById('site-filter');
    if (!select) return;
    const selected = select.value || '__all__';
    while (select.options.length > 1) select.remove(1);
    Object.values(allSites).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)).forEach(site => {
      const option = document.createElement('option');
      option.value = site.id;
      option.textContent = '🌐 ' + (site.name || site.id);
      select.add(option);
    });
    select.value = allSites[selected] ? selected : '__all__';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  // ===== TIME FILTER =====
  function getTimeFilter() {
    const range = document.getElementById('time-range')?.value || '24h';
    const now = Date.now();
    switch (range) {
      case 'today': {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }
      case '24h': return now - 24 * 60 * 60 * 1000;
      case '7d': return now - 7 * 24 * 60 * 60 * 1000;
      case '30d': return now - 30 * 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }

  // ===== INIT FIREBASE + OWNER AUTH =====
  function initFirebase(config) {
    try {
      const existingApp = firebase.apps.find(app => app.name === '[DEFAULT]');
      firebaseApp = existingApp || firebase.initializeApp(config);
      auth = firebase.auth(firebaseApp);
      db = firebase.database(firebaseApp);
      if (authStateUnsubscribe) authStateUnsubscribe();
      authStateUnsubscribe = auth.onAuthStateChanged(user => {
        if (!user || user.isAnonymous) {
          detachListeners();
          showLogin(user?.isAnonymous ? 'Tracker identity detected. Sign in with the dashboard owner Google account.' : 'Sign in to view private analytics.');
          return;
        }
        startOwnerDashboard(user);
      }, error => {
        detachListeners();
        showLogin('Firebase Authentication error: ' + (error.message || 'Please check Firebase Auth settings.'));
      });
      return true;
    } catch (e) {
      console.error('Firebase init error:', e);
      showSetup();
      alert('Firebase connection failed: ' + e.message);
      return false;
    }
  }

  // ===== PARSE CONFIG FROM PASTED TEXT =====
  function parseConfig(text) {
    try {
      // Try direct JSON parse first
      const cleaned = text
        .replace(/const\s+firebaseConfig\s*=\s*/, '')
        .replace(/var\s+firebaseConfig\s*=\s*/, '')
        .replace(/let\s+firebaseConfig\s*=\s*/, '')
        .replace(/;$/, '')
        .trim();
      // Convert JS object notation to JSON
      const jsonStr = cleaned
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(jsonStr);
    } catch (e) {
      // Try another approach — extract key-value pairs
      const config = {};
      const keys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
      keys.forEach(k => {
        const re = new RegExp(k + "\\s*[:=]\\s*[\"']([^\"']+)[\"']");
        const m = text.match(re);
        if (m) config[k] = m[1];
      });
      return config.databaseURL ? config : null;
    }
  }

  // ===== AUTH / SETUP SCREENS =====
  function showSetup() {
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }

  function showLogin(message) {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    const error = document.getElementById('login-error');
    if (error && message) error.textContent = message;
  }

  function showDashboard() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
  }

  function detachListeners() {
    activeListeners.forEach(ref => ref.off());
    activeListeners = [];
    allSessions = {};
    allVisitors = {};
    allSites = {};
    eventStream = [];
    listenersStarted = false;
    if (dashboardRenderTimer) {
      clearInterval(dashboardRenderTimer);
      dashboardRenderTimer = null;
    }
  }

  function startOwnerDashboard(user) {
    const actualEmail = String(user?.email || '').trim();
    document.getElementById('auth-user').textContent = actualEmail || 'Signed in';
    db.ref('sessions').limitToFirst(1).once('value').then(() => {
      showDashboard();
      if (!listenersStarted) {
        listenersStarted = true;
        attachListeners();
        dashboardRenderTimer = setInterval(render, 5000);
      }
    }).catch(error => {
      detachListeners();
      showLogin('Database access denied. Check that the owner email in database.rules.json matches this Google account.');
      console.error('Realtime Database permission check failed:', error);
    });
  }

  // Country code to flag emoji
  function getFlagEmoji(countryCode) {
    if (!countryCode) return '🌐';
    if (countryCode.length !== 2) return '🌐';
    return countryCode.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
  }

  function formatDuration(seconds) {
    if (!seconds) return '0s';
    if (seconds < 60) return Math.round(seconds) + 's';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's';
    return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
  }

  function formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return new Date(timestamp).toLocaleDateString();
  }

  function formatClockTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getSourceIcon(source) {
    if (!source) return '🔗';
    const s = source.toLowerCase();
    if (s.includes('google')) return '🔍';
    if (s.includes('facebook') || s.includes('fb')) return '📘';
    if (s.includes('instagram')) return '📷';
    if (s.includes('twitter') || s.includes('x.com')) return '𝕏';
    if (s.includes('youtube')) return '▶️';
    if (s.includes('linkedin')) return '💼';
    if (s.includes('whatsapp')) return '💬';
    if (s.includes('telegram') || s.includes('t.me')) return '✈️';
    if (s.includes('bing')) return '🅱️';
    if (s.includes('duckduckgo')) return '🦆';
    if (s.includes('yahoo')) return '🟣';
    if (s.includes('direct')) return '⌨️';
    if (s.includes('internal')) return '🏠';
    return '🔗';
  }

  function getDeviceEmoji(deviceType) {
    if (deviceType === 'Mobile') return '📱';
    if (deviceType === 'Tablet') return '📟';
    return '💻';
  }

  function getInitials(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function colorFromString(str) {
    const colors = ['#6c5ce7','#fd79a8','#00cec9','#fdcb6e','#e17055','#74b9ff','#a29bfe','#55efc4','#ff7675','#74b9ff'];
    let hash = 0;
    for (let i = 0; i < (str||'').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  // ===== DATA LISTENERS =====
  function attachListeners() {
    // Remove existing
    activeListeners.forEach(ref => ref.off());
    activeListeners = [];
    allSessions = {};
    allVisitors = {};
    allSites = {};
    updateSiteOptions();

    // Site registry supports friendly names and the site selector.
    const sitesRef = db.ref('sites');
    const upsertSite = (snapshot) => {
      const data = snapshot.val() || {};
      const id = snapshot.key;
      allSites[id] = {
        id,
        name: data.name || data.siteName || allSites[id]?.name || id,
        url: data.url || allSites[id]?.url || ''
      };
      updateSiteOptions();
      render();
    };
    sitesRef.on('child_added', upsertSite);
    sitesRef.on('child_changed', upsertSite);
    sitesRef.on('child_removed', (snapshot) => {
      delete allSites[snapshot.key];
      updateSiteOptions();
      render();
    });
    activeListeners.push(sitesRef);

    // Listen for all sessions
    const sessionsRef = db.ref('sessions');
    sessionsRef.on('child_added', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        allSessions[snapshot.key] = { ...data, _key: snapshot.key };
        registerSiteFromSession(allSessions[snapshot.key]);
        render();
      }
    });
    sessionsRef.on('child_changed', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        allSessions[snapshot.key] = { ...allSessions[snapshot.key], ...data, _key: snapshot.key };
        registerSiteFromSession(allSessions[snapshot.key]);
        render();
      }
    });
    sessionsRef.on('child_removed', (snapshot) => {
      delete allSessions[snapshot.key];
      render();
    });
    activeListeners.push(sessionsRef);

    // Listen for events (live stream)
    const eventsRef = db.ref('sessions');
    eventsRef.on('child_added', (sessionSnap) => {
      const sessionKey = sessionSnap.key;
      const eventsRefInner = db.ref('sessions/' + sessionKey + '/events');
      eventsRefInner.on('child_added', (eventSnap) => {
        const evt = eventSnap.val();
        if (evt) {
          const session = allSessions[sessionKey];
          evt._sessionKey = sessionKey;
          evt._key = eventSnap.key;
          evt.siteId = session?.siteId || 'brand-designer';
          evt.siteName = getSessionSiteName(session || { siteId: evt.siteId });
          addToEventStream(evt);
        }
      });
      activeListeners.push(eventsRefInner);
    });
    activeListeners.push(eventsRef);

    // Listen for visitors
    const visitorsRef = db.ref('visitors');
    visitorsRef.on('child_added', (snap) => {
      allVisitors[snap.key] = snap.val();
      render();
    });
    visitorsRef.on('child_changed', (snap) => {
      allVisitors[snap.key] = snap.val();
      render();
    });
    activeListeners.push(visitorsRef);
  }

  function addToEventStream(evt) {
    // Avoid duplicates
    if (eventStream.find(e => e._key === evt._key && e._sessionKey === evt._sessionKey)) return;
    eventStream.push(evt);
    eventStream.sort((a, b) => b.timestamp - a.timestamp);
    if (eventStream.length > MAX_EVENTS) eventStream = eventStream.slice(0, MAX_EVENTS);
    renderEventStream();
  }

  // ===== FILTER SESSIONS =====
  function getFilteredSessions() {
    const cutoff = getTimeFilter();
    const selectedSite = document.getElementById('site-filter')?.value || '__all__';
    return Object.values(allSessions).filter(s => {
      const inTimeRange = s.startTime && s.startTime >= cutoff;
      const inSite = selectedSite === '__all__' || getSessionSiteId(s) === selectedSite;
      return inTimeRange && inSite;
    });
  }

  // ===== COMPUTE STATS =====
  function computeStats(sessions) {
    const now = Date.now();
    const activeSessions = sessions.filter(s => {
      if (!s.isActive) return false;
      const hb = s.heartbeat;
      if (hb && hb.lastSeen) return (now - hb.lastSeen) < 120000; // 2 min
      return (now - s.startTime) < 30 * 60000;
    });

    const uniqueVisitors = new Set(sessions.map(s => s.visitorId)).size;
    let totalPV = 0;
    let totalDuration = 0;
    let completedSessions = 0;

    sessions.forEach(s => {
      const pvs = s.pageViews ? Object.keys(s.pageViews).length : 0;
      totalPV += pvs;
      if (s.sessionEnd && s.sessionEnd.durationSeconds) {
        totalDuration += s.sessionEnd.durationSeconds;
        completedSessions++;
      } else if (s.heartbeat && s.heartbeat.durationSeconds) {
        totalDuration += s.heartbeat.durationSeconds;
        completedSessions++;
      }
    });

    const avgDuration = completedSessions > 0 ? totalDuration / completedSessions : 0;

    // Leads (digital card)
    let leads = 0;
    sessions.forEach(s => {
      if (s.digitalCard && (s.digitalCard.submitted || s.digitalCard.whatsappClicked)) leads++;
    });

    return {
      active: activeSessions.length,
      totalSessions: sessions.length,
      uniqueVisitors,
      avgDuration,
      totalPV,
      leads
    };
  }

  // ===== RENDER FUNCTIONS =====
  function render() {
    const sessions = getFilteredSessions();
    const stats = computeStats(sessions);

    document.getElementById('stat-active').textContent = stats.active;
    document.getElementById('stat-sessions').textContent = stats.totalSessions;
    document.getElementById('stat-visitors').textContent = stats.uniqueVisitors;
    document.getElementById('stat-avg-duration').textContent = formatDuration(stats.avgDuration);
    document.getElementById('stat-pageviews').textContent = stats.totalPV;
    document.getElementById('stat-leads').textContent = stats.leads;
    document.getElementById('active-count').textContent = stats.active + ' online';

    renderActiveVisitors(sessions);
    renderSources(sessions);
    renderPages(sessions);
    renderCountries(sessions);
    renderDevices(sessions);
    renderLeads(sessions);
    renderEventStream();
  }

  function renderActiveVisitors(sessions) {
    const container = document.getElementById('active-visitors');
    const now = Date.now();

    // Show active first, then recent
    const activeSessions = sessions.filter(s => {
      const hb = s.heartbeat;
      if (s.isActive && hb && hb.lastSeen && (now - hb.lastSeen) < 120000) return true;
      if (s.isActive && (now - s.startTime) < 30 * 60000 && (!hb || !hb.lastSeen)) return true;
      return false;
    });
    const recentSessions = sessions.filter(s => !activeSessions.includes(s))
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      .slice(0, 10);

    const displaySessions = [...activeSessions, ...recentSessions];

    if (displaySessions.length === 0) {
      container.innerHTML = '<div class="empty-state">Waiting for visitors...</div>';
      return;
    }

    container.innerHTML = displaySessions.map(s => {
      const hb = s.heartbeat;
      const isActive = activeSessions.includes(s);
      const isIdle = !isActive && s.isActive && hb && (now - hb.lastSeen) < 300000;
      const statusClass = isActive ? 'active' : (isIdle ? 'idle' : 'ended');
      const location = s.geo ? `${s.geo.city || ''}, ${s.geo.countryCode || s.geo.country || ''}`.replace(/^, |, $/g, '') : 'Unknown location';
      const countryCode = s.geo?.countryCode || '';
      const device = getDeviceEmoji(s.device?.deviceType);
      const duration = hb?.durationSeconds ? formatDuration(hb.durationSeconds) : (s.sessionEnd?.durationSeconds ? formatDuration(s.sessionEnd.durationSeconds) : 'just now');
      const pageCount = s.pageViews ? Object.keys(s.pageViews).length : 0;
      const currentPage = hb?.isActive ? (s.pageViews ? Object.values(s.pageViews).pop()?.path : s.device?.currentUrl) : (s.sessionEnd?.exitPage || '');
      const visitorName = s.digitalCard?.formData?.name || s.digitalCard?.formData?.Name || location.split(',')[0] || 'Visitor';
      const color = colorFromString(s.visitorId || s.sessionId);
      const flag = getFlagEmoji(countryCode);

      return `
        <div class="visitor-item" data-session="${s._key}">
          <div class="visitor-status ${statusClass}"></div>
          <div class="visitor-avatar" style="background:${color}">${getInitials(visitorName)}</div>
          <div class="visitor-info">
            <div class="visitor-meta">
              <span class="visitor-city">${flag} ${visitorName}</span>
            </div>
            <div class="visitor-page">${device} ${s.device?.browser || ''} · on <code style="color:var(--accent-light);font-size:11px">${currentPage || '/'}</code></div>
            <div class="visitor-site">${escapeHtml(getSessionSiteName(s))}</div>
          </div>
          <div class="visitor-stats">
            <div class="visitor-time">${duration}</div>
            <div class="visitor-views">${pageCount} page${pageCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers
    container.querySelectorAll('.visitor-item').forEach(el => {
      el.addEventListener('click', () => openSessionDetail(el.dataset.session));
    });
  }

  function renderSources(sessions) {
    const container = document.getElementById('source-list');
    const sources = {};
    sessions.forEach(s => {
      const src = s.traffic?.source || '(direct)';
      const med = s.traffic?.medium || '(none)';
      const key = src + '|' + med;
      if (!sources[key]) sources[key] = { source: src, medium: med, count: 0 };
      sources[key].count++;
    });

    const arr = Object.values(sources).sort((a, b) => b.count - a.count);
    const max = arr[0]?.count || 1;

    if (arr.length === 0) {
      container.innerHTML = '<div class="empty-state">No data yet</div>';
      return;
    }

    container.innerHTML = arr.map(s => `
      <div class="source-item">
        <div class="source-icon">${getSourceIcon(s.source)}</div>
        <div class="source-info">
          <div class="source-name">${s.source}</div>
          <div class="source-medium">${s.medium}</div>
          <div class="source-bar"><div class="source-bar-fill" style="width:${(s.count/max)*100}%"></div></div>
        </div>
        <div class="source-count">${s.count}</div>
      </div>
    `).join('');
  }

  function renderPages(sessions) {
    const container = document.getElementById('page-list');
    const pages = {};
    sessions.forEach(s => {
      if (!s.pageViews) return;
      Object.values(s.pageViews).forEach(pv => {
        const path = pv.path || '/';
        if (!pages[path]) pages[path] = { path, title: pv.title || '', count: 0 };
        pages[path].count++;
      });
    });

    const arr = Object.values(pages).sort((a, b) => b.count - a.count).slice(0, 15);
    const max = arr[0]?.count || 1;

    if (arr.length === 0) {
      container.innerHTML = '<div class="empty-state">No data yet</div>';
      return;
    }

    container.innerHTML = arr.map(p => `
      <div class="page-item">
        <div class="source-info" style="flex:1">
          <div class="page-path">${p.path}</div>
          ${p.title ? `<div class="page-title">${p.title}</div>` : ''}
          <div class="source-bar"><div class="source-bar-fill" style="width:${(p.count/max)*100}%;background:linear-gradient(90deg,var(--blue),var(--green))"></div></div>
        </div>
        <div class="page-views">${p.count}</div>
      </div>
    `).join('');
  }

  function renderCountries(sessions) {
    const container = document.getElementById('country-list');
    const countries = {};
    sessions.forEach(s => {
      if (!s.geo) return;
      const key = (s.geo.countryCode || 'XX') + '|' + (s.geo.city || 'Unknown');
      if (!countries[key]) countries[key] = {
        country: s.geo.country || 'Unknown',
        countryCode: s.geo.countryCode || '',
        city: s.geo.city || 'Unknown',
        count: 0
      };
      countries[key].count++;
    });

    const arr = Object.values(countries).sort((a, b) => b.count - a.count).slice(0, 15);
    const max = arr[0]?.count || 1;

    if (arr.length === 0) {
      container.innerHTML = '<div class="empty-state">No data yet</div>';
      return;
    }

    container.innerHTML = arr.map(c => `
      <div class="country-item">
        <div class="country-flag">${getFlagEmoji(c.countryCode)}</div>
        <div style="flex:1">
          <div class="country-name">${c.country}</div>
          <div class="country-city">${c.city}</div>
        </div>
        <div class="country-count">${c.count}</div>
      </div>
    `).join('');
  }

  function renderDevices(sessions) {
    const container = document.getElementById('device-chart');
    const devices = { Desktop: 0, Mobile: 0, Tablet: 0 };
    const browsers = {};
    const os = {};

    sessions.forEach(s => {
      if (!s.device) return;
      const dt = s.device.deviceType || 'Desktop';
      devices[dt] = (devices[dt] || 0) + 1;
      const br = s.device.browser || 'Other';
      browsers[br] = (browsers[br] || 0) + 1;
      const osName = s.device.os || 'Other';
      os[osName] = (os[osName] || 0) + 1;
    });

    const sessionTotal = sessions.length;
    const iosCount = os.iOS || 0;
    const androidCount = os.Android || 0;
    const mobileOsSummary = document.getElementById('mobile-os-summary');
    if (mobileOsSummary) {
      const iosPct = sessionTotal ? Math.round(iosCount / sessionTotal * 100) : 0;
      const androidPct = sessionTotal ? Math.round(androidCount / sessionTotal * 100) : 0;
      mobileOsSummary.innerHTML = `
        <div class="mobile-os-card ios-card"><div class="mobile-os-label">🍎 iOS</div><div class="mobile-os-value">${iosCount}</div><div class="mobile-os-share">${iosPct}% of selected sessions</div></div>
        <div class="mobile-os-card android-card"><div class="mobile-os-label">🤖 Android</div><div class="mobile-os-value">${androidCount}</div><div class="mobile-os-share">${androidPct}% of selected sessions</div></div>
      `;
    }
    const total = sessionTotal || 1;

    const deviceColors = { Desktop: '#6c5ce7', Mobile: '#fd79a8', Tablet: '#fdcb6e' };
    const browserColors = ['#00cec9','#74b9ff','#fd79a8','#fdcb6e','#e17055','#a29bfe','#55efc4'];

    let html = '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Device Type</div>';
    Object.entries(devices).forEach(([k, v]) => {
      if (v > 0) {
        html += `<div class="device-row">
          <div class="device-row-header"><span class="name">${getDeviceEmoji(k)} ${k}</span><span class="count">${v} (${Math.round(v/total*100)}%)</span></div>
          <div class="device-bar"><div class="device-bar-fill" style="width:${v/total*100}%;background:${deviceColors[k]||'#666'}"></div></div>
        </div>`;
      }
    });
    html += '</div>';

    html += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Browsers</div>';
    const browserArr = Object.entries(browsers).sort((a,b) => b[1]-a[1]);
    browserArr.forEach(([k, v], i) => {
      html += `<div class="device-row">
        <div class="device-row-header"><span class="name">${k}</span><span class="count">${v} (${Math.round(v/total*100)}%)</span></div>
        <div class="device-bar"><div class="device-bar-fill" style="width:${v/total*100}%;background:${browserColors[i%browserColors.length]}"></div></div>
      </div>`;
    });
    html += '</div>';

    html += '<div><div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Operating System</div>';
    const osArr = Object.entries(os).sort((a,b) => b[1]-a[1]);
    osArr.forEach(([k, v], i) => {
      html += `<div class="device-row">
        <div class="device-row-header"><span class="name">${k}</span><span class="count">${v} (${Math.round(v/total*100)}%)</span></div>
        <div class="device-bar"><div class="device-bar-fill" style="width:${v/total*100}%;background:${browserColors[(i+3)%browserColors.length]}"></div></div>
      </div>`;
    });
    html += '</div>';

    if (sessions.length === 0) html = '<div class="empty-state">No data yet</div>';
    container.innerHTML = html;
  }

  function socialPlatformFromField(fieldName) {
    const key = String(fieldName || '').toLowerCase();
    if (/instagram|insta/.test(key)) return 'Instagram';
    if (/facebook|fb_?handle/.test(key)) return 'Facebook';
    if (/linkedin/.test(key)) return 'LinkedIn';
    if (/twitter|x_?handle|(^|[^a-z])x([^a-z]|$)/.test(key)) return 'X';
    if (/tiktok/.test(key)) return 'TikTok';
    if (/youtube|yt_?handle/.test(key)) return 'YouTube';
    if (/telegram/.test(key)) return 'Telegram';
    if (/social|profile|handle/.test(key)) return 'Social profile';
    return '';
  }

  function getSocialHref(platform, value) {
    const raw = String(value || '').trim();
    if (/^(https?:\/\/|www\.)/i.test(raw)) {
      const candidate = /^www\./i.test(raw) ? 'https://' + raw : raw;
      try {
        const parsed = new URL(candidate);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
      } catch (e) { return ''; }
    }
    const handle = raw.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
    if (!handle || /\s/.test(handle) || platform === 'Social profile') return '';
    const bases = {
      Instagram: 'https://www.instagram.com/',
      Facebook: 'https://www.facebook.com/',
      LinkedIn: 'https://www.linkedin.com/in/',
      X: 'https://x.com/',
      TikTok: 'https://www.tiktok.com/@',
      YouTube: 'https://www.youtube.com/@',
      Telegram: 'https://t.me/'
    };
    return bases[platform] ? bases[platform] + encodeURIComponent(handle) : '';
  }

  function extractLeadContact(data) {
    const entries = Object.entries(data || {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim());
    const find = pattern => entries.find(([key]) => pattern.test(String(key)));
    const name = find(/^(full.?name|your.?name|name|first.?name)$/i) || find(/full.?name|your.?name/i);
    const phone = find(/phone|mobile|telephone|tel.?number|contact.?number|whatsapp.?number/i);
    const email = find(/e.?mail/i);
    const socials = entries.map(([key, value]) => ({ platform: socialPlatformFromField(key), key, value: String(value).trim() }))
      .filter(item => item.platform);
    return {
      name: name ? String(name[1]).trim() : '',
      phone: phone ? String(phone[1]).trim() : '',
      email: email ? String(email[1]).trim() : '',
      socials
    };
  }

  function renderLeads(sessions) {
    const container = document.getElementById('leads-list');
    const leads = [];
    sessions.forEach(s => {
      if (s.digitalCard) {
        if (s.digitalCard.submitted) {
          leads.push({
            type: 'form',
            typeLabel: '📋 Enquiry Form',
            time: s.digitalCard.submitTime,
            data: s.digitalCard.formData || {},
            session: s
          });
        }
        if (s.digitalCard.whatsappClicked) {
          leads.push({
            type: 'whatsapp',
            typeLabel: '💬 WhatsApp',
            time: s.digitalCard.clickTime,
            data: { link: s.digitalCard.href },
            session: s
          });
        }
      }
      // Also detect from events
      if (s.events) {
        Object.values(s.events).forEach(evt => {
          if (evt.type === 'whatsapp_click' && !leads.find(l => l.session._key === s._key && l.type === 'whatsapp')) {
            leads.push({
              type: 'whatsapp',
              typeLabel: '💬 WhatsApp',
              time: evt.timestamp,
              data: { link: evt.href, text: evt.text },
              session: s
            });
          }
          if (evt.type === 'form_submit' && !leads.find(l => l.session._key === s._key && l.type === 'form')) {
            leads.push({
              type: 'form',
              typeLabel: '📋 Form Submit',
              time: evt.timestamp,
              data: evt.data || evt.formData || {},
              session: s
            });
          }
        });
      }
    });

    leads.sort((a, b) => (b.time || 0) - (a.time || 0));
    const search = (document.getElementById('lead-search')?.value || '').trim().toLowerCase();
    const visibleLeads = search ? leads.filter(lead => {
      const haystack = [getSessionSiteName(lead.session), lead.session.geo?.city, lead.session.geo?.country,
        ...Object.entries(lead.data || {}).flatMap(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])]
        .join(' ').toLowerCase();
      return haystack.includes(search);
    }) : leads;

    if (visibleLeads.length === 0) {
      container.innerHTML = leads.length
        ? '<div class="empty-state">No leads match that search.</div>'
        : '<div class="empty-state">No leads captured yet<br><span style="font-size:11px">Contact details appear only when a visitor submits them in a detected enquiry form.</span></div>';
      return;
    }

    container.innerHTML = visibleLeads.slice(0, 50).map(l => {
      const loc = l.session.geo ? `${l.session.geo.city || ''}, ${l.session.geo.country || ''}`.replace(/^, |, $/g, '') : 'Unknown';
      const flag = getFlagEmoji(l.session.geo?.countryCode || '');
      const contact = extractLeadContact(l.data);
      const displayName = contact.name || (l.type === 'whatsapp' ? 'WhatsApp click (identity not shared)' : 'Enquiry lead');
      const phoneHref = contact.phone ? contact.phone.replace(/[^0-9+]/g, '') : '';
      const contactActions = [
        contact.phone ? `<a class="lead-action" href="tel:${escapeHtml(phoneHref)}">☎ ${escapeHtml(contact.phone)}</a>` : '',
        contact.email ? `<a class="lead-action" href="mailto:${encodeURIComponent(contact.email)}">✉ ${escapeHtml(contact.email)}</a>` : '',
        ...contact.socials.map(social => {
          const href = getSocialHref(social.platform, social.value);
          const safeValue = escapeHtml(social.value);
          return href
            ? `<a class="lead-action" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(social.platform)} ↗ ${safeValue}</a>`
            : `<span class="lead-action">${escapeHtml(social.platform)}: ${safeValue}</span>`;
        })
      ].filter(Boolean).join('');
      const fields = Object.entries(l.data || {})
        .filter(([k]) => !k.match(/^(bot|submit|_)/i))
        .filter(([k]) => !/^(full.?name|your.?name|name|first.?name|phone|mobile|telephone|tel.?number|contact.?number|whatsapp.?number|e.?mail|instagram|insta|facebook|fb_?handle|linkedin|twitter|x_?handle|tiktok|youtube|yt_?handle|telegram|social|profile|handle)$/i.test(k))
        .map(([k, v]) => `<div class="field"><span class="key">${escapeHtml(k)}:</span><span class="val">${escapeHtml(typeof v === 'string' ? v : JSON.stringify(v))}</span></div>`).join('');
      return `
        <div class="lead-item">
          <div class="lead-header">
            <span class="lead-type ${l.type}">${l.typeLabel}</span>
            <span class="lead-time">${formatTimeAgo(l.time)}</span>
          </div>
          <div class="lead-contact-name">${escapeHtml(displayName)}</div>
          ${contactActions ? `<div class="lead-contact-actions">${contactActions}</div>` : '<div class="lead-no-contact">No phone/email/social handle was submitted for this interaction.</div>'}
          ${fields ? `<div class="lead-data">${fields}</div>` : ''}
          <div class="lead-meta">${flag} ${escapeHtml(loc)} · ${escapeHtml(l.session.device?.deviceType || '')} ${escapeHtml(l.session.device?.browser || '')} · ${escapeHtml(getSessionSiteName(l.session))} · ${l.time ? formatClockTime(l.time) : ''}</div>
        </div>
      `;
    }).join('');
  }

  function renderEventStream() {
    const container = document.getElementById('event-timeline');
    const cutoff = getTimeFilter();
    const selectedSite = document.getElementById('site-filter')?.value || '__all__';
    const events = eventStream.filter(e => {
      const session = allSessions[e._sessionKey];
      const siteId = session ? getSessionSiteId(session) : (e.siteId || 'brand-designer');
      return e.timestamp >= cutoff && (selectedSite === '__all__' || siteId === selectedSite);
    }).slice(0, 50);

    if (events.length === 0) {
      container.innerHTML = '<div class="empty-state">Waiting for events...</div>';
      return;
    }

    container.innerHTML = events.map(e => {
      const eventSession = allSessions[e._sessionKey];
      const eventSite = getSessionSiteName(eventSession || { siteId: e.siteId, siteName: e.siteName });
      const siteTag = selectedSite === '__all__' ? `<span class="event-site">${escapeHtml(eventSite)}</span> · ` : '';
      const dotClass = ['page_view','click','whatsapp_click','phone_click','email_click','form_submit','form_field_focus','form_field_change','scroll_depth','session_start','outbound_click','lead_interaction','portfolio_interaction','form_submit_click','page_hidden','page_visible','custom_whatsapp_click','custom_form_submit'].includes(e.type) ? e.type : 'default';
      let detail = '';
      switch (e.type) {
        case 'page_view': detail = `Viewed <code>${e.path || '/'}</code>`; break;
        case 'click': detail = `Clicked <code>${e.text || e.selector || 'element'}</code>`; break;
        case 'whatsapp_click': detail = '💬 WhatsApp clicked'; break;
        case 'phone_click': detail = '📞 Phone call clicked'; break;
        case 'email_click': detail = '📧 Email clicked'; break;
        case 'outbound_click': detail = `→ Outbound: <code>${e.href || ''}</code>`; break;
        case 'form_submit': detail = '📋 Form submitted'; break;
        case 'form_submit_click': detail = `Submit: ${e.buttonText || 'form'}`; break;
        case 'form_field_focus': detail = `Field focus: <code>${e.field || ''}</code>`; break;
        case 'form_field_change': detail = `Field: <code>${e.field || ''}</code>`; break;
        case 'scroll_depth': detail = `Scrolled to ${e.depth || ''}`; break;
        case 'session_start': detail = `New session · ${e.trafficSource || ''} · ${e.deviceType || ''} · ${e.country || ''}`; break;
        case 'lead_interaction': detail = `🎯 Lead: ${e.element || ''}`; break;
        case 'portfolio_interaction': detail = `🖼️ Portfolio: ${e.element || ''}`; break;
        case 'page_hidden': detail = `Tab hidden after ${formatDuration(e.timeOnPage || 0)}`; break;
        case 'page_visible': detail = 'Tab visible again'; break;
        default: {
          const label = e.type.replace(/_/g, ' ');
          const extras = [];
          if (e.text) extras.push(e.text);
          if (e.path) extras.push(e.path);
          if (e.href) extras.push(e.href);
          if (e.depth) extras.push(e.depth);
          detail = `<span style="text-transform:capitalize">${label}</span> ${extras.length ? '· <code>' + extras.slice(0,2).join(' · ') + '</code>' : ''}`;
        }
      }
      return `
        <div class="event-item">
          <div class="event-dot ${dotClass}"></div>
          <div class="event-body">
            <div class="event-type">${e.type.replace(/_/g, ' ')}</div>
            <div class="event-detail">${detail}</div>
            <div class="event-time">${siteTag}${formatClockTime(e.timestamp)} · ${formatTimeAgo(e.timestamp)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== SESSION DETAIL MODAL =====
  function openSessionDetail(sessionKey) {
    const s = allSessions[sessionKey];
    if (!s) return;

    const loc = s.geo ? `${s.geo.city || ''}, ${s.geo.region || ''}, ${s.geo.country || ''}`.replace(/^, |, /g, '').replace(/^,/, '') : 'Unknown';
    const flag = getFlagEmoji(s.geo?.countryCode || '');
    const device = s.device || {};
    const hb = s.heartbeat || {};
    const end = s.sessionEnd || {};
    const duration = end.durationSeconds || hb.durationSeconds || 0;
    const pvs = s.pageViews ? Object.values(s.pageViews) : [];
    const evts = s.events ? Object.values(s.events).sort((a,b) => a.timestamp - b.timestamp) : [];

    const deviceColor = colorFromString(s.sessionId);

    let html = `<div class="session-detail">
      <h3>${flag} Session Details</h3>
      <div class="detail-grid">
        <div class="detail-card"><div class="label">Website</div><div class="value">${escapeHtml(getSessionSiteName(s))}</div></div>
        <div class="detail-card"><div class="label">Location</div><div class="value">${loc}</div></div>
        <div class="detail-card"><div class="label">Source</div><div class="value">${getSourceIcon(s.traffic?.source)} ${s.traffic?.source || '(direct)'}</div></div>
        <div class="detail-card"><div class="label">Device</div><div class="value">${getDeviceEmoji(device.deviceType)} ${device.deviceType || ''} · ${device.browser || ''} ${device.browserVersion || ''}</div></div>
        <div class="detail-card"><div class="label">OS</div><div class="value">${device.os || 'Unknown'}</div></div>
        <div class="detail-card"><div class="label">Screen</div><div class="value">${device.screen || ''} (${device.viewport || ''})</div></div>
        <div class="detail-card"><div class="label">Language</div><div class="value">${device.language || ''} · ${device.timezone || ''}</div></div>
        <div class="detail-card"><div class="label">Duration</div><div class="value">${formatDuration(duration)}</div></div>
        <div class="detail-card"><div class="label">Pages Viewed</div><div class="value">${pvs.length} pages</div></div>
        <div class="detail-card"><div class="label">Started</div><div class="value">${new Date(s.startTime).toLocaleString()}</div></div>
        <div class="detail-card"><div class="label">Max Scroll</div><div class="value">${end.maxScrollDepth || s.maxScrollDepth || 0}%</div></div>
      </div>`;

    if (s.digitalCard) {
      html += `<div style="margin-bottom:20px;padding:16px;background:var(--green-dim);border:1px solid var(--green);border-radius:8px">
        <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:8px">💼 Digital Card Interaction</div>`;
      if (s.digitalCard.formData) {
        Object.entries(s.digitalCard.formData).forEach(([k,v]) => {
          html += `<div style="font-size:12px;margin-bottom:4px"><strong style="color:var(--text-secondary)">${k}:</strong> ${v}</div>`;
        });
      }
      if (s.digitalCard.whatsappClicked) html += `<div style="font-size:12px">💬 WhatsApp clicked: ${s.digitalCard.href || ''}</div>`;
      html += `</div>`;
    }

    if (pvs.length > 0) {
      html += `<div style="margin-bottom:16px"><h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">📄 Page Journey</h4>`;
      pvs.forEach((pv, i) => {
        html += `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)"><strong style="color:var(--accent-light)">${i+1}.</strong> <code>${pv.path}</code> ${pv.timeSpent ? '· ' + formatDuration(pv.timeSpent) : ''}</div>`;
      });
      html += `</div>`;
    }

    if (evts.length > 0) {
      html += `<div class="event-log"><h4>⚡ Event Timeline (${evts.length} events)</h4>`;
      evts.slice(-100).forEach(e => {
        const evDetail = [];
        if (e.text) evDetail.push(e.text);
        if (e.href) evDetail.push(e.href);
        if (e.path && e.type === 'page_view') evDetail.push(e.path);
        if (e.depth) evDetail.push(e.depth);
        html += `<div style="font-size:11px;padding:4px 0;color:var(--text-secondary)">
          <span style="color:var(--text-muted);font-family:monospace">${Math.round(e.timeSinceStart)}s</span>
          <strong style="color:var(--text-primary);margin:0 6px">${e.type}</strong>
          ${evDetail.join(' · ')}
        </div>`;
      });
      html += `</div>`;
    }

    html += '</div>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('session-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('session-modal').classList.add('hidden');
  }

  // Optional database URL override for testing, while keeping the real Firebase Web App config.
  function getDBFromURL() {
    const dbUrl = new URLSearchParams(window.location.search).get('db');
    if (dbUrl && window.__AA_FIREBASE_CONFIG__) {
      return { ...window.__AA_FIREBASE_CONFIG__, databaseURL: dbUrl };
    }
    return null;
  }

  // ===== BOOT =====
  function boot() {
    let config = window.__AA_FIREBASE_CONFIG__ || null;
    if (!config) {
      const savedConfig = localStorage.getItem('aa_firebase_config');
      if (savedConfig) {
        try { config = JSON.parse(savedConfig); } catch (e) {}
      }
    }
    const urlConfig = getDBFromURL();
    if (urlConfig) config = urlConfig;

    if (config && config.apiKey && config.databaseURL) {
      if (initFirebase(config)) {
        showLogin('Sign in with the Google account allowed by the database rules.');
        return;
      }
    }
    showSetup();
  }

  // Event listeners
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('save-config-btn').addEventListener('click', () => {
      const text = document.getElementById('firebase-config-input').value;
      const config = parseConfig(text);
      if (!config || !config.databaseURL) {
        alert('Could not parse your Firebase config. Make sure it includes databaseURL.');
        return;
      }
      localStorage.setItem('aa_firebase_config', JSON.stringify(config));
      if (initFirebase(config)) {
        showLogin('Sign in with the Google account allowed by the database rules.');
      }
    });

    document.getElementById('google-login-btn').addEventListener('click', async () => {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await auth.signInWithPopup(provider);
      } catch (error) {
        const message = error.code === 'auth/unauthorized-domain'
          ? 'Add this GitHub Pages domain to Firebase Authentication → Settings → Authorized domains.'
          : 'Google sign-in failed: ' + (error.message || error.code || 'unknown error');
        showLogin(message);
      }
    });

    document.getElementById('signout-btn').addEventListener('click', () => {
      if (auth) auth.signOut().catch(error => console.error('Sign-out error:', error));
    });

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('time-range').addEventListener('change', render);
    document.getElementById('site-filter').addEventListener('change', render);
    document.getElementById('lead-search').addEventListener('input', render);
    document.getElementById('refresh-btn').addEventListener('click', () => {
      if (db) {
        allSessions = {};
        eventStream = [];
        attachListeners();
      }
    });
    document.getElementById('settings-btn').addEventListener('click', () => {
      if (confirm('Disconnect and reconfigure Firebase?')) {
        localStorage.removeItem('aa_firebase_config');
        location.reload();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    boot();
  });
})();
