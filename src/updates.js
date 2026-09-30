'use strict';
const RELEASES = 'https://github.com/codecrafted-html/Noorden-Browser/releases/latest';
function createUpdateManager({app,platform,notify,openRelease,privateWindow=false,updaterFactory=()=>require('electron-updater').autoUpdater}) {
  const supported=app.isPackaged && !privateWindow && ['darwin','win32'].includes(platform);
  let state={phase:supported?'idle':'development',version:'',percent:0,message:supported?'Updates worden automatisch gecontroleerd.':'Updates zijn beschikbaar in geïnstalleerde builds.'};
  const publish=next=>{state={...state,...next};notify();};
  let updater,checking=false,timer;
  if(supported){
    try {
      updater=updaterFactory();
      updater.autoDownload=true;
      updater.autoInstallOnAppQuit=false;
      updater.on('checking-for-update',()=>publish({phase:'checking',message:'Zoeken naar updates…'}));
      updater.on('update-available',info=>publish({phase:'available',version:info.version,message:`Versie ${info.version} wordt gedownload…`}));
      updater.on('download-progress',progress=>publish({phase:'downloading',percent:Math.min(100,Math.round(progress.percent)),message:`Update downloaden: ${Math.round(progress.percent)}%`}));
      updater.on('update-downloaded',info=>publish({phase:'ready',version:info.version,percent:100,message:`Versie ${info.version} is klaar. Herstart om te installeren.`}));
      updater.on('update-not-available',()=>publish({phase:'current',version:app.getVersion(),percent:0,message:'Je hebt de nieuwste versie.'}));
      updater.on('error',error=>{console.error('Update mislukt:',error);publish({phase:'error',message:'Automatisch bijwerken is mislukt. Open de releasepagina voor de nieuwste versie.'});});
    } catch(error){console.error('Updater starten mislukt:',error);publish({phase:'error',message:'Automatisch bijwerken is niet beschikbaar. Open de releasepagina.'});}
  }
  async function check(){
    if(!updater || checking || state.phase==='ready')return;
    checking=true;
    try{await updater.checkForUpdates();}catch(error){console.error('Updatecontrole mislukt:',error);publish({phase:'error',message:'Updatecontrole mislukt. Open de releasepagina voor de nieuwste versie.'});}
    finally{checking=false;}
  }
  let initial;
  function start(){if(!updater)return;initial=setTimeout(()=>void check(),12000);initial.unref?.();timer=setInterval(()=>void check(),6*60*60*1000);timer.unref?.();}
  function install(){if(updater && state.phase==='ready')updater.quitAndInstall(false,true);}
  function dispose(){if(initial)clearTimeout(initial);if(timer)clearInterval(timer);updater?.removeAllListeners();}
  return {get state(){return state;},check,start,install,dispose,openRelease:()=>openRelease(RELEASES)};
}
module.exports={createUpdateManager,RELEASES};
