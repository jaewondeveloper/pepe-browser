#ifndef PEPE_APP_H_
#define PEPE_APP_H_

#include "include/cef_app.h"

class PepeApp : public CefApp, public CefBrowserProcessHandler {
 public:
  PepeApp();

  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override {
    return this;
  }

  void OnContextInitialized() override;

 private:
  IMPLEMENT_REFCOUNTING(PepeApp);
};

#endif  // PEPE_APP_H_
