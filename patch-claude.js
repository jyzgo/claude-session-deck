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
const extFile = path.join(extDir, 'extension.js');

let content = fs.readFileSync(extFile, 'utf-8');

if (content.includes('__SESSION_COLOR_PATCH__')) {
  console.log('Already patched, skipping.');
  process.exit(0);
}

fs.writeFileSync(extFile + '.bak', content);

const templateStart = content.indexOf('return`<!DOCTYPE html');
if (templateStart === -1) {
  console.error('Could not find HTML template');
  process.exit(1);
}

const bodyEnd = content.indexOf('</body>', templateStart);
if (bodyEnd === -1) {
  console.error('Could not find </body>');
  process.exit(1);
}

// Strategy:
// 1. Try data-initial-session first (works for sessions opened from our manager)
// 2. Intercept postMessage from extension: messages contain session_states_update
//    with activeSessionId — this tells us which session THIS panel is showing
// 3. Also intercept the initial "connected" type messages that carry sessionId
// The nonce variable is `q` in the minified code.
const paletteStr = JSON.stringify(PALETTE);

const script = `<script nonce="\${q}">
/* __SESSION_COLOR_PATCH__ */
(function(){
  var P=${paletteStr};
  function hash(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h);}
  var _sid=null;

  function applyColor(sid){
    if(!sid)return;
    _sid=sid;
    var existing=document.getElementById('__scp');
    if(existing)existing.remove();
    var c=P[hash(sid)%P.length];
    var s=document.createElement('style');s.id='__scp';
    s.textContent='body::before,body::after{content:"";position:fixed;left:0;right:0;height:3px;background:'+c+';z-index:99999;pointer-events:none;}body::before{top:0;}body::after{bottom:0;}';
    document.head.appendChild(s);
  }

  // Method 1: data-initial-session (set at creation for sessions opened with explicit ID)
  function checkAttr(){
    var r=document.getElementById('root');
    if(!r)return;
    var sid=r.getAttribute('data-initial-session');
    if(sid)applyColor(sid);
  }
  checkAttr();

  // Method 2: Intercept messages from extension to find sessionId
  window.addEventListener('message',function(e){
    if(!e.data||_sid)return;
    try{
      var d=e.data;
      // from-extension wrapper
      var msg=d.message||d;
      var req=msg.request||msg;
      // session_states_update has activeSessionId
      if(req.type==='session_states_update'&&req.activeSessionId){
        applyColor(req.activeSessionId);return;
      }
      // Any message with sessionId field
      if(req.sessionId&&typeof req.sessionId==='string'&&req.sessionId.includes('-')){
        applyColor(req.sessionId);return;
      }
      // Deep scan for sessionId in message
      var str=JSON.stringify(d);
      var m=str.match(/"sessionId":"([a-f0-9-]{36})"/);
      if(m)applyColor(m[1]);
    }catch(ex){}
  });

  // Method 3: MutationObserver for late attribute setting
  var obs=new MutationObserver(function(){if(!_sid)checkAttr();});
  obs.observe(document.getElementById('root')||document.body,{attributes:true,childList:true,subtree:true});
  setTimeout(checkAttr,300);setTimeout(checkAttr,1000);setTimeout(checkAttr,3000);
})();
</script>
      `;

content = content.substring(0, bodyEnd) + script + content.substring(bodyEnd);
fs.writeFileSync(extFile, content);
console.log('Patched', path.basename(extDir), 'successfully!');
