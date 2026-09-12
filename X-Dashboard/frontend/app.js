(() => {
  const state = {
    settings: {},
    shortcuts: [],
    iconLibrary: [],
    currentPage: 1,
    statuses: {},
  };

  const el = (id) => document.getElementById(id);

  const bg = el("bg");
  const brandTitle = el("brandTitle");
  const clockEl = el("clock");
  const greetingEl = el("greeting");
  const pagesViewport = el("pagesViewport");
  const pagesTrack = el("pagesTrack");
  const pageDots = el("pageDots");
  const edgeIndicatorLeft = el("edgeIndicatorLeft");
  const edgeIndicatorRight = el("edgeIndicatorRight");
  const emptyHint = el("emptyHint");

  const searchWrap = el("searchWrap");
  const searchForm = el("searchForm");
  const searchInput = el("searchInput");
  const searchSuggestions = el("searchSuggestions");

  const settingsBtn = el("settingsBtn");
  const closeDrawer = el("closeDrawer");
  const overlay = el("overlay");
  const drawer = el("drawer");

  const titleInput = el("titleInput");
  const searxngInput = el("searxngInput");
  const newTabInput = el("newTabInput");
  const greetingInput = el("greetingInput");
  const clock24hInput = el("clock24hInput");
  const uiScaleInput = el("uiScaleInput");
  const saveSettingsBtn = el("saveSettingsBtn");
  const settingsStatus = el("settingsStatus");
  const appVersion = el("appVersion");

  const wallpaperFile = el("wallpaperFile");
  const resetWallpaperBtn = el("resetWallpaperBtn");
  const importFile = el("importFile");
  const wallpaperPreview = el("wallpaperPreview");
  const accentSwatch = el("accentSwatch");
  const accentHex = el("accentHex");

  const addForm = el("addForm");
  const manageList = el("manageList");

  const editModal = el("editModal");
  const editForm = el("editForm");

  const scIcon = el("scIcon");
  const scIconPreview = el("scIconPreview");
  const scBrowseIconBtn = el("scBrowseIconBtn");
  const scIconFile = el("scIconFile");
  const editIcon = el("editIcon");
  const editIconPreview = el("editIconPreview");
  const editBrowseIconBtn = el("editBrowseIconBtn");
  const editIconFile = el("editIconFile");
  const editRemoveIconBtn = el("editRemoveIconBtn");

  const iconPickerModal = el("iconPickerModal");
  const iconPickerSearch = el("iconPickerSearch");
  const iconPickerGrid = el("iconPickerGrid");
  const iconPickerEmpty = el("iconPickerEmpty");
  const iconPickerCancel = el("iconPickerCancel");

  const tabBtns = Array.from(document.querySelectorAll(".tab-btn"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  function api(path, opts = {}) {
    return fetch(path, {
      headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      ...opts,
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    });
  }

  // ---------- wallpaper-driven color theme ----------

  function rgbToHsl(r, g, b) {
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
        default: h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function rgbStringToHex(rgbString) {
    const m = rgbString.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  function extractAccentFromImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = 48, h = 27;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const { data } = ctx.getImageData(0, 0, w, h);

          const buckets = new Map();
          let luminanceSum = 0;
          let luminanceCount = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 200) continue;
            // Perceptual luminance across every opaque pixel decides overall dark/light mode.
            luminanceSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            luminanceCount += 1;

            const [hh, ss, ll] = rgbToHsl(r, g, b);
            if (ll < 0.08 || ll > 0.92) continue; // skip near-black / near-white pixels for hue picking
            const key = `${Math.round(hh / 12)}_${Math.round(ss * 4)}`;
            const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, s: 0 };
            entry.count += 1;
            entry.r += r;
            entry.g += g;
            entry.b += b;
            entry.s += ss;
            buckets.set(key, entry);
          }

          const isDark = luminanceCount > 0 ? luminanceSum / luminanceCount < 0.5 : false;

          let best = null;
          for (const entry of buckets.values()) {
            const avgS = entry.s / entry.count;
            const score = entry.count * (0.4 + avgS);
            if (!best || score > best.score) best = { ...entry, score };
          }
          if (!best) {
            resolve({ hex: null, rgb: null, isDark });
            return;
          }

          const r = best.r / best.count;
          const g = best.g / best.count;
          const b = best.b / best.count;
          let [hh, ss, ll] = rgbToHsl(r, g, b);
          ss = Math.min(Math.max(ss, 0.38), 0.75);
          // Keep the accent readable against white text in both light and dark UI: mid-range lightness always.
          ll = Math.min(Math.max(ll, 0.4), 0.55);
          const [fr, fg, fb] = hslToRgb(hh, ss, ll);
          resolve({ hex: rgbToHex(fr, fg, fb), rgb: `${fr}, ${fg}, ${fb}`, isDark });
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // Mirrors the current theme/accent/wallpaper to localStorage so the inline
  // scripts in index.html can repaint them instantly on the next load,
  // before this script and /api/config have even finished fetching.
  function cacheThemeLocally(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (err) {}
  }

  // Device-local UI scale override ("auto" = defer to the CSS breakpoint in
  // style.css). Not part of the server-side settings — a laptop and a desktop
  // monitor viewing the same dashboard may each want a different size.
  function setUiScale(value) {
    const root = document.documentElement;
    if (!value || value === "auto") {
      root.style.removeProperty("--ui-scale");
    } else {
      root.style.setProperty("--ui-scale", value);
    }
    cacheThemeLocally("uiScale", value === "auto" ? "" : value);
    fitUiToViewport();
  }

  function setTheme(isDark) {
    const root = document.documentElement;
    if (isDark) {
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.removeAttribute("data-theme");
      root.style.colorScheme = "light";
    }
    cacheThemeLocally("theme", isDark ? "dark" : "");
  }

  async function applyWallpaperTheme() {
    cacheThemeLocally("wallpaper", state.settings.wallpaper);
    if (!state.settings.wallpaper) {
      document.documentElement.style.removeProperty("--accent-rgb");
      cacheThemeLocally("accentRgb", "");
      setTheme(false);
      return;
    }
    const palette = await extractAccentFromImage(`/wallpapers/${state.settings.wallpaper}`);
    if (palette) {
      if (palette.rgb) {
        document.documentElement.style.setProperty("--accent-rgb", palette.rgb);
        cacheThemeLocally("accentRgb", palette.rgb);
      }
      setTheme(palette.isDark);
    }
  }

  function renderIcon(container, shortcut) {
    container.innerHTML = "";
    // Always the live theme accent (derived from the wallpaper) — shortcuts
    // no longer carry their own fixed color, so this stays in sync as the
    // wallpaper/accent changes instead of going stale.
    const accentColor = "var(--accent)";
    const showInitial = () => {
      container.innerHTML = "";
      // Solid fill here (not the softened tint below) — this is a plain
      // text badge and needs the contrast for the initial to stay readable.
      container.style.background = accentColor;
      container.textContent = (shortcut.name || "?").trim().charAt(0).toUpperCase();
    };
    // With no custom icon set, the backend resolves one automatically:
    // a bundled icon-library match by name first (best quality), then a
    // scraped-and-cached favicon (resolved server-side since a browser
    // can't read another origin's HTML to find its <link rel="icon"> tag).
    const src = (shortcut.icon || "").trim() || `/icons/${shortcut.id}`;
    if (src) {
      // A soft tinted-glass backdrop behind the icon, not a solid block —
      // the icon artwork already carries its own color.
      container.style.background = `color-mix(in srgb, ${accentColor} 35%, transparent)`;
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.loading = "lazy";
      img.onerror = showInitial;
      container.appendChild(img);
    } else {
      showInitial();
    }
  }

  function updateIconPreview(previewEl, src) {
    previewEl.innerHTML = "";
    if (!src) return;
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.onerror = () => (previewEl.innerHTML = "");
    previewEl.appendChild(img);
  }

  // ---------- icon library picker ----------

  let iconPickerTargetInput = null;
  let iconPickerTargetPreview = null;

  const ICON_PICKER_MAX_RESULTS = 150;

  function iconMatchesQuery(entry, query) {
    const haystacks = [entry.slug, entry.name, ...(entry.aliases || [])];
    return haystacks.some((h) => h.toLowerCase().includes(query));
  }

  function renderIconPickerGrid() {
    const query = iconPickerSearch.value.trim().toLowerCase();
    iconPickerGrid.innerHTML = "";

    if (!query) {
      iconPickerEmpty.hidden = false;
      iconPickerEmpty.textContent = `Type to search ${state.iconLibrary.length.toLocaleString()} icons…`;
      return;
    }

    const allMatches = state.iconLibrary.filter((entry) => iconMatchesQuery(entry, query));
    iconPickerEmpty.hidden = allMatches.length !== 0;
    iconPickerEmpty.textContent = "No matching icons.";
    const matches = allMatches.slice(0, ICON_PICKER_MAX_RESULTS);
    for (const entry of matches) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "icon-picker-item";
      const img = document.createElement("img");
      img.src = `/icon-library/${entry.slug}.svg`;
      img.alt = "";
      img.loading = "lazy";
      const label = document.createElement("span");
      label.textContent = entry.name;
      item.appendChild(img);
      item.appendChild(label);
      item.addEventListener("click", () => {
        const value = `/icon-library/${entry.slug}.svg`;
        if (iconPickerTargetInput) iconPickerTargetInput.value = value;
        if (iconPickerTargetPreview) updateIconPreview(iconPickerTargetPreview, value);
        if (iconPickerTargetInput === scIcon) clearStagedIconFile();
        closeIconPicker();
      });
      iconPickerGrid.appendChild(item);
    }
    if (allMatches.length > matches.length) {
      const note = document.createElement("p");
      note.className = "hint icon-picker-truncated";
      note.textContent = `Showing ${matches.length} of ${allMatches.length} matches — refine your search to see more.`;
      iconPickerGrid.appendChild(note);
    }
  }

  function openIconPicker(targetInput, targetPreview) {
    iconPickerTargetInput = targetInput;
    iconPickerTargetPreview = targetPreview;
    iconPickerSearch.value = "";
    renderIconPickerGrid();
    iconPickerModal.hidden = false;
    iconPickerSearch.focus();
  }
  function closeIconPicker() {
    iconPickerModal.hidden = true;
  }

  // A new shortcut has no id yet, so it can't be uploaded to
  // /api/shortcuts/<id>/icon until after it's created. Stage the file
  // client-side (with a local object-URL preview) and upload it right
  // after creation succeeds, inside the addForm submit handler below.
  let stagedScIconFile = null;
  let stagedScIconPreviewUrl = null;
  function clearStagedIconFile() {
    if (stagedScIconPreviewUrl) URL.revokeObjectURL(stagedScIconPreviewUrl);
    stagedScIconFile = null;
    stagedScIconPreviewUrl = null;
    scIconFile.value = "";
  }
  scIconFile.addEventListener("change", () => {
    const file = scIconFile.files[0];
    if (!file) return;
    clearStagedIconFile();
    stagedScIconFile = file;
    scIcon.value = ""; // uploading a file overrides any library pick
    stagedScIconPreviewUrl = URL.createObjectURL(file);
    updateIconPreview(scIconPreview, stagedScIconPreviewUrl);
  });

  scBrowseIconBtn.addEventListener("click", () => openIconPicker(scIcon, scIconPreview));
  editBrowseIconBtn.addEventListener("click", () => openIconPicker(editIcon, editIconPreview));
  iconPickerCancel.addEventListener("click", closeIconPicker);
  iconPickerModal.addEventListener("click", (e) => {
    if (e.target === iconPickerModal) closeIconPicker();
  });
  iconPickerSearch.addEventListener("input", renderIconPickerGrid);

  editIconFile.addEventListener("change", async () => {
    const file = editIconFile.files[0];
    const id = el("editId").value;
    if (!file || !id) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const updated = await api(`/api/shortcuts/${id}/icon`, { method: "POST", body: formData });
      editIcon.value = updated.icon || "";
      updateIconPreview(editIconPreview, updated.icon || "");
      const idx = state.shortcuts.findIndex((s) => s.id === id);
      if (idx !== -1) state.shortcuts[idx] = updated;
      renderPages();
      renderManageList();
    } catch (err) {
      alert(err.message);
    } finally {
      editIconFile.value = "";
    }
  });

  editRemoveIconBtn.addEventListener("click", async () => {
    const id = el("editId").value;
    if (!id) return;
    try {
      const updated = await api(`/api/shortcuts/${id}/icon`, { method: "DELETE" });
      editIcon.value = "";
      updateIconPreview(editIconPreview, "");
      const idx = state.shortcuts.findIndex((s) => s.id === id);
      if (idx !== -1) state.shortcuts[idx] = updated;
      renderPages();
      renderManageList();
    } catch (err) {
      alert(err.message);
    }
  });

  function sortByOrder(shortcuts) {
    return [...shortcuts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // ---------- shortcut online status ----------

  const STATUS_LABELS = {
    online: "Online",
    degraded: "Reachable, but returned an error",
    offline: "Offline",
  };

  function buildStatusDot(shortcut) {
    const dot = document.createElement("span");
    dot.className = "tile-status-dot";
    dot.dataset.statusId = shortcut.id;
    applyStatusToDot(dot, state.statuses[shortcut.id]);
    return dot;
  }

  function applyStatusToDot(dot, status) {
    dot.className = "tile-status-dot" + (status ? ` status-${status}` : "");
    dot.title = STATUS_LABELS[status] || "Checking…";
  }

  async function refreshStatuses() {
    if (state.shortcuts.length === 0) return;
    try {
      const statuses = await api("/api/status");
      state.statuses = statuses;
      for (const [id, status] of Object.entries(statuses)) {
        document.querySelectorAll(`.tile-status-dot[data-status-id="${id}"]`).forEach((dot) => {
          applyStatusToDot(dot, status);
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  let statusPollTimer = null;
  function startStatusPolling() {
    refreshStatuses();
    if (statusPollTimer) clearInterval(statusPollTimer);
    statusPollTimer = setInterval(refreshStatuses, 60 * 1000);
  }

  // ---------- pages (multiple home-screen-style pages, like Android/iOS) ----------

  const MAX_SHORTCUTS_PER_PAGE = 14;

  function computeTotalPages() {
    let max = 1;
    for (const s of state.shortcuts) {
      const p = s.page || 1;
      if (p > max) max = p;
    }
    return max;
  }

  // Where a newly-added shortcut should land: the current page if it has
  // room, otherwise the next page after it that isn't full yet (creating a
  // fresh one past the last page if every existing page is full).
  function pageForNewShortcut() {
    let page = state.currentPage;
    const countOnPage = (p) => state.shortcuts.filter((s) => (s.page || 1) === p).length;
    const totalPages = computeTotalPages();
    while (page <= totalPages && countOnPage(page) >= MAX_SHORTCUTS_PER_PAGE) page++;
    return page;
  }

  let dragSourceId = null;

  // Moving a shortcut onto a tile on a different page moves it there (next
  // to that tile); dropping on a tile on the same page just reorders.
  async function handleTileDrop(sourceId, targetShortcut) {
    const source = state.shortcuts.find((s) => s.id === sourceId);
    if (!source || source.id === targetShortcut.id) return;
    if ((source.page || 1) !== (targetShortcut.page || 1)) {
      try {
        const updated = await api(`/api/shortcuts/${sourceId}`, {
          method: "PUT",
          body: JSON.stringify({ page: targetShortcut.page || 1 }),
        });
        const idx = state.shortcuts.findIndex((s) => s.id === sourceId);
        if (idx !== -1) state.shortcuts[idx] = updated;
      } catch (err) {
        alert(err.message);
        return;
      }
    }
    await reorderAfterDrop(sourceId, targetShortcut.id);
  }

  // Dropping on empty space on a page (or on its dot) just moves the
  // shortcut there, keeping its relative order.
  async function moveShortcutToPage(sourceId, page) {
    const source = state.shortcuts.find((s) => s.id === sourceId);
    if (!source || (source.page || 1) === page) return;
    try {
      const updated = await api(`/api/shortcuts/${sourceId}`, {
        method: "PUT",
        body: JSON.stringify({ page }),
      });
      const idx = state.shortcuts.findIndex((s) => s.id === sourceId);
      if (idx !== -1) state.shortcuts[idx] = updated;
      goToPage(page);
      renderPages();
      renderManageList();
    } catch (err) {
      alert(err.message);
    }
  }

  function buildTile(shortcut) {
    const tile = document.createElement("a");
    tile.className = "tile";
    tile.href = shortcut.url;
    tile.draggable = true;
    tile.dataset.id = shortcut.id;
    if (state.settings.open_new_tab) {
      tile.target = "_blank";
      tile.rel = "noopener noreferrer";
    }

    const iconWrap = document.createElement("div");
    iconWrap.className = "tile-icon";
    renderIcon(iconWrap, shortcut);

    const name = document.createElement("div");
    name.className = "tile-name";
    name.textContent = shortcut.name;

    tile.appendChild(iconWrap);
    tile.appendChild(name);
    tile.appendChild(buildStatusDot(shortcut));

    tile.addEventListener("dragstart", () => {
      dragSourceId = shortcut.id;
      tile.classList.add("dragging");
    });
    tile.addEventListener("dragend", () => {
      tile.classList.remove("dragging");
      document.querySelectorAll(".tile.drag-over").forEach((t) => t.classList.remove("drag-over"));
    });
    tile.addEventListener("dragover", (e) => {
      e.preventDefault();
      tile.classList.add("drag-over");
    });
    tile.addEventListener("dragleave", () => tile.classList.remove("drag-over"));
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      tile.classList.remove("drag-over");
      if (!dragSourceId || dragSourceId === shortcut.id) return;
      handleTileDrop(dragSourceId, shortcut);
    });

    return tile;
  }

  function renderPages() {
    const totalPages = computeTotalPages();
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    emptyHint.hidden = state.shortcuts.length !== 0;

    pagesTrack.innerHTML = "";
    pagesTrack.style.width = `${totalPages * 100}%`;

    for (let p = 1; p <= totalPages; p++) {
      const slide = document.createElement("div");
      slide.className = "page-slide";
      slide.style.width = `${100 / totalPages}%`;
      slide.dataset.page = String(p);

      const pageShortcuts = sortByOrder(state.shortcuts.filter((s) => (s.page || 1) === p));
      const tiles = document.createElement("div");
      tiles.className = "tiles";
      for (const shortcut of pageShortcuts) {
        tiles.appendChild(buildTile(shortcut));
      }
      slide.appendChild(tiles);

      // Dropping on empty space on this page (not on another tile) moves
      // the shortcut here.
      slide.addEventListener("dragover", (e) => e.preventDefault());
      slide.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!dragSourceId) return;
        moveShortcutToPage(dragSourceId, p);
      });

      pagesTrack.appendChild(slide);
    }

    updatePageTransform();
    renderPageDots(totalPages);
    fitUiToViewport();
  }

  // Shrinks the UI just enough that the tallest page's shortcuts fit on
  // screen without scrolling — pages are meant to be swiped between
  // (like a phone home screen), not scrolled within. Layered on top of
  // --ui-scale (the auto/manual size preference) as a separate multiplier
  // that only ever shrinks, never grows past it. All page-slides sit side by
  // side in the DOM (only translated, not removed), so document height
  // already reflects the tallest one regardless of which page is showing.
  function fitUiToViewport() {
    const root = document.documentElement;
    root.style.setProperty("--ui-scale-fit", "1");
    const needed = document.documentElement.scrollHeight;
    const available = window.innerHeight;
    if (needed > available) {
      const fit = Math.max(0.7, available / needed);
      root.style.setProperty("--ui-scale-fit", fit.toFixed(3));
    }
  }
  let fitResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(fitResizeTimer);
    fitResizeTimer = setTimeout(fitUiToViewport, 100);
  });

  function updatePageTransform() {
    const totalPages = computeTotalPages();
    const offsetPercent = (100 / totalPages) * (state.currentPage - 1);
    pagesTrack.style.transform = `translateX(-${offsetPercent}%)`;
  }

  function renderPageDots(totalPages) {
    pageDots.innerHTML = "";
    pageDots.hidden = totalPages <= 1;
    for (let p = 1; p <= totalPages; p++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "page-dot" + (p === state.currentPage ? " active" : "");
      dot.setAttribute("aria-label", `Page ${p}`);
      dot.addEventListener("click", () => goToPage(p));
      dot.addEventListener("dragover", (e) => {
        e.preventDefault();
        dot.classList.add("drag-over");
      });
      dot.addEventListener("dragleave", () => dot.classList.remove("drag-over"));
      dot.addEventListener("drop", (e) => {
        e.preventDefault();
        dot.classList.remove("drag-over");
        if (!dragSourceId) return;
        moveShortcutToPage(dragSourceId, p);
      });
      pageDots.appendChild(dot);
    }
  }

  function goToPage(p) {
    const totalPages = computeTotalPages();
    const clamped = Math.min(Math.max(p, 1), totalPages);
    if (clamped === state.currentPage) return;
    state.currentPage = clamped;
    updatePageTransform();
    renderPageDots(totalPages);
  }

  // Swipe/drag between pages, like a phone home screen.
  let pageDragStartX = null;
  let pageDragDeltaX = 0;
  pagesViewport.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    pageDragStartX = e.clientX;
    pageDragDeltaX = 0;
    pagesTrack.style.transition = "none";
  });
  pagesViewport.addEventListener("pointermove", (e) => {
    if (pageDragStartX === null) return;
    pageDragDeltaX = e.clientX - pageDragStartX;
    const totalPages = computeTotalPages();
    if (totalPages <= 1) return;
    const baseOffsetPercent = (100 / totalPages) * (state.currentPage - 1);
    const viewportWidth = pagesViewport.clientWidth || 1;
    const dragPercentOfTrack = (pageDragDeltaX / viewportWidth) * (100 / totalPages);
    pagesTrack.style.transform = `translateX(-${baseOffsetPercent - dragPercentOfTrack}%)`;
  });
  function endPageDrag() {
    if (pageDragStartX === null) return;
    pagesTrack.style.transition = "";
    const threshold = 60;
    if (pageDragDeltaX > threshold) goToPage(state.currentPage - 1);
    else if (pageDragDeltaX < -threshold) goToPage(state.currentPage + 1);
    else updatePageTransform();
    pageDragStartX = null;
    pageDragDeltaX = 0;
  }
  pagesViewport.addEventListener("pointerup", endPageDrag);
  pagesViewport.addEventListener("pointercancel", endPageDrag);
  pagesViewport.addEventListener("pointerleave", () => {
    if (pageDragStartX !== null) endPageDrag();
  });

  // Dragging a tile near the left/right edge auto-flips to the adjacent
  // page after a short hover, like a phone home screen. Holding at the
  // right edge of the last page creates a new page and moves the tile
  // there — pages exist purely as a byproduct of dragging, at any time,
  // regardless of how full the current page is.
  let edgeFlipTimer = null;
  function clearEdgeFlipTimer() {
    if (edgeFlipTimer) {
      clearTimeout(edgeFlipTimer);
      edgeFlipTimer = null;
    }
  }

  // Chevron + filling ring that appears the moment a drag nears an edge,
  // so it's obvious a page flip (or new-page move) is about to happen
  // instead of it happening silently after an unexplained pause.
  function showEdgeIndicator(side) {
    const target = side === "left" ? edgeIndicatorLeft : edgeIndicatorRight;
    const other = side === "left" ? edgeIndicatorRight : edgeIndicatorLeft;
    other.classList.remove("visible", "charging");
    target.classList.add("visible");
    target.classList.remove("charging");
    void target.offsetWidth; // force reflow so the ring restarts from empty
    requestAnimationFrame(() => target.classList.add("charging"));
  }
  function hideEdgeIndicators() {
    edgeIndicatorLeft.classList.remove("visible", "charging");
    edgeIndicatorRight.classList.remove("visible", "charging");
  }

  // Listen on the whole document, and measure against the actual window
  // edges — not pagesViewport's own bounding box. The content column is
  // centered and narrower than the window on wide screens, so watching
  // only its edges left a dead zone between it and the real screen edge
  // where dragging toward the edge did nothing.
  document.addEventListener("dragover", (e) => {
    if (!dragSourceId) return;
    const edgeZone = 60;
    const nearLeft = e.clientX < edgeZone;
    const nearRight = window.innerWidth - e.clientX < edgeZone;
    if (nearLeft || nearRight) {
      if (!edgeFlipTimer) {
        showEdgeIndicator(nearRight ? "right" : "left");
        edgeFlipTimer = setTimeout(() => {
          const totalPages = computeTotalPages();
          if (nearRight && state.currentPage === totalPages && dragSourceId) {
            moveShortcutToPage(dragSourceId, totalPages + 1);
          } else {
            goToPage(state.currentPage + (nearRight ? 1 : -1));
          }
          edgeFlipTimer = null;
          hideEdgeIndicators();
        }, 700);
      }
    } else {
      clearEdgeFlipTimer();
      hideEdgeIndicators();
    }
  });
  document.addEventListener("drop", () => {
    clearEdgeFlipTimer();
    hideEdgeIndicators();
  });
  document.addEventListener("dragend", () => {
    clearEdgeFlipTimer();
    hideEdgeIndicators();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!drawer.hidden || !editModal.hidden || !iconPickerModal.hidden) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    goToPage(state.currentPage + (e.key === "ArrowRight" ? 1 : -1));
  });

  async function reorderAfterDrop(sourceId, targetId) {
    const sorted = [...state.shortcuts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const fromIdx = sorted.findIndex((s) => s.id === sourceId);
    const toIdx = sorted.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    const order = sorted.map((s) => s.id);
    try {
      const updated = await api("/api/shortcuts/reorder", {
        method: "POST",
        body: JSON.stringify({ order }),
      });
      state.shortcuts = updated;
      renderPages();
      renderManageList();
    } catch (err) {
      console.error(err);
    }
  }

  function buildManageRow(s) {
    const row = document.createElement("div");
    row.className = "manage-item";

    const iconWrap = document.createElement("div");
    iconWrap.className = "manage-icon";
    renderIcon(iconWrap, s);

    const info = document.createElement("div");
    info.className = "manage-info";
    const name = document.createElement("div");
    name.className = "manage-name";
    name.textContent = s.name;
    const meta = document.createElement("div");
    meta.className = "manage-meta";
    meta.textContent = s.url;
    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "manage-actions";

    const editBtn = document.createElement("button");
    editBtn.title = "Edit";
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>';
    editBtn.addEventListener("click", () => openEditModal(s));

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.title = "Delete";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Z"/></svg>';
    delBtn.addEventListener("click", () => deleteShortcut(s.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(iconWrap);
    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  function renderManageList() {
    manageList.innerHTML = "";
    if (state.shortcuts.length === 0) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "No shortcuts yet.";
      manageList.appendChild(p);
      return;
    }

    const totalPages = computeTotalPages();
    if (totalPages <= 1) {
      for (const s of sortByOrder(state.shortcuts)) {
        manageList.appendChild(buildManageRow(s));
      }
      return;
    }

    for (let p = 1; p <= totalPages; p++) {
      const items = sortByOrder(state.shortcuts.filter((s) => (s.page || 1) === p));
      if (items.length === 0) continue;
      const section = document.createElement("div");
      section.className = "manage-group";
      const label = document.createElement("p");
      label.className = "manage-group-label";
      label.textContent = `Page ${p}`;
      section.appendChild(label);
      for (const s of items) section.appendChild(buildManageRow(s));
      manageList.appendChild(section);
    }
  }

  async function deleteShortcut(id) {
    if (!confirm("Delete this shortcut?")) return;
    try {
      await api(`/api/shortcuts/${id}`, { method: "DELETE" });
      state.shortcuts = state.shortcuts.filter((s) => s.id !== id);
      renderPages();
      renderManageList();
    } catch (err) {
      alert(err.message);
    }
  }

  function openEditModal(shortcut) {
    el("editId").value = shortcut.id;
    el("editName").value = shortcut.name;
    el("editUrl").value = shortcut.url;
    editIcon.value = shortcut.icon || "";
    // Preview whatever will actually render — the custom icon if set, else
    // the same auto-resolved icon (library match / favicon) the tile uses.
    updateIconPreview(editIconPreview, shortcut.icon || `/icons/${shortcut.id}`);
    editModal.hidden = false;
  }

  el("editCancel").addEventListener("click", () => (editModal.hidden = true));
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) editModal.hidden = true;
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = el("editId").value;
    const payload = {
      name: el("editName").value.trim(),
      url: el("editUrl").value.trim(),
      icon: el("editIcon").value.trim(),
    };
    try {
      const updated = await api(`/api/shortcuts/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const idx = state.shortcuts.findIndex((s) => s.id === id);
      if (idx !== -1) state.shortcuts[idx] = updated;
      editModal.hidden = true;
      renderPages();
      renderManageList();
      refreshStatuses();
    } catch (err) {
      alert(err.message);
    }
  });

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const targetPage = pageForNewShortcut();
    const payload = {
      name: el("scName").value.trim(),
      url: el("scUrl").value.trim(),
      icon: el("scIcon").value.trim(),
      page: targetPage,
    };
    try {
      let created = await api("/api/shortcuts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (stagedScIconFile) {
        const formData = new FormData();
        formData.append("file", stagedScIconFile);
        try {
          created = await api(`/api/shortcuts/${created.id}/icon`, { method: "POST", body: formData });
        } catch (err) {
          alert(`Shortcut created, but the icon upload failed: ${err.message}`);
        }
      }
      state.shortcuts.push(created);
      state.currentPage = targetPage;
      renderPages();
      renderManageList();
      refreshStatuses();
      addForm.reset();
      updateIconPreview(scIconPreview, "");
      clearStagedIconFile();
    } catch (err) {
      alert(err.message);
    }
  });

  function switchTab(name) {
    for (const btn of tabBtns) {
      const active = btn.dataset.tab === name;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    }
    for (const panel of tabPanels) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }
  for (const btn of tabBtns) {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  }

  function currentAccentHex() {
    const val = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    return rgbStringToHex(val) || "#4f7cff";
  }

  function refreshAppearanceTab() {
    if (state.settings.wallpaper) {
      wallpaperPreview.style.backgroundImage = `url(/wallpapers/${state.settings.wallpaper})`;
    } else {
      wallpaperPreview.style.backgroundImage = "";
    }
    const hex = currentAccentHex();
    accentSwatch.style.background = hex;
    accentHex.textContent = hex.toUpperCase();
  }

  function openDrawer() {
    overlay.hidden = false;
    drawer.hidden = false;
    titleInput.value = state.settings.title || "";
    searxngInput.value = state.settings.searxng_url || "";
    newTabInput.checked = !!state.settings.open_new_tab;
    greetingInput.checked = state.settings.greeting_enabled !== false;
    clock24hInput.checked = state.settings.clock_24h !== false;
    let savedUiScale = "";
    try { savedUiScale = localStorage.getItem("uiScale") || ""; } catch (err) {}
    uiScaleInput.value = savedUiScale || "auto";
    refreshAppearanceTab();
    switchTab("general");
    renderManageList();
  }
  function closeDrawerFn() {
    overlay.hidden = true;
    drawer.hidden = true;
    settingsStatus.textContent = "";
  }
  settingsBtn.addEventListener("click", openDrawer);
  closeDrawer.addEventListener("click", closeDrawerFn);
  overlay.addEventListener("click", closeDrawerFn);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawerFn();
      editModal.hidden = true;
    }
  });

  uiScaleInput.addEventListener("change", () => setUiScale(uiScaleInput.value));

  saveSettingsBtn.addEventListener("click", async () => {
    try {
      const updated = await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          title: titleInput.value,
          searxng_url: searxngInput.value,
          open_new_tab: newTabInput.checked,
          greeting_enabled: greetingInput.checked,
          clock_24h: clock24hInput.checked,
        }),
      });
      state.settings = updated.settings;
      applySettingsToUI();
      renderPages();
      settingsStatus.textContent = "Saved.";
      setTimeout(() => (settingsStatus.textContent = ""), 2000);
    } catch (err) {
      settingsStatus.textContent = err.message;
    }
  });

  wallpaperFile.addEventListener("change", async () => {
    const file = wallpaperFile.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const updated = await api("/api/wallpaper", { method: "POST", body: formData });
      state.settings = updated.settings;
      await applyWallpaper();
      renderPages();
      refreshAppearanceTab();
    } catch (err) {
      alert(err.message);
    } finally {
      wallpaperFile.value = "";
    }
  });

  resetWallpaperBtn.addEventListener("click", async () => {
    try {
      const updated = await api("/api/wallpaper", { method: "DELETE" });
      state.settings = updated.settings;
      await applyWallpaper();
      renderPages();
      refreshAppearanceTab();
    } catch (err) {
      alert(err.message);
    }
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    if (!file) return;
    if (!confirm("Importing will replace your current settings and shortcuts. Continue?")) {
      importFile.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      const cfg = await api("/api/import", { method: "POST", body: formData });
      state.settings = cfg.settings;
      state.shortcuts = cfg.shortcuts;
      applySettingsToUI();
      renderPages();
      renderManageList();
      refreshStatuses();
      settingsStatus.textContent = "Imported.";
      setTimeout(() => (settingsStatus.textContent = ""), 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      importFile.value = "";
    }
  });

  function openLink(url) {
    if (state.settings.open_new_tab) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = url;
    }
  }

  function pulseSearch() {
    searchForm.classList.remove("pulse");
    void searchForm.offsetWidth; // restart the animation on repeated clicks
    searchForm.classList.add("pulse");
  }

  function closeSearchSuggestions() {
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = "";
  }

  function getSuggestionButtons() {
    return Array.from(searchSuggestions.querySelectorAll(".search-suggestion"));
  }

  let searchActiveIndex = -1;
  function setActiveSuggestion(index) {
    const buttons = getSuggestionButtons();
    searchActiveIndex = index;
    buttons.forEach((b, i) => b.classList.toggle("active", i === index));
  }

  function submitWebSearch(query) {
    const q = query.trim();
    if (!q) return;
    const base = (state.settings.searxng_url || "").replace(/\/$/, "");
    if (!base) {
      alert("Set your SearXNG URL in Settings first.");
      return;
    }
    pulseSearch();
    openLink(`${base}/search?q=${encodeURIComponent(q)}`);
    searchInput.value = "";
    closeSearchSuggestions();
  }

  function activateShortcutSuggestion(shortcut) {
    pulseSearch();
    openLink(shortcut.url);
    searchInput.value = "";
    closeSearchSuggestions();
  }

  function renderSearchSuggestions() {
    const q = searchInput.value.trim();
    searchSuggestions.innerHTML = "";
    searchActiveIndex = -1;
    if (!q) {
      closeSearchSuggestions();
      return;
    }
    const needle = q.toLowerCase();
    const matches = state.shortcuts
      .filter((s) => s.name.toLowerCase().includes(needle) || (s.url || "").toLowerCase().includes(needle))
      .slice(0, 5);

    for (const shortcut of matches) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-suggestion";

      const iconWrap = document.createElement("span");
      iconWrap.className = "search-suggestion-icon";
      renderIcon(iconWrap, shortcut);

      const name = document.createElement("span");
      name.className = "search-suggestion-name";
      name.textContent = shortcut.name;

      const url = document.createElement("span");
      url.className = "search-suggestion-url";
      url.textContent = shortcut.url;

      item.appendChild(iconWrap);
      item.appendChild(name);
      item.appendChild(url);
      item.addEventListener("click", () => activateShortcutSuggestion(shortcut));
      searchSuggestions.appendChild(item);
    }

    const webItem = document.createElement("button");
    webItem.type = "button";
    webItem.className = "search-suggestion search-suggestion-web";
    webItem.append("Search the web for ");
    const strong = document.createElement("strong");
    strong.textContent = `"${q}"`;
    webItem.appendChild(strong);
    webItem.addEventListener("click", () => submitWebSearch(q));
    searchSuggestions.appendChild(webItem);

    searchSuggestions.hidden = false;
    if (matches.length) setActiveSuggestion(0);
  }

  searchInput.addEventListener("input", renderSearchSuggestions);
  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) renderSearchSuggestions();
  });
  searchInput.addEventListener("keydown", (e) => {
    const buttons = getSuggestionButtons();
    if (!buttons.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion(searchActiveIndex < buttons.length - 1 ? searchActiveIndex + 1 : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion(searchActiveIndex > 0 ? searchActiveIndex - 1 : buttons.length - 1);
    } else if (e.key === "Escape") {
      closeSearchSuggestions();
    }
  });
  document.addEventListener("click", (e) => {
    if (!searchWrap.contains(e.target)) closeSearchSuggestions();
  });

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const buttons = getSuggestionButtons();
    if (searchActiveIndex >= 0 && buttons[searchActiveIndex]) {
      buttons[searchActiveIndex].click();
      return;
    }
    submitWebSearch(searchInput.value);
  });

  async function applyWallpaper() {
    if (state.settings.wallpaper) {
      bg.style.backgroundImage = `url(/wallpapers/${state.settings.wallpaper})`;
    } else {
      bg.style.backgroundImage = "";
    }
    await applyWallpaperTheme();
  }

  function greetingText() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function tickClock() {
    const now = new Date();
    const use12h = state.settings.clock_24h === false;
    clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: use12h });
    greetingEl.textContent = `${greetingText()} · ${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}`;
  }

  let clockTimer = null;
  function applySettingsToUI() {
    document.title = state.settings.title || "Dashboard";
    brandTitle.textContent = state.settings.title || "Dashboard";
    const showClock = state.settings.greeting_enabled !== false;
    clockEl.parentElement.style.display = showClock ? "" : "none";
    if (showClock) {
      tickClock();
      if (!clockTimer) clockTimer = setInterval(tickClock, 1000 * 30);
    } else if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
    applyWallpaper();
  }

  async function init() {
    try {
      const cfg = await api("/api/config");
      state.settings = cfg.settings;
      state.shortcuts = cfg.shortcuts;
      if (cfg.version) appVersion.textContent = `v${cfg.version}`;
      applySettingsToUI();
      renderPages();
      startStatusPolling();
    } catch (err) {
      console.error(err);
      pagesTrack.innerHTML = `<p class="empty-hint">Could not load dashboard config: ${err.message}</p>`;
      emptyHint.hidden = true;
    }
    try {
      state.iconLibrary = await api("/api/icon-library");
    } catch (err) {
      console.error(err);
    }
  }

  init();
})();
