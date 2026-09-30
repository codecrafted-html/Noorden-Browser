'use strict';
(() => {
  const $=id=>document.getElementById(id),send=(name,value)=>window.browser.command(name,value);
  const svg=name=>{const e=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(e.namespaceURI,'use');use.setAttribute('href','#i-'+name);e.append(use);return e;};
  const labels={history:['Geschiedenis','Je recent bezochte websites.'],downloads:['Downloads','Gedownloade bestanden en hun voortgang.'],bookmarks:['Bladwijzers','Websites die je hebt bewaard.'],settings:['Instellingen','Pas Noorder aan zoals jij wilt.'],help:['Help','Sneltoetsen en informatie.'],extensions:['Extensies','Lokaal geïnstalleerde extensies.'],groups:['Tabbladgroepen','Groepeer de tabbladen die bij elkaar horen.']};
  let state,panel='',findOpen=false;
  function closePanel(){if(!panel)return;panel='';$('popover-overlay').hidden=true;for(const id of ['site-popover','downloads-popover','menu-popover'])$(id).hidden=true;send('ui-overlay',false);}
  function showPanel(name){if(panel===name){closePanel();return;}const wasOpen=!!panel;panel=name;$('popover-overlay').hidden=false;for(const id of ['site-popover','downloads-popover','menu-popover'])$(id).hidden=id!==name+'-popover';if(!wasOpen)send('ui-overlay',true);renderPanel();}
  function line(label,icon,action,shortcut=''){
    const button=document.createElement('button');button.className='menu-row';button.append(svg(icon));const text=document.createElement('span');text.textContent=label;button.append(text);if(shortcut){const key=document.createElement('kbd');key.textContent=shortcut;button.append(key);}button.onclick=()=>{closePanel();action();};return button;
  }
  function separator(){const div=document.createElement('div');div.className='menu-separator';return div;}
  function renderPanel(){if(!state)return;if(panel==='site')sitePanel();if(panel==='downloads')downloadPanel();if(panel==='menu')menuPanel();}
  function sitePanel(){
    const tab=state.tabs.find(t=>t.id===state.activeId);if(tab?.kind!=='web'){closePanel();return;}
    const site=new URL(tab.url);$('site-name').textContent=site.hostname;$('site-secure-label').textContent=site.protocol==='https:'?'Verbinding is beveiligd':'Verbinding is niet versleuteld';
    const permissions=[['microphone','Microfoon','mic'],['camera','Camera','camera'],['automaticDownloads','Automatische downloads','download'],['clipboard','Klembord lezen','clipboard']];
    $('site-permissions').replaceChildren();for(const [key,label,icon] of permissions){const row=document.createElement('div'),name=document.createElement('span'),toggle=document.createElement('button');row.className='permission-row';name.textContent=label;toggle.className='switch'+(state.sitePermissions[key]===true?' on':'');toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-checked',String(state.sitePermissions[key]===true));toggle.onclick=()=>send('site-permission',{key,enabled:state.sitePermissions[key]!==true});row.append(svg(icon),name,toggle);$('site-permissions').append(row);}
  }
  function friendlyBytes(bytes){if(!Number.isFinite(bytes)||bytes<1)return '0 KB';return bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.ceil(bytes/1024)+' KB';}
  function downloadRow(d){const row=document.createElement('div'),body=document.createElement('div'),title=document.createElement('strong'),status=document.createElement('span'),action=document.createElement('button');row.className='download-row';title.textContent=d.name;status.textContent=d.state==='progressing'?friendlyBytes(d.received)+(d.total?' / '+friendlyBytes(d.total):'')+' · Bezig':d.state==='completed'?friendlyBytes(d.received)+' · Gereed':d.state==='cancelled'?'Geannuleerd':'Onderbroken';body.append(title,status);action.textContent=d.state==='progressing'?'Annuleer':d.state==='completed'?'Toon map':'';action.onclick=()=>send(d.state==='progressing'?'download-cancel':'download-show',d.id);row.append(svg('download'),body,action);if(d.state==='completed')row.onclick=e=>{if(e.target!==action)send('download-open',d.id);};return row;}
  function downloadPanel(){const list=$('recent-downloads');list.replaceChildren();if(!state.downloads.length){const empty=document.createElement('p');empty.className='download-empty';empty.textContent='Nog geen downloads.';list.append(empty);}for(const d of state.downloads.slice(0,5))list.append(downloadRow(d));}
  function menuPanel(){const list=$('menu-items');list.replaceChildren();const mod=state.platform==='darwin'?'⌘':'Ctrl+';
    const add=(name,icon,cmd,shortcut='')=>list.append(line(name,icon,()=>send(cmd),shortcut));
    add('Nieuw tabblad','plus','new',mod+'T');
    add('Nieuw venster','max','new-window',mod+'N');
    add('Nieuw incognitovenster','lock','incognito-window',mod+'Shift+N');
    list.append(separator());
    add(state.privateWindow?'Incognito':'Lokaal profiel','globe','settings');
    add('Wachtwoorden van dit apparaat','lock','passwords');
    add('Geschiedenis','history','history',mod+'H');
    add('Downloads','download','downloads',mod+'J');
    add('Bladwijzers','star','bookmarks');
    add('Tabbladgroepen','folder','groups');
    add('Extensies','puzzle','extensions');
    add('Browsegegevens wissen','close','clear-browser-data');
    list.append(separator());
    const zoom=document.createElement('div');zoom.className='menu-zoom';zoom.append(svg('search'));const title=document.createElement('span');title.textContent='Zoom';zoom.append(title);for(const [label,cmd] of [['−','zoom-out'],[state.zoom+'%','zoom-reset'],['+','zoom-in'],['⛶','fullscreen']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>send(cmd);zoom.append(b);}list.append(zoom);
    list.append(separator());
    add('Afdrukken','print','print',mod+'P');add('Deze pagina doorzoeken','search','find',mod+'F');add('Vertalen naar Nederlands','globe','translate');add('Zoeken met Google Lens','search','lens');add('Opslaan als PDF','download','save-pdf');add('Link kopiëren','clipboard','share-link');
    list.append(separator());
    add('Controleer op updates','reload','update-check');add('Help','globe','help');add('Instellingen','settings','settings');
  }
  function utilityRow(title,detail,icon,actions=[]){const row=document.createElement('div'),body=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');row.className='utility-item';strong.textContent=title;small.textContent=detail;body.append(strong,small);row.append(svg(icon),body);for(const [label,fn] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=fn;row.append(b);}return row;}
  function renderUtility(s){const kind=s.kind;if(!labels[kind])return;
    $('utility-title').textContent=labels[kind][0];$('utility-description').textContent=labels[kind][1];$('utility-label').textContent=kind==='settings'?'PERSONALISEREN':'NOORDER BROWSER';const list=$('utility-list');list.replaceChildren();const action=$('utility-action');action.hidden=true;
    if(kind==='history'){action.hidden=!s.history.length;action.textContent='Geschiedenis wissen';action.onclick=()=>send('history-clear');for(const h of s.history)list.append(utilityRow(h.title,h.url+' · '+new Date(h.time).toLocaleString('nl-BE'),'history',[['Openen',()=>send('navigate',h.url)]]));}
    if(kind==='downloads'){action.hidden=!s.downloads.some(d=>d.state!=='progressing');action.textContent='Lijst wissen';action.onclick=()=>send('download-clear');for(const d of s.downloads){const actions=d.state==='completed'?[['Openen',()=>send('download-open',d.id)],['Toon map',()=>send('download-show',d.id)]]:d.state==='progressing'?[['Annuleer',()=>send('download-cancel',d.id)]]:[];list.append(utilityRow(d.name,d.state+' · '+friendlyBytes(d.received),'download',actions));}}
    if(kind==='bookmarks')for(const b of s.bookmarks)list.append(utilityRow(b.title,b.url,'star',[['Openen',()=>send('navigate',b.url)]]));
    if(kind==='settings'){
      const addSelect=(title,options,value,onchange)=>{const row=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');row.className='settings-row';label.textContent=title;for(const [v,text] of options){const option=document.createElement('option');option.value=v;option.textContent=text;select.append(option);}select.value=String(value);select.onchange=()=>onchange(select.value);row.append(label,select);list.append(row);};
      addSelect('Uiterlijk',[['system','Systeem'],['light','Licht'],['dark','Donker']],s.settings.theme,v=>send('setting',{theme:v}));
      addSelect('Geheugenbesparing',[['0','Uit'],['2','Na 2 minuten'],['5','Na 5 minuten'],['15','Na 15 minuten']],s.settings.sleepMinutes,v=>send('setting',{sleepMinutes:+v}));
      const row=document.createElement('div'),label=document.createElement('label'),box=document.createElement('input');row.className='settings-row';label.textContent='Bladwijzerbalk tonen';box.type='checkbox';box.checked=s.settings.bookmarkBar;box.onchange=()=>send('setting',{bookmarkBar:box.checked});row.append(label,box);list.append(row);
      list.append(utilityRow('Website-rechten','Klik op het icoon links in de adresbalk om microfoon, camera, downloads en klembord per website in te stellen.','lock'));
      const update=s.update||{phase:'development',message:'Updates zijn beschikbaar in geïnstalleerde builds.'};
      const updateActions=[];
      if(update.phase==='ready')updateActions.push(['Herstart en installeer',()=>send('update-install')]);
      else if(!['development','downloading','available','checking'].includes(update.phase))updateActions.push(['Controleren',()=>send('update-check')]);
      updateActions.push(['Releases openen',()=>send('update-open-release')]);
      list.append(utilityRow('Automatische updates',update.message,'reload',updateActions));
    }
    if(kind==='help'){list.append(utilityRow('Navigeren','Ctrl/⌘ + L · adresbalk, Ctrl/⌘ + T · nieuw tabblad','globe'));list.append(utilityRow('Zoeken en afdrukken','Ctrl/⌘ + F · zoeken op pagina, Ctrl/⌘ + P · afdrukken','search'));list.append(utilityRow('Tabbladen','Ctrl/⌘ + W · sluiten, Ctrl/⌘ + Shift + T · herstellen','plus'));}
    if(kind==='groups'){for(const [id,group] of Object.entries(s.groups)){const count=s.tabs.filter(t=>t.group===id).length;list.append(utilityRow(group.name,count+' tabblad'+(count===1?'':'en'),'folder',[['Openen',()=>send('group-open',id)],['Verwijderen',()=>send('group-delete',id)]]));}list.append(utilityRow('Nieuwe groep','Rechtermuisklik op een tabblad en kies Nieuwe groep met dit tabblad.','plus'));}
    if(kind==='extensions'){list.append(utilityRow('Uitgepakte extensie toevoegen','Electron ondersteunt een deel van de Chrome-extensie-API; .crx-bestanden en de Chrome Web Store worden niet ondersteund.','puzzle',[['Map kiezen',()=>send('extension-add')]]));for(const ext of s.extensions)list.append(utilityRow(ext.name,ext.path,'puzzle',[['Verwijderen',()=>send('extension-remove',ext.id)]]));}
    if(!list.children.length){const p=document.createElement('p');p.className='utility-empty';p.textContent='Hier staat nog niets.';list.append(p);}
  }
  window.noorderPanels={render(s){state=s;$('download-dot').hidden=!s.downloads.some(d=>d.state==='progressing');renderPanel();renderUtility(s);if(panel && !['site','downloads','menu'].includes(panel))closePanel();}};
  $('site-info').onclick=()=>{if(state?.kind==='web')showPanel('site');};$('downloads-button').onclick=()=>showPanel('downloads');$('menu').onclick=()=>showPanel('menu');
  $('popover-overlay').onclick=e=>{if(e.target===$('popover-overlay'))closePanel();};for(const close of document.querySelectorAll('.popover-close'))close.onclick=closePanel;
  for(const b of document.querySelectorAll('[data-panel-command]'))b.onclick=()=>{const cmd=b.dataset.panelCommand;closePanel();send(cmd);};
  $('reset-permissions').onclick=()=>send('site-reset');$('clear-site-data').onclick=()=>send('site-clear-data');
  function closeFind(){findOpen=false;$('find-bar').hidden=true;send('find-text','');send('ui-overlay',false);}
  window.browser.onFind(()=>{findOpen=true;$('find-bar').hidden=false;send('ui-overlay',true);$('find-input').focus();$('find-input').select();});
  $('find-input').oninput=()=>send('find-text',$('find-input').value);$('find-input').onkeydown=e=>{if(e.key==='Enter')send('find-next',$('find-input').value);if(e.key==='Escape')closeFind();};$('find-prev').onclick=()=>send('find-previous',$('find-input').value);$('find-next').onclick=()=>send('find-next',$('find-input').value);$('find-close').onclick=closeFind;
  window.browser.onFindResult(result=>{$('find-count').textContent=result.matches?(result.active||1)+' / '+result.matches:'0 resultaten';});
  window.browser.onOverlayImage(data=>{$('web-placeholder').style.backgroundImage=data?'url('+data+')':'';$('web-placeholder').classList.toggle('site-preview',!!data);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePanel();if(findOpen)closeFind();}});
})();
