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
// Simple approach: hash document.body.innerText (every session has unique content)
const colorScript = `
;/* __SESSION_COLOR_PATCH__ */
(function(){
  if(window.__SCP_LOADED)return;window.__SCP_LOADED=true;
  var P=${paletteStr};
  function hash(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return Math.abs(h);}
  var _applied=false;

  function applyColor(text){
    var existing=document.getElementById('__scp');if(existing)existing.remove();
    var c=P[hash(text)%P.length];
    var s=document.createElement('style');s.id='__scp';
    s.textContent='body{border:3px solid '+c+';border-radius:4px;box-sizing:border-box;}';
    document.head.appendChild(s);
    _applied=true;
  }

  function tryApply(){
    // Priority 1: data-initial-session
    var r=document.getElementById('root');
    if(r){
      var sid=r.getAttribute('data-initial-session');
      if(sid){applyColor(sid);return true;}
    }
    // Priority 2: body text content (unique per session)
    var text=document.body.innerText.trim();
    if(text.length>50){
      applyColor(text.substring(0,300));
      return true;
    }
    return false;
  }

  // Poll: try immediately, then every 500ms, keep trying for 30s
  tryApply();
  var count=0;
  var iv=setInterval(function(){
    count++;
    if(tryApply()||count>60){clearInterval(iv);}
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
