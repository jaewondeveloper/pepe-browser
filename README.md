# Pepe Browser

Windows용 미니 브라우저입니다.

## Python (추천 — Visual Studio 불필요)

**Qt WebEngine**(Chromium)으로 메인 화면에 직접 로드합니다. iframe을 쓰지 않아 YouTube 등도 동작합니다.

```powershell
cd $env:USERPROFILE\pepe-browser
py -3 -m pip install -r requirements.txt
py -3 pepe_browser.py
```

- 툴바/동작: `pepe_browser.py`
- 시작 페이지: `resources/home.html`

---

## C++ / CEF (고급 — MSVC Build Tools 필요)

Chromium Embedded Framework(CEF)로 만든 네이티브 빌드입니다.

## 구조

| 경로 | 설명 |
|------|------|
| `scripts/download_cef.ps1` | CEF 바이너리 다운로드 (~250MB) |
| `scripts/build.ps1` | CMake + Visual Studio 빌드 |
| `src/pepe_window_win.cc` | 네이티브 툴바 UI (녹색 테마, 주소창, 뒤로/앞으로) |
| `resources/home.html` | 시작 페이지 (HTML/CSS로 꾸미기) |
| `third_party/cef/` | 다운로드된 Chromium(CEF) SDK |

## 사전 요구 사항

1. **Visual Studio 2022** — Desktop development with C++
2. **CMake 3.21+** — [다운로드](https://cmake.org/download/)
3. **Python 3** — CEF 빌드 스크립트용 (`py` 명령 사용)

## 빠른 시작

```powershell
cd $env:USERPROFILE\pepe-browser

# 1) Chromium(CEF) 다운로드 (curl 사용, 이어받기 지원 — 예전보다 훨씬 빠름)
.\scripts\download_cef.ps1

# 더 작은 패키지(다운로드·압축 해제 더 빠름, 일부 예제/테스트 없음)
# .\scripts\download_cef.ps1 -Type minimal

# 다운로드가 깨졌을 때만
# .\scripts\download_cef.ps1 -ForceDownload

# 2) 빌드 (Developer PowerShell for VS 2022 권장)
.\scripts\build.ps1

# 3) 실행
cd build\Release
.\pepe_browser.exe
```

## UI 수정

- **툴바/버튼/색**: `src/pepe_window_win.cc` (`kToolbarHeight`, `RGB(56, 142, 60)` 등)
- **시작 화면**: `resources/home.html` 편집 후 다시 빌드
- **기본 URL**: `PepeWindow_GetHomeUrl()` 또는 `pepe_app.cc`의 `home_url`

## 참고

- 전체 Chromium 소스 빌드 대신 **CEF 바이너리**를 사용해 디스크·시간을 크게 줄였습니다.
- CEF 버전은 [cef-project](https://github.com/chromiumembedded/cef-project)와 동일한 `144.0.6` 계열입니다.
