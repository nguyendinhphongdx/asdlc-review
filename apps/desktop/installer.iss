; ASDLC Review: trình cài đặt Windows (Inno Setup 6, giao diện "modern": Windows 10/11, sắc nét trên màn hình DPI cao).
; Cài theo người dùng (không cần quyền admin), vẫn cho chọn thư mục. Build:
;   ISCC /DVersion=x.y.z /DSrc=<thư mục app đã đóng gói> /DOutDir=<thư mục ra> /DOutName=<tên file không .exe> /DIcon=<.ico> installer.iss
#define AppName "ASDLC Review"
#define AppExe "ASDLC Review.exe"

[Setup]
AppId={{111D6C62-DD1A-4451-A550-BD54A98FA58B}
AppName={#AppName}
AppVersion={#Version}
AppPublisher=ASDLC Review
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
WizardStyle=modern
WizardImageFile=installer\sidebar.bmp,installer\sidebar@2x.bmp
WizardSmallImageFile=installer\small.bmp,installer\small@2x.bmp
#ifdef Icon
SetupIconFile={#Icon}
#endif
UninstallDisplayIcon={app}\{#AppExe}
OutputDir={#OutDir}
OutputBaseFilename={#OutName}
Compression=lzma2/max
SolidCompression=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#Src}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
// Bản cài cũ dùng NSIS (registry HKCU\Software\ASDLCReview): gỡ trước khi cài để không bị trùng mục trong "Apps".
procedure CurStepChanged(CurStep: TSetupStep);
var
  OldDir: String;
  Code: Integer;
begin
  if CurStep = ssInstall then
  begin
    if RegQueryStringValue(HKCU, 'Software\ASDLCReview', 'InstallDir', OldDir) then
    begin
      if FileExists(OldDir + '\Uninstall.exe') then
      begin
        Exec(OldDir + '\Uninstall.exe', '/S _?=' + OldDir, '', SW_HIDE, ewWaitUntilTerminated, Code);
        DeleteFile(OldDir + '\Uninstall.exe');
      end;
      RegDeleteKeyIncludingSubkeys(HKCU, 'Software\ASDLCReview');
    end;
  end;
end;
