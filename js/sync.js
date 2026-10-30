// ═══════════════════════════════════════════════════════════════════
// FIREBASE: environments, per-record sync, sign-in
//
// The app keeps its in-memory shapes (ROSTER, raidSchedule, quests, …) and its
// save*() functions. This layer maps each collection to one database path per
// record (members/{char}, signups/{raid}/{char}, …) and only writes records that
// changed, so two people saving at once no longer overwrite each other, and the
// database rules (database.rules.json) can say who may change which record.
// ═══════════════════════════════════════════════════════════════════

// Web configs. The apiKey of a Firebase web app is meant to be public; the
// database rules are what protect the data.
// prod: Firebase console → Project settings → Your apps → Web app → config.
const FB_ENVS={
  prod:{ apiKey:'', authDomain:'boogalo-app.firebaseapp.com', projectId:'boogalo-app',
         databaseURL:'https://boogalo-app-default-rtdb.europe-west1.firebasedatabase.app' },
  staging:{ apiKey:'', authDomain:'', projectId:'', databaseURL:'' },
  // Local Firebase emulators (cd dev && npm run dev)
  emulator:{ apiKey:'demo-key', authDomain:'demo-whaapp.firebaseapp.com', projectId:'demo-whaapp',
             databaseURL:'https://demo-whaapp-default-rtdb.firebaseio.com' },
};
// Local files and localhost use the emulators; Netlify branch deploys / deploy
// previews ("branch--site.netlify.app") use staging once it is configured;
// anything else - the live site, whatever its name - uses production.
function pickFbEnv(){
  const h=location.hostname;
  if(h===''||h==='localhost'||h==='127.0.0.1') return 'emulator';
  if(/--.+\.netlify\.app$/.test(h) && FB_ENVS.staging.databaseURL) return 'staging';
  return 'prod';
}
const FB_ENV=pickFbEnv();
const FB_NS='whaapp-v2/';     // all app data
const FB_OLD_NS='whaapp/';    // pre-accounts data (read-only, imported once by the RL)

let _fbDB=null, _fbAuth=null;
try{
  const cfg=FB_ENVS[FB_ENV];
  firebase.initializeApp(cfg);
  _fbDB=firebase.database();
  if(FB_ENV==='emulator') _fbDB.useEmulator('127.0.0.1',9000);
  if(cfg.apiKey){
    _fbAuth=firebase.auth();
    if(FB_ENV==='emulator') _fbAuth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});
  } else console.warn('[FB] no apiKey for "'+FB_ENV+'" - sign-in is off until FB_ENVS.'+FB_ENV+'.apiKey is filled in (js/sync.js)');
  if(FB_ENV!=='prod') document.title='['+FB_ENV.toUpperCase()+'] '+document.title;
  console.log('[FB] SDK ready ('+FB_ENV+')');
}catch(e){ console.warn('[FB] SDK init failed:',e.message); }

// ── Character keys ────────────────────────────────────────────────
// Database keys can't contain . # $ [ ] / - percent-encode those (and %).
function charKey(name){ return String(name==null?'':name).trim().replace(/[.#$\[\]\/%]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')); }
function charFromKey(k){ return String(k).replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16))); }

// ── Collections ───────────────────────────────────────────────────
// key       = the name save*() passes to fbSet() and applyFirebaseKey() understands
// nodes     = database nodes (under FB_NS) the collection is stored in
// read      = who may read it: 'public' | 'member' | 'staff'
// get       = current in-memory value (same shape save*() passes to fbSet)
// toRecords = in-memory value → { 'node/…/recordKey': record }
// fromNodes = { node: value } → in-memory shape applyFirebaseKey() expects
const _vals=v=>v&&typeof v==='object'?Object.values(v).filter(Boolean):[];
const _single=node=>({ nodes:[node], toRecords:v=>({[node]:v}), fromNodes:n=>n[node]||{} });
const SYNC={
  roster:{ nodes:['members'], read:'public', get:()=>ROSTER,
    toRecords:arr=>{ const o={}; (arr||[]).forEach(p=>{ if(p&&p.name) o['members/'+charKey(p.name)]=p; }); return o; },
    fromNodes:n=>_vals(n.members).sort((a,b)=>String(a.name).localeCompare(String(b.name))) },
  raids:{ nodes:['raids','signups','operaVotes'], read:'public', get:()=>raidSchedule,
    toRecords:arr=>{
      const o={};
      (arr||[]).forEach(r=>{
        if(!r||!r.id) return;
        const {signedUp,signupStatus,_signupAt,...rest}=r;
        if(rest.operaGamble&&rest.operaGamble.votes){
          const {votes,...og}=rest.operaGamble; rest.operaGamble=og;
          Object.entries(votes).forEach(([n,ev])=>{ o['operaVotes/'+r.id+'/'+charKey(n)]={name:n,event:ev}; });
        }
        o['raids/'+r.id]=rest;
        const at=_signupAt||{}, now=Date.now();
        (signedUp||[]).forEach((n,i)=>{ o['signups/'+r.id+'/'+charKey(n)]={name:n,status:'ready',at:at[n]||now+i}; });
        Object.entries(signupStatus||{}).forEach(([n,st])=>{
          if(st&&!(signedUp||[]).includes(n)) o['signups/'+r.id+'/'+charKey(n)]={name:n,status:st,at:at[n]||now};
        });
      });
      return o;
    },
    fromNodes:n=>{
      const raids=_vals(n.raids).filter(r=>r.id).map(r=>({...r}));
      raids.forEach(r=>{
        const list=_vals((n.signups||{})[r.id]).sort((a,b)=>(a.at||0)-(b.at||0));
        r.signedUp=list.filter(s=>s.status==='ready').map(s=>s.name);
        r.signupStatus={}; list.filter(s=>s.status!=='ready').forEach(s=>{ r.signupStatus[s.name]=s.status; });
        r._signupAt={}; list.forEach(s=>{ r._signupAt[s.name]=s.at; });
        const votes=_vals((n.operaVotes||{})[r.id]);
        if(votes.length){ r.operaGamble={...(r.operaGamble||{}),votes:{}}; votes.forEach(v=>{ r.operaGamble.votes[v.name]=v.event; }); }
      });
      return raids.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
    } },
  alts:{ nodes:['alts'], read:'public', get:()=>playerAlts,
    toRecords:m=>{ const o={}; Object.entries(m||{}).forEach(([main,list])=>{ const rec={}; (list||[]).forEach(a=>{ if(a) rec[charKey(a)]=a; }); o['alts/'+charKey(main)]=rec; }); return o; },
    fromNodes:n=>{ const m={}; Object.entries(n.alts||{}).forEach(([k,rec])=>{ m[charFromKey(k)]=_vals(rec); }); return m; } },
  applications:{ nodes:['applications'], read:'staff', publicCreate:true, get:()=>applications,
    toRecords:arr=>{ const o={}; (arr||[]).forEach(a=>{ if(a&&a.id) o['applications/'+a.id]=a; }); return o; },
    fromNodes:n=>_vals(n.applications).sort((a,b)=>String(a.id).localeCompare(String(b.id))) },
  quests:{ nodes:['quests'], read:'public', get:()=>quests,
    toRecords:arr=>{ const o={}; (arr||[]).forEach(q=>{ if(q&&q.id) o['quests/'+q.id]={...q,uid:q.uid||_uid||''}; }); return o; },
    fromNodes:n=>_vals(n.quests).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id))) },
  leaves:{ nodes:['leaves'], read:'member', get:()=>leaves,
    toRecords:arr=>{ const o={}; (arr||[]).forEach(l=>{ if(l&&l.id) o['leaves/'+l.id]={...l,ck:charKey(l.name)}; }); return o; },
    fromNodes:n=>_vals(n.leaves).sort((a,b)=>String(a.from).localeCompare(String(b.from))) },
  guildEffort:{ nodes:['ge/players','ge/bank','ge/extra'], read:'public',
    get:()=>({data:guildEffortData,bank:guildBankStock,extra:guildExtraItems,profs:playerProfessions}),
    toRecords:g=>{
      const o={}, names=new Set([...Object.keys(g.data||{}),...Object.keys(g.profs||{})]);
      names.forEach(nm=>{ o['ge/players/'+charKey(nm)]={name:nm,data:(g.data||{})[nm]||null,profs:(g.profs||{})[nm]||null}; });
      o['ge/bank']=g.bank; o['ge/extra']=g.extra;
      return o;
    },
    fromNodes:n=>{
      const g={data:{},profs:{},bank:n['ge/bank']||{},extra:n['ge/extra']||[]};
      _vals(n['ge/players']).forEach(p=>{ if(p.data) g.data[p.name]=p.data; if(p.profs) g.profs[p.name]=p.profs; });
      return g;
    } },
  weights:        { ..._single('staff/weights'),         read:'staff',  get:()=>playerWeights },
  roleOverrides:  { ..._single('staff/roleOverrides'),   read:'public', get:()=>roleOverrides },
  buffAssign:     { ..._single('staff/buffAssign'),      read:'public', get:()=>buffAssign },
  healerTanks:    { ...{nodes:['staff/healerTanks'],toRecords:v=>({'staff/healerTanks':v}),fromNodes:n=>n['staff/healerTanks']||[]}, read:'public', get:()=>healerTanks },
  groups:         { ...{nodes:['staff/groups'],toRecords:v=>({'staff/groups':v}),fromNodes:n=>n['staff/groups']||[]}, read:'public', get:()=>groups },
  bossAssignments:{ ..._single('staff/bossAssignments'), read:'public', get:()=>bossAssignments },
  killLog:        { ..._single('staff/killLog'),         read:'public', get:()=>killLog },
  diagramPositions:{..._single('staff/diagramPositions'),read:'public', get:()=>diagramPositions },
};
// Account nodes, read directly by the sign-in and Accounts code
const ACCOUNT_NODES={ owners:'public', loginIndex:'public', meta:'public', users:'staff', requests:'staff' };

// ── State ─────────────────────────────────────────────────────────
let _uid=null, _role=null, _userRec=null;
const _nodeData={};   // node → latest value from the database
const _loaded={};     // node → true once its first value arrived
const _listening={};  // node → true while a listener is attached
const _last={};       // collection → { path: JSON } as last applied from the database
const _waiters=[];
function isStaffRole(){ return _role==='gl'||_role==='rl'||_role==='officer'; }
function _canRead(level){ return level==='public'||(level==='member'&&!!_role)||(level==='staff'&&isStaffRole()); }

// Drop null/undefined/empty containers the way the database does, and serialise
// with sorted keys so equal records compare equal.
function _clean(v){
  if(v===null||v===undefined||typeof v==='function') return undefined;
  if(typeof v==='number'&&!isFinite(v)) return undefined;
  if(Array.isArray(v)){ const a=v.map(_clean); return a.some(x=>x!==undefined)?a.map(x=>x===undefined?null:x):undefined; }
  if(typeof v==='object'){ const o={}; let any=false; Object.keys(v).sort().forEach(k=>{ const c=_clean(v[k]); if(c!==undefined){ o[k]=c; any=true; } }); return any?o:undefined; }
  return v;
}
function _recordsJSON(recs){ const o={}; Object.entries(recs).forEach(([p,v])=>{ const c=_clean(v); if(c!==undefined) o[p]=JSON.stringify(c); }); return o; }

// ── Reading ───────────────────────────────────────────────────────
function _collectionsOf(node){ return Object.keys(SYNC).filter(k=>SYNC[k].nodes.includes(node)); }
function _rebuild(key){
  const c=SYNC[key];
  if(!c.nodes.every(n=>_loaded[n])) return;
  const n={}; c.nodes.forEach(x=>{ n[x]=_nodeData[x]; });
  applyFirebaseKey(key,c.fromNodes(n));
  _last[key]=_recordsJSON(c.toRecords(c.get()));
  // the next-raid bar lists the player's characters, which come from the roster and alts
  if(key==='alts'||key==='roster') try{ renderNextRaidBar?.(); }catch(e){}
}
function _listen(node){
  if(_listening[node]||!_fbDB) return;
  _listening[node]=true;
  _fbDB.ref(FB_NS+node).on('value',snap=>{
    _nodeData[node]=snap.val();
    _loaded[node]=true;
    _collectionsOf(node).forEach(_rebuild);
    if(node in ACCOUNT_NODES) try{ renderAccounts?.(true); updateAccountsBadge?.(); }catch(e){}
    setSyncDot('synced');
    for(let i=_waiters.length-1;i>=0;i--) if(_waiters[i].nodes.every(x=>_loaded[x])){ _waiters[i].resolve(); _waiters.splice(i,1); }
  },e=>{
    _listening[node]=false;
    if(String(e.code||e.message).toUpperCase().includes('PERMISSION')) return; // not readable for this role
    console.warn('[FB] listen error:',node,e.code||e.message); setSyncDot('offline');
  });
}
function _whenLoaded(...nodes){ return nodes.every(n=>_loaded[n])?Promise.resolve():new Promise(r=>_waiters.push({nodes,resolve:r})); }
function _attachListeners(){
  Object.values(SYNC).forEach(c=>{ if(_canRead(c.read)) c.nodes.forEach(_listen); });
  Object.entries(ACCOUNT_NODES).forEach(([n,lvl])=>{ if(_canRead(lvl)) _listen(n); });
}
function initFirebaseSync(){
  if(!_fbDB){ setSyncDot('offline'); return; }
  setSyncDot('syncing');
  _attachListeners();
  // Collections this browser may add to but not read (applications for non-staff):
  // whatever is already in memory (e.g. from the local cache) counts as sent, so
  // only genuinely new records are written.
  Object.entries(SYNC).forEach(([k,c])=>{ if(c.publicCreate&&!_canRead(c.read)) _last[k]=_recordsJSON(c.toRecords(c.get())); });
  initAuth();
}

// ── Writing ───────────────────────────────────────────────────────
// Can the signed-in user write this path? Mirrors database.rules.json so a save
// doesn't send writes that would be refused (one refused path fails the whole
// update). The rules are what actually enforce it.
function _isMine(k){ return (typeof getMyChars==='function'?getMyChars():[]).some(n=>charKey(n)===k); }
// The raid a raids/signups/operaVotes path belongs to is led by the signed-in user
function _leadsRaid(raidId,val,prev){
  const r=raidSchedule.find(x=>x.id===raidId);
  const cur=r?r.leaderUid:undefined, before=prev?JSON.parse(prev).leaderUid:undefined;
  return (before??cur)===_uid || (!prev&&val&&val.leaderUid===_uid);
}
function _canWrite(key,path,val,prev){
  const seg=path.split('/');
  // Raid Leader rank: only the raids they lead (Guild Leader and officers: every raid)
  if(_role==='rl'&&(seg[0]==='raids'||seg[0]==='signups'||seg[0]==='operaVotes')){
    if(_leadsRaid(seg[1],seg[0]==='raids'?val:null,seg[0]==='raids'?prev:null)) return true;
    if(seg[0]==='raids') return false;
    return _isMine(seg[2]); // their own sign-up for someone else's raid
  }
  // Staff never change someone else's profile fields (the rules refuse it; skip so the rest of the save goes through)
  if(isStaffRole()&&seg[0]==='members'&&prev!==undefined&&val!==null&&!_isMine(seg[1])){
    const old=JSON.parse(prev), same=f=>JSON.stringify(_clean(old[f]))===JSON.stringify(_clean(val[f]));
    return ['spec','flexSpec','type','timezone','professions','secProfessions','resVals'].every(same);
  }
  if(isStaffRole()) return true;
  if(key==='applications') return prev===undefined&&val!==null;
  if(!_role) return false;
  switch(seg[0]){
    case 'members': return _isMine(seg[1])&&prev!==undefined&&val!==null;
    case 'alts': return (_nodeData.owners||{})[seg[1]]===_uid;
    case 'signups': case 'operaVotes': return _isMine(seg[2]);
    case 'leaves': { const ck=(val||JSON.parse(prev||'{}')).ck; return _isMine(ck); }
    case 'quests': return val!==null||JSON.parse(prev||'{}').uid===_uid;
    case 'ge':
      if(seg[1]==='players') return _isMine(seg[2]);
      if(seg[1]==='bank') return !!(guildEffortData[charFromKey(_userRec?.main||'')]?.isGEMember);
      return false;
  }
  return false;
}
function fbSet(key,data){
  if(!_fbDB||_fbIgnore) return;
  const c=SYNC[key]; if(!c) return; // reviews / specRequests are no longer synced
  const createOnly=c.publicCreate&&!isStaffRole();
  let last=_last[key];
  if(!last){
    if(createOnly) last=_last[key]={};
    else{ console.warn('[FB] not loaded yet - save skipped:',key); return; }
  }
  const next=_recordsJSON(c.toRecords(data));
  const writes={}; let skipped=0;
  const consider=(p,val)=>{ if(_canWrite(key,p,val,last[p])) writes[FB_NS+p]=val; else skipped++; };
  Object.keys(next).forEach(p=>{ if(next[p]!==last[p]) consider(p,JSON.parse(next[p])); });
  if(!createOnly) Object.keys(last).forEach(p=>{ if(!(p in next)) consider(p,null); });
  if(createOnly) Object.keys(writes).forEach(p=>{ last[p.slice(FB_NS.length)]=JSON.stringify(_clean(writes[p])); });
  if(skipped){
    console.info('[FB] '+key+': '+skipped+' change(s) not yours to save - kept as they were');
    if(!createOnly) setTimeout(()=>_rebuild(key),0); // put back what we didn't save
  }
  if(!Object.keys(writes).length) return;
  _fbDB.ref().update(writes).catch(e=>{
    console.warn('[FB] write refused:',key,e.message);
    toast('Not saved - you don\'t have permission for that change','err');
  });
}

// ── Sign-in ──────────────────────────────────────────────────────
// Login = character name + password (Firebase Auth email/password underneath,
// with a random hidden address). A new login is a request the Raid Leader
// approves; until then the account has no rights. Forgot password = request again.
const LOGIN_DOMAIN='@whaapp.invalid';
function _randomLoginAddress(){ const b=new Uint8Array(16); crypto.getRandomValues(b); return [...b].map(x=>x.toString(16).padStart(2,'0')).join('')+LOGIN_DOMAIN; }
// Character typed on the login screen → its roster spelling (case-insensitive), or as typed
function _resolveCharName(typed){
  const t=String(typed||'').trim().replace(/\s+/g,' '); if(!t) return '';
  const p=ROSTER.find(x=>x.name.toLowerCase()===t.toLowerCase());
  if(p) return p.name;
  const k=Object.keys(_nodeData.loginIndex||{}).find(x=>charFromKey(x).toLowerCase()===t.toLowerCase());
  return k?charFromKey(k):t;
}
function _authMsg(id,msg){
  const el=document.getElementById(id); if(!el) return;
  el.style.display=msg?'flex':'none';
  const sp=el.querySelector('span'); if(sp) sp.textContent=msg||''; else el.textContent=msg||'';
}

let _requesting=false;
async function _handleUser(u){
  if(!u){ _uid=null; _role=null; _userRec=null; return; }
  if(_requesting) return; // a sign-up in progress signs in for a moment; it handles itself
  _uid=u.uid;
  let rec=null;
  try{ rec=(await _fbDB.ref(FB_NS+'users/'+u.uid).once('value')).val(); }catch(e){ console.warn('[FB] could not read account:',e.message); }
  if(!rec){
    let req=null;
    try{ req=(await _fbDB.ref(FB_NS+'requests/'+u.uid).once('value')).val(); }catch(e){}
    await _fbAuth.signOut();
    _authMsg('auth-login-err', req
      ? 'Your login for '+req.name+' is waiting for the Guild Leader to accept it.'
      : 'This login is no longer linked to a character. Members: just sign in with your name. Leaders: ask the Guild Leader.');
    return;
  }
  _userRec=rec; _role=rec.role;
  _attachListeners();
  await _whenLoaded('members','alts');
  const name=charFromKey(rec.main);
  const me=gp(name)||{name};
  setView(rec.role==='gl'||rec.role==='rl'?'rl':rec.role==='officer'?'officer':'participant', me);
  // Accounts (logins and ranks) are the Guild Leader's
  document.querySelectorAll('.ni[onclick*="\'accounts\'"]').forEach(el=>{ el.style.display=rec.role==='gl'?'':'none'; });
  if(rec.role==='gl') try{ checkMigrationNeeded(); }catch(e){}
}
function initAuth(){
  if(!_fbAuth) return;
  _fbAuth.onAuthStateChanged(u=>{ _handleUser(u); });
}

// Members sign in with their name only: a "name-only" login whose address and password are derived
// from the main character (not secret, on purpose). Leaders (officer, Raid Leader, Guild Leader)
// have a password login instead, and the database never gives a name-only login a leader rank.
const NAME_ONLY_PASSWORD='whaapp-name-only-login';
async function nameOnlyEmail(k){ return 'n-'+(await _sha256Hex('whaapp:'+k)).slice(0,40)+LOGIN_DOMAIN; }
async function _sha256Hex(s){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// The login that belongs to a typed name: { name, main, k, email (existing login or null) }
function _loginFor(typed){
  const name=_resolveCharName(typed);
  const main=getMainOf(name)||name;
  const idx=_nodeData.loginIndex||{};
  const k=[main,name,...(playerAlts[main]||[])].map(charKey).find(x=>idx[x])||charKey(main);
  return {name,main,k,email:idx[k]||null};
}
// Live, while typing the name: show the password field only for leaders' logins
async function authNameChanged(){
  const typed=document.getElementById('auth-name')?.value||'';
  const row=document.getElementById('auth-pass-row'); if(!row) return;
  let needs=false;
  if(typed.trim()&&_loaded.loginIndex){ const l=_loginFor(typed); needs=!!l.email&&l.email!==await nameOnlyEmail(l.k); }
  row.style.display=needs?'':'none';
}

async function loginWithPassword(){
  _authMsg('auth-login-err','');
  if(!_fbAuth){ _authMsg('auth-login-err','Sign-in isn\'t configured on this site yet.'); return; }
  const typed=document.getElementById('auth-name')?.value||'';
  const pw=document.getElementById('auth-pass')?.value||'';
  if(!typed.trim()){ _authMsg('auth-login-err','Enter your character name (first and last).'); return; }
  await _whenLoaded('loginIndex','alts','members');
  const l=_loginFor(typed);
  const nameEmail=await nameOnlyEmail(l.k);
  try{
    if(!l.email){
      // First sign-in of a roster member: create their name-only login
      if(!gp(l.main)){ _authMsg('auth-login-err',l.name+' isn\'t on the roster. New to the guild? Use "Join the guild".'); return; }
      _requesting=true;
      let cred;
      try{ cred=await _fbAuth.createUserWithEmailAndPassword(nameEmail,NAME_ONLY_PASSWORD); }
      catch(e){ if(e.code!=='auth/email-already-in-use') throw e; cred=await _fbAuth.signInWithEmailAndPassword(nameEmail,NAME_ONLY_PASSWORD); }
      const uid=cred.user.uid;
      try{
        await _fbDB.ref(FB_NS.slice(0,-1)).update({['users/'+uid]:{main:l.k,role:'member',nameOnly:true},['owners/'+l.k]:uid,['loginIndex/'+l.k]:nameEmail});
      }catch(e){ await _fbAuth.signOut(); throw new Error('This character can\'t be signed in to. Ask the Guild Leader.'); }
      finally{ _requesting=false; }
      _handleUser(cred.user);
    } else if(l.email===nameEmail){
      await _fbAuth.signInWithEmailAndPassword(nameEmail,NAME_ONLY_PASSWORD);
    } else {
      // A leader's login: password required
      const row=document.getElementById('auth-pass-row'); if(row) row.style.display='';
      if(!pw){ _authMsg('auth-login-err','Leaders sign in with their password.'); document.getElementById('auth-pass')?.focus(); return; }
      await _fbAuth.signInWithEmailAndPassword(l.email,pw);
    }
  }catch(e){
    _requesting=false;
    _authMsg('auth-login-err', e.code==='auth/too-many-requests'?'Too many attempts. Wait a few minutes and try again.'
      :(e.code&&e.code.startsWith('auth/'))?'Wrong password.':(e.message||'Could not sign in.'));
  }
}

// Creates the account and a login request for the Raid Leader, then signs out again.
// Returns '' on success, else a message for the person.
async function createLoginRequest(name,pw,kind,appId){
  if(!_fbAuth) return 'Sign-in isn\'t configured on this site yet.';
  const email=_randomLoginAddress();
  _requesting=true;
  let cred=null;
  try{
    cred=await _fbAuth.createUserWithEmailAndPassword(email,pw);
    await _fbDB.ref(FB_NS+'requests/'+cred.user.uid).set({char:charKey(name),name,email,kind,appId:appId||null,at:firebase.database.ServerValue.TIMESTAMP});
    return '';
  }catch(e){
    if(cred) try{ await cred.user.delete(); }catch(_){}
    return 'Could not create the login: '+(e.message||e.code);
  }finally{
    try{ await _fbAuth.signOut(); }catch(_){}
    _requesting=false;
  }
}
function checkNewPassword(pw,pw2){
  if((pw||'').length<8) return 'Choose a password of at least 8 characters.';
  if(pw!==pw2) return 'The two passwords don\'t match.';
  return '';
}

// "I'm on the roster": first login, or a new password after forgetting it
async function requestLogin(){
  _authMsg('auth-claim-err',''); _authMsg('auth-claim-ok','');
  const typed=document.getElementById('claim-name')?.value||'';
  const pw=document.getElementById('claim-pass')?.value||'';
  const pw2=document.getElementById('claim-pass2')?.value||'';
  if(!typed.trim()){ _authMsg('auth-claim-err','Enter your character name (first and last).'); return; }
  await _whenLoaded('members');
  const name=_resolveCharName(typed);
  if(!gp(name)){ _authMsg('auth-claim-err',name+' isn\'t on the roster. New to the guild? Use "Join the guild".'); return; }
  const bad=checkNewPassword(pw,pw2); if(bad){ _authMsg('auth-claim-err',bad); return; }
  const err=await createLoginRequest(name,pw,'login');
  if(err){ _authMsg('auth-claim-err',err); return; }
  ['claim-pass','claim-pass2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  _authMsg('auth-claim-ok','Request sent for '+name+'. Let the Guild Leader know in-game; once they accept it, sign in with your name and this password.');
}

async function signOutUser(){
  try{ if(_fbAuth) await _fbAuth.signOut(); }catch(e){}
  location.reload(); // drop everything the previous role could read
}
