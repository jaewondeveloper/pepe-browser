"""Content area web view with Edge-style context menu (image-aware)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from PySide6.QtCore import QFile, QPoint, Qt, QUrl
from PySide6.QtGui import QGuiApplication, QImage
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest
from PySide6.QtWebEngineCore import QWebEngineContextMenuRequest, QWebEnginePage
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QFileDialog, QMessageBox

from pepe_context_menu import PepeContextMenu

if TYPE_CHECKING:
    from pepe_browser import PepeBrowser

PAGE_HELPER_SCRIPT = """
(function () {
  if (window.__pepePageHelpers) return;
  window.__pepePageHelpers = true;

  document.addEventListener(
    "mousedown",
    function (e) {
      if (e.button !== 0) return;
      if (e.target.closest(
        "a, button, input, textarea, select, option, label, video, audio, img, svg, canvas, [contenteditable=true], [role=button], [role=link], [role=tab]"
      )) return;
      if (typeof bridge !== "undefined" && bridge.startWindowDrag) bridge.startWindowDrag();
    },
    false
  );

  document.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();
      var el = e.target;
      var img = el.tagName === "IMG" ? el : el.closest("img");
      var a = img ? null : el.closest("a");
      var payload = {
        isImage: !!img,
        imageUrl: img ? (img.currentSrc || img.src || "") : "",
        linkUrl: a ? (a.href || "") : ""
      };
      if (typeof bridge !== "undefined" && bridge.showPageContextMenu) {
        bridge.showPageContextMenu(e.clientX, e.clientY, JSON.stringify(payload));
      }
    },
    true
  );
})();
"""


class ContentWebView(QWebEngineView):
    def __init__(self, browser: PepeBrowser, parent=None) -> None:
        super().__init__(parent)
        self._browser = browser
        self._nam = QNetworkAccessManager(self)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        self.loadFinished.connect(self._inject_page_helpers)

    def contextMenuEvent(self, event) -> None:
        event.accept()
        if hasattr(self, "lastContextMenuRequest"):
            try:
                request = self.lastContextMenuRequest()
                if request is not None:
                    self._show_page_context_menu_from_request(
                        request, event.globalPos()
                    )
                    return
            except Exception:
                pass

    def _inject_page_helpers(self, ok: bool) -> None:
        if not ok:
            return
        channel_file = QFile("qrc:///qtwebchannel/qwebchannel.js")
        if not channel_file.open(QFile.OpenModeFlag.ReadOnly):
            self.page().runJavaScript(PAGE_HELPER_SCRIPT)
            return
        qwc = bytes(channel_file.readAll()).decode("utf-8")
        boot = (
            qwc
            + "\nnew QWebChannel(qt.webChannelTransport,function(c){"
            "window.bridge=c.objects.bridge;});\n"
            + PAGE_HELPER_SCRIPT
        )
        self.page().runJavaScript(boot)

    def show_context_menu_from_bridge(
        self, view_x: int, view_y: int, info_json: str
    ) -> None:
        try:
            info: dict[str, Any] = json.loads(info_json)
        except json.JSONDecodeError:
            info = {}
        global_pos = self.mapToGlobal(QPoint(view_x, view_y))
        self._show_page_context_menu_from_info(info, global_pos)

    def _show_page_context_menu_from_request(
        self, request: QWebEngineContextMenuRequest, global_pos
    ) -> None:
        is_image = (
            request.mediaType()
            == QWebEngineContextMenuRequest.MediaType.MediaTypeImage
            and request.mediaUrl().isValid()
        )
        info = {
            "isImage": is_image,
            "imageUrl": request.mediaUrl().toString() if is_image else "",
            "linkUrl": request.linkUrl().toString()
            if request.linkUrl().isValid() and not is_image
            else "",
        }
        self._show_page_context_menu_from_info(info, global_pos)

    def _show_page_context_menu_from_info(
        self, info: dict[str, Any], global_pos
    ) -> None:
        menu = PepeContextMenu()
        is_image = bool(info.get("isImage"))
        image_url = str(info.get("imageUrl") or "")
        link_url = str(info.get("linkUrl") or "")

        if is_image and image_url:
            media_url = QUrl(image_url)
            menu.add_action(
                "새 탭에서 이미지 열기",
                lambda: self._browser.open_url_in_new_tab(media_url),
            )
            menu.add_action(
                "다른 이름으로 사진 저장",
                lambda: self._save_image(media_url),
            )
            menu.add_action(
                "이미지 복사",
                lambda: self._copy_image(media_url),
            )
            menu.add_action(
                "이미지 링크 복사",
                lambda: self._copy_text(image_url),
            )
            menu.add_separator()

        if link_url and not is_image:
            link = QUrl(link_url)
            menu.add_action(
                "새 탭에서 링크 열기",
                lambda: self._browser.open_url_in_new_tab(link),
            )
            menu.add_action("링크 복사", lambda: self._copy_text(link_url))
            menu.add_separator()

        menu.add_action(
            "뒤로",
            self.back,
            enabled=self.history().canGoBack(),
        )
        menu.add_action(
            "앞으로",
            self.forward,
            enabled=self.history().canGoForward(),
        )
        menu.add_action("새로고침", self.reload, shortcut="Ctrl+R")
        menu.add_separator()

        menu.add_action(
            "새 탭",
            self._browser.create_tab_from_context,
            shortcut="Ctrl+T",
        )
        menu.add_separator()

        if is_image and image_url:
            menu.add_action(
                "Gemini에게 이 이미지에 대해 물어보기",
                lambda: self._browser.open_url_in_new_tab(
                    QUrl("https://gemini.google.com/")
                ),
            )
            menu.add_separator()

        menu.add_action("검사", self._inspect_element, shortcut="Ctrl+Shift+I")
        menu.popup_at(global_pos)

    def _copy_text(self, text: str) -> None:
        QGuiApplication.clipboard().setText(text)

    def _copy_image(self, url: QUrl) -> None:
        action = getattr(QWebEnginePage.WebAction, "CopyImageToClipboard", None)
        if action is not None:
            self.page().triggerAction(action)
            return
        reply = self._nam.get(QNetworkRequest(url))
        reply.finished.connect(lambda r=reply: self._on_image_bytes(r, save_as=False))

    def _save_image(self, url: QUrl) -> None:
        action = getattr(QWebEnginePage.WebAction, "DownloadImageToDisk", None)
        if action is not None:
            self.page().triggerAction(action)
            return

        path_part = urlparse(url.path()).path
        suggested = Path(path_part).name if path_part else "image"
        if not suggested or suggested == ".":
            suggested = "image"
        ext = Path(suggested).suffix
        if not ext:
            suggested += ".png"

        dest, _ = QFileDialog.getSaveFileName(
            self,
            "다른 이름으로 사진 저장",
            suggested,
            "Images (*.png *.jpg *.jpeg *.webp *.gif *.bmp);;All Files (*)",
        )
        if not dest:
            return

        reply = self._nam.get(QNetworkRequest(url))
        reply.finished.connect(
            lambda r=reply, d=dest: self._on_image_bytes(r, save_as=True, dest=d)
        )

    def _on_image_bytes(
        self, reply, *, save_as: bool, dest: str | None = None
    ) -> None:
        reply.deleteLater()
        if reply.error():
            QMessageBox.warning(self, "Pepe Browser", "이미지를 가져오지 못했습니다.")
            return
        data = reply.readAll()
        if save_as and dest:
            Path(dest).write_bytes(data.data())
            return
        img = QImage()
        if img.loadFromData(data):
            QGuiApplication.clipboard().setImage(img)

    def _inspect_element(self) -> None:
        action = getattr(QWebEnginePage.WebAction, "InspectElement", None)
        if action is not None:
            self.page().triggerAction(action)
