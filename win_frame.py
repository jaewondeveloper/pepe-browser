"""Windows 11-style rounded corners for frameless Qt windows."""

from __future__ import annotations

import ctypes
import sys
from PySide6.QtWidgets import QWidget

# DWM window corner preference (Windows 11 build 22000+)
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_DEFAULT = 0
DWMWCP_DONOTROUND = 1
DWMWCP_ROUND = 2
DWMWCP_ROUNDSMALL = 3

# Subtle drop shadow on frameless windows
CS_DROPSHADOW = 0x00020000
GWL_STYLE = -16


def _hwnd(widget: QWidget) -> int:
    return int(widget.winId())


def apply_win11_round_corners(widget: QWidget) -> bool:
    """Prefer native Windows 11 rounded corners via DWM."""
    if sys.platform != "win32":
        return False
    hwnd = _hwnd(widget)
    if not hwnd:
        return False
    preference = ctypes.c_int(DWMWCP_ROUND)
    hr = ctypes.windll.dwmapi.DwmSetWindowAttribute(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        ctypes.byref(preference),
        ctypes.sizeof(preference),
    )
    return hr == 0


def apply_round_window_region(widget: QWidget, radius: int = 10) -> None:
    """Fallback: clip window to a rounded rectangle (Win10 / older builds)."""
    if sys.platform != "win32":
        return
    hwnd = _hwnd(widget)
    if not hwnd:
        return
    w = max(1, widget.width())
    h = max(1, widget.height())
    rgn = ctypes.windll.gdi32.CreateRoundRectRgn(0, 0, w + 1, h + 1, radius * 2, radius * 2)
    ctypes.windll.user32.SetWindowRgn(hwnd, rgn, True)


def apply_frameless_shadow(widget: QWidget) -> None:
    if sys.platform != "win32":
        return
    hwnd = _hwnd(widget)
    if not hwnd:
        return
    style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
    ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style | CS_DROPSHADOW)


def apply_windows_rounded_frame(widget: QWidget, radius: int = 10) -> bool:
    """Apply best available rounded frame. Returns True if native Win11 DWM rounding is active."""
    if sys.platform != "win32":
        return False
    apply_frameless_shadow(widget)
    if apply_win11_round_corners(widget):
        return True
    apply_round_window_region(widget, radius)
    return False
