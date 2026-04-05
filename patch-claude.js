const fs = require('fs');
const os = require('os');
const path = require('path');

const PALETTE = [
  '#4a9eff', '#a78bfa', '#f472b6', '#fb923c',
  '#facc15', '#4ade80', '#2dd4bf', '#64748b',
  '#ef4444', '#22d3ee', '#818cf8', '#e879f9',
  '#f97316', '#06b6d4', '#8b5cf6', '#ec4899',
  '#84cc16', '#14b8a6', '#f59e0b', '#6366f1',
  '#10b981', '#e11d48', '#0ea5e9', '#d946ef',
];

const extBase = path.join(os.homedir(), '.vscode', 'extensions');
const dirs = fs.readdirSync(extBase).filter(d => d.startsWith('anthropic.claude-code-'));
if (dirs.length === 0) {
  console.error('Claude Code extension not found');
  process.exit(1);
}

const extDir = path.join(extBase, dirs[dirs.length - 1]);
const paletteStr = JSON.stringify(PALETTE);

// SAFE: only append to webview/index.js
const colorScript = `
;/* __SESSION_COLOR_PATCH__ */
(function(){
  if(window.__SCP_LOADED)return;window.__SCP_LOADED=true;
  var P=${paletteStr};
  function hash(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h);}
  var _sid=null;

  function applyColor(sid){
    if(!sid||_sid===sid)return;_sid=sid;
    var existing=document.getElementById('__scp');if(existing)existing.remove();
    var c=P[hash(sid)%P.length];
    var s=document.createElement('style');s.id='__scp';
    s.textContent='body{border:3px solid '+c+' !important;border-radius:4px;box-sizing:border-box;}';
    document.head.appendChild(s);
  }

  // Method 1: data-initial-session (set when opened from session manager)
  function checkAttr(){
    var r=document.getElementById('root');if(!r)return false;
    var sid=r.getAttribute('data-initial-session');
    if(sid){applyColor(sid);return true;}
    return false;
  }

  // Method 2: intercept messages, skip the global broadcast, pick up panel-specific sessionId
  window.addEventListener('message',function(e){
    if(!e.data||_sid)return;
    try{
      var str=JSON.stringify(e.data);
      // Skip session_states_update (broadcast to ALL panels, contains wrong global activeSessionId)
      if(str.indexOf('session_states_update')!==-1)return;
      // Also skip very short messages (no useful data)
      if(str.length<50)return;
      // Strip activeSessionId just in case
      str=str.replace(/"activeSessionId":"[^"]*"/g,'""');
      // Find sessionId in panel-specific messages
      var m=str.match(/"sessionId":"([a-f0-9-]{36})"/);
      if(m)applyColor(m[1]);
    }catch(ex){}
  });

  // Poll for data-initial-session attribute
  checkAttr();
  var obs=new MutationObserver(function(){if(!_sid)checkAttr();});
  obs.observe(document.getElementById('root')||document.body,{attributes:true,childList:true,subtree:true});
  // Keep retrying for 60 seconds
  var count=0;
  var iv=setInterval(function(){
    count++;
    if(_sid||count>120){clearInterval(iv);return;}
    checkAttr();
  },500);
})();
`;

const webviewJs = path.join(extDir, 'webview', 'index.js');
let content = fs.readFileSync(webviewJs, 'utf-8');

if (content.includes('__SESSION_COLOR_PATCH__')) {
  console.log('Already patched, skipping.');
  process.exit(0);
}

fs.writeFileSync(webviewJs + '.bak', content);
content += colorScript;
fs.writeFileSync(webviewJs, content);
console.log('Patched webview/index.js (append only, safe)');
