"""Inject tools/live.js, live.css, social.js and social.css into index.html between their markers.
Edit those files, then run: python3 tools/inject.py  (from the repo root)."""
import re, sys
s = open('index.html').read()
def put(begin, end, path, keep_begin=True):
    global s
    a = s.index(begin) + len(begin) + 1; b = s.index(end, a)
    s = s[:a] + open(path).read() + s[b:]
put('/* SOCIAL-BEGIN */', '/* SOCIAL-END */', 'tools/social.js')
put('/* SOCIAL-CSS-BEGIN */', '/* SOCIAL-CSS-END */', 'tools/social.css')
put('/* LIVE-BEGIN */', '/* LIVE-END */', 'tools/live.js')
open('index.html', 'w').write(s)
print('injected')
