; ASDLC Review Windows installer (per-user, no admin rights needed).
; Build: makensis /DVERSION=x.y.z /DSRC=<packaged app dir> /DOUT=<output .exe> /DICON=<.ico> installer.nsi
Unicode true
!define APP "ASDLC Review"
!define EXE "ASDLC Review.exe"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ASDLCReview"
Name "${APP}"
OutFile "${OUT}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\ASDLCReview" "InstallDir"
SetCompressor /SOLID lzma
!if /FileExists "${ICON}"
  Icon "${ICON}"
  UninstallIcon "${ICON}"
!endif
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "Software\ASDLCReview" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "ASDLC Review"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\ASDLCReview"
SectionEnd
