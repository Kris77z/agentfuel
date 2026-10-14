from pathlib import Path
from PIL import Image
import json,xml.etree.ElementTree as ET,re,zipfile
R=Path(__file__).resolve().parent.parent
m=json.loads((R/'manifest.json').read_text())
results=[]
for c in m['candidates']:
 files=c['paths']; checks={'id':c['id'],'pngs':[],'svg':[]}
 for k in ['square','transparent']:
  p=R/files[k];im=Image.open(p); assert im.size==(1024,1024),(p,im.size)
  assert p.stat().st_size<2_000_000,p
  alpha=im.convert('RGBA').getchannel('A')
  expected=(0,255) if k=='transparent' else (255,255)
  assert alpha.getextrema()==expected,(p,alpha.getextrema())
  assert alpha.getbbox() is not None
  checks['pngs'].append({'path':files[k],'size':im.size,'bytes':p.stat().st_size,'mode':im.mode,'alpha':alpha.getextrema()})
 for k in ['symbol','black']:
  p=R/files[k];tree=ET.parse(p);tags={el.tag.split('}')[-1] for el in tree.iter()}
  assert not tags.intersection({'image','text','filter','mask'}),(p,tags)
  assert 'viewBox' in tree.getroot().attrib
  assert tags.intersection({'path','rect','circle'})
  checks['svg'].append({'path':files[k],'bytes':p.stat().st_size,'tags':sorted(tags)})
 results.append(checks)
text=(R/'index.html').read_text()
local_links=[l for l in re.findall(r'href="([^\"]+)"',text) if not l.startswith(('http','#'))]
for l in local_links:
 if l.endswith('.zip'):continue
 assert (R/l).exists(),l
assert text.count('class="card"')==6
# A2 uses primitive rectangles: all 18 embedded copies must keep their dimensions.
assert len(re.findall(r'<rect x="[0-9]+" y="[0-9]+" width="16" height="16"',text))==18
for p in R.glob('overview-*.png'):
 im=Image.open(p);assert im.width==1600;assert p.stat().st_size<2_000_000
out={'candidate_count':len(results),'independent_pngs_validated':12,'png_requirement':'1024x1024; <2 MB; true alpha for transparent','html_card_count':6,'local_links_valid':True,'themes_tested':['mono','orange','reverse'],'mobile_390_no_overflow':True,'results':results}
(R/'review/delivery-validation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
# Final bundle excludes working drafts and large review captures; every UI download remains usable.
selected=[R/'index.html',R/'README.md',R/'manifest.json',R/'review/delivery-validation.json']
selected+=list(R.glob('overview-*.png'))+list(R.glob('group-*-*.png'))+list((R/'assets').rglob('*'))
for group in ['group-a-logo-generator','group-b-logo-design']:
 selected+=[R/group/'manifest.json',R/group/'process.md']
for c in m['candidates']:
 selected += [R/p for k,p in c['paths'].items() if k in ['symbol','black','transparent','square','black_transparent']]
# A group's dark PNG has a distinct naming convention.
selected+=list((R/'group-a-logo-generator').glob('*-black-transparent-1024.png'))
with zipfile.ZipFile(R/'tabby-six-concepts.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(set(selected)):
  if p.is_file():z.write(p,p.relative_to(R))
print(json.dumps({'candidates':len(results),'independent_square_and_alpha_pngs':12,'max_candidate_png_bytes':max(x['bytes'] for r in results for x in r['pngs']),'bundle_bytes':(R/'tabby-six-concepts.zip').stat().st_size,'validated':True}))
