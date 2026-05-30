let bridge = null;
const DEFAULT_FAVICON = "https://www.google.com/favicon.ico";
let tabsUiBound = false;

let state = {
  tabs: [],
  activeId: 0,
  omnibox: "",
  placeholder: "Google에서 검색하거나 URL을 입력하세요.",
  canBack: false,
  canForward: false,
};

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
      bridge.startWindowDrag();
    });
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest(".no-drag")) return;
      bridge.toggleMaximize();
    });
  });

  bindTabsUi();
}

function bindTabsUi() {
  if (tabsUiBound) return;
  tabsUiBound = true;
  const container = document.getElementById("tabs");
  container.addEventListener("click", (e) => {
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

window.chromeUI = {
  sync(payload) {
    state = { ...state, ...payload };
    renderTabs();
    renderOmnibox();
    renderNav();
  },
};

function setFavicon(tabEl, url) {
  const icon = tabEl.querySelector(".favicon");
  if (!icon) return;
  const next = url || DEFAULT_FAVICON;
  if (icon.dataset.src === next) return;
  icon.dataset.src = next;
  icon.style.backgroundImage = `url("${next}")`;
}

function renderTabs() {
  const container = document.getElementById("tabs");
  const keep = new Set();

  state.tabs.forEach((tab) => {
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
      container.appendChild(el);
    }

    el.classList.toggle("active", tab.id === state.activeId);
    const titleEl = el.querySelector(".title");
    const label = tab.title || "새 탭";
    if (titleEl.textContent !== label) {
      titleEl.textContent = label;
    }
    setFavicon(el, tab.favicon);
  });

  container.querySelectorAll(".tab").forEach((el) => {
    if (!keep.has(el.getAttribute("data-id"))) {
      el.remove();
    }
  });
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
