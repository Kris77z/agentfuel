import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1600,height:800},deviceScaleFactor:1});
for(const theme of ['mono','orange','reverse']){
 await page.goto('file://'+root+'/index.html?board=1&theme='+theme);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:root+'/overview-'+theme+'.png',fullPage:true});
 for(const group of ['a','b'])await page.locator('#group-'+group).screenshot({path:root+'/group-'+group+'-'+theme+'.png'});
}
await page.goto('file://'+root+'/index.html');
await page.evaluate(()=>document.fonts.ready);
await page.getByRole('button',{name:'网站橙',exact:true}).click();
const okOrange=await page.evaluate(()=>document.body.classList.contains('theme-orange'));
await page.getByRole('button',{name:'反白 / CRT',exact:true}).click();
const okReverse=await page.evaluate(()=>document.body.classList.contains('theme-reverse'));
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:root+'/review/mobile-preview.png',fullPage:true});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
await page.goto('file://'+root+'/group-a-logo-generator/preview.html');
await page.screenshot({path:root+'/review/group-a-testing.png',fullPage:true});
console.log(JSON.stringify({themes:{orange:okOrange,reverse:okReverse},mobileOverflow:overflow,cardCount:6}));
await browser.close();
