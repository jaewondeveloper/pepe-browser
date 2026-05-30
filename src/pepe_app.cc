#include "pepe_app.h"

#include "include/cef_browser.h"
#include "include/wrapper/cef_helpers.h"
#include "pepe_handler.h"
#include "pepe_window_win.h"

PepeApp::PepeApp() = default;

void PepeApp::OnContextInitialized() {
  CEF_REQUIRE_UI_THREAD();

  PepeWindow_Create();

  CefWindowInfo window_info;
  CefBrowserSettings browser_settings;

  CefRefPtr<PepeHandler> handler(new PepeHandler());

  HWND content = PepeWindow_GetContentHwnd();
  RECT bounds = {};
  GetClientRect(content, &bounds);
  window_info.SetAsChild(content, CefRect(0, 0, bounds.right, bounds.bottom));
  window_info.runtime_style = CEF_RUNTIME_STYLE_ALLOY;

  const std::string home_url = PepeWindow_GetHomeUrl();

  CefBrowserHost::CreateBrowser(window_info, handler, home_url, browser_settings,
                                nullptr, nullptr);
}
