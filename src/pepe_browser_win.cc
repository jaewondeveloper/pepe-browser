#include <windows.h>

#include "include/cef_app.h"
#include "include/cef_command_line.h"
#include "pepe_app.h"

namespace {

int RunMain(HINSTANCE instance) {
  CefMainArgs main_args(instance);

  const int exit_code = CefExecuteProcess(main_args, nullptr, nullptr);
  if (exit_code >= 0) {
    return exit_code;
  }

  CefSettings settings;
  settings.no_sandbox = true;
  settings.windowless_rendering_enabled = false;

  CefRefPtr<PepeApp> app(new PepeApp);

  if (!CefInitialize(main_args, settings, app.get(), nullptr)) {
    return 1;
  }

  CefRunMessageLoop();
  CefShutdown();
  return 0;
}

}  // namespace

int APIENTRY wWinMain(HINSTANCE instance,
                      HINSTANCE,
                      LPWSTR,
                      int) {
  return RunMain(instance);
}
