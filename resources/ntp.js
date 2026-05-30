let bridge = null;

function navigate(raw) {
  const text = (raw || "").trim();
  if (!text) return;
  if (bridge && bridge.navigate) {
    bridge.navigate(text);
    return;
  }
  window.location.href = text.startsWith("http") ? text : "https://www.google.com/search?q=" + encodeURIComponent(text);
}

function initBridge() {
  if (typeof qt === "undefined") return;
  new QWebChannel(qt.webChannelTransport, (channel) => {
    bridge = channel.objects.bridge;
  });
}

document.getElementById("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  navigate(document.getElementById("search-input").value);
});

document.querySelectorAll(".shortcut[data-url]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(el.getAttribute("data-url"));
  });
});

document.getElementById("add-shortcut").addEventListener("click", () => {
  const url = prompt("바로가기 URL을 입력하세요", "https://");
  if (url) navigate(url);
});

document.getElementById("customize-btn").addEventListener("click", () => {
  alert("맞춤설정은 곧 추가될 예정입니다.");
});

initBridge();
