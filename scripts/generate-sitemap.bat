@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo Generating sitemap.xml...

powershell -Command "$games = Get-Content 'public\assets\data\json\igrs.games.json' | ConvertFrom-Json; $routes = @(); $routes += @{url='/';priority=1.0;changefreq='daily'}; $routes += @{url='/search/';priority=0.9;changefreq='daily'}; $routes += @{url='/ratings/';priority=0.8;changefreq='weekly'}; $routes += @{url='/steamchecker/';priority=0.7;changefreq='weekly'}; foreach ($game in $games) { $routes += @{url="/game/$($game.id)";priority=0.6;changefreq='weekly'} } $xml = '<?xml version=`"1.0`" encoding=`"UTF-8`"`r`n'+ '<urlset xmlns=`"http://www.sitemaps.org/schemas/sitemap/0.9`">'+ ($routes | ForEach-Object { '  <url>`r`n    <loc>https://igrsdb.id$($_.url)</loc>`r`n    <priority>$($_.priority)</priority>`r`n    <changefreq>$($_.changefreq)</changefreq>`r`n  </url>' }) + '</urlset>'; $xml | Out-File -FilePath 'dist\sitemap.xml' -Encoding utf8; Write-Host 'Generated sitemap.xml with ' + $routes.Count + ' URLs'"

if %ERRORLEVEL% EQU 0 (
    echo ✓ Sitemap generated successfully
) else (
    echo ✗ Failed to generate sitemap
    exit /b 1
)
