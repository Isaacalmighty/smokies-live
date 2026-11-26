#!/bin/sh
# Wrap the app (index.html is the artifact-style body) into a full page for GitHub Pages
OUT=/home/user/smokies-live/index.html
{
printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0d1411">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Smokies Live">\n<meta name="description" content="Live 3D map of the Great Smoky Mountains: real sky, weather, clouds, rivers, roads, cameras, news and events.">\n<meta property="og:title" content="Smokies Live">\n<meta property="og:description" content="Live 3D map of the Great Smoky Mountains.">\n<meta property="og:image" content="https://isaacalmighty.github.io/smokies-live/thumb.jpg">\n<link rel="icon" href="data:image/svg+xml,%%3Csvg xmlns=%%27http://www.w3.org/2000/svg%%27 viewBox=%%270 0 30 30%%27%%3E%%3Cpath d=%%27M2 24 L10 13 L14 18 L20 8 L28 24 Z%%27 fill=%%27%%23f2a65a%%27/%%3E%%3C/svg%%3E">\n<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n'
cat index.html
printf '\n</body>\n</html>\n'
} > $OUT
