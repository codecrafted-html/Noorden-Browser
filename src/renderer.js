'use strict';
const $ = id => document.getElementById(id);
const send = (name,value) => window.browser.command(name,value);
const svg = (name, cls='') => {const el=document.createElementNS('http://www.w3.org/2000/svg','svg');if(cls)el.setAttribute('class',cls);const use=document.createElementNS(el.namespaceURI,'use');use.setAttribute('href','#i-'+name);el.append(use);return el;};
let state, addressTab, bookmarkKey='', overviewKey='', exceptionsKey='', dragged;
const tabNodes = new Map();
function hostname(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'Noorder';}}
function focusAddress(){$('address').focus();$('address').select();}
function renderTabs(s){
  const ids=new Set(s.tabs.map(t=>t.id));for(const [id,node] of tabNodes)if(!ids.has(id)){node.remove();tabNodes.delete(id);}
  for(const t of s.tabs){
    let node=tabNodes.get(t.id);
    if(!node){node=document.createElement('div');node.className='tab';node.setAttribute('role','tab');node.draggable=true;node.dataset.id=t.id;
      const icon=svg('globe','tab-icon'),picture=document.createElement('img'),title=document.createElement('span'),close=document.createElement('button');picture.className='tab-icon-image';picture.alt='';picture.hidden=true;picture.onerror=()=>{picture.hidden=true;icon.hidden=false;};title.className='tab-title';close.className='tab-close';close.append(svg('close'));close.setAttribute('aria-label','Tabblad sluiten');close.addEventListener('click',e=>{e.stopPropagation();send('close',t.id);});
      node.append(icon,picture,title,close);node.addEventListener('click',()=>send('activate',t.id));node.addEventListener('auxclick',e=>{if(e.button===1){e.preventDefault();send('close',t.id);}});node.addEventListener('contextmenu',e=>{e.preventDefault();send('tab-menu',t.id);});
      node.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();send('activate',t.id);}if(e.key==='Delete')send('close',t.id);if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const i=state.tabs.findIndex(x=>x.id===t.id),next=state.tabs[(i+(e.key==='ArrowLeft'?-1:1)+state.tabs.length)%state.tabs.length];send('activate',next.id);tabNodes.get(next.id)?.focus();}});
      node.addEventListener('dragstart',e=>{dragged=t.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(t.id));});node.addEventListener('dragend',()=>{dragged=null;});node.addEventListener('dragover',e=>{if(dragged)e.preventDefault();});node.addEventListener('drop',e=>{e.preventDefault();if(!dragged||dragged===t.id)return;const ids=state.tabs.map(x=>x.id).filter(id=>id!==dragged);ids.splice(ids.indexOf(t.id),0,dragged);send('reorder',ids);dragged=null;});
      tabNodes.set(t.id,node);
    }
    node.classList.toggle('active',t.id===s.activeId);node.classList.toggle('suspended',t.suspended);node.classList.toggle('pinned',t.pinned);node.classList.toggle('grouped',!!t.group);node.dataset.group=t.group||'';node.setAttribute('aria-selected',String(t.id===s.activeId));node.tabIndex=t.id===s.activeId?0:-1;node.title=t.title+(t.suspended?' · In slaapstand':'');node.querySelector('.tab-title').textContent=t.title;
    const icon=node.querySelector('.tab-icon'),picture=node.querySelector('.tab-icon-image');
    const pictureSource=t.kind==='home'?'logo.svg':t.kind==='web'?t.favicon:'';
    if(pictureSource && !t.loading){if(picture.getAttribute('src')!==pictureSource)picture.src=pictureSource;picture.hidden=false;icon.hidden=true;}
    else{picture.hidden=true;icon.hidden=false;}
    icon.classList.toggle('loading',t.loading);icon.firstChild.setAttribute('href','#i-'+(t.loading?'reload':t.media?'sound':t.suspended?'sleep':t.pinned?'pin':t.kind==='performance'?'leaf':'globe'));
    // Only move a DOM node when ordering changed: preserves focus and dragging.
    const index=s.tabs.indexOf(t);if($('tabs').children[index]!==node)$('tabs').insertBefore(node,$('tabs').children[index]||null);
  }
}
function renderBookmarks(s){const key=JSON.stringify(s.bookmarks);if(bookmarkKey===key)return;bookmarkKey=key;$('bookmarks').replaceChildren();
  if(!s.bookmarks.length){const hint=document.createElement('span');hint.className='bookmark-hint';hint.append(svg('star'),document.createTextNode('Je favoriete websites binnen handbereik. Voeg een bladwijzer toe met '+(s.platform==='darwin'?'⌘':'Ctrl')+' + D.'));$('bookmarks').append(hint);return;}
  for(const b of s.bookmarks){const button=document.createElement('button'),text=document.createElement('span');button.className='bookmark-item';text.textContent=b.title;button.title=b.url;if(b.favicon){const picture=document.createElement('img');picture.className='bookmark-favicon';picture.alt='';picture.src=b.favicon;picture.onerror=()=>picture.replaceWith(svg('globe'));button.append(picture);}else button.append(svg('globe'));button.append(text);button.onclick=()=>send('navigate',b.url);$('bookmarks').append(button);}
}
function renderPerformance(s){
  $('ram').textContent=s.metrics??'—';$('ram-description').textContent=s.metrics===null?'Meting momenteel niet beschikbaar':'Som van browserprocessen*';$('live-count').textContent=s.live;$('sleep-count').textContent=s.sleeping;$('sleep-setting').value=s.settings.sleepMinutes;$('tab-count').textContent=s.tabs.length+' tabbladen';$('version').textContent=s.version;
  const key=JSON.stringify(s.tabs.map(t=>[t.id,t.title,t.favicon,t.kind,t.suspended,t.reason,t.excepted,t.url]));
  if(key!==overviewKey){overviewKey=key;$('tab-overview').replaceChildren();for(const t of s.tabs){const row=document.createElement('div'),text=document.createElement('div'),title=document.createElement('strong'),host=document.createElement('span'),status=document.createElement('span');row.className='overview-row';text.className='overview-text';title.textContent=t.title;host.textContent=t.kind==='web'?hostname(t.url):'Noorder';text.append(title,host);status.className='row-status'+(t.suspended?' asleep':'');status.textContent=t.reason||'Kan slapen';let icon=svg(t.suspended?'sleep':t.kind==='web'?'globe':'home');if(t.favicon){icon=document.createElement('img');icon.className='overview-favicon';icon.src=t.favicon;icon.alt='';}row.append(icon,text,status);
      if(t.kind==='web'){const action=document.createElement('button');action.className='row-action';action.textContent=t.excepted?'Uitzondering uit':'Altijd actief';action.onclick=()=>send('except',t.id);row.append(action);} $('tab-overview').append(row);}}
  const ek=JSON.stringify(s.settings.exceptions);if(ek!==exceptionsKey){exceptionsKey=ek;$('exceptions').replaceChildren();if(!s.settings.exceptions.length){const p=document.createElement('p');p.className='empty';p.textContent='Nog geen uitzonderingen. Kies ‘Altijd actief’ naast een website.';$('exceptions').append(p);}for(const h of s.settings.exceptions){const row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');row.className='exception-row';name.textContent=h;remove.textContent='Verwijderen';remove.onclick=()=>send('remove-exception',h);row.append(name,remove);$('exceptions').append(row);}}
}
function render(s){const previousTab=state?.activeId;state=s;document.body.classList.toggle('dark',s.dark);document.body.classList.toggle('mac',s.platform==='darwin');document.body.classList.toggle('private-window',s.privateWindow);document.documentElement.style.setProperty('--bar-height',s.settings.bookmarkBar?'126px':'96px');$('bookmarks').hidden=!s.settings.bookmarkBar;
  const update=s.update||{};$('update-pill').hidden=!['available','downloading','ready','error'].includes(update.phase);$('update-pill').textContent=update.phase==='ready'?'Herstart voor update':update.phase==='error'?'Update controleren':update.phase==='downloading'?`${update.percent}% update`:'Update';$('update-pill').title=update.message||'Update';
  renderTabs(s);if(previousTab!==s.activeId)tabNodes.get(s.activeId)?.scrollIntoView({block:'nearest',inline:'nearest'});renderBookmarks(s);$('home-page').hidden=s.kind!=='home';$('performance-page').hidden=s.kind!=='performance';$('utility-page').hidden=!['history','downloads','bookmarks','settings','help','extensions','groups'].includes(s.kind);$('web-placeholder').hidden=s.kind!=='web';$('web-status').textContent=s.error||'Pagina laden…';
  if(document.activeElement!==$('address')||addressTab!==s.activeId){$('address').value=s.url;addressTab=s.activeId;}
  $('back').disabled=!s.canBack;$('forward').disabled=!s.canForward;$('reload').disabled=s.kind!=='web';$('reload-icon').setAttribute('href',s.loading?'#i-close':'#i-reload');$('reload').title=s.loading?'Stoppen':'Herladen';$('reload').setAttribute('aria-label',s.loading?'Stoppen':'Herladen');
  $('bookmark').disabled=s.kind!=='web';$('bookmark').classList.toggle('saved',s.bookmarked);$('bookmark').setAttribute('aria-label',s.bookmarked?'Bladwijzer verwijderen':'Bladwijzer toevoegen');$('site-icon').setAttribute('href',s.kind==='web'?'#i-tune':'#i-search');$('site-info').title=s.kind==='web'?(s.url.startsWith('https:')?'HTTPS-verbinding':'Onversleutelde HTTP-verbinding'):'Nieuw tabblad';
  $('saver-title').textContent=s.sleeping?s.sleeping+' tabblad'+(s.sleeping===1?' slaapt':'en slapen'):'Meer ruimte voor wat je doet';$('saver-subtitle').textContent=s.settings.sleepMinutes?'Ongebruikte tabbladen gaan na '+s.settings.sleepMinutes+' minuten slapen.':'Automatische geheugenbesparing is uitgeschakeld.';$('saver-badge').textContent=s.settings.sleepMinutes?'Besparing aan':'Besparing uit';
  if(s.kind==='performance')renderPerformance(s);window.noorderPanels?.render(s);
}
$('address-form').addEventListener('submit',e=>{e.preventDefault();send('navigate',$('address').value);$('address').blur();});
$('address').addEventListener('keydown',e=>{if(e.key==='Escape'){$('address').value=state?.url||'';$('address').blur();}});
$('search-form').addEventListener('submit',e=>{e.preventDefault();if($('search').value.trim()){send('navigate',$('search').value);$('search').value='';}});
for(const id of ['back','forward','home','bookmark','performance'])$(id).addEventListener('click',()=>send(id));
$('update-pill').onclick=()=>send('settings');
$('reload').onclick=()=>send(state?.loading?'stop':'reload');$('new-tab').onclick=()=>send('new');$('home-performance').onclick=()=>send('performance');$('sleep-all').onclick=()=>send('sleep-all');$('sleep-setting').onchange=e=>send('setting',{sleepMinutes:+e.target.value});$('appearance').onclick=()=>send('setting',{theme:state?.dark?'light':'dark'});
for(const button of document.querySelectorAll('[data-url]'))button.onclick=()=>send('navigate',button.dataset.url);
for(const button of document.querySelectorAll('[data-command]'))button.onclick=()=>send(button.dataset.command);
window.browser.onState(render);window.browser.onFocusAddress(focusAddress);send('get-state');
