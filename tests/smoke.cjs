// Integration check: run with DISPLAY and Playwright installed (or NODE_PATH set).
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../qa');fs.mkdirSync(output,{recursive:true});
const server = http.createServer((req,res)=>{
  if(req.url==='/favicon.png'){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(path.join(root,'src/logo.png')));return;}
  if(req.url==='/favicon.ico'){res.setHeader('Content-Type','image/x-icon');res.end(fs.readFileSync(path.join(root,'build/icon.ico')));return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Test ${req.url}</title>${req.url==='/fallback'?'':'<link rel="icon" type="image/png" href="/favicon.png">'}<style>body{font:20px sans-serif;padding:30px}</style><h1>Browser test ${req.url}</h1><input id="input" placeholder="Typ hier"><a href="/second">Volgende pagina</a><script>window.memory=new Uint8Array(24*1024*1024);window.memory.fill(42);</script>${req.url==='/frame'?'<iframe src="/embedded"></iframe>':''}`);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'noorder-test-'));
  const app = await electron.launch({executablePath:require('electron'),args:['--no-sandbox',root],env:{...process.env,NOORDER_TEST:'1',NOORDER_TEST_PROFILE:profile}});
  const errors=[];const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  const act = (name,value)=>app.evaluate(({app},{name,value})=>globalThis.__noorderTest.command(name,value),{name,value});
  const snap = ()=>app.evaluate(({app})=>globalThis.__noorderTest.snapshot());
  const wait = async fn=>{for(let i=0;i<100;i++){const s=await snap();if(fn(s))return s;await new Promise(r=>setTimeout(r,100));}const last=await snap();console.error('last state',JSON.stringify({activeId:last.activeId,url:last.url,tab:last.tabs.find(t=>t.id===last.activeId)&&{url:last.tabs.find(t=>t.id===last.activeId).url,loading:last.tabs.find(t=>t.id===last.activeId).loading,icon:!!last.tabs.find(t=>t.id===last.activeId).favicon},bookmarks:last.bookmarks.map(b=>({url:b.url,icon:!!b.favicon}))}));throw new Error('Timed out waiting for state');};
  try {
    await page.locator('#home-page').waitFor();await wait(s=>s.tabs.length===1);assert.equal((await snap()).live,0);
    assert.equal((await snap()).settings.theme,'dark');await page.waitForFunction(()=>document.body.classList.contains('dark'));await page.screenshot({path:path.join(output,'Noorder-Browser-donker.png')});
    await act('setting',{theme:'light'});await page.waitForFunction(()=>!document.body.classList.contains('dark'));await page.screenshot({path:path.join(output,'Noorder-Browser-licht.png')});
    await page.locator('#address').fill(base+'/first');await page.locator('#address').press('Enter');await wait(s=>!s.loading&&s.tabs[0].title==='Test /first'&&s.tabs[0].favicon.startsWith('data:image/png;base64,'));
    assert.equal(await page.locator('.tab.active .tab-icon-image').isVisible(),true);await page.screenshot({path:path.join(output,'Noorder-Browser-favicons.png')});
    await act('navigate',base+'/second');await wait(s=>!s.loading&&s.canBack);await act('back');await wait(s=>!s.loading&&s.url.endsWith('/first'));await act('forward');await wait(s=>!s.loading&&s.url.endsWith('/second'));
    await act('bookmark');assert.equal((await snap()).bookmarks.length,1);await wait(s=>s.bookmarks[0]?.favicon.startsWith('data:image/'));
    const first=(await snap()).activeId;await act('new');assert.equal((await snap()).live,1);await act('sleep-all');await wait(s=>s.sleeping===1);assert.equal((await snap()).live,0);
    await act('activate',first);await wait(s=>s.live===1&&!s.loading&&s.canBack);assert.ok((await snap()).url.endsWith('/second'));
    await act('back');await wait(s=>!s.loading&&s.url.endsWith('/first'));await act('forward');await wait(s=>!s.loading&&s.url.endsWith('/second'));
    // Real trusted keyboard input reaches the isolated page preload.
    await app.evaluate(({app})=>{const m=globalThis.__noorderTest;const wc=m.tabs.find(t=>t.id===m.snapshot().activeId).view.webContents;wc.executeJavaScript('document.querySelector("input").focus()');});
    await app.evaluate(({app})=>{const m=globalThis.__noorderTest;m.tabs.find(t=>t.id===m.snapshot().activeId).view.webContents.sendInputEvent({type:'char',keyCode:'x'});});
    await new Promise(r=>setTimeout(r,250));await act('new');await act('sleep-all');let s=await snap();assert.equal(s.tabs.find(t=>t.id===first).reason,'Onopgeslagen invoer');assert.equal(s.live,1);
    // Pinning and exceptions prevent manual and automatic suspension.
    const second=await app.evaluate(({app},url)=>globalThis.__noorderTest.newTab(url).id,base+'/pinned');await wait(s=>!s.loading);await act('pin',second);await act('new');await act('sleep-all');assert.equal((await snap()).tabs.find(t=>t.id===second).reason,'Vastgezet');await act('pin',second);await act('except',second);await act('sleep-all');assert.equal((await snap()).tabs.find(t=>t.id===second).reason,'Altijd actief');await act('except',second);
    // New blank tabs share the shell. Memory comparison uses identical loaded fixtures.
    for(const t of (await snap()).tabs)await act('close',t.id);
    for(let i=0;i<5;i++){await app.evaluate(({app},url)=>globalThis.__noorderTest.newTab(url),base+'/ram-'+i);await wait(s=>!s.loading);}
    await act('performance');await new Promise(r=>setTimeout(r,600));const before=await app.evaluate(({app})=>globalThis.__noorderTest.measure());await act('sleep-all');await wait(s=>s.live===0&&s.sleeping===5);await new Promise(r=>setTimeout(r,1200));const after=await app.evaluate(({app})=>globalThis.__noorderTest.measure());assert.equal((await snap()).live,0,'all five loaded WebContents are destroyed');
    await page.screenshot({path:path.join(output,'Noorder-Browser-prestaties.png')});
    const wakeId=(await snap()).tabs.find(t=>t.kind==='web').id;await act('activate',wakeId);await wait(s=>s.live===1&&!s.loading);await act('new');await app.evaluate(({app})=>{const m=globalThis.__noorderTest;m.tabs.forEach(t=>t.lastActive=Date.now()-600000);m.sweep();});await wait(s=>s.live===0);
    await app.evaluate(({app})=>globalThis.__noorderTest.win.setSize(760,600));await page.screenshot({path:path.join(output,'narrow.png')});
    assert.deepEqual(errors,[]);const result={date:new Date().toISOString(),platform:process.platform,electron:await app.evaluate(()=>process.versions.electron),checks:['Navigation and back/forward','Website favicons in tabs and bookmarks','Bookmarks','Dark and light UI','Sleep and restore navigation history','Trusted input protects forms','Pinned tabs and exceptions protected','Automatic inactivity sweep','Five fixture pages release renderers','Blank tabs use no remote renderer'],memoryFixture:{pages:5,allocationMBPerPage:24,beforeMB:before,afterMB:after,loadedWebContentsBefore:5,loadedWebContentsAfter:0,note:'OS memory metrics are unavailable in this container; no RAM benchmark claim. All five remote WebContents were destroyed and a sleeping tab restored successfully.'},pageErrors:errors};fs.writeFileSync(path.join(output,'test-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  } finally {await app.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
