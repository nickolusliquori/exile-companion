@echo off
rem Builds the Path of Building helper for releases: LuaJIT (MIT, pinned commit) plus pob/*.lua into pobbuild\
rem The app ships pobbuild\ as resources\pob and runs Path of Building headless from the user's own install.
setlocal
set LUAJIT_COMMIT=96f7b297326e9fd454b7186c6858b2773f94a0dc
if exist luajit-src rmdir /s /q luajit-src
mkdir luajit-src && cd luajit-src
git init -q && git remote add origin https://github.com/LuaJIT/LuaJIT.git
git fetch -q --depth 1 origin %LUAJIT_COMMIT% || exit /b 1
git checkout -q FETCH_HEAD || exit /b 1
for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath`) do set VS=%%i
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
cd src
call msvcbuild.bat >nul || exit /b 1
cd ..\..
if exist pobbuild rmdir /s /q pobbuild
mkdir pobbuild
copy /y luajit-src\src\luajit.exe pobbuild\ >nul || exit /b 1
copy /y luajit-src\src\lua51.dll pobbuild\ >nul || exit /b 1
copy /y luajit-src\COPYRIGHT pobbuild\LICENSE-LuaJIT.txt >nul
copy /y pob\*.lua pobbuild\ >nul || exit /b 1
copy /y pob\LICENSE-PathOfBuilding.md pobbuild\ >nul
echo Path of Building helper ready:
dir /b pobbuild
