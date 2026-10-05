/*
 * Audiences Analyze — per-site embed template
 *
 * Copy into each website just before </body>.
 * tracker.js already contains this Firebase Web App config.
 * Only change SITE_ID, SITE_NAME, SITE_URL, and the GitHub Pages username/repo URL.
 */
(function () {
  window.__AA_SITE_ID__ = "brand-designer";
  window.__AA_SITE_NAME__ = "Brand Designer";
  window.__AA_SITE_URL__ = "https://rjsarkar83.github.io/Brand_Designer/";

  var tracker = document.createElement("script");
  tracker.src = "https://rjsarkar83.github.io/Audiences-analyze/tracker.js";
  tracker.async = true;
  document.head.appendChild(tracker);
})();
