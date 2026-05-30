let bridge = null;
let tabsUiBound = false;
let tabDragBound = false;
let suppressTabClick = false;
let contextMenuTabId = null;

const DRAG_THRESHOLD = 4;
const TAB_WIDTH_FULL = 200;
const TAB_WIDTH_COMPACT = 36;
const TAB_GAP = 2;
const COMPACT_BUFFER = 20;

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
      e.preventDefault();
      const id = parseInt(closeBtn.getAttribute("data-close"), 10);
      removeTabOptimistic(id);
      bridge.closeTab(id);
      return;
    }
    const tabEl = e.target.closest(".tab");
    if (tabEl) {
      bridge.switchTab(parseInt(tabEl.getAttribute("data-id"), 10));
    }
  });
}

function removeTabOptimistic(tabId) {
  const container = document.getElementById("tabs");
  if (container) {
    const el = container.querySelector(`.tab[data-id="${tabId}"]`);
    if (el) el.remove();
  }
  state.tabs = (state.tabs || []).filter((t) => t.id !== tabId);
  if (state.activeId === tabId && state.tabs.length) {
    state.activeId = state.tabs[Math.max(0, state.tabs.length - 1)].id;
  }
  requestAnimationFrame(updateTabLayout);
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

    const tabs = [...container.querySelectorAll(".tab")];
    const startIndex = tabs.indexOf(tab);

    tabDrag = {
      tab,
      container,
      startX: e.clientX,
      startIndex,
      targetIndex: startIndex,
      moved: false,
    };

    tab.classList.add("dragging");
    container.classList.add("tabs-reordering");
    document.addEventListener("mousemove", onTabDragMove);
    document.addEventListener("mouseup", onTabDragEnd);
    e.preventDefault();
  });
}

function getTabSlotWidth(container) {
  const tab = container.querySelector(".tab:not(.dragging)") || container.querySelector(".tab");
  return tab ? tab.offsetWidth : TAB_WIDTH_FULL;
}

function computeTargetIndex(container, draggedTab, clientX) {
  const tabs = [...container.querySelectorAll(".tab")];
  const slot = getTabSlotWidth(container);
  const scroll = document.getElementById("tab-scroll");
  const originLeft = scroll
    ? scroll.getBoundingClientRect().left - scroll.scrollLeft
    : container.getBoundingClientRect().left;

  for (let i = 0; i < tabs.length; i++) {
    const mid = originLeft + tabs[i].offsetLeft + slot / 2;
    if (clientX < mid) return i;
  }
  return Math.max(0, tabs.length - 1);
}

function applyTabDragLayout(dragState, clientX) {
  const { tab, container, startIndex, startX } = dragState;
  const tabs = [...container.querySelectorAll(".tab")];
  const slot = getTabSlotWidth(container);
  const stride = slot + TAB_GAP;
  const targetIndex = computeTargetIndex(container, tab, clientX);
  dragState.targetIndex = targetIndex;

  tabs.forEach((el, i) => {
    if (el === tab) {
      el.style.transform = `translate3d(${clientX - startX}px, 0, 0)`;
      return;
    }
    let shift = 0;
    if (startIndex < targetIndex && i > startIndex && i <= targetIndex) {
      shift = -stride;
    } else if (startIndex > targetIndex && i >= targetIndex && i < startIndex) {
      shift = stride;
    }
    el.style.transform = shift ? `translate3d(${shift}px, 0, 0)` : "";
  });
}

function clearTabDragTransforms(container) {
  container.querySelectorAll(".tab").forEach((el) => {
    el.style.transform = "";
  });
}

function onTabDragMove(e) {
  if (!tabDrag) return;
  const dx = e.clientX - tabDrag.startX;
  const dy = e.clientY - tabDrag.startY;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    tabDrag.moved = true;
  }
  applyTabDragLayout(tabDrag, e.clientX);
  autoScrollTabStrip(e.clientX);
}

function autoScrollTabStrip(clientX) {
  const scroll = document.getElementById("tab-scroll");
  if (!scroll) return;
  const r = scroll.getBoundingClientRect();
  const edge = 56;
  if (clientX > r.right - edge) {
    scroll.scrollLeft += Math.ceil((clientX - (r.right - edge)) / 4);
  } else if (clientX < r.left + edge) {
    scroll.scrollLeft -= Math.ceil((r.left + edge - clientX) / 4);
  }
}

function reorderTabDom(container, tab, fromIndex, toIndex) {
  const tabs = [...container.querySelectorAll(".tab")];
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

  if (toIndex > fromIndex) {
    const ref = tabs[toIndex];
    if (ref) containerInsertAfter(container, tab, ref);
    else container.appendChild(tab);
  } else {
    const ref = tabs[toIndex];
    if (ref) container.insertBefore(tab, ref);
  }
}

function onTabDragEnd(e) {
  if (!tabDrag) return;

  document.removeEventListener("mousemove", onTabDragMove);
  document.removeEventListener("mouseup", onTabDragEnd);

  const { tab, container, moved, startIndex, targetIndex } = tabDrag;

  if (moved && startIndex !== targetIndex) {
    suppressTabClick = true;
    clearTabDragTransforms(container);
    reorderTabDom(container, tab, startIndex, targetIndex);
    const order = [...container.querySelectorAll(".tab")].map((el) =>
      parseInt(el.getAttribute("data-id"), 10)
    );
    if (bridge && bridge.reorderTabs) {
      bridge.reorderTabs(JSON.stringify(order));
    }
  } else {
    clearTabDragTransforms(container);
  }

  tab.classList.remove("dragging");
  container.classList.remove("tabs-reordering");
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

function measureTabsAvailableWidth() {
  const strip = document.getElementById("tab-strip");
  const rightControls = document.querySelector(".right-controls");
  const newBtn = document.getElementById("btn-new-tab");
  if (!strip || !rightControls) return 0;

  const stripRect = strip.getBoundingClientRect();
  const rightRect = rightControls.getBoundingClientRect();
  const newBtnW = newBtn ? newBtn.offsetWidth + TAB_GAP : 30;

  return Math.max(
    0,
    rightRect.left - stripRect.left - 8 - COMPACT_BUFFER - newBtnW
  );
}

function setupTabLayoutObserver() {
  const tabScroll = document.getElementById("tab-scroll");
  const tabStrip = document.getElementById("tab-strip");
  const rightControls = document.querySelector(".right-controls");
  if (!tabScroll || layoutObserver) return;

  layoutObserver = new ResizeObserver(() => {
    requestAnimationFrame(updateTabLayout);
  });
  layoutObserver.observe(tabScroll);
  if (tabStrip) layoutObserver.observe(tabStrip);
  if (rightControls) layoutObserver.observe(rightControls);
}

function updateTabLayout() {
  const container = document.getElementById("tabs");
  const tabScroll = document.getElementById("tab-scroll");
  if (!container) return;

  const count = container.querySelectorAll(".tab").length;
  if (count === 0) {
    container.classList.remove("compact");
    if (tabScroll) tabScroll.style.maxWidth = "";
    return;
  }

  const tabsOnlyWidth = measureTabsAvailableWidth();
  if (tabScroll && tabsOnlyWidth > 0) {
    tabScroll.style.maxWidth = `${tabsOnlyWidth + (document.getElementById("btn-new-tab")?.offsetWidth || 28) + TAB_GAP}px`;
  }

  const fullRequired = count * TAB_WIDTH_FULL + Math.max(0, count - 1) * TAB_GAP;
  const useCompact = tabsOnlyWidth > 0 && fullRequired > tabsOnlyWidth;

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
