const {_electron: electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../qa');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url==='/favicon.png'){res.writeHead(200,{'Content-Type':'image/png'});res.end(fs.readFileSync(path.join(root,'src/logo.png')));return;}
 if(req.url==='/file.bin'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="noorder-feature-test.bin"'});res.end(Buffer.alloc(131072,0x4e));return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Website met permissies</title><link rel="icon" href="/favicon.png"><h1>Website met permissies</h1>');
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,profile=fs.mkdtempSync(path.join(os.tmpdir(),'noorder-features-'));
 const app=await electron.launch({executablePath:require('electron'),args:['--no-sandbox',root],env:{...process.env,NOORDER_TEST:'1',NOORDER_TEST_PROFILE:profile}});
 const page=await app.firstWindow(),act=(name,value)=>app.evaluate((_e,{name,value})=>globalThis.__noorderTest.command(name,value),{name,value}),snap=()=>app.evaluate(()=>globalThis.__noorderTest.snapshot());
 const wait=async predicate=>{for(let i=0;i<100;i++){const s=await snap();if(predicate(s))return s;await new Promise(r=>setTimeout(r,100));}throw new Error('state timeout');};
 let savedPath='';try{
   await page.locator('#home-page').waitFor();await act('navigate',base+'/first');await wait(s=>s.tabs[0]?.favicon.startsWith('data:image/'));
   await page.locator('#site-info').click();await page.locator('#site-popover').waitFor({state:'visible'});await page.getByRole('switch',{name:'Microfoon'}).click();await wait(s=>s.sitePermissions.microphone===true);
   assert.equal(await app.evaluate(()=>{const m=globalThis.__noorderTest,t=m.tabs.find(x=>x.id===m.snapshot().activeId);return m.permissionAllowed(t.view.webContents,'media',new URL(t.url).origin,{mediaTypes:['audio']});}),true);
   await page.screenshot({path:path.join(out,'Noorder-website-rechten.png')});await page.locator('#site-popover .popover-close').click();
   await page.locator('#menu').click();await page.locator('#menu-popover').waitFor({state:'visible'});assert.equal(await page.getByText('Nieuw incognitovenster',{exact:true}).isVisible(),true);await page.screenshot({path:path.join(out,'Noorder-menu.png')});
   await page.locator('#menu-popover .menu-row').filter({hasText:'Geschiedenis'}).click();await wait(s=>s.kind==='history');assert.ok((await snap()).history.some(h=>h.url===base+'/first'));
   await act('activate',1);
   await app.evaluate((_e,url)=>{const m=globalThis.__noorderTest;m.tabs.find(t=>t.id===m.snapshot().activeId).view.webContents.downloadURL(url);},base+'/file.bin');
   const s=await wait(s=>s.downloads[0]?.state==='completed');savedPath=s.downloads[0].path;assert.equal(fs.statSync(savedPath).size,131072);
   await page.locator('#downloads-button').click();await page.locator('#downloads-popover').waitFor({state:'visible'});assert.equal(await page.getByText('noorder-feature-test.bin').count()>0,true);await page.screenshot({path:path.join(out,'Noorder-downloads.png')});
   await page.locator('#downloads-popover .popover-close').click();
   const extension=await app.evaluate((_e,folder)=>globalThis.__noorderTest.loadExtension(folder),path.join(root,'tests/fixtures/extension'));assert.equal(extension.name,'Noorder functietest');await wait(s=>s.extensions.some(e=>e.name===extension.name));await act('extension-remove',extension.id);await wait(s=>!s.extensions.length);
   await act('find');await page.locator('#find-bar').waitFor({state:'visible'});await page.locator('#find-input').fill('Website');await page.waitForFunction(()=>document.querySelector('#find-count').textContent.includes('/'));await page.locator('#find-close').click();
   await act('groups');await wait(s=>s.kind==='groups');await act('group-create',1);assert.equal((await snap()).tabs.find(t=>t.id===1).group.startsWith('group-'),true);
   console.log('Feature smoke: favicon, menu, website-rechten, geschiedenis, downloads, groepen, zoeken, extensies OK');
 }finally{await app.close();server.close();if(savedPath)fs.rmSync(savedPath,{force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
