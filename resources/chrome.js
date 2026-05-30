let bridge = null;
let tabsUiBound = false;
let tabDragBound = false;
let suppressTabClick = false;
let contextMenuTabId = null;

const DRAG_THRESHOLD = 4;
const TAB_WIDTH_FULL = 200;
const TAB_WIDTH_COMPACT = 36;
const TAB_GAP = 2;
const COMPACT_MIN_TABS = 6;

let layoutObserver = null;
const FALLBACK_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#4285F4"/><text x="8" y="12" text-anchor="middle" fill="#fff" font-size="10" font-family="Arial">G</text></svg>'
  );

const GOOGLE_SPINNER_SVG = `<svg class="google-spinner" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
  <circle cx="12" cy="12" r="9" fill="none" stroke="#4285F4" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="14 42" />
</svg>`;

let state = {
  tabs: [],
  activeId: 0,
  omnibox: "",
  placeholder: "Google에서 검색하거나 URL을 입력하세요.",
  canBack: false,
  canForward: false,
};

let tabDrag = null;

function initBridge() {
  if (typeof qt === "undefined") return;
  new QWebChannel(qt.webChannelTransport, (channel) => {
    bridge = channel.objects.bridge;
    setupUi();
    if (bridge.requestSync) bridge.requestSync();
  });
}

function setupUi() {
  document.getElementById("btn-new-tab").addEventListener("click", () => bridge.newTab());
  document.getElementById("btn-min").addEventListener("click", () => bridge.minimize());
  document.getElementById("btn-max").addEventListener("click", () => bridge.toggleMaximize());
  document.getElementById("btn-close").addEventListener("click", () => bridge.close());
  document.getElementById("btn-gemini").addEventListener("click", () =>
    bridge.navigate("https://gemini.google.com/")
  );
  document.getElementById("btn-back").addEventListener("click", () => bridge.goBack());
  document.getElementById("btn-forward").addEventListener("click", () => bridge.goForward());
  document.getElementById("btn-reload").addEventListener("click", () => bridge.reload());

  const omnibox = document.getElementById("omnibox");
  omnibox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") bridge.navigate(omnibox.value);
  });

  document.querySelectorAll(".drag-region").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".no-drag")) return;
      if (e.target.closest(".tab")) return;
      bridge.startWindowDrag();
    });
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest(".no-drag")) return;
      bridge.toggleMaximize();
    });
  });

  bindTabsUi();
  bindTabDrag();
  bindTabContextMenu();
  setupTabLayoutObserver();

  document.addEventListener("click", hideTabContextMenu);
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("#tab-context-menu")) hideTabContextMenu();
  });
  window.addEventListener("resize", () => requestAnimationFrame(updateTabLayout));
}

function bindTabsUi() {
  if (tabsUiBound) return;
  tabsUiBound = true;
  document.getElementById("tabs").addEventListener("click", (e) => {
    if (suppressTabClick) {
      suppressTabClick = false;
      return;
    }
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) {
      e.stopPropagation();
      bridge.closeTab(parseInt(closeBtn.getAttribute("data-close"), 10));
      return;
    }
    const tabEl = e.target.closest(".tab");
    if (tabEl) {
      bridge.switchTab(parseInt(tabEl.getAttribute("data-id"), 10));
    }
  });
}

function bindTabContextMenu() {
  const menu = document.getElementById("tab-context-menu");
  const container = document.getElementById("tabs");
  if (!menu || !container) return;

  container.addEventListener("contextmenu", (e) => {
    const tabEl = e.target.closest(".tab");
    if (!tabEl) return;
    e.preventDefault();
    contextMenuTabId = parseInt(tabEl.getAttribute("data-id"), 10);
    menu.hidden = false;
    const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  });

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || contextMenuTabId == null) return;
    const action = btn.getAttribute("data-action");
    const id = contextMenuTabId;
    hideTabContextMenu();
    if (action === "new-tab") bridge.newTab();
    else if (action === "reload-tab" && bridge.reloadTab) bridge.reloadTab(id);
    else if (action === "close-tab") bridge.closeTab(id);
    else if (action === "close-others") {
      [...(state.tabs || [])].forEach((t) => {
        if (t.id !== id) bridge.closeTab(t.id);
      });
    }
  });
}

function hideTabContextMenu() {
  const menu = document.getElementById("tab-context-menu");
  if (menu) menu.hidden = true;
  contextMenuTabId = null;
}

function bindTabDrag() {
  if (tabDragBound) return;
  tabDragBound = true;

  const container = document.getElementById("tabs");
  container.addEventListener("mousedown", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || e.button !== 0) return;
    if (e.target.closest("[data-close]")) return;

    tabDrag = {
      tab,
      container,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      pointerId: e.pointerId,
    };

    tab.classList.add("dragging");
    document.addEventListener("mousemove", onTabDragMove);
    document.addEventListener("mouseup", onTabDragEnd);
    e.preventDefault();
  });
}

function onTabDragMove(e) {
  if (!tabDrag) return;
  const dx = e.clientX - tabDrag.startX;
  const dy = e.clientY - tabDrag.startY;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    tabDrag.moved = true;
  }
  tabDrag.tab.style.transform = `translate3d(${dx}px, 0, 0)`;
}

function insertIndexAtClientX(container, clientX, draggedTab) {
  const tabs = [...container.querySelectorAll(".tab")].filter((t) => t !== draggedTab);
  for (let i = 0; i < tabs.length; i++) {
    const r = tabs[i].getBoundingClientRect();
    const mid = r.left + r.width / 2;
    if (clientX < mid) return i;
  }
  return tabs.length;
}

function onTabDragEnd(e) {
  if (!tabDrag) return;

  document.removeEventListener("mousemove", onTabDragMove);
  document.removeEventListener("mouseup", onTabDragEnd);

  const { tab, container, moved } = tabDrag;
  tab.style.transform = "";
  tab.classList.remove("dragging");

  if (moved) {
    suppressTabClick = true;
    const tabs = [...container.querySelectorAll(".tab")];
    const fromIndex = tabs.indexOf(tab);
    let toIndex = insertIndexAtClientX(container, e.clientX, tab);
    if (fromIndex >= 0 && toIndex > fromIndex) toIndex -= 1;

    if (fromIndex >= 0 && toIndex !== fromIndex) {
      const ref = container.querySelectorAll(".tab")[toIndex];
      if (toIndex > fromIndex) {
        containerInsertAfter(container, tab, ref);
      } else if (ref) {
        container.insertBefore(tab, ref);
      }
    }

    const order = [...container.querySelectorAll(".tab")].map((el) =>
      parseInt(el.getAttribute("data-id"), 10)
    );
    if (bridge && bridge.reorderTabs) {
      bridge.reorderTabs(JSON.stringify(order));
    }
  }

  tabDrag = null;
}

function containerInsertAfter(container, node, ref) {
  if (ref.nextSibling) {
    container.insertBefore(node, ref.nextSibling);
  } else {
    container.appendChild(node);
  }
}

window.chromeUI = {
  sync(payload) {
    state = { ...state, ...payload };
    renderTabs();
    renderOmnibox();
    renderNav();
  },

  setActiveTab(activeId, partial) {
    state.activeId = activeId;
    if (partial) {
      if (partial.omnibox !== undefined && document.activeElement !== document.getElementById("omnibox")) {
        document.getElementById("omnibox").value = partial.omnibox || "";
      }
      if (partial.placeholder !== undefined) {
        document.getElementById("omnibox").placeholder = partial.placeholder || "";
      }
      if (partial.canBack !== undefined) {
        document.getElementById("btn-back").disabled = !partial.canBack;
      }
      if (partial.canForward !== undefined) {
        document.getElementById("btn-forward").disabled = !partial.canForward;
      }
    }
    document.querySelectorAll(".tab").forEach((el) => {
      const id = parseInt(el.getAttribute("data-id"), 10);
      el.classList.toggle("active", id === activeId);
    });
    requestAnimationFrame(updateTabLayout);
  },
};

function setFavicon(tabEl, url) {
  if (tabEl.classList.contains("is-loading")) return;

  const box = tabEl.querySelector(".favicon");
  if (!box) return;

  const next = url || FALLBACK_FAVICON;
  if (box.dataset.src === next && box.querySelector("img")) return;
  box.dataset.src = next;

  let img = box.querySelector("img");
  if (!img) {
    box.innerHTML = "";
    img = document.createElement("img");
    img.width = 16;
    img.height = 16;
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      if (img.dataset.fallbackApplied === "1") return;
      img.dataset.fallbackApplied = "1";
      img.src = FALLBACK_FAVICON;
    });
    box.appendChild(img);
  }
  img.dataset.fallbackApplied = "0";
  img.src = next;
}

function setTabLoading(tabEl, loading) {
  tabEl.classList.toggle("is-loading", !!loading);
  const box = tabEl.querySelector(".favicon");
  if (!box) return;
  if (loading) {
    box.dataset.src = "";
    box.innerHTML = GOOGLE_SPINNER_SVG;
    return;
  }
  const id = parseInt(tabEl.getAttribute("data-id"), 10);
  const tab = (state.tabs || []).find((t) => t.id === id);
  box.innerHTML = "";
  setFavicon(tabEl, tab && tab.favicon);
}

function measureTabStripWidth() {
  const strip = document.getElementById("tab-strip");
  const tabLeft = document.querySelector(".tab-left");
  const rightControls = document.querySelector(".right-controls");
  const newBtn = document.getElementById("btn-new-tab");
  if (!strip || !tabLeft) return 0;

  const rightW = rightControls ? rightControls.offsetWidth + 12 : 340;
  const stripW = strip.clientWidth || window.innerWidth;
  const leftW = tabLeft.clientWidth;
  const btnWidth = newBtn ? newBtn.offsetWidth + TAB_GAP : 32;
  return Math.max(leftW, stripW - rightW) - btnWidth;
}

function setupTabLayoutObserver() {
  const tabLeft = document.querySelector(".tab-left");
  const tabStrip = document.getElementById("tab-strip");
  if (!tabLeft || layoutObserver) return;

  layoutObserver = new ResizeObserver(() => {
    requestAnimationFrame(updateTabLayout);
  });
  layoutObserver.observe(tabLeft);
  if (tabStrip) layoutObserver.observe(tabStrip);
}

function updateTabLayout() {
  const container = document.getElementById("tabs");
  if (!container) return;

  const count = container.querySelectorAll(".tab").length;
  if (count === 0) {
    container.classList.remove("compact");
    return;
  }

  const available = measureTabStripWidth();
  const fullRequired = count * TAB_WIDTH_FULL + Math.max(0, count - 1) * TAB_GAP;
  const useCompact =
    count >= COMPACT_MIN_TABS && available > 0 && fullRequired > available;

  container.classList.toggle("compact", useCompact);
}

function renderTabs() {
  const container = document.getElementById("tabs");
  if (!container) return;

  const keep = new Set();
  const ordered = [];

  (state.tabs || []).forEach((tab) => {
    const id = String(tab.id);
    keep.add(id);
    let el = container.querySelector(`.tab[data-id="${id}"]`);
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "tab no-drag";
      el.setAttribute("data-id", id);
      el.innerHTML =
        '<span class="favicon" aria-hidden="true"></span>' +
        '<span class="title"></span>' +
        `<span class="close no-drag" data-close="${id}" aria-label="탭 닫기">×</span>`;
    }

    el.classList.toggle("active", tab.id === state.activeId);
    const titleEl = el.querySelector(".title");
    const label = tab.title || "기본탭";
    if (titleEl.textContent !== label) {
      titleEl.textContent = label;
    }
    el.title = label;

    if (tab.loading) {
      setTabLoading(el, true);
    } else {
      setTabLoading(el, false);
      setFavicon(el, tab.favicon);
    }
    ordered.push(el);
  });

  ordered.forEach((el) => container.appendChild(el));

  container.querySelectorAll(".tab").forEach((el) => {
    if (!keep.has(el.getAttribute("data-id"))) {
      el.remove();
    }
  });

  requestAnimationFrame(() => requestAnimationFrame(updateTabLayout));
}

function renderOmnibox() {
  const el = document.getElementById("omnibox");
  el.placeholder = state.placeholder || "Google에서 검색하거나 URL을 입력하세요.";
  if (document.activeElement !== el) {
    el.value = state.omnibox || "";
  }
}

function renderNav() {
  document.getElementById("btn-back").disabled = !state.canBack;
  document.getElementById("btn-forward").disabled = !state.canForward;
}

initBridge();
