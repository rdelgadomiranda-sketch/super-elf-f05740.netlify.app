/* ═══════════════════════════════════════════════════════════
   STATE & STORAGE
═══════════════════════════════════════════════════════════ */
// ===== lz-string 1.5.0 (MIT) — inlined for transparent localStorage compression =====
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();

// Categories whose values are large clinical text — compressed transparently.
const _LZ_PREFIXES = ['aba5_notes_', 'aba5_sum_', 'aba5_hist_'];
const _LZ_MARK = '\u0001LZ';
function _lzShouldCompress(k){ return _LZ_PREFIXES.some(p => k.indexOf(p) === 0); }   // CURRENT_USER.id

// ---- in-memory cache + provenance maps ---------------------
const MEM = Object.create(null);

// ---- key classification ------------------------------------
function _clientSub(k){
  let m;
  if((m = k.match(/^aba5_sum_(.+)$/)))   return { col: 'summary', id: m[1] };
  if((m = k.match(/^aba5_pools_(.+)$/)))  return { col: 'pools',   id: m[1] };
  if((m = k.match(/^aba5_hist_(.+)$/)))   return { col: 'history', id: m[1] };
  if((m = k.match(/^aba5_notes_(.+)$/)))  return { col: 'notes',   id: m[1] };
  if((m = k.match(/^aba5_assess_(.+)$/)))  return { col: 'assessment_core',     id: m[1] };
  if((m = k.match(/^aba5_assessx_(.+)$/))) return { col: 'assessment_excludes', id: m[1] };
  if((m = k.match(/^aba5_abaevid_(.+)$/)))  return { col: 'aba_evidenced_by', id: m[1] };
  if((m = k.match(/^aba5_abaroster_(.+)$/))) return { col: 'aba_roster',      id: m[1] };
  if((m = k.match(/^aba5_abalocs_(.+)$/)))   return { col: 'aba_locations',   id: m[1] };
  if((m = k.match(/^aba5_assessdate_(.+)$/))) return { col: 'assessment_date', id: m[1] };
  return null;
}
const _isCore = k => k === 'aba5_therapists' || k === 'aba5_clients' || !!_clientSub(k);

// ---- localStorage fallback (old behavior, for non-core keys) ----
const _LZ_LOCAL_PREFIXES = ['aba5_notes_', 'aba5_sum_', 'aba5_hist_'];
const _LZM = '\u0001LZ';
const _lzLocal = k => _LZ_LOCAL_PREFIXES.some(p => k.indexOf(p) === 0);
const _localGet = k => {
  try {
    let v = localStorage.getItem(k);
    if (v == null) return null;
    if (v.indexOf(_LZM) === 0) v = LZString.decompressFromUTF16(v.slice(_LZM.length));
    return v ? JSON.parse(v) : null;
  } catch { return null; }
};
const _localSet = (k, v) => {
  try {
    const json = JSON.stringify(v);
    if (_lzLocal(k)) localStorage.setItem(k, _LZM + LZString.compressToUTF16(json));
    else localStorage.setItem(k, json);
    return true;
  } catch { return false; }
};
const _localDel = k => { try { localStorage.removeItem(k); } catch {} };

// ---- the new LS (cache read + write-through) ----------------
const LS = {
  get: k => {
    if (_isCore(k)) return (k in MEM) ? _clone(MEM[k]) : null;
    return _localGet(k);
  },
  set: (k, v) => {
    if (_isCore(k)) {
      MEM[k] = _clone(v);
      _mirrorSave();
      if (_MIRROR_MODE) { _PENDING.push({ type:'set', key:k, val:_clone(v) }); _pendingSave(); return true; }
      _enqueue(() => _pushWrite(k, v));
      return true;
    }
    return _localSet(k, v);
  },
  del: k => {
    if (_isCore(k)) {
      delete MEM[k];
      _mirrorSave();
      if (_MIRROR_MODE) { _PENDING.push({ type:'del', key:k }); _pendingSave(); return; }
      _enqueue(() => _pushDelete(k));
      return;
    }
    _localDel(k);
  }
};

// ---- serialized background write queue ---------------------
let _chain = Promise.resolve();
function _enqueue(fn){ _chain = _chain.then(fn).catch(e => _syncError(e?.message || String(e))); }

async function _pushWrite(k, v){
  if (!CURRENT_OWNER) return; // not logged in yet
  if (k === 'aba5_therapists') return _writeTherapists(v);
  if (k === 'aba5_clients')    return _writeClients(v);
  const sub = _clientSub(k);
  if (sub){
    const patch = {}; patch[sub.col] = v;
    const { error } = await _sb().from('clients').update(patch).eq('id', sub.id);
    if (error) _syncError(`update ${sub.col} (${sub.id}): ` + error.message);
  }
}

async function _pushDelete(k){
  if (!CURRENT_OWNER) return;
  const sub = _clientSub(k);
  if (sub){
    const empty = sub.col === 'notes' ? [] : (sub.col === 'summary' ? '' : {});
    const patch = {}; patch[sub.col] = empty;
    await _sb().from('clients').update(patch).eq('id', sub.id);
  }
}

// ---- hydrate cache from Supabase ---------------------------
/* ═══════════════════════════════════════════════════════════════════════════
   FASE 2 — ESPEJO DE DATOS EN INDEXEDDB
   Si Supabase no responde, la app sigue funcionando: lee del espejo local y
   deja generar notas sin interrupción. Las escrituras se encolan y se
   sincronizan solas cuando la nube vuelve. Nunca se pierde trabajo.
   ═══════════════════════════════════════════════════════════════════════════ */
const _IDB_NAME = 'aba5_mirror';
const _IDB_STORE = 'kv';
let _idb = null;
let _MIRROR_MODE = false;   // true = Supabase caído, trabajando contra el espejo
let _PENDING = [];          // escrituras en espera de sincronizar

function _idbOpen(){
  return new Promise((res, rej) => {
    try{
      const rq = indexedDB.open(_IDB_NAME, 1);
      rq.onupgradeneeded = () => { const db = rq.result; if(!db.objectStoreNames.contains(_IDB_STORE)) db.createObjectStore(_IDB_STORE); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    }catch(e){ rej(e); }
  });
}
async function _idbGet(key){
  if(!_idb) return null;
  return new Promise((res) => {
    try{
      const tx = _idb.transaction(_IDB_STORE, 'readonly');
      const rq = tx.objectStore(_IDB_STORE).get(key);
      rq.onsuccess = () => res(rq.result === undefined ? null : rq.result);
      rq.onerror = () => res(null);
    }catch(e){ res(null); }
  });
}
async function _idbPut(key, val){
  if(!_idb) return false;
  return new Promise((res) => {
    try{
      const tx = _idb.transaction(_IDB_STORE, 'readwrite');
      tx.objectStore(_IDB_STORE).put(val, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    }catch(e){ res(false); }
  });
}

// Snapshot the whole in-memory state to the mirror (after a successful hydrate
// and after every write, so the mirror is never stale).
let _mirrorTimer = null;
function _mirrorSave(){
  if(!_idb) return;
  clearTimeout(_mirrorTimer);
  _mirrorTimer = setTimeout(async () => {
    try{
      await _idbPut('snapshot', {
        at: Date.now(),
        owner: CURRENT_OWNER,
        mem: JSON.parse(JSON.stringify(MEM)),
        therapistOwner: Object.assign({}, _therapistOwner),
        clientOwner: Object.assign({}, _clientOwner),
        clientShared: Object.assign({}, _clientShared),
      });
    }catch(e){ console.warn('[mirror] snapshot failed', e); }
  }, 800);
}

async function _mirrorLoad(){
  const snap = await _idbGet('snapshot');
  if(!snap || !snap.mem) return false;
  Object.keys(snap.mem).forEach(k => { MEM[k] = snap.mem[k]; });
  Object.assign(_therapistOwner, snap.therapistOwner || {});
  Object.assign(_clientOwner, snap.clientOwner || {});
  Object.assign(_clientShared, snap.clientShared || {});
  _knownTherapistIds = new Set((MEM['aba5_therapists'] || []).map(t => t.id));
  _knownClientIds    = new Set((MEM['aba5_clients']    || []).map(c => c.id));
  return true;
}

async function _pendingLoad(){ _PENDING = (await _idbGet('pending')) || []; }
async function _pendingSave(){ await _idbPut('pending', _PENDING); }

// Banner: always tell the user which mode they are in — silence risks data loss.
function _mirrorBanner(show, extra){
  let b = document.getElementById('abaMirrorBanner');
  if(!show){ if(b) b.remove(); return; }
  if(!b){
    b = document.createElement('div');
    b.id = 'abaMirrorBanner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100002;background:#8a6d1f;color:#fff;padding:8px 14px;font-family:system-ui,sans-serif;font-size:12px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.25)';
    document.body.appendChild(b);
  }
  b.textContent = '⚠ Modo espejo local: la nube no responde. Puedes seguir trabajando y generando notas; los cambios se guardan aquí y se sincronizarán solos cuando vuelva.' + (extra || '');
}

// Try to reconnect and flush everything queued while offline.
async function _mirrorTryReconnect(){
  if(!_MIRROR_MODE) return;
  try{
    const { error } = await _sb().from('clients').select('id').limit(1);
    if(error) throw error;
  }catch(e){ return; }  // still down
  // Cloud is back: replay the queue in order.
  let ok = 0, failed = 0;
  for(const w of _PENDING.slice()){
    try{
      if(w.type === 'set') await _pushWrite(w.key, w.val);
      else if(w.type === 'del') await _pushDelete(w.key);
      ok++;
      _PENDING.shift();
      await _pendingSave();
    }catch(e){ failed++; break; }
  }
  if(!_PENDING.length){
    _MIRROR_MODE = false;
    _mirrorBanner(false);
    try{ await hydrate(); _mirrorSave(); }catch(e){}
    if(ok) _syncErrorClear && _syncErrorClear();
    console.info('[mirror] reconectado; ' + ok + ' cambio(s) sincronizado(s)');
  }
}

// ── SESSION REVIEW MODAL ────────────────────────────────────────
let _pendingGenerate = false;

let _pendingImport = null;
