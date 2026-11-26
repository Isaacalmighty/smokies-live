s=open('index.html').read()
js=open('live.js').read(); css=open('live.css').read()
a=s.index('/* LIVE-BEGIN */')+len('/* LIVE-BEGIN */\n'); b=s.index('/* LIVE-END */')
s=s[:a]+js+s[b:]
a=s.index('/* ---------- live panel ---------- */'); b=s.index('#radarStamp{',a)
s=s[:a]+css+s[b:]
open('index.html','w').write(s)
