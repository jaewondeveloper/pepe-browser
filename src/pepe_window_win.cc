#include "pepe_window_win.h"

#include <commctrl.h>
#include <shellapi.h>

#include <sstream>
#include <string>

#include "include/cef_browser.h"
#include "pepe_handler.h"

namespace {

constexpr wchar_t kWindowClass[] = L"PepeBrowserWindow";
constexpr int kToolbarHeight = 52;

constexpr int kIdBack = 1001;
constexpr int kIdForward = 1002;
constexpr int kIdReload = 1003;
constexpr int kIdGo = 1004;
constexpr int kIdUrl = 1005;

HWND g_hwnd = nullptr;
HWND g_content = nullptr;
HWND g_url_edit = nullptr;
HBRUSH g_toolbar_brush = nullptr;
HFONT g_font = nullptr;

std::wstring GetExeDirectory() {
  wchar_t path[MAX_PATH];
  GetModuleFileNameW(nullptr, path, MAX_PATH);
  std::wstring dir(path);
  const size_t pos = dir.find_last_of(L"\\/");
  if (pos != std::wstring::npos) {
    dir.resize(pos);
  }
  return dir;
}

std::wstring Utf8ToWide(const std::string& utf8) {
  if (utf8.empty()) {
    return L"";
  }
  const int size = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
  if (size <= 0) {
    return L"";
  }
  std::wstring wide(static_cast<size_t>(size - 1), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, wide.data(), size);
  return wide;
}

std::string WideToUtf8(const std::wstring& wide) {
  if (wide.empty()) {
    return "";
  }
  const int size = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, nullptr, 0,
                                       nullptr, nullptr);
  if (size <= 0) {
    return "";
  }
  std::string utf8(static_cast<size_t>(size - 1), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, utf8.data(), size, nullptr, nullptr);
  return utf8;
}

HWND CreateToolbarButton(HWND parent,
                         const wchar_t* label,
                         int x,
                         int y,
                         int w,
                         int h,
                         int id) {
  HWND btn = CreateWindowW(L"BUTTON", label, WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                           x, y, w, h, parent, reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)),
                           GetModuleHandle(nullptr), nullptr);
  SendMessage(btn, WM_SETFONT, reinterpret_cast<WPARAM>(g_font), TRUE);
  return btn;
}

void Navigate(const std::wstring& input) {
  auto* handler = PepeHandler::GetInstance();
  if (!handler) {
    return;
  }
  CefRefPtr<CefBrowser> browser = handler->GetMainBrowser();
  if (!browser) {
    return;
  }

  std::wstring url = input;
  if (url.find(L"http://") != 0 && url.find(L"https://") != 0 && url.find(L"file://") != 0) {
    if (url.find(L'.') != std::wstring::npos && url.find(L' ') == std::wstring::npos) {
      url = L"https://" + url;
    } else {
      std::wstring query = url;
      for (auto& ch : query) {
        if (ch == L' ') {
          ch = L'+';
        }
      }
      url = L"https://www.google.com/search?q=" + query;
    }
  }

  browser->GetMainFrame()->LoadURL(WideToUtf8(url));
}

void LayoutControls(int width, int height) {
  const int btn_w = 64;
  const int btn_h = 28;
  const int pad = 8;
  int x = pad;

  for (int id : {kIdBack, kIdForward, kIdReload, kIdGo}) {
    HWND btn = GetDlgItem(g_hwnd, id);
    if (btn) {
      SetWindowPos(btn, nullptr, x, 12, btn_w, btn_h, SWP_NOZORDER);
      x += btn_w + 6;
    }
  }

  if (g_url_edit) {
    const int url_x = x;
    const int url_w = std::max(120, width - url_x - pad);
    SetWindowPos(g_url_edit, nullptr, url_x, 12, url_w, btn_h, SWP_NOZORDER);
  }

  if (g_content) {
    SetWindowPos(g_content, nullptr, 0, kToolbarHeight, width,
                 std::max(0, height - kToolbarHeight), SWP_NOZORDER);
  }

  PepeWindow_ResizeBrowser();
}

LRESULT CALLBACK PepeWndProc(HWND hwnd,
                             UINT message,
                             WPARAM wparam,
                             LPARAM lparam) {
  switch (message) {
    case WM_CREATE: {
      g_toolbar_brush = CreateSolidBrush(RGB(56, 142, 60));
      g_font = CreateFontW(16, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                           OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                           DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");

      CreateToolbarButton(hwnd, L"◀", 0, 0, 0, 0, kIdBack);
      CreateToolbarButton(hwnd, L"▶", 0, 0, 0, 0, kIdForward);
      CreateToolbarButton(hwnd, L"↻", 0, 0, 0, 0, kIdReload);
      CreateToolbarButton(hwnd, L"Go", 0, 0, 0, 0, kIdGo);

      g_url_edit = CreateWindowW(L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_AUTOHSCROLL,
                                 0, 0, 0, 0, hwnd,
                                 reinterpret_cast<HMENU>(static_cast<INT_PTR>(kIdUrl)),
                                 GetModuleHandle(nullptr), nullptr);
      SendMessage(g_url_edit, WM_SETFONT, reinterpret_cast<WPARAM>(g_font), TRUE);

      g_content = CreateWindowW(L"STATIC", nullptr,
                                WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN | WS_CLIPSIBLINGS, 0, 0,
                                0, 0, hwnd, nullptr, GetModuleHandle(nullptr), nullptr);
      return 0;
    }
    case WM_CTLCOLORSTATIC:
    case WM_CTLCOLOREDIT:
    case WM_CTLCOLORBTN: {
      HDC hdc = reinterpret_cast<HDC>(wparam);
      SetBkMode(hdc, TRANSPARENT);
      SetTextColor(hdc, RGB(255, 255, 255));
      return reinterpret_cast<LRESULT>(g_toolbar_brush);
    }
    case WM_SIZE: {
      const int w = LOWORD(lparam);
      const int h = HIWORD(lparam);
      LayoutControls(w, h);
      return 0;
    }
    case WM_KEYDOWN:
      if (wparam == VK_RETURN && GetFocus() == g_url_edit) {
        wchar_t buffer[2048];
        GetWindowTextW(g_url_edit, buffer, 2048);
        Navigate(buffer);
        return 0;
      }
      break;
    case WM_COMMAND: {
      const int id = LOWORD(wparam);
      const int notify = HIWORD(wparam);

      if (id == kIdGo && notify == BN_CLICKED) {
        wchar_t buffer[2048];
        GetWindowTextW(g_url_edit, buffer, 2048);
        Navigate(buffer);
        return 0;
      }

      auto* handler = PepeHandler::GetInstance();
      CefRefPtr<CefBrowser> browser =
          handler ? handler->GetMainBrowser() : nullptr;

      if (!browser) {
        return 0;
      }

      if (id == kIdBack && notify == BN_CLICKED) {
        browser->GoBack();
      } else if (id == kIdForward && notify == BN_CLICKED) {
        browser->GoForward();
      } else if (id == kIdReload && notify == BN_CLICKED) {
        browser->Reload();
      }
      return 0;
    }
    case WM_CLOSE: {
      auto* handler = PepeHandler::GetInstance();
      if (handler) {
        CefRefPtr<CefBrowser> browser = handler->GetMainBrowser();
        if (browser) {
          browser->GetHost()->CloseBrowser(false);
          return 0;
        }
      }
      DestroyWindow(hwnd);
      return 0;
    }
    case WM_DESTROY:
      if (g_font) {
        DeleteObject(g_font);
        g_font = nullptr;
      }
      if (g_toolbar_brush) {
        DeleteObject(g_toolbar_brush);
        g_toolbar_brush = nullptr;
      }
      return 0;
    default:
      return DefWindowProc(hwnd, message, wparam, lparam);
  }
}

}  // namespace

void PepeWindow_Create() {
  INITCOMMONCONTROLSEX icc = {sizeof(icc), ICC_STANDARD_CLASSES};
  InitCommonControlsEx(&icc);

  WNDCLASSEXW wc = {};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = PepeWndProc;
  wc.hInstance = GetModuleHandle(nullptr);
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
  wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
  wc.lpszClassName = kWindowClass;
  RegisterClassExW(&wc);

  g_hwnd = CreateWindowExW(0, kWindowClass, L"Pepe Browser",
                           WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT,
                           1280, 800, nullptr, nullptr, GetModuleHandle(nullptr), nullptr);
}

HWND PepeWindow_GetContentHwnd() {
  return g_content;
}

std::string PepeWindow_GetHomeUrl() {
  const std::wstring home = GetExeDirectory() + L"\\resources\\home.html";
  std::wstring file_url = L"file:///" + home;
  for (auto& ch : file_url) {
    if (ch == L'\\') {
      ch = L'/';
    }
  }
  return WideToUtf8(file_url);
}

void PepeWindow_OnTitleChanged(const std::wstring& title) {
  if (!g_hwnd) {
    return;
  }
  std::wstring window_title = L"Pepe Browser — " + title;
  SetWindowTextW(g_hwnd, window_title.c_str());
}

void PepeWindow_OnUrlChanged(const std::wstring& url) {
  if (g_url_edit) {
    SetWindowTextW(g_url_edit, url.c_str());
  }
}

void PepeWindow_ResizeBrowser() {
  auto* handler = PepeHandler::GetInstance();
  if (!handler || !g_content) {
    return;
  }

  CefRefPtr<CefBrowser> browser = handler->GetMainBrowser();
  if (!browser) {
    return;
  }

  RECT bounds = {};
  GetClientRect(g_content, &bounds);
  if (bounds.right > 0 && bounds.bottom > 0) {
    HWND host = browser->GetHost()->GetWindowHandle();
    if (host) {
      SetWindowPos(host, nullptr, 0, 0, bounds.right, bounds.bottom, SWP_NOZORDER);
    }
    browser->GetHost()->WasResized();
  }
}
