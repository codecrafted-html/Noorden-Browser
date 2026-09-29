const { ipcRenderer } = require('electron');
let dirty = false;
function edited(event) { if (event.isTrusted && !dirty) { dirty = true; ipcRenderer.send('page:status', 'dirty', true); } }
addEventListener('input', edited, true);
addEventListener('change', edited, true);
function media() { ipcRenderer.send('page:status', 'media', [...document.querySelectorAll('audio,video')].some(el => !el.paused && !el.ended)); }
for (const event of ['play','pause','ended','emptied']) addEventListener(event, media, true);
