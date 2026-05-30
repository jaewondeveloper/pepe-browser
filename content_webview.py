"""Content area web view with Edge-style context menu (image-aware)."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from PySide6.QtCore import QFile, Qt, QUrl
from PySide6.QtGui import QGuiApplication, QImage
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkRequest
from PySide6.QtWebEngineCore import QWebEngineContextMenuRequest, QWebEnginePage
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QFileDialog, QMessageBox

from pepe_context_menu import PepeContextMenu

if TYPE_CHECKING:
    from pepe_browser import PepeBrowser

WINDOW_DRAG_SCRIPT = """
(function () {
  if (window.__pepeDragBound) return;
  window.__pepeDragBound = true;
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
})();
"""


class ContentWebView(QWebEngineView):
    def __init__(self, browser: PepeBrowser, parent=None) -> None:
        super().__init__(parent)
        self._browser = browser
        self._nam = QNetworkAccessManager(self)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        self.page().contextMenuRequested.connect(self._on_context_menu_requested)
        self.loadFinished.connect(self._inject_window_drag)

    def contextMenuEvent(self, event) -> None:
        event.accept()

    def _inject_window_drag(self, ok: bool) -> None:
        if not ok:
            return
        channel_file = QFile("qrc:///qtwebchannel/qwebchannel.js")
        if not channel_file.open(QFile.OpenModeFlag.ReadOnly):
            self.page().runJavaScript(WINDOW_DRAG_SCRIPT)
            return
        qwc = bytes(channel_file.readAll()).decode("utf-8")
        boot = (
            qwc
            + "\nnew QWebChannel(qt.webChannelTransport,function(c){"
            "window.bridge=c.objects.bridge;});\n"
            + WINDOW_DRAG_SCRIPT
        )
        self.page().runJavaScript(boot)

    def _on_context_menu_requested(self, request: QWebEngineContextMenuRequest) -> None:
        request.accept()
        global_pos = self.mapToGlobal(request.position())
        self._show_page_context_menu(request, global_pos)

    def _show_page_context_menu(
        self, request: QWebEngineContextMenuRequest, global_pos
    ) -> None:
        menu = PepeContextMenu()
        media_type = request.mediaType()
        media_url = request.mediaUrl()
        link_url = request.linkUrl()
        is_image = media_type == QWebEngineContextMenuRequest.MediaType.MediaTypeImage and media_url.isValid()

        if is_image:
            img_url = media_url.toString()
            menu.add_action(
                "새 탭에서 이미지 열기",
                lambda: self._browser.open_url_in_new_tab(QUrl(img_url)),
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
                lambda: self._copy_text(img_url),
            )
            menu.add_separator()

        if link_url.isValid() and not is_image:
            link = link_url.toString()
            menu.add_action(
                "새 탭에서 링크 열기",
                lambda: self._browser.open_url_in_new_tab(link_url),
            )
            menu.add_action("링크 복사", lambda: self._copy_text(link))
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

        if is_image:
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
        reply = self._nam.get(QNetworkRequest(url))
        reply.finished.connect(lambda r=reply: self._on_image_bytes(r, save_as=False))

    def _save_image(self, url: QUrl) -> None:
        path_part = urlparse(url.path()).path
        suggested = Path(path_part).name if path_part else "image"
        if not suggested or suggested == ".":
            suggested = "image"
        ext = Path(suggested).suffix
        if not ext:
            ext = ".png"
            suggested += ext

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
