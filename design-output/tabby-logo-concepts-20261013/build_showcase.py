from pathlib import Path
from PIL import Image
import json,re,html
R=Path(__file__).resolve().parent
A=json.loads((R/'group-a-logo-generator/manifest.json').read_text())
B=json.loads((R/'group-b-logo-design/manifest.json').read_text())['candidates']
EN={'A1':'STRIPE SIGNAL','A2':'QUEUE T','A3':'WORK LOOP','B1':'TABBED B','B2':'CREDIT STAMP','B3':'READY CAT'}
for group,items in [('group-a-logo-generator',A),('group-b-logo-design',B)]:
 for d in items:
  d['group']=group;d['name']=d['name'].split(' · ')[-1];d['english']=EN[d['id']]
  d['paths']={k:f'{group}/{v}' for k,v in d['files'].items()}
C=A+B
counter=0
def svg(d,normalized=False):
 global counter
 counter+=1
 s=(R/d['paths']['black']).read_text()
 s=re.sub(r'\b(color|fill)="#[0-9a-fA-F]{6}"',lambda m:m.group(1)+'="currentColor"',s)
 root_tag=re.search(r'<svg\b[^>]*>',s).group(0)
 s=s.replace(root_tag,re.sub(r'\bwidth="[^\"]*"|\bheight="[^\"]*"','',root_tag),1)
 s=s.replace('id="title"',f'id="title-{counter}"').replace('aria-labelledby="title"',f'aria-labelledby="title-{counter}"').replace('id="symbol"',f'id="symbol-{counter}"')
 if normalized:
  png=R/d['paths'].get('black_transparent',d['paths']['transparent'])
  if not png.exists():png=R/d['paths']['transparent']
  im=Image.open(png).convert('RGBA');bb=im.getchannel('A').getbbox()
  vb=list(map(float,re.search(r'viewBox="([^\"]+)"',s).group(1).split()))
  x,y,x2,y2=bb;w=(x2-x)/im.width*vb[2];h=(y2-y)/im.height*vb[3];pad=max(w,h)*.17
  new=f'{x/im.width*vb[2]-pad:.3f} {y/im.height*vb[3]-pad:.3f} {w+2*pad:.3f} {h+2*pad:.3f}'
  s=re.sub(r'viewBox="[^\"]+"',f'viewBox="{new}"',s)
 return s

def card(d):
 rec=d['id']=='B3'
 return f'''<article class="card" id="{d['id']}">
 <div class="card-top"><span class="number">{d['id']}</span><span class="eng">{d['english']}</span>{'<span class="recommended">推荐</span>' if rec else ''}</div>
 <div class="art">{svg(d,True)}</div>
 <div class="copy"><h3>{d['name']}</h3><p>{html.escape(d['idea'])}</p></div>
 <div class="context"><div class="brand-lockup">{svg(d)}<b>Tabby</b></div><div class="browser-tab">{svg(d)}<span>Tabby · Agents at work</span><i>×</i></div></div>
 <div class="download"><a href="{d['paths']['square']}" download>方形 PNG ↗</a><a href="{d['paths']['transparent']}" download>透明 PNG ↗</a><a href="{d['paths']['symbol']}" download>SVG ↗</a></div>
 </article>'''

css='''@font-face{font-family:Inter;src:url(assets/fonts/InterVariable.woff2)}@font-face{font-family:Geist;src:url(assets/fonts/GeistMono-Variable.woff2)}*{box-sizing:border-box}body{margin:0;background:#f1f0ee;color:#202020;font:14px/1.5 Inter,Arial,"PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-underline-offset:4px}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #ff5900;outline-offset:5px}.page{max-width:1520px;margin:auto;padding:42px 48px 24px}.top{display:flex;align-items:end;justify-content:space-between;gap:28px;padding-bottom:26px;border-bottom:1px solid #d8d5d0}.brand-title{font-size:72px;line-height:1;letter-spacing:-.065em;font-weight:550;margin:0}.subtitle{font-size:16px;margin:15px 0 0;color:#74716b}.header-meta{text-align:right;font-family:Geist,monospace;font-size:11px;line-height:1.8;color:#74716b}.line{color:#ff5900}.toolbar{display:flex;align-items:center;gap:6px;margin:22px 0 28px}.toolbar-label{color:#74716b;font:11px Geist,monospace;margin-right:12px}.theme{border:1px solid #d8d5d0;background:transparent;padding:8px 14px;color:#202020;font-size:12px}.theme[aria-pressed=true]{background:#202020;border-color:#202020;color:#fff}.toolbar small{margin-left:auto;color:#74716b;font-size:11px}.group{margin-bottom:30px}.group-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:12px}.group-heading h2{margin:0;font-size:18px;font-weight:550;letter-spacing:-.025em}.group-heading h2>span{font:11px Geist,monospace;background:#202020;color:#fff;padding:5px 7px;margin-right:12px}.group-heading a{font:11px Geist,monospace;color:#74716b;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.card{background:#fff;border:1px solid #d8d5d0;overflow:hidden;transition:transform .25s,border-color .25s}.card:hover{transform:translateY(-3px);border-color:#202020}.card-top{display:flex;align-items:center;gap:10px;padding:16px 20px 0;height:40px;font:11px Geist,monospace;color:#74716b}.number{color:#202020;font-weight:600}.eng{font-size:10px;letter-spacing:.05em}.recommended{margin-left:auto;color:#ff5900;font-size:11px}.art{height:218px;display:grid;place-items:center;color:#202020}.art svg{width:220px;height:220px;display:block}.copy{padding:10px 24px 22px;min-height:118px}.copy h3{margin:0 0 8px;font-size:22px;letter-spacing:-.03em;font-weight:550}.copy p{margin:0;max-width:340px;color:#77736c;font-size:12px;line-height:1.8}.context{display:grid;grid-template-columns:1fr 1.6fr;gap:8px;padding:14px 16px;border-top:1px solid #eeece8;background:#f7f6f4;min-width:0}.brand-lockup{display:flex;align-items:center;gap:5px;color:#202020}.brand-lockup svg{width:22px;height:22px;flex-shrink:0}.brand-lockup b{font-weight:550;font-size:21px;letter-spacing:-.05em}.browser-tab{display:flex;align-items:center;gap:7px;color:#555;border-bottom:1px solid #d8d5d0;font:9px Geist,monospace;min-width:0}.browser-tab svg{width:16px;height:16px;flex-shrink:0}.browser-tab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.browser-tab i{font-size:14px;font-style:normal;margin-left:auto;color:#aaa}.download{display:flex;gap:16px;padding:13px 20px;font:9px Geist,monospace;border-top:1px solid #eeece8;color:#77736c}.download a{text-decoration:none}.download a:hover{color:#ff5900}.footer{border-top:1px solid #d8d5d0;padding-top:22px;display:flex;justify-content:space-between;gap:30px}.footer strong{font-weight:500}.footer p{font-size:11px;color:#74716b;line-height:1.8;margin:7px 0}.footer a{font-size:11px}.foot-meta{text-align:right;font:10px Geist,monospace;color:#74716b}.theme-orange .art{color:#ff5900}.theme-reverse .art{color:#f1f0ee;background:#202020}.theme-reverse .context{background:#160a02;color:#ff8f3f;border-top-color:#160a02}.theme-reverse .brand-lockup,.theme-reverse .browser-tab{color:#ff8f3f}.board-only .toolbar{display:none}.board-only .download{display:none}.board-only .page{padding-top:36px}.board-only .top{margin-bottom:28px}.board-only .footer{padding-top:17px}.board-only .group{margin-bottom:28px}@media(max-width:900px){.page{padding:28px 24px}.grid{gap:12px}.context{grid-template-columns:1fr}.copy{padding:10px 18px 20px;min-height:146px}.art svg{width:180px;height:180px}.art{height:190px}.eng{display:none}.download{gap:10px;font-size:8px;padding:13px 14px}.header-meta{font-size:9px}.brand-title{font-size:60px}}@media(max-width:600px){.grid{grid-template-columns:1fr}.top{align-items:start}.brand-title{font-size:54px}.header-meta{display:none}.toolbar{flex-wrap:wrap}.toolbar small{display:none}.group-heading{align-items:start;flex-direction:column;gap:8px}.copy{min-height:0}.context{grid-template-columns:1fr 1.5fr}.footer{flex-direction:column}.foot-meta{text-align:left}.art{height:240px}.art svg{width:240px;height:240px}.download{font-size:10px;gap:22px}}@media(prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}'''
page=f'''<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tabby — 六款 Logo 候选</title><style>{css}</style></head><body>
<main class="page"><header class="top"><div><h1 class="brand-title">Tabby<span class="line">.</span></h1><p class="subtitle">六个方向，让自主工作有一个可记住的标记。</p></div><div class="header-meta">IDENTITY EXPLORATION / ROUND 01<br>REPUTATION YOU CAN SPEND<br>13 OCT 2026</div></header>
<div class="toolbar" aria-label="配色切换"><span class="toolbar-label">VIEW MODE</span><button class="theme" data-theme="mono" aria-pressed="true">炭黑</button><button class="theme" data-theme="orange" aria-pressed="false">网站橙</button><button class="theme" data-theme="reverse" aria-pressed="false">反白 / CRT</button><small>大图等比例归一 · 导航 22px / 浏览器图标 16px 为真实尺寸</small></div>
<section class="group" id="group-a"><div class="group-heading"><h2><span>A</span>几何范式 · 条纹、点阵、回环</h2><a href="https://github.com/op7418/logo-generator-skill" target="_blank" rel="noopener">op7418 / logo-generator-skill ↗</a></div><div class="grid">{''.join(card(d) for d in A)}</div></section>
<section class="group" id="group-b"><div class="group-heading"><h2><span>B</span>概念与构造 · 字母、印签、角色</h2><a href="https://github.com/kaankiziltug/logo-design-skill" target="_blank" rel="noopener">kaankiziltug / logo-design-skill ↗</a></div><div class="grid">{''.join(card(d) for d in B)}</div></section>
<footer class="footer"><div><strong>优先推荐 B3「待命猫」；偏可信执行工具，可选 B2「信誉印签」。</strong><p>延续现有首页的暖白、炭黑与橙色。六款均为手绘矢量，独立 1024px PNG 提供透明与暖白底。</p><a href="tabby-six-concepts.zip" download>下载全部候选资产 ↗</a>　<a href="README.md">设计依据与能力说明 ↗</a></div><div class="foot-meta">TABBY / KEEP WORKING<br>CONCEPTS FOR SELECTION<br>未选定方向 · 尚未替换网站</div></footer></main>
<script>const q=new URLSearchParams(location.search);function theme(v){{document.body.classList.remove('theme-orange','theme-reverse');if(v!=='mono')document.body.classList.add('theme-'+v);document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===v)));}}document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>theme(b.dataset.theme)));theme(q.get('theme')||'mono');if(q.get('board'))document.body.classList.add('board-only');</script></body></html>'''
(R/'index.html').write_text(page)
(R/'manifest.json').write_text(json.dumps({'brand':'Tabby','date':'2026-10-13','recommended':'B3','alternative':'B2','candidates':C,'skill_sources':{'A':'https://github.com/op7418/logo-generator-skill','B':'https://github.com/kaankiziltug/logo-design-skill'},'palette':{'paper':'#f1f0ee','ink':'#202020','orange':'#ff5900'}},ensure_ascii=False,indent=2))
print('six candidate showcase ready')
