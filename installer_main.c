#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>

static BOOL ExtractResourceToFile(int resId, const char* outPath) {
    HRSRC hRes = FindResourceA(NULL, MAKEINTRESOURCEA(resId), (LPCSTR)10); // 10 = RT_RCDATA
    if (!hRes) return FALSE;
    HGLOBAL hData = LoadResource(NULL, hRes);
    if (!hData) return FALSE;
    DWORD size = SizeofResource(NULL, hRes);
    if (size == 0) return FALSE;
    void* pData = LockResource(hData);
    if (!pData) return FALSE;

    HANDLE hFile = CreateFileA(outPath, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return FALSE;
    DWORD written = 0;
    BOOL ok = WriteFile(hFile, pData, size, &written, NULL);
    CloseHandle(hFile);
    if (!ok || written != size) {
        // Недописанный exe или dll не должен остаться на диске.
        DeleteFileA(outPath);
        return FALSE;
    }
    return TRUE;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    (void)hInstance; (void)hPrevInstance; (void)lpCmdLine; (void)nCmdShow;

    char tempPath[MAX_PATH];
    DWORD tempLen = GetTempPathA(MAX_PATH, tempPath);
    // GetTempPathA возвращает нужную длину: если она не влезла в буфер,
    // дальше собирать пути бессмысленно.
    if (tempLen == 0 || tempLen >= MAX_PATH) {
        MessageBoxA(NULL, "Could not determine the temporary folder.", "Pagrysha Launcher", MB_ICONERROR | MB_OK);
        return 1;
    }

    char setupDir[MAX_PATH];
    snprintf(setupDir, sizeof(setupDir), "%sPagryshaLauncherSetup", tempPath);
    if (!CreateDirectoryA(setupDir, NULL) && GetLastError() != ERROR_ALREADY_EXISTS) {
        MessageBoxA(NULL, "Could not create the temporary setup folder.", "Pagrysha Launcher", MB_ICONERROR | MB_OK);
        return 1;
    }
    if (GetFileAttributesA(setupDir) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxA(NULL, "The temporary setup folder is not accessible.", "Pagrysha Launcher", MB_ICONERROR | MB_OK);
        return 1;
    }

    char exePath[MAX_PATH];
    snprintf(exePath, sizeof(exePath), "%s\\Pagrysha_Launcher_Setup.exe", setupDir);

    char dllPath[MAX_PATH];
    snprintf(dllPath, sizeof(dllPath), "%s\\WebView2Loader.dll", setupDir);

    if (!ExtractResourceToFile(1, exePath)) {
        MessageBoxA(NULL, "Could not extract the launcher executable from the installer.", "Pagrysha Launcher", MB_ICONERROR | MB_OK);
        return 1;
    }
    if (!ExtractResourceToFile(2, dllPath)) {
        MessageBoxA(NULL, "Could not extract WebView2Loader.dll from the installer.", "Pagrysha Launcher", MB_ICONERROR | MB_OK);
        return 1;
    }

    char cmdLine[MAX_PATH * 2];
    snprintf(cmdLine, sizeof(cmdLine), "\"%s\" --is-installer", exePath);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));

    if (CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE, 0, NULL, setupDir, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, INFINITE);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    } else {
        MessageBoxA(NULL, "Could not start the launcher setup program.", "Pagrysha Launcher", MB_ICONERROR | MB_OK);
        return 1;
    }

    return 0;
}
