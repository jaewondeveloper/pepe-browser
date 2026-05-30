"""Edge-style popup context menu (rounded, shadow, shortcuts)."""

from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QFrame,
    QGraphicsDropShadowEffect,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

MENU_FRAME_STYLE = """
QFrame#pepeMenuFrame {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
}
"""

ROW_STYLE = """
QPushButton {
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #202124;
  font-size: 13px;
  text-align: left;
  padding: 0 12px;
  min-height: 32px;
}
QPushButton:hover:enabled {
  background: #f1f3f4;
}
QPushButton:disabled {
  color: #9aa0a6;
}
QLabel.pepe-menu-shortcut {
  color: #5f6368;
  font-size: 12px;
  padding-right: 4px;
}
QLabel.pepe-menu-badge {
  background: #c5221f;
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  padding: 2px 6px;
}
"""


class PepeContextMenu(QWidget):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent, Qt.WindowType.Popup | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(12, 12, 12, 12)

        self._frame = QFrame(self)
        self._frame.setObjectName("pepeMenuFrame")
        self._frame.setStyleSheet(MENU_FRAME_STYLE)

        shadow = QGraphicsDropShadowEffect(self._frame)
        shadow.setBlurRadius(24)
        shadow.setOffset(0, 4)
        shadow.setColor(QColor(60, 64, 67, 70))
        self._frame.setGraphicsEffect(shadow)

        self._layout = QVBoxLayout(self._frame)
        self._layout.setContentsMargins(8, 8, 8, 8)
        self._layout.setSpacing(0)

        outer.addWidget(self._frame)
        self.setStyleSheet(ROW_STYLE)
        self.setMinimumWidth(300)

    def add_separator(self) -> None:
        line = QFrame(self._frame)
        line.setFrameShape(QFrame.Shape.HLine)
        line.setStyleSheet("background: #e8eaed; max-height: 1px; margin: 6px 8px;")
        line.setFixedHeight(1)
        self._layout.addWidget(line)

    def add_action(
        self,
        label: str,
        callback: Callable[[], None],
        *,
        shortcut: str = "",
        badge: str = "",
        enabled: bool = True,
    ) -> None:
        row = QWidget(self._frame)
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(4, 0, 4, 0)
        row_layout.setSpacing(8)

        btn = QPushButton(label, row)
        btn.setEnabled(enabled)
        btn.setSizePolicy(
            btn.sizePolicy().horizontalPolicy(),
            btn.sizePolicy().verticalPolicy(),
        )
        btn.setCursor(Qt.CursorShape.PointingHandCursor if enabled else Qt.CursorShape.ArrowCursor)
        btn.clicked.connect(lambda _checked=False, cb=callback: (self.hide(), cb()))
        row_layout.addWidget(btn, 1)

        if badge:
            badge_lbl = QLabel(badge, row)
            badge_lbl.setObjectName("pepeMenuBadge")
            badge_lbl.setProperty("class", "pepe-menu-badge")
            badge_lbl.setStyleSheet(
                "background:#c5221f;color:#fff;font-size:10px;font-weight:600;"
                "border-radius:4px;padding:2px 6px;"
            )
            row_layout.addWidget(badge_lbl)

        if shortcut:
            sc = QLabel(shortcut, row)
            sc.setObjectName("pepeMenuShortcut")
            sc.setStyleSheet("color:#5f6368;font-size:12px;")
            sc.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            row_layout.addWidget(sc)

        self._layout.addWidget(row)

    def popup_at(self, global_pos) -> None:
        self.adjustSize()
        screen = self.screen()
        if screen:
            geo = screen.availableGeometry()
            x = min(global_pos.x(), geo.right() - self.width() - 8)
            y = min(global_pos.y(), geo.bottom() - self.height() - 8)
            self.move(max(geo.left() + 4, x), max(geo.top() + 4, y))
        else:
            self.move(global_pos)
        self.show()
        self.raise_()
