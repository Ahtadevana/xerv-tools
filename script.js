(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* =========================================================
     THEME
  ========================================================= */
  const THEME_KEY = "xerv-devtools-theme";
  const root = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeToggle.setAttribute("aria-pressed", String(theme === "light"));
  }

  applyTheme(getPreferredTheme());

  themeToggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });

  /* =========================================================
     VIEW ROUTER — each tool feels like its own page,
     driven entirely by the URL hash so back/forward works.
  ========================================================= */
  const views = document.querySelectorAll(".view");
  const validRoutes = new Set(["git-remote", "color-lab"]);

  function routeFromHash() {
    const raw = location.hash.replace(/^#/, "");
    return validRoutes.has(raw) ? raw : "hub";
  }

  function activate(routeName) {
    views.forEach((view) => {
      const isTarget = view.dataset.view === routeName;
      if (isTarget) {
        view.classList.remove("anim-in");
        view.classList.add("active");
        // force reflow so the animation restarts every time this view is entered
        void view.offsetWidth;
        if (!prefersReducedMotion) view.classList.add("anim-in");
      } else {
        view.classList.remove("active", "anim-in");
      }
    });
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  function render() {
    activate(routeFromHash());
  }

  window.addEventListener("hashchange", render);
  render();

  document.querySelectorAll("[data-target]").forEach((card) => {
    card.addEventListener("click", () => {
      location.hash = card.dataset.target;
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = "";
    });
  });

  document.querySelectorAll("[data-home-link]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = "";
    });
  });

  /* =========================================================
     TOAST + CLIPBOARD
  ========================================================= */
  const toastEl = document.getElementById("toast");
  let toastTimer = null;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  async function copyText(text) {
    if (!text || text === "—") return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch (fallbackErr) {
        return false;
      }
    }
  }

  function flashCopied(el) {
    el.classList.add("copied");
    clearTimeout(el._copyTimer);
    el._copyTimer = setTimeout(() => el.classList.remove("copied"), 1400);
  }

  /* =========================================================
     GIT REMOTE CONVERTER
  ========================================================= */
  const gitInput = document.getElementById("git-input");
  const gitHttpsCode = document.getElementById("git-https");
  const gitSshCode = document.getElementById("git-ssh");
  const gitHttpsItem = document.getElementById("git-https-item");
  const gitSshItem = document.getElementById("git-ssh-item");
  const gitHint = document.getElementById("git-hint");

  function parseGithubUrl(raw) {
    const input = raw.trim();
    if (!input) return null;

    let match =
      input.match(/^(?:https?:\/\/)?(?:www\.)?github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i) ||
      input.match(/^git@github\.com:([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i) ||
      input.match(/^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i) ||
      input.match(/^git:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i);

    if (!match) return null;
    const [, owner, repo] = match;
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/i, "") };
  }

  function updateGitTool() {
    const parsed = parseGithubUrl(gitInput.value);
    if (!parsed) {
      gitHttpsCode.textContent = "—";
      gitSshCode.textContent = "—";
      gitHttpsItem.disabled = true;
      gitSshItem.disabled = true;
      gitHint.textContent = gitInput.value.trim()
        ? "That doesn't look like a GitHub repo URL yet — keep typing."
        : "Paste a repo URL above to see both remotes.";
      return;
    }
    const https = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    const ssh = `git@github.com:${parsed.owner}/${parsed.repo}.git`;
    gitHttpsCode.textContent = https;
    gitSshCode.textContent = ssh;
    gitHttpsItem.disabled = false;
    gitSshItem.disabled = false;
    gitHint.textContent = `Detected ${parsed.owner}/${parsed.repo} — click either remote to copy it.`;
  }

  gitInput.addEventListener("input", updateGitTool);
  updateGitTool();

  [gitHttpsItem, gitSshItem].forEach((item) => {
    item.addEventListener("click", async () => {
      const code = item.querySelector("code");
      const ok = await copyText(code.textContent);
      if (ok) {
        flashCopied(item);
        showToast(`Copied ${item === gitHttpsItem ? "HTTPS" : "SSH"} remote`);
      }
    });
  });

  /* =========================================================
     COLOR CONVERTER
  ========================================================= */
  const el = {
    hex: document.getElementById("hex-input"),
    rgb: document.getElementById("rgb-input"),
    hsl: document.getElementById("hsl-input"),
    hsv: document.getElementById("hsv-input"),
    cmyk: document.getElementById("cmyk-input"),
    ansiTrue: document.getElementById("ansi-true-input"),
    ansi256: document.getElementById("ansi-256-input"),
    swatch: document.getElementById("color-swatch"),
    swatchLabel: document.getElementById("swatch-label"),
  };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const round = (v) => Math.round(v);

  // ---- conversions, all funnel through {r,g,b} 0-255 ----

  function hexToRgb(hex) {
    let h = hex.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex({ r, g, b }) {
    return "#" + [r, g, b].map((v) => clamp(round(v), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function parseTriplet(str) {
    const nums = str.match(/-?\d+(\.\d+)?/g);
    if (!nums || nums.length < 3) return null;
    return nums.slice(0, 4).map(Number);
  }

  function parseRgbString(str) {
    const n = parseTriplet(str);
    if (!n) return null;
    const [r, g, b] = n;
    if ([r, g, b].some((v) => v < 0 || v > 255)) return null;
    return { r: round(r), g: round(g), b: round(b) };
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToRgb({ h, s, l }) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
  }

  function parseHslString(str) {
    const n = parseTriplet(str);
    if (!n) return null;
    let [h, s, l] = n;
    if (s < 0 || s > 100 || l < 0 || l > 100) return null;
    h = ((h % 360) + 360) % 360;
    return hslToRgb({ h, s, l });
  }

  function rgbToHsv({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s: s * 100, v: v * 100 };
  }

  function hsvToRgb({ h, s, v }) {
    s /= 100; v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
  }

  function parseHsvString(str) {
    const n = parseTriplet(str);
    if (!n) return null;
    let [h, s, v] = n;
    if (s < 0 || s > 100 || v < 0 || v > 100) return null;
    h = ((h % 360) + 360) % 360;
    return hsvToRgb({ h, s, v });
  }

  function rgbToCmyk({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    const c = (1 - r - k) / (1 - k);
    const m = (1 - g - k) / (1 - k);
    const y = (1 - b - k) / (1 - k);
    return { c: c * 100, m: m * 100, y: y * 100, k: k * 100 };
  }

  function cmykToRgb({ c, m, y, k }) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    const r = 255 * (1 - c) * (1 - k);
    const g = 255 * (1 - m) * (1 - k);
    const b = 255 * (1 - y) * (1 - k);
    return { r, g, b };
  }

  function parseCmykString(str) {
    const n = parseTriplet(str);
    if (!n || n.length < 4) return null;
    const [c, m, y, k] = n;
    if ([c, m, y, k].some((v) => v < 0 || v > 100)) return null;
    return cmykToRgb({ c, m, y, k });
  }

  function rgbToAnsiTrueString({ r, g, b }) {
    return `\\033[38;2;${round(r)};${round(g)};${round(b)}m`;
  }

  function parseAnsiTrueString(str) {
    const m = str.match(/38;2;(\d+);(\d+);(\d+)/);
    if (!m) return null;
    const [, r, g, b] = m.map(Number);
    if ([r, g, b].some((v) => v > 255)) return null;
    return { r, g, b };
  }

  function rgbToAnsi256({ r, g, b }) {
    if (round(r) === round(g) && round(g) === round(b)) {
      if (r < 8) return 16;
      if (r > 248) return 231;
      return round(((r - 8) / 247) * 24) + 232;
    }
    const ri = round((r / 255) * 5);
    const gi = round((g / 255) * 5);
    const bi = round((b / 255) * 5);
    return 16 + 36 * ri + 6 * gi + bi;
  }

  function rgbToAnsi256String(rgb) {
    return `\\033[38;5;${rgbToAnsi256(rgb)}m`;
  }

  // ---- render ----

  function contrastText({ r, g, b }) {
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#14110a" : "#f5f4f0";
  }

  function render_(rgb, sourceId) {
    const safe = {
      r: clamp(round(rgb.r), 0, 255),
      g: clamp(round(rgb.g), 0, 255),
      b: clamp(round(rgb.b), 0, 255),
    };

    if (sourceId !== "hex") el.hex.value = rgbToHex(safe);
    if (sourceId !== "rgb") el.rgb.value = `${safe.r}, ${safe.g}, ${safe.b}`;

    if (sourceId !== "hsl") {
      const hsl = rgbToHsl(safe);
      el.hsl.value = `${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%`;
    }
    if (sourceId !== "hsv") {
      const hsv = rgbToHsv(safe);
      el.hsv.value = `${round(hsv.h)}, ${round(hsv.s)}%, ${round(hsv.v)}%`;
    }
    if (sourceId !== "cmyk") {
      const cmyk = rgbToCmyk(safe);
      el.cmyk.value = `${round(cmyk.c)}%, ${round(cmyk.m)}%, ${round(cmyk.y)}%, ${round(cmyk.k)}%`;
    }
    if (sourceId !== "ansiTrue") el.ansiTrue.value = rgbToAnsiTrueString(safe);
    el.ansi256.value = rgbToAnsi256String(safe);

    const hex = rgbToHex(safe);
    el.swatch.style.backgroundColor = hex;
    el.swatchLabel.textContent = hex;
    el.swatchLabel.style.color = contrastText(safe);
    el.swatchLabel.style.background = safe.r + safe.g + safe.b > 620 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)";
  }

  const parsers = {
    hex: (v) => hexToRgb(v),
    rgb: (v) => parseRgbString(v),
    hsl: (v) => parseHslString(v),
    hsv: (v) => parseHsvString(v),
    cmyk: (v) => parseCmykString(v),
    ansiTrue: (v) => parseAnsiTrueString(v),
  };

  Object.entries(parsers).forEach(([key, parser]) => {
    el[key].addEventListener("input", () => {
      const parsed = parser(el[key].value);
      if (parsed) render_(parsed, key);
    });
  });

  // initial color
  render_({ r: 255, g: 180, b: 84 }, null);

  // copy buttons within color-lab
  document.querySelectorAll(".copy-btn[data-copy-target]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = document.getElementById(btn.dataset.copyTarget);
      const ok = await copyText(target.value);
      if (ok) {
        flashCopied(btn);
        showToast("Copied to clipboard");
      }
    });
  });
})();
