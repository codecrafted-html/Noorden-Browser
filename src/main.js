'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, Menu, nativeTheme, shell, dialog, nativeImage, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { defaults, normalizeSettings, addressToUrl, isWebUrl, host, sleepReason } = require('./policy');
const testMode = !app.isPackaged && process.env.NOORDER_TEST === '1';
if (testMode && process.env.NOORDER_TEST_PROFILE) app.setPath('userData', process.env.NOORDER_TEST_PROFILE);
const childProfile=process.env.NOORDER_CHILD_PROFILE;
const privateWindow=process.env.NOORDER_PRIVATE==='1';
if(childProfile && path.isAbsolute(childProfile))app.setPath('userData',childProfile);
const UI = pathToFileURL(path.join(__dirname, 'index.html')).href;
let win, tabs = [], activeId = null, nextId = 1, bookmarks = [], history = [], downloads = [], permissions = {}, activeDownloads = new Map(), nextDownloadId = 1, settings = { ...defaults }, closed = [], timer, metrics = null, overlayOpen = false, groups = {}, extensions = [];
const current = () => tabs.find(t => t.id === activeId);
const alive = t => !!t?.view?.webContents && !t.view.webContents.isDestroyed();
const file = name => path.join(app.getPath('userData'), name + '.json');
function save() { try { fs.mkdirSync(app.getPath('userData'), {recursive:true}); for(const [name,data] of Object.entries({settings,bookmarks,history,downloads,permissions,groups,extensions}))fs.writeFileSync(file(name), JSON.stringify(data)); } catch (e) { console.error('Bewaren mislukt', e.message); } }
function read() {
  try { settings = normalizeSettings(JSON.parse(fs.readFileSync(file('settings'), 'utf8'))); } catch {}
  try { bookmarks = JSON.parse(fs.readFileSync(file('bookmarks'), 'utf8')).filter(b => isWebUrl(b?.url) && typeof b.title === 'string').slice(0,200).map(b => ({title:b.title,url:b.url,favicon:validFavicon(b.favicon)?b.favicon:''})); } catch { bookmarks = []; }
  try { history=JSON.parse(fs.readFileSync(file('history'),'utf8')).filter(h=>isWebUrl(h?.url) && Number.isFinite(h.time)).slice(0,500); } catch {history=[];}
  try { downloads=JSON.parse(fs.readFileSync(file('downloads'),'utf8')).filter(d=>typeof d?.name==='string' && typeof d.path==='string').slice(0,200).map(d=>({...d,state:d.state==='progressing'?'interrupted':d.state})); } catch {downloads=[];}
  nextDownloadId=Math.max(0,...downloads.map(d=>Number(d.id)||0))+1;
  try { const data=JSON.parse(fs.readFileSync(file('permissions'),'utf8'));permissions=Object.fromEntries(Object.entries(data).filter(([origin,value])=>{try{return new URL(origin).origin===origin && typeof value==='object' && !!value;}catch{return false;}}).slice(0,200)); } catch {permissions={};}
  try {const data=JSON.parse(fs.readFileSync(file('groups'),'utf8'));groups=typeof data==='object'&&data?data:{};}catch{groups={};}
  try {extensions=JSON.parse(fs.readFileSync(file('extensions'),'utf8')).filter(e=>typeof e?.path==='string'&&path.isAbsolute(e.path)).slice(0,20);}catch{extensions=[];}
  nativeTheme.themeSource = settings.theme;
}
function reason(t, manual = false) {
  let audible = false, frameCount = 1;
  if (alive(t)) { try { audible = t.view.webContents.isCurrentlyAudible(); frameCount = t.view.webContents.mainFrame.framesInSubtree.length; } catch {} }
  return sleepReason({ ...t, hasView: !!alive(t), active: t.id === activeId, excepted: settings.exceptions.includes(host(t.url)), audible, frameCount }, settings, Date.now(), manual);
}
function snapshot() {
  const t = current(), wc = alive(t) ? t.view.webContents : null;
  return { version: app.getVersion(), platform: process.platform, activeId,
    tabs: tabs.map(t => ({ id:t.id, kind:t.kind, url:t.url, title:t.title, favicon:t.favicon, group:t.group, loading:t.loading, suspended:t.suspended, pinned:t.pinned, media:t.media, error:t.error, reason:reason(t,true), excepted:settings.exceptions.includes(host(t.url)) })),
    kind:t?.kind || 'home', url:t?.url || '', loading:!!t?.loading, error:t?.error || '',
    canBack:!!wc?.navigationHistory.canGoBack(), canForward:!!wc?.navigationHistory.canGoForward(),
    bookmarked:bookmarks.some(b=>b.url===t?.url), bookmarks, history:history.slice(0,200), downloads:downloads.slice(0,100),
    sitePermissions:permissions[origin(t?.url)]||{},groups, extensions:extensions.map(e=>({name:e.name,id:e.id,path:e.path})),privateWindow,settings, dark:nativeTheme.shouldUseDarkColors, metrics,
    live:tabs.filter(alive).length, sleeping:tabs.filter(t=>t.suspended).length, maximized:!!win?.isMaximized(), zoom:wc?Math.round(wc.getZoomFactor()*100):100 };
}
function broadcast() { if (win && !win.isDestroyed()) win.webContents.send('browser:state', snapshot()); }
function origin(url){try{const u=new URL(url);return isWebUrl(url)?u.origin:'';}catch{return '';}}
function recordHistory(tab){if(!isWebUrl(tab.url))return;history.unshift({url:tab.url,title:tab.title||host(tab.url),time:Date.now()});history=history.slice(0,500);save();}
function permissionKey(permission,details={}){if(permission==='media'){const types=details.mediaTypes||[];if(types.includes('audio'))return 'microphone';if(types.includes('video'))return 'camera';return '';}return ({'clipboard-read':'clipboard','multiple-downloads':'automaticDownloads'})[permission]||'';}
function permissionAllowed(wc,permission,requestingOrigin,details={}){
  const tab=tabs.find(t=>alive(t)&&t.view.webContents===wc),site=origin(tab?.url||wc?.getURL());
  if(!site || site!==origin(requestingOrigin))return false;
  const key=permissionKey(permission,details);
  if(permission==='media' && (details.mediaTypes||[]).length>1)return details.mediaTypes.every(type=>permissions[site]?.[type==='audio'?'microphone':'camera']===true);
  return !!key && permissions[site]?.[key]===true;
}
function registerDownload(item,wc){
  const tab=tabs.find(t=>alive(t)&&t.view.webContents===wc),initiator=origin(tab?.url||'');
  const name=path.basename(item.getFilename()).slice(0,180)||'download';
  let destination=path.join(app.getPath('downloads'),name),suffix=1;
  while(fs.existsSync(destination)||downloads.some(d=>d.path===destination && d.state==='progressing')){const ext=path.extname(name),stem=name.slice(0,name.length-ext.length);destination=path.join(app.getPath('downloads'),`${stem} (${suffix++})${ext}`);}
  item.setSavePath(destination);
  const download={id:nextDownloadId++,name,url:item.getURL(),origin:initiator,path:destination,total:item.getTotalBytes(),received:0,state:'progressing',time:Date.now()};
  downloads.unshift(download);downloads=downloads.slice(0,200);activeDownloads.set(download.id,item);
  if(tab)tab.downloading++;save();broadcast();
  item.on('updated',()=>{download.total=item.getTotalBytes();download.received=item.getReceivedBytes();broadcast();});
  item.once('done',(_event,state)=>{download.state=state;download.received=item.getReceivedBytes();download.total=item.getTotalBytes();activeDownloads.delete(download.id);if(tab)tab.downloading=Math.max(0,tab.downloading-1);save();broadcast();});
}
function bounds() { if (!win || win.isDestroyed()) return; const t=current(); if(alive(t)) { const {width,height}=win.getContentBounds(), y=settings.bookmarkBar?126:96; t.view.setBounds({x:0,y,width,height:Math.max(1,height-y)}); } }
function detach(t) { if(alive(t) && win && !win.isDestroyed()) { try { win.contentView.removeChildView(t.view); t.view.setVisible(false); } catch {} } }
function attach(t) { if(alive(t) && win && !win.isDestroyed()) { win.contentView.addChildView(t.view); t.view.setVisible(!overlayOpen); bounds(); } }
function makeTab(url='', kind='home') { return {id:nextId++,kind,url,title:kind==='performance'?'Prestaties':'Nieuw tabblad',favicon:'',group:'',hasIconLink:false,view:null,history:null,suspended:false,loading:false,error:'',dirty:false,media:false,pinned:false,downloading:0,unloadBlocked:false,lastActive:Date.now(),recentAudio:0,pendingSleep:false}; }

const FAVICON_LIMIT = 128 * 1024;
function validFavicon(value) { return typeof value === 'string' && value.length < 180000 && /^data:image\/(png|jpeg|gif|webp|x-icon|svg\+xml);base64,[a-z\d+/=]+$/i.test(value); }
function faviconFromBytes(bytes) {
  if (!bytes.length || bytes.length > FAVICON_LIMIT) return '';
  if (bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) || bytes[0]===0xff&&bytes[1]===0xd8) {
    const image=nativeImage.createFromBuffer(bytes);
    if(!image.isEmpty())return image.resize({width:32,height:32}).toDataURL();
  }
  let mime='';
  if(bytes.subarray(0,4).equals(Buffer.from([0,0,1,0])))mime='image/x-icon';
  else if(bytes.subarray(0,4).toString()==='GIF8')mime='image/gif';
  else if(bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
  else if(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(bytes.subarray(0,512).toString('utf8')))mime='image/svg+xml';
  return mime?'data:'+mime+';base64,'+bytes.toString('base64'):'';
}
async function readFavicon(url, wc) {
  try {
    if(url.startsWith('data:')){
      if(url.length>FAVICON_LIMIT*2)return '';
      const match=/^data:image\/[^;,]+;base64,([a-z\d+/=]+)$/i.exec(url);
      return match?faviconFromBytes(Buffer.from(match[1],'base64')):'';
    }
    if(!isWebUrl(url))return '';
    const abort=new AbortController(), timeout=setTimeout(()=>abort.abort(),4000);
    try {
      const response=await wc.session.fetch(url,{signal:abort.signal});
      if(!response.ok || Number(response.headers.get('content-length')||0)>FAVICON_LIMIT)return '';
      const reader=response.body?.getReader();if(!reader)return '';
      let size=0;const chunks=[];
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>FAVICON_LIMIT){await reader.cancel();return '';}chunks.push(Buffer.from(value));}
      return faviconFromBytes(Buffer.concat(chunks));
    }finally{clearTimeout(timeout);}
  }catch{return '';}
}
async function setFavicon(tab, wc, urls) {
  const page=wc.getURL();
  for(const url of urls){
    const favicon=await readFavicon(url,wc);
    if(wc.isDestroyed() || tab.view?.webContents!==wc || wc.getURL()!==page)return;
    if(!favicon)continue;
    tab.favicon=favicon;
    let changed=false;
    for(const bookmark of bookmarks)if(bookmark.url===tab.url && bookmark.favicon!==favicon){bookmark.favicon=favicon;changed=true;}
    if(changed)save();broadcast();return;
  }
}
function createView(t) {
  const view = new WebContentsView({ webPreferences:{ preload:path.join(__dirname,'page-preload.js'), nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true, backgroundThrottling:true, safeDialogs:true, navigateOnDragDrop:false } });
  t.view=view; t.suspended=false; t.pendingSleep=false; t.unloadBlocked=false;
  const wc=view.webContents;
  wc.on('before-input-event', shortcut);
  wc.setWindowOpenHandler(({url,disposition}) => { if(isWebUrl(url)) newTab(url, disposition!=='background-tab'); return {action:'deny'}; });
  wc.on('will-frame-navigate', e=>{ if(e.isMainFrame && !isWebUrl(e.url)) e.preventDefault(); });
  wc.on('will-redirect', e=>{ if(e.isMainFrame && !isWebUrl(e.url)) e.preventDefault(); });
  wc.on('did-start-loading', ()=>{ t.loading=true; t.error=''; broadcast(); });
  wc.on('did-stop-loading', ()=>{ t.loading=false; broadcast(); });
  wc.on('did-navigate', (_e,url)=>{ if(t.url!==url){t.favicon='';t.hasIconLink=false;}t.url=url; t.dirty=false; t.media=false; t.unloadBlocked=false; t.history=null; recordHistory(t);broadcast(); });
  wc.on('page-favicon-updated', (_e,urls)=>{t.hasIconLink=urls.length>0;void setFavicon(t,wc,urls); });
  wc.on('did-finish-load', ()=>{setTimeout(()=>{if(!t.favicon && alive(t) && t.view.webContents===wc && wc.getURL()===t.url && isWebUrl(t.url))void setFavicon(t,wc,[new URL('/favicon.ico',t.url).href]);},450);});
  wc.on('did-navigate-in-page', (_e,url,main)=>{ if(main){t.url=url; broadcast();} });
  wc.on('page-title-updated', (_e,title)=>{t.title=title.slice(0,160)||host(t.url);if(history[0]?.url===t.url){history[0].title=t.title;save();}broadcast();});
  wc.on('found-in-page',(_event,result)=>{if(t.id===activeId && win && !win.isDestroyed())win.webContents.send('browser:find-result',{matches:result.matches,active:result.activeMatchOrdinal});});
  wc.on('media-started-playing', ()=>{ t.media=true; broadcast(); });
  wc.on('media-paused', ()=>{t.media=false; t.recentAudio=Date.now(); broadcast();});
  wc.on('did-fail-load', (_e,code,desc,_url,main)=>{if(main&&code!==-3){t.error=desc; t.loading=false; broadcast();}});
  wc.on('will-prevent-unload', ()=>{t.unloadBlocked=true; t.pendingSleep=false; broadcast();});
  wc.on('render-process-gone', ()=>{t.error='Pagina gestopt. Klik op herladen.'; t.loading=false; broadcast();});
  wc.on('destroyed', ()=>{
    if(t.view!==view)return;
    t.view=null; t.loading=false;
    if(t.pendingSleep){ t.pendingSleep=false; t.suspended=true; if(t.id===activeId && tabs.includes(t)) wake(t); }
    broadcast();
  });
  view.setVisible(false);
  return wc;
}
function wake(t) {
  if(alive(t)) return;
  const history=t.history, wc=createView(t);
  if(t.id===activeId) attach(t);
  if(history?.entries.length) wc.navigationHistory.restore(history).catch(()=>{if(!wc.isDestroyed())wc.loadURL(t.url).catch(()=>{});});
  else wc.loadURL(t.url).catch(()=>{});
}
function activate(id) {
  const next=tabs.find(t=>t.id===id); if(!next || !win) return;
  const old=current(); if(old && old!==next){old.lastActive=Date.now();detach(old);}
  activeId=id; next.lastActive=Date.now();
  if(next.kind==='web'){if(!alive(next))wake(next);else attach(next); next.view?.webContents.focus();}
  else win.webContents.focus();
  if(next.kind==='performance')measure();
  broadcast();
}
function newTab(input='', foreground=true) {
  const url=addressToUrl(input),t=makeTab(url,url?'web':'home'); tabs.push(t);
  if(url)t.title=host(url);
  if(foreground)activate(t.id);else{t.suspended=!!url;broadcast();}
  return t;
}
function closeTab(id) {
  const index=tabs.findIndex(t=>t.id===id); if(index<0)return;
  const t=tabs[index],wasActive=id===activeId;
  // Explicit tab closing can discard input only after confirmation.
  if(t.dirty && !testMode){ const choice=dialog.showMessageBoxSync(win,{type:'question',message:'Dit tabblad bevat invoer.',detail:'Sluiten kan onopgeslagen wijzigingen verwijderen.',buttons:['Annuleren','Sluiten'],defaultId:0,cancelId:0});if(choice!==1)return; }
  if(t.kind==='web')closed=[t.url,...closed].slice(0,10);
  detach(t); tabs.splice(index,1); t.pendingSleep=false;
  if(alive(t))t.view.webContents.close();
  if(wasActive){activeId=null; if(tabs.length)activate(tabs[Math.min(index,tabs.length-1)].id);else newTab();}else broadcast();
}
function navigate(input) {
  let t=current(); if(!t)t=newTab(); const url=addressToUrl(input);
  if(!url){detach(t); if(alive(t))t.view.webContents.close(); Object.assign(t,{kind:'home',url:'',title:'Nieuw tabblad',suspended:false,history:null});broadcast();return;}
  t.kind='web'; t.url=url; t.favicon=''; t.hasIconLink=false; t.error=''; t.history=null; t.dirty=false; t.media=false; t.recentAudio=0;
  if(!alive(t))wake(t);else{attach(t);t.view.webContents.loadURL(url).catch(()=>{});}broadcast();
}
function suspend(t, manual=false) {
  if(!t || t.pendingSleep || reason(t,manual))return false;
  const wc=t.view.webContents;
  try {t.history={entries:wc.navigationHistory.getAllEntries(),index:wc.navigationHistory.getActiveIndex()};} catch {t.history=null;}
  t.pendingSleep=true;
  wc.close({waitForBeforeUnload:true});
  return true;
}
function sweep() { for(const t of tabs)suspend(t);if(current()?.kind==='performance')measure();broadcast(); }
function measure() { const processes=app.getAppMetrics(); const valid=processes.length>0 && processes.every(p=>Number.isFinite(p.memory?.workingSetSize)&&p.memory.workingSetSize>0); metrics=valid?Math.round(processes.reduce((n,p)=>n+p.memory.workingSetSize,0)/1024):null;broadcast();return metrics; }
function performancePage(){let t=tabs.find(t=>t.kind==='performance');if(!t){t=makeTab('','performance');tabs.push(t);}activate(t.id);}
const internalTitles={history:'Geschiedenis',downloads:'Downloads',bookmarks:'Bladwijzers',settings:'Instellingen',help:'Help',extensions:'Extensies',groups:'Tabbladgroepen'};
function openPage(kind){if(kind==='performance')return performancePage();if(!Object.hasOwn(internalTitles,kind))return;let t=tabs.find(tab=>tab.kind===kind);if(!t){t=makeTab('',kind);t.title=internalTitles[kind];tabs.push(t);}activate(t.id);}
function toggleException(t){const h=host(t?.url);if(!h)return;settings.exceptions=settings.exceptions.includes(h)?settings.exceptions.filter(x=>x!==h):[...settings.exceptions,h];save();broadcast();}
function showTabMenu(id){const t=tabs.find(t=>t.id===id);if(!t)return;Menu.buildFromTemplate([
  {label:t.pinned?'Losmaken':'Tabblad vastzetten',click:()=>{t.pinned=!t.pinned;broadcast();}},
  {label:'Website altijd actief',type:'checkbox',checked:settings.exceptions.includes(host(t.url)),enabled:t.kind==='web',click:()=>toggleException(t)},
  {label:'Nieuwe groep met dit tabblad',click:()=>command('group-create',id)},
  {label:'Uit groep verwijderen',enabled:!!t.group,click:()=>command('group-remove',id)},
  {label:'Nu laten slapen',enabled:!reason(t,true),click:()=>suspend(t,true)}, {type:'separator'},
  {label:'Dupliceren',click:()=>newTab(t.url)}, {label:'Sluiten',click:()=>closeTab(id)}
]).popup({window:win});}
function mainMenu(){Menu.buildFromTemplate([
  {label:'Nieuw tabblad',click:()=>newTab()}, {label:'Gesloten tabblad terughalen',enabled:!!closed.length,click:()=>newTab(closed.shift())},
  {type:'separator'},{label:'Prestaties en geheugen',click:performancePage},
  {label:'Bladwijzerbalk',type:'checkbox',checked:settings.bookmarkBar,click:()=>command('setting',{bookmarkBar:!settings.bookmarkBar})},
  {label:'Weergave',submenu:['system','light','dark'].map((theme,i)=>({label:['Systeem','Licht','Donker'][i],type:'radio',checked:settings.theme===theme,click:()=>command('setting',{theme})}))},
  {label:'Downloads openen',click:()=>shell.openPath(app.getPath('downloads'))},
  {type:'separator'},{label:'Vergroten',click:()=>zoom(.1)},{label:'Verkleinen',click:()=>zoom(-.1)},{label:'Werkelijke grootte',click:()=>{if(alive(current()))current().view.webContents.setZoomLevel(0);}},
  {type:'separator'},{label:'Afsluiten',click:()=>win.close()}
]).popup({window:win});}
function zoom(delta){if(alive(current())){const wc=current().view.webContents;wc.setZoomFactor(Math.min(3,Math.max(.5,wc.getZoomFactor()+delta)));}}
function newWindow(incognito){
  const profile=incognito?fs.mkdtempSync(path.join(os.tmpdir(),'noorder-private-')):fs.mkdtempSync(path.join(app.getPath('userData'),'window-'));
  if(!incognito)for(const name of ['settings','bookmarks','permissions','extensions'])try{fs.copyFileSync(file(name),path.join(profile,name+'.json'));}catch{}
  const args=[...(testMode?['--no-sandbox']:[]),...(app.isPackaged?[]:[app.getAppPath()])];
  const child=spawn(process.execPath,args,{detached:true,stdio:'ignore',env:{...process.env,NOORDER_CHILD_PROFILE:profile,NOORDER_PRIVATE:incognito?'1':'0',NOORDER_TEST:'0',ELECTRON_RUN_AS_NODE:''}});
  child.unref();
  return {pid:child.pid,profile};
}
function openPasswords(){
  if(process.platform==='darwin')spawn('/usr/bin/open',['-a','Passwords'],{detached:true,stdio:'ignore'}).unref();
  else if(process.platform==='win32')spawn('control.exe',['/name','Microsoft.CredentialManager'],{detached:true,stdio:'ignore'}).unref();
  else dialog.showMessageBox(win,{message:'Wachtwoorden worden beheerd door je besturingssysteem.'});
}
async function clearBrowserData(){
  const {response}=await dialog.showMessageBox(win,{type:'warning',message:'Browsegegevens wissen?',detail:'Geschiedenis, cookies, websitegegevens, cache, downloads in de lijst en website-rechten worden gewist. Je bladwijzers en gedownloade bestanden blijven staan.',buttons:['Annuleren','Wissen'],defaultId:0,cancelId:0});
  if(response!==1)return;
  await session.defaultSession.clearStorageData();await session.defaultSession.clearCache();history=[];downloads=downloads.filter(d=>d.state==='progressing');permissions={};save();broadcast();
}
async function loadExtension(folder){
  try{
    const extension=await session.defaultSession.extensions.loadExtension(folder);
    extensions=extensions.filter(e=>e.id!==extension.id);
    extensions.push({id:extension.id,name:extension.name,path:folder});save();broadcast();
    return extension;
  }catch(error){if(!testMode)dialog.showErrorBox('Extensie laden mislukt',error.message);throw error;}
}
async function addExtension(){
  const result=await dialog.showOpenDialog(win,{title:'Kies de map van een uitgepakte extensie',properties:['openDirectory']});
  if(result.canceled||!result.filePaths[0])return;
  await loadExtension(result.filePaths[0]);
}
async function uiOverlay(show){
  overlayOpen=show;
  const tab=current();if(!alive(tab))return;
  const wc=tab.view.webContents;
  if(show){
    try {const image=await wc.capturePage();if(overlayOpen && alive(tab) && current()===tab)win.webContents.send('browser:overlay-image',image.resize({width:Math.min(1280,image.getSize().width)}).toDataURL());}catch{}
    if(overlayOpen && alive(tab))tab.view.setVisible(false);
  }else {tab.view.setVisible(true);win.webContents.send('browser:overlay-image','');}
}
async function savePdf(wc,tab){
  const name=(tab.title||'Pagina').replace(/[\\/:*?"<>|]/g,'').slice(0,80)||'Pagina';
  const {canceled,filePath}=await dialog.showSaveDialog(win,{defaultPath:path.join(app.getPath('downloads'),name+'.pdf'),filters:[{name:'PDF',extensions:['pdf']}]});
  if(canceled||!filePath||wc.isDestroyed())return;
  try {await fs.promises.writeFile(filePath,await wc.printToPDF({printBackground:true}));}catch(error){dialog.showErrorBox('PDF opslaan mislukt',error.message);}
}
function command(name,value){const t=current(),wc=alive(t)?t.view.webContents:null;switch(name){
  case 'get-state':broadcast();break;
  case 'new':newTab();break;
  case 'close':if(Number.isInteger(value))closeTab(value);break;
  case 'activate':if(Number.isInteger(value))activate(value);break;
  case 'navigate':if(typeof value==='string'&&value.length<8192)navigate(value);break;
  case 'home':navigate('');break;
  case 'back':if(wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();break;
  case 'forward':if(wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();break;
  case 'reload':wc?.reload();break;
  case 'stop':wc?.stop();break;
  case 'focus-address':win.webContents.focus();win.webContents.send('browser:focus-address');break;
  case 'bookmark':if(!isWebUrl(t?.url))break;bookmarks=bookmarks.some(b=>b.url===t.url)?bookmarks.filter(b=>b.url!==t.url):[...bookmarks,{title:t.title,url:t.url,favicon:t.favicon}].slice(-200);save();broadcast();break;
  case 'performance':performancePage();break;
  case 'history':case 'downloads':case 'bookmarks':case 'settings':case 'help':case 'extensions':openPage(name);break;
  case 'groups':openPage('groups');break;
  case 'group-create':{const target=tabs.find(tab=>tab.id===value);if(target){const id='group-'+Date.now();groups[id]={name:'Groep '+(Object.keys(groups).length+1),color:'#5487bb'};target.group=id;save();broadcast();}break;}
  case 'group-remove':{const target=tabs.find(tab=>tab.id===value);if(target){target.group='';broadcast();}break;}
  case 'group-open':{const target=tabs.find(tab=>tab.group===value);if(target)activate(target.id);break;}
  case 'group-delete':if(typeof value==='string'&&Object.hasOwn(groups,value)){delete groups[value];for(const tab of tabs)if(tab.group===value)tab.group='';save();broadcast();}break;
  case 'new-window':newWindow(false);break;
  case 'incognito-window':newWindow(true);break;
  case 'passwords':openPasswords();break;
  case 'clear-browser-data':void clearBrowserData().catch(error=>dialog.showErrorBox('Wissen mislukt',error.message));break;
  case 'extension-add':void addExtension().catch(()=>{});break;
  case 'extension-remove':{const ext=extensions.find(e=>e.id===value);if(ext){session.defaultSession.extensions.removeExtension(ext.id);extensions=extensions.filter(e=>e.id!==ext.id);save();broadcast();}break;}
  case 'lens':newTab('https://lens.google.com/');break;
  case 'site-permission':{
    const site=origin(t?.url),key=value?.key;
    if(site && ['microphone','camera','clipboard','automaticDownloads'].includes(key) && typeof value.enabled==='boolean'){
      permissions[site]={...permissions[site],[key]:value.enabled};save();broadcast();
    }break;
  }
  case 'site-reset':{const site=origin(t?.url);if(site){delete permissions[site];save();broadcast();}break;}
  case 'site-clear-data':{const site=origin(t?.url);if(site)void session.defaultSession.clearStorageData({origin:site}).then(()=>wc?.reload()).catch(e=>console.error('Sitegegevens wissen:',e));break;}
  case 'download-open':{const d=downloads.find(d=>d.id===value);if(d?.state==='completed' && fs.existsSync(d.path))void shell.openPath(d.path);break;}
  case 'download-show':{const d=downloads.find(d=>d.id===value);if(d?.state==='completed' && fs.existsSync(d.path))shell.showItemInFolder(d.path);break;}
  case 'download-cancel':activeDownloads.get(value)?.cancel();break;
  case 'download-clear':downloads=downloads.filter(d=>d.state==='progressing');save();broadcast();break;
  case 'history-clear':history=[];save();broadcast();break;
  case 'find':win.webContents.focus();win.webContents.send('browser:find');break;
  case 'ui-overlay':if(typeof value==='boolean')void uiOverlay(value);break;
  case 'find-text':if(typeof value==='string'&&value.length<=500){if(value)wc?.findInPage(value);else wc?.stopFindInPage('clearSelection');}break;
  case 'find-next':if(typeof value==='string'&&value.length<=500&&value)wc?.findInPage(value,{findNext:true});break;
  case 'find-previous':if(typeof value==='string'&&value.length<=500&&value)wc?.findInPage(value,{findNext:true,forward:false});break;
  case 'print':wc?.print({silent:false,printBackground:true});break;
  case 'save-pdf':if(wc)void savePdf(wc,t);break;
  case 'share-link':if(isWebUrl(t?.url))clipboard.writeText(t.url);break;
  case 'translate':if(isWebUrl(t?.url))newTab('https://translate.google.com/translate?sl=auto&tl=nl&u='+encodeURIComponent(t.url));break;
  case 'fullscreen':win.setFullScreen(!win.isFullScreen());break;
  case 'zoom-in':zoom(.1);break;
  case 'zoom-out':zoom(-.1);break;
  case 'zoom-reset':if(wc)wc.setZoomFactor(1);broadcast();break;
  case 'sleep-all':tabs.forEach(t=>suspend(t,true));break;
  case 'sleep-tab':suspend(tabs.find(t=>t.id===value),true);break;
  case 'except':toggleException(tabs.find(t=>t.id===value));break;
  case 'pin':{const target=tabs.find(t=>t.id===value);if(target){target.pinned=!target.pinned;broadcast();}break;}
  case 'remove-exception':settings.exceptions=settings.exceptions.filter(h=>h!==value);save();broadcast();break;
  case 'setting':if(value&&typeof value==='object'){settings=normalizeSettings({...settings,...value,exceptions:settings.exceptions});nativeTheme.themeSource=settings.theme;save();bounds();broadcast();}break;
  case 'menu':mainMenu();break;
  case 'tab-menu':showTabMenu(value);break;
  case 'minimize':win.minimize();break;
  case 'maximize':win.isMaximized()?win.unmaximize():win.maximize();break;
  case 'window-close':win.close();break;
  case 'reorder':if(Array.isArray(value)&&value.length===tabs.length&&new Set(value).size===tabs.length&&value.every(id=>tabs.some(t=>t.id===id))){tabs=value.map(id=>tabs.find(t=>t.id===id));broadcast();}break;
}}
function shortcut(event,input){if(input.type!=='keyDown')return;const mod=process.platform==='darwin'?input.meta:input.control,key=input.key.toLowerCase();let handled=true;
  if(mod&&key==='l')command('focus-address');
  else if(mod&&key==='t'&&input.shift){if(closed.length)newTab(closed.shift());}
  else if(mod&&key==='t')newTab();
  else if(mod&&key==='w')closeTab(activeId);
  else if(mod&&key==='r')command('reload');
  else if(mod&&key==='d')command('bookmark');
  else if(mod&&key==='f')command('find');
  else if(mod&&key==='p')command('print');
  else if(mod&&key==='n'&&input.shift)command('incognito-window');
  else if(mod&&key==='n')command('new-window');
  else if(mod&&key==='j')command('downloads');
  else if(mod&&key==='h')command('history');
  else if(mod&&key==='+'||mod&&key==='=')command('zoom-in');
  else if(mod&&key==='-')command('zoom-out');
  else if(mod&&key==='0')command('zoom-reset');
  else if(mod&&/^[1-9]$/.test(key)){const t=key==='9'?tabs.at(-1):tabs[+key-1];if(t)activate(t.id);}
  else if(input.control&&key==='tab'){const i=tabs.findIndex(t=>t.id===activeId);activate(tabs[(i+(input.shift?-1:1)+tabs.length)%tabs.length].id);}
  else if(input.alt&&key==='left')command('back');else if(input.alt&&key==='right')command('forward');
  else handled=false;if(handled)event.preventDefault();
}
function createWindow(){win=new BrowserWindow({width:1280,height:850,minWidth:680,minHeight:480,title:'Noorder Browser',backgroundColor:'#f8fafd',icon:path.join(__dirname,'logo.png'),
  ...(process.platform==='darwin'?{titleBarStyle:'hidden',trafficLightPosition:{x:16,y:16}}:{frame:false}),
  webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('before-input-event',shortcut);
  win.on('resize',()=>{bounds();broadcast();});
  win.on('close',e=>{if(!testMode && tabs.some(t=>t.dirty)){const answer=dialog.showMessageBoxSync(win,{type:'question',message:'Er staan tabbladen met invoer open.',detail:'Afsluiten kan onopgeslagen wijzigingen verwijderen.',buttons:['Annuleren','Afsluiten'],defaultId:0,cancelId:0});if(answer!==1)e.preventDefault();}});
  win.on('closed',()=>{const old=tabs;tabs=[];activeId=null;win=null;old.forEach(t=>{t.pendingSleep=false;if(alive(t))t.view.webContents.close();});});
  win.loadFile(path.join(__dirname,'index.html')).then(()=>{newTab();broadcast();});
}
app.whenReady().then(()=>{
  read();Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'}]):null);
  for(const extension of extensions)void session.defaultSession.extensions.loadExtension(extension.path).then(loaded=>{extension.id=loaded.id;extension.name=loaded.name;broadcast();}).catch(()=>{extensions=extensions.filter(e=>e!==extension);save();});
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>{
    const site=origin(wc.getURL()),requesting=origin(details?.requestingUrl||wc.getURL()),key=permissionKey(permission,details);
    if(site!==requesting||!key){callback(false);return;}
    if(permissionAllowed(wc,permission,requesting,details)){callback(true);return;}
    if(permissions[site]?.[key]===false){callback(false);return;}
    const names={microphone:'microfoon',camera:'camera',clipboard:'klembord',automaticDownloads:'meerdere downloads'};
    const requested=permission==='media'?[...new Set((details.mediaTypes||[]).map(type=>type==='audio'?'microphone':type==='video'?'camera':''))].filter(Boolean):[key];
    void dialog.showMessageBox(win,{type:'question',message:`${host(site)} wil toegang tot ${requested.map(name=>names[name]).join(' en ')}.`,detail:'Je kunt dit later aanpassen via het icoon links in de adresbalk.',buttons:['Blokkeren','Toestaan'],defaultId:0,cancelId:0}).then(({response})=>{
      permissions[site]={...permissions[site],...Object.fromEntries(requested.map(name=>[name,response===1]))};save();broadcast();callback(response===1);
    }).catch(()=>callback(false));
  });
  session.defaultSession.setPermissionCheckHandler((wc,permission,requestingOrigin,details)=>permissionAllowed(wc,permission,requestingOrigin,details));
  session.defaultSession.on('will-download',(_e,item,wc)=>registerDownload(item,wc));
  ipcMain.on('browser:command',(event,name,value)=>{if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==UI||typeof name!=='string')return;command(name,value);});
  ipcMain.on('page:status',(event,type,value)=>{const t=tabs.find(t=>alive(t)&&t.view.webContents===event.sender);if(!t||event.senderFrame!==event.sender.mainFrame||value!==true&&value!==false)return;if(type==='dirty')t.dirty=t.dirty||value;if(type==='media'){t.media=value;if(!value)t.recentAudio=Date.now();}broadcast();});
  nativeTheme.on('updated',broadcast);createWindow();timer=setInterval(sweep,10000);timer.unref();
});
app.on('activate',()=>{if(!win)createWindow();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('will-quit',()=>{clearInterval(timer);if(privateWindow && childProfile)try{fs.rmSync(childProfile,{recursive:true,force:true});}catch{}});
if(testMode)globalThis.__noorderTest=module.exports={snapshot,newTab,activate,command,sweep,measure,suspend,permissionAllowed,loadExtension,newWindow,get tabs(){return tabs;},get win(){return win;}};
