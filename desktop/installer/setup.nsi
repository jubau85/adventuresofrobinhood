; Windows-Installer für A Knight's Tale (NSIS, auch unter Linux übersetzbar: makensis, siehe build-setup.mjs).
; Installiert für den angemeldeten Benutzer (ohne Administratorrechte) nach %LOCALAPPDATA%\Programs\A Knight's Tale,
; legt Verknüpfungen im Startmenü und auf dem Desktop an und trägt sich unter „Apps“ zum Deinstallieren ein.
; Spielstände (%APPDATA%\A Knight's Tale\saves) bleiben beim Deinstallieren erhalten.
Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SRC
  !define SRC "..\release\win-unpacked"
!endif
!ifndef OUT
  !define OUT "..\release\A Knight's Tale Setup ${VERSION}.exe"
!endif
!define NAME "A Knight's Tale"
!define EXE "A Knight's Tale.exe"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\AKnightsTale"

Name "${NAME}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${NAME}"
InstallDirRegKey HKCU "${UNKEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${NAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1031 "ProductName" "${NAME}"
VIAddVersionKey /LANG=1031 "FileDescription" "${NAME} – Installation"
VIAddVersionKey /LANG=1031 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1031 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1031 "LegalCopyright" "${NAME}"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "${NAME} jetzt starten"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"

Section "Spiel" SecMain
  SetShellVarContext current
  ; Ein laufendes Spiel würde das Überschreiben verhindern
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "..\build\icon.ico"
  WriteUninstaller "$INSTDIR\Deinstallieren.exe"
  CreateDirectory "$SMPROGRAMS\${NAME}"
  CreateShortcut "$SMPROGRAMS\${NAME}\${NAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"
  CreateShortcut "$SMPROGRAMS\${NAME}\${NAME} deinstallieren.lnk" "$INSTDIR\Deinstallieren.exe"
  CreateShortcut "$DESKTOP\${NAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${NAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Deinstallieren.exe"'
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${NAME}"
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Delete "$DESKTOP\${NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${NAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
SectionEnd
