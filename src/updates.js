'use strict';
const RELEASES = 'https://github.com/codecrafted-html/Noorden-Browser/releases/latest';
const DIRECT_FEED = `${RELEASES}/download/`;
function reason(error){
  if(Number.isInteger(error?.statusCode))return `HTTP ${error.statusCode}`;
  if(typeof error?.code==='string' && /^[A-Z][A-Z0-9_]{2,60}$/.test(error.code))return error.code;
  return 'onbekende fout';
}
function createUpdateManager({app,platform,notify,openRelease,privateWindow=false,updaterFactory=()=>require('electron-updater').autoUpdater}) {
  const supported=app.isPackaged && !privateWindow && ['darwin','win32'].includes(platform);
  let state={phase:supported?'idle':'development',version:'',percent:0,message:supported?'Updates worden automatisch gecontroleerd.':'Updates zijn beschikbaar in geïnstalleerde builds.'};
  const publish=next=>{state={...state,...next};notify();};
  let updater,checking=false,timer,usingDirectFeed=false;
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
      updater.on('error',error=>{console.error('Update mislukt:',error);if(!checking)publish({phase:'error',message:`Update mislukt (${reason(error)}). Open de releasepagina of probeer opnieuw.`});});
    } catch(error){console.error('Updater starten mislukt:',error);publish({phase:'error',message:'Automatisch bijwerken is niet beschikbaar. Open de releasepagina.'});}
  }
  async function check(){
    if(!updater || checking || state.phase==='ready')return;
    checking=true;
    try{await updater.checkForUpdates();}
    catch(error){
      console.error('GitHub-updatecontrole mislukt:',error);
      if(!usingDirectFeed){
        try{
          updater.setFeedURL({provider:'generic',url:DIRECT_FEED});usingDirectFeed=true;
          await updater.checkForUpdates();return;
        }catch(directError){error=directError;console.error('Directe updatecontrole mislukt:',directError);}
      }
      publish({phase:'error',message:`Updatecontrole mislukt (${reason(error)}). Open de releasepagina of probeer opnieuw.`});
    }
    finally{checking=false;}
  }
  let initial;
  function start(){if(!updater)return;initial=setTimeout(()=>void check(),12000);initial.unref?.();timer=setInterval(()=>void check(),6*60*60*1000);timer.unref?.();}
  function install(){if(updater && state.phase==='ready')updater.quitAndInstall(false,true);}
  function dispose(){if(initial)clearTimeout(initial);if(timer)clearInterval(timer);updater?.removeAllListeners();}
  return {get state(){return state;},check,start,install,dispose,openRelease:()=>openRelease(RELEASES)};
}
module.exports={createUpdateManager,RELEASES};
