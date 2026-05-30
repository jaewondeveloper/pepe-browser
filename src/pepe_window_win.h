#ifndef PEPE_WINDOW_WIN_H_
#define PEPE_WINDOW_WIN_H_

#include <string>

#include <windows.h>

void PepeWindow_Create();
HWND PepeWindow_GetContentHwnd();
std::string PepeWindow_GetHomeUrl();
void PepeWindow_OnTitleChanged(const std::wstring& title);
void PepeWindow_OnUrlChanged(const std::wstring& url);
void PepeWindow_ResizeBrowser();

#endif  // PEPE_WINDOW_WIN_H_
