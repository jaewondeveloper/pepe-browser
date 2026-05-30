#include "pepe_handler.h"

#include "include/cef_app.h"
#include "include/wrapper/cef_helpers.h"
#include "pepe_window_win.h"

namespace {

PepeHandler* g_instance = nullptr;

}  // namespace

PepeHandler::PepeHandler() {
  g_instance = this;
}

PepeHandler::~PepeHandler() {
  g_instance = nullptr;
}

PepeHandler* PepeHandler::GetInstance() {
  return g_instance;
}

void PepeHandler::OnTitleChange(CefRefPtr<CefBrowser> browser,
                                 const CefString& title) {
  CEF_REQUIRE_UI_THREAD();
  PepeWindow_OnTitleChanged(title.ToWString());
}

void PepeHandler::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  browser_list_.push_back(browser);
}

bool PepeHandler::DoClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();
  return false;
}

void PepeHandler::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
  CEF_REQUIRE_UI_THREAD();

  BrowserList::iterator it = browser_list_.begin();
  for (; it != browser_list_.end(); ++it) {
    if ((*it)->IsSame(browser)) {
      browser_list_.erase(it);
      break;
    }
  }

  if (browser_list_.empty()) {
    CefQuitMessageLoop();
  }
}

void PepeHandler::OnLoadEnd(CefRefPtr<CefBrowser> browser,
                            CefRefPtr<CefFrame> frame,
                            int httpStatusCode) {
  CEF_REQUIRE_UI_THREAD();
  if (frame->IsMain()) {
    PepeWindow_OnUrlChanged(frame->GetURL().ToWString());
  }
}

CefRefPtr<CefBrowser> PepeHandler::GetMainBrowser() const {
  if (browser_list_.empty()) {
    return nullptr;
  }
  return browser_list_.front();
}
