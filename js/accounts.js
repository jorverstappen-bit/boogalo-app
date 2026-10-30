// ═══════════════════════════════════════════════════════════════════
// ACCOUNTS (Raid Leader): login requests, logins, roles, one-time data import
// Uses the state and helpers from js/sync.js (_nodeData, _fbDB, charKey, …).
// ═══════════════════════════════════════════════════════════════════
const ROLE_LABEL={member:'Member',officer:'Officer',rl:'Raid Leader',gl:'Guild Leader'};

function _v2(){ return _fbDB.ref(FB_NS.slice(0,-1)); }
// Name as on the roster: class-colour dot, first name, muted last name
function _acctName(name){
  const p=gp(name), s=splitName(name);
  return `<span style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap"><span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:${p?(CC[p.cls]||'var(--t3)'):'var(--t3)'}"></span><span style="font-weight:500">${esc(s.first)}</span><span style="color:var(--t3)">${esc(s.last)}</span></span>`;
}
function _requests(){ return Object.entries(_nodeData.requests||{}).map(([uid,r])=>({uid,...r})).sort((a,b)=>(a.at||0)-(b.at||0)); }
function _accountRows(){
  // One row per main character (alts sign in through their main), plus any
  // account whose character isn't on the roster.
  const names=new Set(ROSTER.map(p=>p.name).filter(n=>!getMainOf(n)));
  Object.keys(_nodeData.owners||{}).forEach(k=>names.add(charFromKey(k)));
  return [...names].sort((a,b)=>a.localeCompare(b));
}
function updateAccountsBadge(){
  const b=document.getElementById('migrate-badge'); if(!b) return;
  const n=_role==='gl'?_requests().length:0;
  const migrate=_role==='gl'&&_loaded.meta&&!(_nodeData.meta&&_nodeData.meta.migratedAt);
  b.textContent=n?String(n):'!';
  b.style.display=(n||migrate)?'':'none';
}

function renderAccounts(fromListener){
  const el=document.getElementById('accounts-content'); if(!el) return;
  if(fromListener&&!document.getElementById('page-accounts')?.classList.contains('active')) return;
  if(_role!=='gl'){ el.innerHTML='<div class="empty">Only the Guild Leader manages accounts.</div>'; return; }
  const owners=_nodeData.owners||{}, users=_nodeData.users||{};
  const migrated=!!(_nodeData.meta&&_nodeData.meta.migratedAt);
  const reqs=_requests();
  const rows=_accountRows();
  const withLogin=rows.filter(n=>owners[charKey(n)]).length;
  const pendingFor=new Set(reqs.map(r=>r.char));
  let html='';
  if(!migrated){
    html+=`<div class="card" style="margin-bottom:14px;border-color:rgba(201,164,53,.4)">
      <div style="font-weight:600;color:var(--gold);margin-bottom:4px"><i class="ti ti-database-import"></i> Import the guild's data</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:10px">The new version stores data in a new, protected place. Import the roster, raids, sign-ups, quests, Guild Effort and everything else from the current app once. The old data is left untouched (read-only).</div>
      <button class="btn btn-g" onclick="migrateFromV1()"><i class="ti ti-database-import"></i> Import data now</button>
    </div>`;
  }
  // Login requests
  html+=`<div class="card" style="margin-bottom:14px">
    <div style="font-weight:600;margin-bottom:4px">Password requests ${reqs.length?`<span style="color:var(--t3);font-weight:400">· ${reqs.length}</span>`:''}</div>
    <div style="font-size:13px;color:var(--t2);margin-bottom:${reqs.length?12:0}px">${reqs.length
      ?'Check in-game that the request is really from that player before accepting it.'
      :'No open requests. Members sign in with just their name. Officers and leaders request a password on the sign-in screen ("Leader password"); accept it here, then set their rank.'}</div>`;
  if(reqs.length){
    const perChar={}; reqs.forEach(r=>{ perChar[r.char]=(perChar[r.char]||0)+1; });
    html+=`<div style="display:flex;flex-direction:column;gap:8px">`;
    reqs.forEach(r=>{
      const name=charFromKey(r.char), p=gp(name), owned=owners[r.char];
      const notes=[];
      if(r.kind==='join'&&!p) notes.push('new player - accepting their application in RL Review accepts this too');
      else if(!p) notes.push('not on the roster');
      if(owned) notes.push('has a login already - accepting replaces its password');
      if(perChar[r.char]>1) notes.push(perChar[r.char]+' requests for this character');
      const when=r.at?new Date(r.at).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
      html+=`<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg3)">
        <div style="flex:1 1 240px;min-width:0">
          <div style="color:var(--t1)">${_acctName(name)}${p?` <span style="color:var(--t3)">· ${esc(p.cls)}</span>`:''}</div>
          <div style="font-size:12px;color:var(--t3)">${esc(when)}${notes.length?' · '+esc(notes.join(' · ')):''}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="declineRequest(${jsArg(r.uid)})">Decline</button>
          <button class="btn btn-sm btn-p" onclick="approveRequest(${jsArg(r.uid)})" ${r.kind==='join'&&!p?'disabled title="Accept the application in RL Review first"':''}>Accept</button>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }
  html+=`</div>`;
  // Logins per character
  html+=`<div class="card" style="margin-bottom:10px;font-size:13px;color:var(--t2)">
    <b style="color:var(--t1)">${withLogin} of ${rows.length}</b> characters have a login. Members sign in by name; leaders with a password - a forgotten password is a new request you accept.</div>`;
  html+=`<div class="card" style="padding:0;overflow-x:auto"><table><thead><tr><th>Character</th><th>Login</th><th>Role</th><th style="text-align:right">Actions</th></tr></thead><tbody>`;
  rows.forEach(n=>{
    const k=charKey(n), uid=owners[k], u=uid?users[uid]:null, p=gp(n);
    const me=uid&&uid===_uid;
    let status, role='', actions='';
    if(uid){
      status=`<span class="pill" style="background:var(--gred);color:var(--ok)">Active</span>`;
      const r=(u&&u.role)||'member';
      role=me?`<span style="color:var(--t2)">${esc(ROLE_LABEL[r]||r)} (you)</span>`
        :(u&&u.nameOnly)?`<span style="color:var(--t2)" title="To make them an officer or leader, they first set a password (Leader password on the sign-in screen) and you accept it">Member · signs in by name</span>`
        :`<select aria-label="Role for ${esc(n)}" onchange="setAccountRole(${jsArg(uid)},this.value,${jsArg(n)})" style="width:auto;font-size:13px">${Object.keys(ROLE_LABEL).map(x=>`<option value="${x}" ${x===r?'selected':''}>${ROLE_LABEL[x]}</option>`).join('')}</select>`;
      if(!me) actions=`<button class="btn btn-sm" onclick="removeLogin(${jsArg(n)})">Remove login</button>`;
    } else if(pendingFor.has(k)){
      status=`<span class="pill" style="background:var(--goldd);color:var(--gold)">Waiting for you</span>`;
    } else {
      status=`<span style="color:var(--t3)">No login</span>`;
    }
    html+=`<tr><td>${_acctName(n)} ${p?`<span style="color:var(--t3)">· ${esc(p.cls)}</span>`:'<span style="font-size:12px;color:var(--t3)">not on roster</span>'}</td><td>${status}</td><td>${role}</td><td style="text-align:right;white-space:nowrap">${actions}</td></tr>`;
  });
  html+=`</tbody></table></div>`;
  el.innerHTML=html;
}

async function approveRequest(uid){
  if(_role!=='gl') return;
  const r=(_nodeData.requests||{})[uid]; if(!r) return;
  const k=r.char, old=(_nodeData.owners||{})[k];
  // A new password for an existing login keeps that login's role
  const role=old?(((_nodeData.users||{})[old]||{}).role||'member'):'member';
  const upd={['users/'+uid]:{main:k,role},['owners/'+k]:uid,['loginIndex/'+k]:r.email,['requests/'+uid]:null};
  if(old&&old!==uid&&old!==_uid) upd['users/'+old]=null;
  try{ await _v2().update(upd); toast('Account accepted: '+charFromKey(k),'ok'); }
  catch(e){ toast('Could not approve: '+e.message,'err'); }
}
async function declineRequest(uid){
  if(_role!=='gl') return;
  const r=(_nodeData.requests||{})[uid]; if(!r) return;
  try{ await _fbDB.ref(FB_NS+'requests/'+uid).remove(); toast('Request declined','warn'); }
  catch(e){ toast('Could not decline: '+e.message,'err'); }
}
async function removeLogin(name){
  if(_role!=='gl') return;
  const k=charKey(name), uid=(_nodeData.owners||{})[k];
  if(!uid) return;
  if(uid===_uid){ toast('You can\'t remove your own login','warn'); return; }
  if(!confirm('Remove the login for '+name+'? Their password stops working. They can request a new one on the sign-in screen.')) return;
  try{ await _v2().update({['owners/'+k]:null,['loginIndex/'+k]:null,['users/'+uid]:null}); toast('Login removed for '+name,'ok'); }
  catch(e){ toast('Could not remove the login: '+e.message,'err'); }
}
async function setAccountRole(uid,role,name){
  if(_role!=='gl'||uid===_uid) return;
  try{ await _fbDB.ref(FB_NS+'users/'+uid+'/role').set(role); toast(name+' is now '+(ROLE_LABEL[role]||role),'ok'); }
  catch(e){ toast('Could not change the role: '+e.message,'err'); }
}

// ── Keep logins attached to characters ────────────────────────────
// Approving / declining a guild application also decides the login the applicant asked for
function accountsOnAppDecision(app,decision){
  const req=_requests().find(r=>r.appId===app.id); if(!req) return;
  if(decision==='approved'){
    if(_role==='gl') setTimeout(()=>approveRequest(req.uid),300); // after the roster entry is saved
  } else if(_role==='gl') declineRequest(req.uid);
}
function accountsOnRename(oldName,newName){
  if(_role!=='gl') return;
  const o=charKey(oldName), n=charKey(newName), upd={};
  const own=(_nodeData.owners||{})[o];
  if(own){ upd['owners/'+o]=null; upd['owners/'+n]=own; if(((_nodeData.users||{})[own]||{}).main===o) upd['users/'+own+'/main']=n; }
  const li=(_nodeData.loginIndex||{})[o]; if(li){ upd['loginIndex/'+o]=null; upd['loginIndex/'+n]=li; }
  _requests().filter(r=>r.char===o).forEach(r=>{ upd['requests/'+r.uid+'/char']=n; upd['requests/'+r.uid+'/name']=newName; });
  if(Object.keys(upd).length) _v2().update(upd).catch(e=>toast('Login not moved to the new name: '+e.message,'err'));
}
function accountsOnRemovePlayer(name){
  if(_role!=='gl') return;
  const k=charKey(name), upd={}, uid=(_nodeData.owners||{})[k];
  if(uid&&uid!==_uid){ upd['owners/'+k]=null; upd['loginIndex/'+k]=null; upd['users/'+uid]=null; }
  _requests().filter(r=>r.char===k).forEach(r=>{ upd['requests/'+r.uid]=null; });
  if(Object.keys(upd).length) _v2().update(upd).catch(e=>toast('Login not removed: '+e.message,'err'));
}
// A member makes an alt their main: the login moves with it (before the alts list is saved)
async function accountsOnSetMain(oldMain,newMain){
  if(!_uid||!_userRec) return;
  const o=charKey(oldMain), n=charKey(newMain);
  if(_userRec.main!==o) return;
  try{ await _v2().update({['owners/'+n]:_uid,['users/'+_uid+'/main']:n}); _userRec.main=n; }
  catch(e){ toast('Could not move your login to '+newMain+': '+e.message,'err'); }
}

// ── One-time import from the pre-accounts data (whaapp/) ──────────
function checkMigrationNeeded(){
  _whenLoaded('meta').then(()=>{
    updateAccountsBadge();
    if(!(_nodeData.meta&&_nodeData.meta.migratedAt)) toast('Import the guild\'s data: open Accounts','warn');
  });
}
async function migrateFromV1(){
  if(_role!=='gl') return;
  if(_nodeData.meta&&_nodeData.meta.migratedAt){ toast('Already imported','warn'); return; }
  if(!confirm('Import all guild data from the current app into the new, protected database?\n\nDo this once. The old data stays as it is (read-only).')) return;
  let old;
  try{ old=(await _fbDB.ref(FB_OLD_NS.slice(0,-1)).once('value')).val()||{}; }
  catch(e){ toast('Could not read the old data: '+e.message,'err'); return; }
  Object.keys(SYNC).forEach(k=>{ if(old[k]!=null) applyFirebaseKey(k,old[k]); _last[k]={}; });
  [saveRoster,saveRaids,saveWeights,saveAlts,saveRoleOverrides,saveApplications,saveQuests,saveBuffAssign,
   saveLeaves,saveHealerTanks,saveGroups,saveBossAssignments,saveKillLog,saveGE,saveDiagramPositions]
    .forEach(f=>{ try{ f(); }catch(e){ console.warn('[migrate]',f.name,e); } });
  try{ await _fbDB.ref(FB_NS+'meta').update({migratedAt:firebase.database.ServerValue.TIMESTAMP,migratedBy:_uid}); }
  catch(e){ toast('Import written, but not marked as done: '+e.message,'err'); return; }
  updateAccountsBadge();
  toast('Imported: '+ROSTER.length+' characters, '+raidSchedule.length+' raids, '+quests.length+' quests','ok');
  renderAccounts();
}

// ── Raid leaders (assigned by the Guild Leader) ───────────────────
// People who may lead a raid: everyone with the Raid Leader or Guild Leader rank
function raidLeaderOptions(){
  return Object.entries(_nodeData.users||{})
    .filter(([,u])=>u&&(u.role==='rl'||u.role==='gl'))
    .map(([uid,u])=>({uid,name:charFromKey(u.main)}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}
// The Raid Leader field on the create / edit raid forms (r = the raid, or null for a new one)
function raidLeaderField(id,r){
  if(isGL()){
    const cur=r?(r.leaderUid||''):_uid;
    const opts=raidLeaderOptions();
    return `<select id="${esc(id)}" style="width:100%"><option value="">No leader yet</option>${opts.map(o=>`<option value="${esc(o.uid)}" ${o.uid===cur?'selected':''}>${esc(o.name)}</option>`).join('')}</select>`;
  }
  const name=r?(r.leaderUid?(r.rl||'-'):'Not assigned yet'):(_role==='rl'?CURRENT_USER?.name:'Assigned by the Guild Leader');
  return `<div id="${esc(id)}" style="height:36px;display:flex;align-items:center;color:var(--t2)">${esc(name||'-')}</div>`;
}
// What the form decided: { leaderUid, rl (display name) }
function readRaidLeader(id,r){
  if(isGL()){
    const uid=document.getElementById(id)?.value||'';
    const o=raidLeaderOptions().find(x=>x.uid===uid);
    return { leaderUid:uid||null, rl:o?o.name:'TBD' };
  }
  if(r) return { leaderUid:r.leaderUid||null, rl:r.rl||'TBD' };  // only the Guild Leader reassigns
  if(_role==='rl') return { leaderUid:_uid, rl:CURRENT_USER?.name||'TBD' };  // a Raid Leader leads what they create
  return { leaderUid:null, rl:'TBD' };
}

// ── Alts ──────────────────────────────────────────────────────────
// Adds a new character as an alt of `mainName`: a roster entry plus the alt link, in one update.
// Members can do this for their own main without approval (the alt shares their login);
// staff can do it for anyone. c = {first,last,cls,spec,flexSpec,role,profs:[name,…]}.
// Returns '' on success, else a message for the person.
async function addAltCharacter(mainName,c){
  const first=String(c.first||'').trim(), last=String(c.last||'').trim();
  if(!first||!last) return 'Enter a first and a last name.';
  const name=(first+' '+last).replace(/\s+/g,' ');
  if(name.length>60) return 'That name is too long.';
  const taken=ROSTER.some(p=>p.name.toLowerCase()===name.toLowerCase())
    ||Object.keys(_nodeData.owners||{}).some(k=>charFromKey(k).toLowerCase()===name.toLowerCase())
    ||Object.values(playerAlts).some(list=>(list||[]).some(a=>String(a).toLowerCase()===name.toLowerCase()));
  if(taken) return name+' is already in the guild. Ask the Guild Leader if it should be linked to you.';
  const own=_userRec&&charFromKey(_userRec.main)===mainName;
  if(!own&&!isStaffRole()) return 'You can only add alts to your own main.';
  if(getMainOf(mainName)) return 'Alts are added to a main character.';
  const mk=charKey(mainName), ak=charKey(name);
  const profs=(c.profs||[]).filter(Boolean).slice(0,2);
  const rec={name,cls:c.cls,spec:c.spec,flexSpec:c.flexSpec||'',type:c.role||SPEC_ROLE[c.spec]||'Melee',
    dispel:[],interrupt:0,present:true,resFrost:false,resNature:false,resFire:false,
    professions:profs.map(p=>({name:p}))};
  try{ await _fbDB.ref(FB_NS.slice(0,-1)).update({['alts/'+mk+'/'+ak]:name,['members/'+ak]:rec}); }
  catch(e){ return 'Could not add the alt: '+e.message; }
  return '';
}
