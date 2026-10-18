/* FV360 Studio v9 — inicio de aplicación, historial y edición contextual.
   No modifica las funciones ni los formatos existentes de exportación. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),app=window.FV360Bridge;
 if(!app||!$('fvWorkspaceHome'))return;
 const mobile=!!window.FV360Mobile,home=$('fvWorkspaceHome');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmtDate=s=>{try{return new Date(s).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return 'Fecha no disponible'}};
 let ready=false,search='',provider=null,homeOpen=false,loadingList=false;
 function welcome(){const h=new Date().getHours();$('fvGreeting').textContent=h<12?'¡Hola, buenos días!':h<19?'¡Hola, buenas tardes!':'¡Hola, buenas noches!'}
 function show(){welcome();home.hidden=false;homeOpen=true;document.body.classList.add('fv-home-open');refresh();}
 function hide(){home.hidden=true;homeOpen=false;document.body.classList.remove('fv-home-open');}
 async function create(){if(window.FV360UX&&!(await window.FV360UX.confirmExit()))return;const name=await FV360Dialog.prompt('Nombre del nuevo proyecto', 'Nuevo levantamiento');if(name===null)return;const title=name.trim()||'Nuevo levantamiento';
  try{await provider.create(title);hide();app.openTab('photos');window.dispatchEvent(new Event('fv360:home-updated'))}catch(e){FV360Dialog.alert('No se pudo crear el proyecto: '+e.message)}}
 async function open(id){if(window.FV360UX&&!(await window.FV360UX.confirmExit()))return;try{await provider.open(id);hide();app.openTab('photos');}catch(e){FV360Dialog.alert('No se pudo recuperar el proyecto: '+e.message)}}
 function imported(){hide();setTimeout(refresh,350)}
 function counts(x){const p=x.countPhotos??x.meta?.photos?.length??0,v=x.countViews??x.meta?.reportViews?.length??0,r=x.countReports??x.meta?.reports?.length??1;return `${p} foto${p===1?'':'s'} · ${v} lámina${v===1?'':'s'} · ${r} reporte${r===1?'':'s'}`}
 async function refresh(){if(!homeOpen||!provider||loadingList)return;loadingList=true;
  try{const rows=await provider.list();const activeId=provider.active(),filter=search.toLocaleLowerCase('es');
   $('fvHomeActive').textContent=app.getProjectName();
   const visible=rows.filter(r=>(r.title||'').toLocaleLowerCase('es').includes(filter));
   $('fvHomeProjects').innerHTML=visible.map(r=>`<article data-fv-project="${esc(r.id)}" draggable="true" class="fv-home-card ${r.id===activeId?'fv-home-card-active':''}"><div class="fv-home-card-top"><span class="fv-home-card-icon">▧</span><span class="fv-home-card-label">${r.id===activeId?'ABIERTO':'GUARDADO'}</span></div><h3>${esc(r.title||'Levantamiento sin título')}</h3><div class="fv-home-card-stats">${esc(counts(r))}</div><div class="fv-home-card-date">${esc(fmtDate(r.updatedAt))}</div><button type="button" data-fv-home-open="${esc(r.id)}">${r.id===activeId?'Continuar proyecto':'Abrir proyecto'} ↗</button></article>`).join('')||`<div class="fv-home-empty">${search?'No se encontraron proyectos con ese nombre.':(mobile?'Aún no hay proyectos guardados en este teléfono.':'Aún no hay proyectos en la biblioteca local. Puedes crear uno nuevo o abrir JSON/ZIP.')}</div>`;
   $('fvHomeProjects').querySelectorAll('[data-fv-home-open]').forEach(b=>b.onclick=()=>open(b.dataset.fvHomeOpen));
   window.dispatchEvent(new CustomEvent('fv360:home-rendered',{detail:{rows,activeId}}));
   $('fvHomeStorage').textContent=mobile?'Guardado en este teléfono':'Guardado en este navegador';
  }catch(e){$('fvHomeProjects').innerHTML='<div class="fv-home-empty">No se pudo leer el historial local. Puedes importar un respaldo JSON/ZIP.</div>';console.warn(e)}finally{loadingList=false}}
 function desktopProvider(){
  const DB='FV360_PC_LIBRARY',STORE='projects',MEDIA='media',KEY='fv360.pc.active.v1';let db=null,activeId=null,saving=null,pending=false,timer=0,restoring=false,knownAssets=new Set();
  const newid=()=>('PC-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
  const req=q=>new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});
  const txDone=t=>new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||Error('Transacción cancelada'))});
  async function connect(){return new Promise((res,rej)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});if(!d.objectStoreNames.contains(MEDIA))d.createObjectStore(MEDIA)};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
  async function getRecord(id){return db?req(db.transaction(STORE,'readonly').objectStore(STORE).get(id)):null}
  async function list(){if(!db)return[];const rows=await req(db.transaction(STORE,'readonly').objectStore(STORE).getAll());return rows.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))}
  async function originalBlob(p){if(p.blob instanceof Blob)return p.blob;if(p.source){const r=await fetch(p.source);if(!r.ok)throw Error('No se puede recuperar la fotografía '+p.name);return r.blob()}throw Error('La fotografía no tiene respaldo: '+p.name)}
  async function store(){if(!db||!activeId||restoring)return;
   const snap=app.snapshot(),photoAssets={};for(const p of snap.photos){if(!knownAssets.has(activeId+'::'+p.id))photoAssets[p.id]=await originalBlob(p)};
   const photoMeta=snap.photos.map(({blob,source,...p})=>p);
   const meta={...snap,photos:photoMeta,reportViews:snap.reportViews.map(({thumb,...v})=>v)},now=new Date().toISOString();
   const t=db.transaction([STORE,MEDIA],'readwrite');t.objectStore(STORE).put({id:activeId,title:snap.project||'Nuevo levantamiento',updatedAt:now,countPhotos:photoMeta.length,countViews:snap.reportViews.length,countReports:snap.reports?.length||1,meta});
   const m=t.objectStore(MEDIA);Object.entries(photoAssets).forEach(([id,b])=>m.put(b,activeId+'::'+id));
   const used=new Set(photoMeta.map(p=>activeId+'::'+p.id));const cursor=m.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(String(c.key).startsWith(activeId+'::')&&!used.has(c.key))c.delete();c.continue()};
   await txDone(t);knownAssets=new Set([...knownAssets.filter(k=>!k.startsWith(activeId+'::')),...used]);localStorage.setItem(KEY,activeId);window.dispatchEvent(new Event('fv360:home-updated'));
  }
  async function save(){if(!db||restoring)return;if(saving){pending=true;await saving;if(pending){pending=false;return save()}return}
   clearTimeout(timer);saving=store();try{await saving}catch(e){console.warn('FV360: guardado PC local',e)}finally{saving=null}}
  function schedule(){if(restoring||!db)return;clearTimeout(timer);timer=setTimeout(()=>save(),2100)}
  async function load(id){if(!db)throw Error('La biblioteca local no está disponible. Usa un respaldo JSON o ZIP.');await save();const row=await getRecord(id);if(!row)throw Error('Proyecto no encontrado');restoring=true;
   try{const blobs={};for(const p of row.meta.photos){const blob=await req(db.transaction(MEDIA,'readonly').objectStore(MEDIA).get(id+'::'+p.id));if(!blob)throw Error('Falta foto '+p.name);blobs[p.id]=blob}await app.restore(row.meta,blobs);activeId=id;knownAssets=new Set(row.meta.photos.map(p=>id+'::'+p.id));localStorage.setItem(KEY,id)}finally{restoring=false}
   window.dispatchEvent(new Event('fv360:home-updated'));
  }
  async function create(name){await save();restoring=true;try{activeId=newid();knownAssets.clear();app.fresh(name||'Nuevo levantamiento');localStorage.setItem(KEY,activeId)}finally{restoring=false}await save()}
  async function imported(){if(!db)return;restoring=true;try{activeId=newid();knownAssets.clear();localStorage.setItem(KEY,activeId)}finally{restoring=false}await save()}
  const adapter={list,save,open:load,create,active:()=>activeId,import:()=>$('projectInput').click(),imported};
  adapter.ready=(async()=>{try{db=await connect();const remembered=localStorage.getItem(KEY),row=remembered?await getRecord(remembered):null;
   if(row)await load(remembered);else{activeId=newid();localStorage.setItem(KEY,activeId);await save()}
   window.addEventListener('fv360:changed',schedule);$('projectName').addEventListener('input',schedule);
   document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save()});
   window.addEventListener('pagehide',()=>save());
  }catch(e){console.warn('FV360 PC: sin biblioteca persistente',e);activeId=activeId||newid()}
   return adapter})();return adapter;
 }
 function configureNotes(){
  const txt=$('annText'),txtHost=$('fvNotesText'),font=$('annFont'),fontHost=$('fvNotesFont'),typ=$('annAlign')?.closest('details');
  if(txt&&txtHost){const oldLabel=document.querySelector('label[for="annText"]');if(oldLabel)oldLabel.hidden=true;
   txtHost.innerHTML='<label class="input-label" for="annText">Contenido de la nota seleccionada</label>';txtHost.appendChild(txt)}
  if(font&&fontHost){fontHost.innerHTML='<label class="input-label" for="annFont">Tamaño del texto</label>';fontHost.appendChild(font)}
  if(typ)$('fvNotesTypo').appendChild(typ);
  const insert=()=>{app.beginNote?.();app.openTab('notes');$('viewer').scrollIntoView({behavior:'smooth',block:'nearest'})};
  $('fvAddText').onclick=insert;$('fvQuickNotes').onclick=()=>{app.openTab('notes');insert()};
  $('navNotes')&&($('navNotes').onclick=()=>app.openTab('notes'));
  $('fvJumpLibrary').onclick=()=>$('fvPhotoLibrary').scrollIntoView({behavior:'smooth',block:'start'});
  $('fvNoteScale').addEventListener('input',()=>{$('annScale').value=$('fvNoteScale').value;$('annScale').dispatchEvent(new Event('input',{bubbles:true}));$('fvNoteScaleValue').textContent=$('fvNoteScale').value+'%'});
  refreshNotes();
 }
 function refreshNotes(){const notes=app.getNotes?.()||[];const selected=app.getSelectedAnnotation?.();
  $('fvNoteSelection').textContent=selected?.type==='note'?`Editando nota ${selected.index+1}`:'Selecciona una nota o pulsa «Añadir texto»';
  if(selected?.type==='note'){$('fvNoteScale').value=String(selected.uiScale||100);$('fvNoteScaleValue').textContent=$('fvNoteScale').value+'%'}
  $('fvNoteList').innerHTML=notes.map(n=>`<button type="button" data-fv-note="${n.index}" class="fv-note-item ${selected?.index===n.index?'is-selected':''}"><span>✎</span><strong>${esc(n.text?.slice(0,65)||'Nota sin texto')}</strong><small>Editar ↗</small></button>`).join('')||'<p class="helper">No hay notas en esta fotografía y reporte.</p>';
  $('fvNoteList').querySelectorAll('[data-fv-note]').forEach(b=>b.onclick=()=>app.selectNote(Number(b.dataset.fvNote)));
 }
 window.FV360Workspace={openHome:show,closeHome:hide,refreshNotes,getProvider:()=>provider,refresh:refresh};
 $('fvHomeShortcut').onclick=show;$('fvNewProjectShortcut').onclick=create;$('fvHomeClose').onclick=hide;
 $('fvHomeNew').onclick=create;$('fvHomeImport').onclick=async()=>{if(!provider)return;if(window.FV360UX&&!(await window.FV360UX.confirmExit()))return;$('projectInput').click()};$('fvHomeContinue').onclick=hide;
 $('fvHomeSearch').addEventListener('input',e=>{search=e.target.value;refresh()});
 window.addEventListener('fv360:project-imported',async()=>{if(!mobile&&provider?.imported)await provider.imported();imported()});
 window.addEventListener('fv360:home-updated',()=>{if(homeOpen)refresh()});
 window.addEventListener('fv360:changed',()=>{if(app.getSelectedAnnotation?.()?.type==='note')refreshNotes()});
 configureNotes();
 if(mobile){provider=window.FV360Mobile;show();if(provider.isReady){ready=true;refresh()}else window.addEventListener('fv360:library-ready',()=>{ready=true;refresh()},{once:true})}
 else{provider=desktopProvider();show();provider.ready.then(()=>{ready=true;refresh()})}
})();
