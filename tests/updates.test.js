'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createUpdateManager,RELEASES}=require('../src/updates');

test('downloads an available update and installs only after user action',async()=>{
  const updater=new EventEmitter();let checks=0,installs=0,notifications=0;
  updater.checkForUpdates=async()=>{checks++;updater.emit('checking-for-update');updater.emit('update-available',{version:'9.0.0'});updater.emit('download-progress',{percent:45.8});updater.emit('update-downloaded',{version:'9.0.0'});};
  updater.quitAndInstall=()=>{installs++;};
  let opened='';const manager=createUpdateManager({app:{isPackaged:true,getVersion:()=> '2.3.0'},platform:'win32',notify:()=>notifications++,openRelease:url=>{opened=url;},updaterFactory:()=>updater});
  await manager.check();
  assert.equal(checks,1);assert.equal(manager.state.phase,'ready');assert.equal(manager.state.version,'9.0.0');assert.equal(manager.state.percent,100);assert.equal(installs,0);assert.ok(notifications>=4);
  manager.install();assert.equal(installs,1);
  manager.openRelease();assert.equal(opened,RELEASES);
  manager.dispose();
});

test('handles update errors and avoids checks in development and private windows',async()=>{
  const updater=new EventEmitter();updater.checkForUpdates=async()=>{throw new Error('network');};updater.quitAndInstall=()=>{throw new Error('should not install');};
  const args={app:{isPackaged:true,getVersion:()=> '2.3.0'},platform:'darwin',notify:()=>{},openRelease:()=>{},updaterFactory:()=>updater};
  const manager=createUpdateManager(args);await manager.check();assert.equal(manager.state.phase,'error');manager.install();manager.dispose();
  for(const options of [{...args,app:{isPackaged:false}}, {...args,privateWindow:true}]){
    const inactive=createUpdateManager({...options,updaterFactory:()=>{throw new Error('should not load updater');}});
    await inactive.check();assert.equal(inactive.state.phase,'development');inactive.dispose();
  }
});
