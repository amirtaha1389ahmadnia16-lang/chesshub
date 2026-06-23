@echo off
echo Copying classic pieces to root...
copy pieces\classic\*.png .

echo Renaming files in root...
ren bk.png bK.png 2>nul
ren wk.png wK.png 2>nul
ren bq.png bQ.png 2>nul
ren wq.png wQ.png 2>nul
ren br.png bR.png 2>nul
ren wr.png wR.png 2>nul
ren bb.png bB.png 2>nul
ren wb.png wB.png 2>nul
ren bn.png bN.png 2>nul
ren wn.png wN.png 2>nul
ren bp.png bP.png 2>nul
ren wp.png wP.png 2>nul

echo Renaming files in pieces\classic...
cd pieces\classic
ren bk.png bK.png 2>nul
ren wk.png wK.png 2>nul
ren bq.png bQ.png 2>nul
ren wq.png wQ.png 2>nul
ren br.png bR.png 2>nul
ren wr.png wR.png 2>nul
ren bb.png bB.png 2>nul
ren wb.png wB.png 2>nul
ren bn.png bN.png 2>nul
ren wn.png wN.png 2>nul
ren bp.png bP.png 2>nul
ren wp.png wP.png 2>nul
cd ..\..

echo Done! Please refresh your Live Server with Ctrl+Shift+R.
pause