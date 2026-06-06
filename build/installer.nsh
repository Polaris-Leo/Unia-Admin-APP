; Unia Admin - 自定义 NSIS 安装脚本
; 实现旧版检测、进程关闭和安装路径复用

!macro customInit
  ; ── 读取注册表中已安装的版本号 ──
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion"
  ${EndIf}

  ${If} $R0 != ""
    ; ── 检测到旧版，进入更新流程 ──
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "检测到已安装版本 $R0$\n$\n是否更新至最新版本？$\n$\n• 点击「是」将自动关闭旧版并执行更新$\n• 点击「否」取消安装" \
      IDYES doUpdate IDNO cancelInstall

    cancelInstall:
      Quit

    doUpdate:
      ; ── 关闭正在运行的旧版进程 ──
      ExecWait 'taskkill /F /IM "${PRODUCT_FILENAME}.exe"'
      Sleep 1000

      ; ── 读取旧版安装目录，设为本次默认安装路径 ──
      ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "InstallLocation"
      ${If} $R1 == ""
        ReadRegStr $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "InstallLocation"
      ${EndIf}
      ${If} $R1 != ""
        StrCpy $INSTDIR $R1
      ${EndIf}
  ${EndIf}
!macroend
