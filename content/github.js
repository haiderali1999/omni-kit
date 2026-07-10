// OmniKit GitHub enhancer: shows repo size, default branch and last-push age
// on repository pages. Survives GitHub's SPA navigation.
(() => {
  const NON_REPO = new Set([
    "settings", "notifications", "explore", "marketplace", "topics", "trending",
    "collections", "sponsors", "orgs", "features", "pulls", "issues", "codespaces",
    "search", "login", "signup", "about", "pricing", "new", "organizations", "dashboard"
  ]);

  let lastKey = null;

  function fmtSize(kb) {
    if (kb < 1024) return kb + " KB";
    if (kb < 1024 * 1024) return (kb / 1024).toFixed(1) + " MB";
    return (kb / 1024 / 1024).toFixed(2) + " GB";
  }

  function timeAgo(iso) {
    const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
    if (days < 1) return "today";
    if (days < 30) return days + "d ago";
    if (days < 365) return Math.floor(days / 30) + "mo ago";
    return Math.floor(days / 365) + "y ago";
  }

  async function enhance() {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
    document.getElementById("omnikit-gh-badge")?.remove();
    if (!m || NON_REPO.has(m[1])) return;
    const key = m[1] + "/" + m[2];
    lastKey = key;

    try {
      const res = await fetch(`https://api.github.com/repos/${key}`);
      if (!res.ok) return;
      const data = await res.json();
      if (lastKey !== key) return; // navigated away meanwhile

      const badge = document.createElement("div");
      badge.id = "omnikit-gh-badge";
      badge.style.cssText =
        "display:inline-flex;gap:10px;align-items:center;margin:4px 0 0 4px;padding:3px 10px;" +
        "background:rgba(79,140,255,.12);border:1px solid rgba(79,140,255,.4);border-radius:20px;" +
        "font-size:12px;color:inherit;vertical-align:middle;";
      badge.innerHTML =
        `<span title="Repository size">📦 ${fmtSize(data.size)}</span>` +
        `<span title="Default branch">🌿 ${data.default_branch}</span>` +
        `<span title="Last push">⏱ ${timeAgo(data.pushed_at)}</span>`;

      const anchor =
        document.querySelector("#repository-container-header strong") ||
        document.querySelector('strong[itemprop="name"]');
      if (anchor) anchor.parentElement.appendChild(badge);
      else {
        badge.style.cssText += "position:fixed;bottom:14px;right:14px;z-index:9999;background:#1b1e26;color:#e8eaf0;";
        document.body.appendChild(badge);
      }
    } catch {
      // API rate limit or network issue — fail silently
    }
  }

  let href = location.href;
  setInterval(() => {
    if (location.href !== href) {
      href = location.href;
      enhance();
    }
  }, 1200);
  enhance();
})();
