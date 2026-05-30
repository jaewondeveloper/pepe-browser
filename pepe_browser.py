"""Pepe Browser — frameless window, HTML chrome, multi-tab WebEngine."""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from PySide6.QtCore import QObject, Qt, QUrl, QUrlQuery, Slot
from PySide6.QtGui import QResizeEvent, QShowEvent
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow, QSizePolicy, QStackedWidget, QVBoxLayout, QWidget

from win_frame import apply_round_window_region, apply_windows_rounded_frame

ROOT = Path(__file__).resolve().parent
WINDOW_RADIUS = 10
RESOURCES = ROOT / "resources"
HOME_URL = QUrl.fromLocalFile(str((RESOURCES / "home.html").resolve()))
CHROME_URL = QUrl.fromLocalFile(str((RESOURCES / "chrome.html").resolve()))
HOME_PATH = HOME_URL.toLocalFile().replace("\\", "/").lower()
CHROME_HEIGHT = 88

WINDOW_STYLE = f"""
QMainWindow {{
    background: #dee1e6;
}}
QWidget#browserRoot {{
    background: #dee1e6;
    border-radius: {WINDOW_RADIUS}px;
}}
QStackedWidget {{
    background: #ffffff;
    border-bottom-left-radius: {WINDOW_RADIUS}px;
    border-bottom-right-radius: {WINDOW_RADIUS}px;
}}
"""


def normalize_url(text: str) -> QUrl:
    raw = text.strip()
    if not raw:
        return HOME_URL
    if raw.startswith(("http://", "https://", "file://")):
        return QUrl(raw)
    if "." in raw and " " not in raw:
        return QUrl("https://" + raw)
    q = QUrl("https://www.google.com/search")
    query = QUrlQuery()
    query.addQueryItem("q", raw)
    q.setQuery(query)
    return q


def is_home_url(url: QUrl) -> bool:
    if url.scheme() != "file":
        return False
    return url.toLocalFile().replace("\\", "/").lower() == HOME_PATH


def favicon_for_url(url: QUrl) -> str:
    if is_home_url(url):
        return "https://www.google.com/favicon.ico"
    host = url.host()
    if host:
        return f"https://www.google.com/s2/favicons?domain={host}&sz=32"
    return "https://www.google.com/favicon.ico"


@dataclass
class Tab:
    tab_id: int
    view: QWebEngineView
    title: str = "새 탭"
    favicon: str = "https://www.google.com/favicon.ico"


class BrowserBridge(QObject):
    def __init__(self, window: "PepeBrowser") -> None:
        super().__init__()
        self._window = window

    @Slot()
    def requestSync(self) -> None:
        self._window.sync_chrome()

    @Slot()
    def newTab(self) -> None:
        self._window.create_tab(HOME_URL)

    @Slot(int)
    def switchTab(self, tab_id: int) -> None:
        self._window.switch_tab(tab_id)

    @Slot(int)
    def closeTab(self, tab_id: int) -> None:
        self._window.close_tab(tab_id)

    @Slot(str)
    def navigate(self, text: str) -> None:
        self._window.navigate_active(normalize_url(text))

    @Slot()
    def goBack(self) -> None:
        tab = self._window.active_tab()
        if tab:
            tab.view.back()

    @Slot()
    def goForward(self) -> None:
        tab = self._window.active_tab()
        if tab:
            tab.view.forward()

    @Slot()
    def reload(self) -> None:
        tab = self._window.active_tab()
        if tab:
            tab.view.reload()

    @Slot()
    def minimize(self) -> None:
        self._window.showMinimized()

    @Slot()
    def toggleMaximize(self) -> None:
        if self._window.isMaximized():
            self._window.showNormal()
        else:
            self._window.showMaximized()

    @Slot()
    def close(self) -> None:
        self._window.close()

    @Slot()
    def startWindowDrag(self) -> None:
        wh = self._window.windowHandle()
        if wh:
            wh.startSystemMove()


class PepeBrowser(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Pepe Browser")
        self.resize(1280, 800)
        self.setWindowFlags(Qt.WindowType.Window | Qt.WindowType.FramelessWindowHint)
        self.setStyleSheet(WINDOW_STYLE)
        self._dwm_rounded = False

        self._tabs: list[Tab] = []
        self._next_id = 1
        self._active_id = 0
        self._bridge = BrowserBridge(self)

        central = QWidget(self)
        central.setObjectName("browserRoot")
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.chrome_view = QWebEngineView(self)
        self.chrome_view.setFixedHeight(CHROME_HEIGHT)
        self.chrome_view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        chrome_settings = self.chrome_view.settings()
        chrome_settings.setAttribute(QWebEngineSettings.WebAttribute.ShowScrollBars, False)
        chrome_settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        self._setup_channel(self.chrome_view)
        self.chrome_view.loadFinished.connect(lambda _ok: self.sync_chrome())
        self.chrome_view.load(CHROME_URL)
        layout.addWidget(self.chrome_view)

        self.stack = QStackedWidget(self)
        self.stack.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        layout.addWidget(self.stack, 1)

        self.create_tab(HOME_URL)

    def _setup_channel(self, view: QWebEngineView) -> None:
        channel = QWebChannel(view.page())
        channel.registerObject("bridge", self._bridge)
        view.page().setWebChannel(channel)

    def create_tab(self, url: QUrl) -> Tab:
        view = QWebEngineView(self)
        view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self._setup_channel(view)
        view.urlChanged.connect(lambda u, v=view: self._on_url_changed(v, u))
        view.titleChanged.connect(lambda t, v=view: self._on_title_changed(v, t))
        view.loadFinished.connect(lambda _ok, v=view: self.sync_chrome())

        tab_id = self._next_id
        self._next_id += 1
        tab = Tab(tab_id=tab_id, view=view)
        self._tabs.append(tab)
        self.stack.addWidget(view)
        view.setUrl(url)
        self.switch_tab(tab_id)
        return tab

    def close_tab(self, tab_id: int) -> None:
        if len(self._tabs) <= 1:
            self.active_tab().view.setUrl(HOME_URL)
            self.sync_chrome()
            return

        idx = next((i for i, t in enumerate(self._tabs) if t.tab_id == tab_id), -1)
        if idx < 0:
            return

        tab = self._tabs.pop(idx)
        self.stack.removeWidget(tab.view)
        tab.view.deleteLater()

        if self._active_id == tab_id:
            new_idx = min(idx, len(self._tabs) - 1)
            self.switch_tab(self._tabs[new_idx].tab_id)
        else:
            self.sync_chrome()

    def switch_tab(self, tab_id: int) -> None:
        tab = next((t for t in self._tabs if t.tab_id == tab_id), None)
        if not tab:
            return
        self._active_id = tab_id
        self.stack.setCurrentWidget(tab.view)
        self.sync_chrome()

    def active_tab(self) -> Tab | None:
        return next((t for t in self._tabs if t.tab_id == self._active_id), None)

    def navigate_active(self, url: QUrl) -> None:
        tab = self.active_tab()
        if tab:
            tab.view.setUrl(url)

    def _on_url_changed(self, view: QWebEngineView, url: QUrl) -> None:
        tab = next((t for t in self._tabs if t.view is view), None)
        if not tab:
            return
        tab.favicon = favicon_for_url(url)
        if is_home_url(url):
            tab.title = "새 탭"
        elif url.host():
            tab.title = url.host()
        if tab.tab_id == self._active_id:
            self.sync_chrome()

    def _on_title_changed(self, view: QWebEngineView, title: str) -> None:
        tab = next((t for t in self._tabs if t.view is view), None)
        if not tab or not title or is_home_url(view.url()):
            return
        tab.title = title[:40]
        if tab.tab_id == self._active_id:
            self.sync_chrome()

    def sync_chrome(self) -> None:
        tab = self.active_tab()
        if not tab:
            return

        url = tab.view.url()
        home = is_home_url(url)
        payload = {
            "tabs": [
                {"id": t.tab_id, "title": t.title, "favicon": t.favicon} for t in self._tabs
            ],
            "activeId": self._active_id,
            "omnibox": "" if home else url.toString(),
            "placeholder": "Google에서 검색하거나 URL을 입력하세요." if home else "",
            "canBack": tab.view.history().canGoBack(),
            "canForward": tab.view.history().canGoForward(),
        }
        js = f"window.chromeUI&&window.chromeUI.sync({json.dumps(payload, ensure_ascii=False)});"
        self.chrome_view.page().runJavaScript(js)

        if not home and tab.view.title():
            self.setWindowTitle(tab.view.title())
        else:
            self.setWindowTitle("새 탭")

    def showEvent(self, event: QShowEvent) -> None:
        super().showEvent(event)
        self._dwm_rounded = apply_windows_rounded_frame(self, WINDOW_RADIUS)

    def resizeEvent(self, event: QResizeEvent) -> None:
        super().resizeEvent(event)
        if sys.platform == "win32" and not self._dwm_rounded:
            apply_round_window_region(self, WINDOW_RADIUS)


def main() -> None:
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    window = PepeBrowser()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
