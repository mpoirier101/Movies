' start-silent.vbs
' Launches the Movies Node.js server with no console window.
' Use this in Task Scheduler instead of calling node.exe directly.

Dim shell
Set shell = CreateObject("WScript.Shell")

' Launch server.js from this script's own folder so source and deployed copies work alike.
appFolder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """C:\Program Files\nodejs\node.exe"" """ & appFolder & "\server.js""", 0, False

' The second argument (0) = hidden window
' The third argument (False) = don't wait for it to finish (runs in background)

Set shell = Nothing
