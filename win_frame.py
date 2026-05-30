"""Frameless window: Win11 DWM rounded corners, no HRGN (avoids clip/transparency)."""

from __future__ import annotations

import ctypes
import sys

from PySide6.QtWidgets import QWidget

DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_ROUND = 2
CS_DROPSHADOW = 0x00020000
GWL_STYLE = -16


def _hwnd(widget: QWidget) -> int:
    return int(widget.winId())


def clear_window_region(widget: QWidget) -> None:
    if sys.platform != "win32":
        return
    hwnd = _hwnd(widget)
    if hwnd:
        ctypes.windll.user32.SetWindowRgn(hwnd, 0, True)


def prepare_frameless_window(widget: QWidget) -> None:
    if sys.platform != "win32":
        return
    hwnd = _hwnd(widget)
    if not hwnd:
        return

    clear_window_region(widget)

    rounded = ctypes.c_int(DWMWCP_ROUND)
    ctypes.windll.dwmapi.DwmSetWindowAttribute(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        ctypes.byref(rounded),
        ctypes.sizeof(rounded),
    )

    style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_STYLE)
    ctypes.windll.user32.SetWindowLongW(hwnd, GWL_STYLE, style | CS_DROPSHADOW)
