from pathlib import Path
import json
import sys
sys.path.insert(0,'/Users/jungle/.codex/skills/logo-generator/scripts')
from svg_to_png import svg_to_png
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent
QA=ROOT/'iterations'
QA.mkdir(exist_ok=True)
DESIGNS=[
 {'id':'A1','name':'Stripe Signal · 虎斑信号','idea':'用三道虎斑负形识别 Tabby，让猫的轮廓保留工业印记的克制。','pattern':'Geometric shape + negative-space line system','construction':'100单位画布；64单位宽猫形、45°耳尖，三道圆端负形条纹；不画眼睛或胡须。','minimum':'建议24px；16px保留耳尖与整体轮廓。','risk':'最直接的猫语义，16px时虎斑细节弱于外轮廓。','body':'<path fill-rule="evenodd" d="M18 20 L36 38 H45 V56 A5 5 0 0 0 55 56 V38 H64 L82 20 V55 C82 73 67 80 50 80 C33 80 18 73 18 55 Z M28 41 Q30 39 32 41 L39 48 Q41 50 39 52 Q37 54 35 52 L28 45 Q26 43 28 41 Z M72 41 Q70 39 68 41 L61 48 Q59 50 61 52 Q63 54 65 52 L72 45 Q74 43 72 41 Z"/>'},
 {'id':'A2','name':'Queue T · 队列 T','idea':'六个模块构成 T，末端向右续接，像完成一单后进入下一单的任务队列。','pattern':'Rounded rectangle dot matrix + letter abstraction','construction':'100单位画布；16×16模块、6单位间隙、2单位圆角；三块横梁、两块竖干与一个右向续接模块。','minimum':'16px保留T骨架；22px可看清分块。','risk':'比猫方向更抽象，需要Tabby字标一起建立识别。','body':'<rect x="20" y="20" width="16" height="16" rx="2"/><rect x="42" y="20" width="16" height="16" rx="2"/><rect x="64" y="20" width="16" height="16" rx="2"/><rect x="42" y="42" width="16" height="16" rx="2"/><rect x="42" y="64" width="16" height="16" rx="2"/><rect x="64" y="64" width="16" height="16" rx="2"/>'},
 {'id':'A3','name':'Work Loop · 工作回环','idea':'将工作闭环做成升一格的回环，每次交付都为下一次工作留下信誉。','pattern':'Geometric letter abstraction + stepped cycle','construction':'100单位画布；一体实心台阶轮廓，内部单一圆角台阶负形；14单位主体厚度。','minimum':'16px可读闭环与台阶；22px更清楚。','risk':'业务意味强，Tabby猫的联想较弱。','body':'<path fill-rule="evenodd" d="M19 24 H59 V40 H81 V80 H19 Z M36 40 H45 V54 H64 Q67 54 67 57 V63 Q67 66 64 66 H36 Q33 66 33 63 V43 Q33 40 36 40 Z"/>'}
]
for d in DESIGNS:
 ident=d['id'].lower()
 def svg(color):
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" color="{color}" role="img" aria-labelledby="title"><title id="title">Tabby {d["id"]} {d["name"]}</title><g id="symbol" fill="currentColor" >{d["body"]}</g></svg>'
 for tag,color in [('symbol','#ff5900'),('black','#202020')]:
  p=ROOT/f'{ident}-{tag}.svg';p.write_text(svg(color))
  svg_to_png(str(p),str(ROOT/f'{ident}-{tag}-transparent-1024.png'),1024,1024)
 fg=Image.open(ROOT/f'{ident}-symbol-transparent-1024.png').convert('RGBA')
 bg=Image.new('RGBA',(1024,1024),'#f1f0ee');bg.alpha_composite(fg);bg.convert('RGB').save(ROOT/f'{ident}-square-1024.png',optimize=True)
 for size in [16,22,32,64,256]:
  import cairosvg
  cairosvg.svg2png(url=str(ROOT/f'{ident}-black.svg'),write_to=str(QA/f'{ident}-test-{size}.png'),output_width=size,output_height=size)
 d['files']={'symbol':f'{ident}-symbol.svg','black':f'{ident}-black.svg','transparent':f'{ident}-symbol-transparent-1024.png','square':f'{ident}-square-1024.png'}
manifest=[{k:v for k,v in d.items() if k!='body'} for d in DESIGNS]
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Review sheet; render vector master at exact source size for QA.
canvas=Image.new('RGB',(1500,610),'#f1f0ee');draw=ImageDraw.Draw(canvas)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',26)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
for idx,d in enumerate(DESIGNS):
 x=idx*500
 draw.text((x+35,25),d['id']+' / '+d['name'].split(' · ')[0],font=font,fill='#202020')
 icon=Image.open(ROOT/f'{d["id"].lower()}-symbol-transparent-1024.png').convert('RGBA');icon.thumbnail((330,330))
 canvas.paste(icon,(x+85,80),icon)
 for j,s in enumerate([16,22,32,64]):
  icon=Image.open(QA/f'{d["id"].lower()}-test-{s}.png').convert('RGBA')
  canvas.paste(icon,(x+40+j*105,460),icon)
  draw.text((x+40+j*105,540),str(s)+'px',font=small,fill='#74716b')
canvas.save(QA/'a-review-final.png',optimize=True)
print('A designs generated')
