"""Content area web view with Pepe-styled context menu (no Chromium default)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtGui import QAction
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMenu

if TYPE_CHECKING:
    from pepe_browser import PepeBrowser

PAGE_CONTEXT_MENU_STYLE = """
QMenu {
  background-color: #ffffff;
  border: 1px solid #dadce0;
  border-radius: 8px;
  padding: 6px 0;
}
QMenu::item {
  padding: 8px 16px;
  font-size: 13px;
  color: #202124;
}
QMenu::item:selected {
  background-color: #f1f3f4;
}
QMenu::item:disabled {
  color: #9aa0a6;
}
QMenu::separator {
  height: 1px;
  background: #e8eaed;
  margin: 4px 8px;
}
"""


class ContentWebView(QWebEngineView):
    def __init__(self, browser: PepeBrowser, parent=None) -> None:
        super().__init__(parent)
        self._browser = browser

    def contextMenuEvent(self, event) -> None:
        event.accept()
        self._show_page_context_menu(event.globalPos())

    def _show_page_context_menu(self, global_pos) -> None:
        menu = QMenu(self)
        menu.setStyleSheet(PAGE_CONTEXT_MENU_STYLE)

        back = QAction("뒤로", menu)
        back.setEnabled(self.history().canGoBack())
        back.triggered.connect(self.back)
        menu.addAction(back)

        forward = QAction("앞으로", menu)
        forward.setEnabled(self.history().canGoForward())
        forward.triggered.connect(self.forward)
        menu.addAction(forward)

        menu.addSeparator()

        reload_action = QAction("새로고침", menu)
        reload_action.triggered.connect(self.reload)
        menu.addAction(reload_action)

        menu.addSeparator()

        new_tab = QAction("새 탭", menu)
        new_tab.triggered.connect(self._browser.create_tab_from_context)
        menu.addAction(new_tab)

        menu.popup(global_pos)
