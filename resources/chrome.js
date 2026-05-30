let bridge = null;
let tabsUiBound = false;
let tabDragBound = false;
let suppressTabClick = false;

const DRAG_THRESHOLD = 5;
const TAB_WIDTH_FULL = 200;
const TAB_WIDTH_COMPACT = 36;
const TAB_GAP = 2;

let layoutObserver = null;
const FALLBACK_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#4285F4"/><text x="8" y="12" text-anchor="middle" fill="#fff" font-size="10" font-family="Arial">G</text></svg>'
  );

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
  setupTabLayoutObserver();
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

function bindTabDrag() {
  if (tabDragBound) return;
  tabDragBound = true;

  const container = document.getElementById("tabs");
  container.addEventListener("mousedown", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || e.button !== 0) return;
    if (e.target.closest("[data-close]")) return;

    const tabs = [...container.querySelectorAll(".tab")];
    tabDrag = {
      tab,
      container,
      tabs,
      startX: e.clientX,
      startIndex: tabs.indexOf(tab),
      moved: false,
      width: tab.offsetWidth || TAB_WIDTH_FULL,
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
  if (Math.abs(dx) > DRAG_THRESHOLD) {
    tabDrag.moved = true;
  }
  tabDrag.tab.style.transform = `translateX(${dx}px)`;

  if (!tabDrag.moved) return;

  const tabW = tabDrag.container.classList.contains("compact") ? TAB_WIDTH_COMPACT : TAB_WIDTH_FULL;
  const shift = Math.round(dx / (tabW + TAB_GAP));
  let targetIndex = tabDrag.startIndex + shift;
  targetIndex = Math.max(0, Math.min(tabDrag.tabs.length - 1, targetIndex));

  const currentIndex = tabDrag.tabs.indexOf(tabDrag.tab);
  if (targetIndex === currentIndex) return;

  const targetTab = tabDrag.tabs[targetIndex];
  if (targetIndex > currentIndex) {
    containerInsertAfter(tabDrag.container, tabDrag.tab, targetTab);
  } else {
    tabDrag.container.insertBefore(tabDrag.tab, targetTab);
  }

  tabDrag.tabs = [...tabDrag.container.querySelectorAll(".tab")];
  tabDrag.startIndex = tabDrag.tabs.indexOf(tabDrag.tab);
  tabDrag.startX = e.clientX;
  tabDrag.tab.style.transform = "translateX(0px)";
}

function containerInsertAfter(container, node, ref) {
  if (ref.nextSibling) {
    container.insertBefore(node, ref.nextSibling);
  } else {
    container.appendChild(node);
  }
}

function onTabDragEnd() {
  if (!tabDrag) return;

  document.removeEventListener("mousemove", onTabDragMove);
  document.removeEventListener("mouseup", onTabDragEnd);

  tabDrag.tab.style.transform = "";
  tabDrag.tab.classList.remove("dragging");

  if (tabDrag.moved) {
    suppressTabClick = true;
    const order = [...tabDrag.container.querySelectorAll(".tab")].map((el) =>
      parseInt(el.getAttribute("data-id"), 10)
    );
    if (bridge && bridge.reorderTabs) {
      bridge.reorderTabs(JSON.stringify(order));
    }
  }

  tabDrag = null;
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
  const box = tabEl.querySelector(".favicon");
  if (!box) return;

  const next = url || FALLBACK_FAVICON;
  if (box.dataset.src === next) return;
  box.dataset.src = next;

  let img = box.querySelector("img");
  if (!img) {
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

function setupTabLayoutObserver() {
  const tabLeft = document.querySelector(".tab-left");
  const tabStrip = document.getElementById("tab-strip");
  if (!tabLeft || layoutObserver) return;

  layoutObserver = new ResizeObserver(() => updateTabLayout());
  layoutObserver.observe(tabLeft);
  if (tabStrip) layoutObserver.observe(tabStrip);
}

function updateTabLayout() {
  const container = document.getElementById("tabs");
  const tabLeft = document.querySelector(".tab-left");
  const newBtn = document.getElementById("btn-new-tab");
  if (!container || !tabLeft) return;

  const count = container.querySelectorAll(".tab").length;
  if (count === 0) {
    container.classList.remove("compact");
    return;
  }

  const btnWidth = newBtn ? newBtn.offsetWidth + TAB_GAP : 32;
  const available = Math.max(0, tabLeft.clientWidth - btnWidth);
  const fullRequired = count * TAB_WIDTH_FULL + Math.max(0, count - 1) * TAB_GAP;

  if (fullRequired <= available) {
    container.classList.remove("compact");
  } else {
    container.classList.add("compact");
  }
}

function renderTabs() {
  const container = document.getElementById("tabs");
  if (!container) return;

  const keep = new Set();

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
        `<span class="close no-drag" data-close="${id}">×</span>`;
    }

    el.classList.toggle("active", tab.id === state.activeId);
    const titleEl = el.querySelector(".title");
    const label = tab.title || "기본탭";
    if (titleEl.textContent !== label) {
      titleEl.textContent = label;
    }
    el.title = label;
    setFavicon(el, tab.favicon);
  });

  state.tabs.forEach((tab) => {
    const el = container.querySelector(`.tab[data-id="${tab.id}"]`);
    if (el) container.appendChild(el);
  });

  container.querySelectorAll(".tab").forEach((el) => {
    if (!keep.has(el.getAttribute("data-id"))) {
      el.remove();
    }
  });

  requestAnimationFrame(updateTabLayout);
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
