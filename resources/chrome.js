let bridge = null;
let state = {
  tabs: [],
  activeId: 0,
  omnibox: "",
  placeholder: "Google에서 검색하거나 URL을 입력하세요.",
  canBack: false,
  canForward: false,
};

function initBridge() {
  if (typeof qt === "undefined") {
    // 테스트용 데이터 구성
    state.tabs = [
      { id: 1, title: "새 탭", favicon: "" },
      { id: 2, title: "GitHub", favicon: "https://github.com/favicon.ico" },
      { id: 3, title: "YouTube", favicon: "https://www.youtube.com/favicon.ico" }
    ];
    state.activeId = 1;
    renderTabs();
    return;
  }
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
}

window.chromeUI = {
  sync(payload) {
    state = { ...state, ...payload };
    renderTabs();
    renderOmnibox();
    renderNav();
  },
};

function renderTabs() {
  const container = document.getElementById("tabs");
  container.innerHTML = "";
  state.tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (tab.id === state.activeId ? " active" : "");
    btn.setAttribute("data-id", tab.id);
    
    btn.innerHTML = `
      <img class="favicon" src="${tab.favicon || "https://www.google.com/favicon.ico"}" alt="" onerror="this.src='https://www.google.com/favicon.ico'"/>
      <span class="title">${escapeHtml(tab.title || "새 탭")}</span>
      <span class="close" data-close="${tab.id}">×</span>
    `;
    
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return;
      if (bridge) bridge.switchTab(tab.id);
    });
    
    btn.querySelector(".close").addEventListener("click", (e) => {
      e.stopPropagation();
      if (bridge) bridge.closeTab(tab.id);
    });
    
    container.appendChild(btn);
  });
  
  // 투명해지지 않는 고유의 커스텀 좌우 슬라이드 리스너 장착
  setupInPlaceTabDrag();
}

/* 마우스 트래킹 방식의 투명화 없는 고성능 좌우 이동 스크립트 */
function setupInPlaceTabDrag() {
  const container = document.getElementById("tabs");
  const tabs = Array.from(container.querySelectorAll(".tab"));
  
  tabs.forEach((tab) => {
    tab.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // 좌클릭만 허용
      if (e.target.closest("[data-close]")) return; // 닫기 버튼은 무시
      
      let startX = e.clientX;
      let currentIdx = tabs.indexOf(tab);
      let tabWidth = tab.offsetWidth;
      
      tab.classList.add("dragging");
      
      function onMouseMove(moveEvent) {
        let deltaX = moveEvent.clientX - startX;
        tab.style.transform = `translateX(${deltaX}px)`;
        
        // 실시간으로 좌측 혹은 우측의 탭 경계를 넘었는지 판단 후 DOM 노드 실시간 교체
        let targetIdx = currentIdx + Math.round(deltaX / tabWidth);
        targetIdx = Math.max(0, Math.min(tabs.length - 1, targetIdx));
        
        if (targetIdx !== currentIdx) {
          const targetTab = tabs[targetIdx];
          if (targetIdx > currentIdx) {
            container.insertBefore(tab, targetTab.nextSibling);
          } else {
            container.insertBefore(tab, targetTab);
          }
          
          // 내부 인덱스 데이터 동기화 갱신
          tabs.splice(currentIdx, 1);
          tabs.splice(targetIdx, 0, tab);
          currentIdx = targetIdx;
          startX = moveEvent.clientX; 
          tab.style.transform = `translateX(0px)`;
        }
      }
      
      function onMouseUp() {
        tab.classList.remove("dragging");
        tab.style.transform = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        
        // 최종 변경 완료된 ID 순서 배열 추출 및 백엔드 전송부
        const finalIds = Array.from(container.querySelectorAll(".tab")).map(el => 
          parseInt(el.getAttribute("data-id"))
        );
        if (bridge && bridge.updateTabsOrder) {
          bridge.updateTabsOrder(finalIds);
        }
      }
      
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

function renderOmnibox() {
  const el = document.getElementById("omnibox");
  el.placeholder = state.placeholder || "";
  if (document.activeElement !== el) {
    el.value = state.omnibox || "";
  }
}

function renderNav() {
  document.getElementById("btn-back").disabled = !state.canBack;
  document.getElementById("btn-forward").disabled = !state.canForward;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

initBridge();