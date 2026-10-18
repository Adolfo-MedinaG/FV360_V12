/* FV360 Studio v10 — carpetas locales, guardado manual y espacio de trabajo personalizable.
   Capa aditiva: el motor de fotografía, líneas, reportes, JSON/ZIP y DXF sigue intacto. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),app=window.FV360Bridge,home=window.FV360Workspace;
 if(!app||!home||!$('fvWorkspaceHome'))return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const lsGet=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))??def}catch{return def}};
 const lsPut=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch(e){console.warn('FV360: preferencias no persistidas',e)}};
 const FOLDERS_KEY='fv360.v10.folders',SETTINGS_KEY='fv360.v10.settings',FILES_KEY='fv360.v10.manual.files',HIDDEN_KEY='fv360.v13.hidden.recent';
 let hiddenRecent=new Set(lsGet(HIDDEN_KEY,[])),showHiddenRecent=false;
 const DEFAULT={font:'medium',mode:'all',sort:'recent',askBeforeLeave:true,reduceMotion:false,contrast:false,toolbarHidden:[],tabHidden:[],toolbarOrder:[],tabOrder:[]};
 const settings={...DEFAULT,...lsGet(SETTINGS_KEY,{})};
 let folders=lsGet(FOLDERS_KEY,{items:[],placements:{},favorites:[]}),fileHistory=lsGet(FILES_KEY,{}),selectedFolder='all';
 const originalOrder={tool:null,tab:null};
 let dirty=false,isSaving=false,manualMode='save',fileHandle=null,handleOwner=null,lastProjectId=null,ready=false,currentRows=[];
 const getProvider=()=>home.getProvider?.(),getId=()=>getProvider()?.active?.()||'sin-id';
 const currentFile=()=>fileHistory[getId()]||null;
 const docName=()=>app.getProjectName()||'Levantamiento';
 const newFolderId=()=>`carpeta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
 const countFolder=id=>currentRows.filter(r=>(folders.placements[r.id]||'inbox')===id).length;
 const notify=s=>{const el=$('fvUXStatus');if(el)el.textContent=s};
 function status(){const doc=currentFile();const el=$('fvUXStatus'),dot=$('fvUXDirty');if(!el)return;
  el.textContent=isSaving?'Guardando archivo…':dirty?'Cambios sin guardar en archivo':doc?`Archivo: ${doc.name} · ${new Date(doc.at).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Borrador local · guarda un JSON';
  dot.textContent=dirty?'●':'✓';dot.dataset.dirty=String(dirty);
 }
 function markDirty(){if(!ready||isSaving)return;dirty=true;status()}
 function resetDocumentState(){const id=getId();if(id!==lastProjectId){lastProjectId=id;fileHandle=null;handleOwner=null;dirty=false}status()}
 function folderSave(){lsPut(FOLDERS_KEY,folders)}
 function saveSettings(){lsPut(SETTINGS_KEY,settings);applySettings()}
 function attachToolbox(){
  const host=document.querySelector('.header-actions');if(host){
   const wrap=document.createElement('div');wrap.className='fv-ux-actions';wrap.innerHTML=`<span class="fv-ux-save-dot" id="fvUXDirty" aria-hidden="true">✓</span><span class="fv-ux-state" id="fvUXStatus">Borrador local</span><button id="fvSaveNow" type="button" title="Guardar el proyecto (Ctrl/Cmd+S)" aria-label="Guardar el proyecto"><svg class="fv-icon-save" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h13l3 3v15H4zM7 3v7h9V3M7 21v-8h10v8"/></svg><span>Guardar</span></button><button id="fvSaveAs" type="button" title="Guardar como nuevo archivo">Guardar como…</button><button id="fvOpenSettings" type="button" title="Personalizar FV360">⚙ Ajustes</button>`;
   if(document.querySelector('.project-strip')){
    wrap.classList.add('fv-ux-mobile-strip');
    document.querySelector('.project-strip').insertAdjacentElement('afterend',wrap);
   }else host.prepend(wrap);
  }
  const bar=$('fvWorkspaceHome').querySelector('.fv-home-top');if(bar){const b=document.createElement('button');b.id='fvHomeSettings';b.type='button';b.textContent='⚙ Configurar';bar.insertBefore(b,$('fvHomeClose'));b.addEventListener('click',openSettings)}
  $('fvSaveNow')?.addEventListener('click',()=>saveManual('save'));
  $('fvSaveAs')?.addEventListener('click',()=>saveManual('saveas'));
  $('fvOpenSettings')?.addEventListener('click',openSettings);
 }
 // En Chrome/Edge se mantiene la referencia de File System Access para Guardar.
 // iOS/Safari sólo permiten Compartir/Descargas, por eso allí Guardar crea una copia nueva.
 window.FV360UXFile={
  async prepare(suggested){
   const owner=getId();
   if(manualMode==='save'&&fileHandle&&handleOwner===owner)return fileHandle;
   if(typeof window.showSaveFilePicker==='function'&&window.isSecureContext){
    try{const h=await window.showSaveFilePicker({suggestedName:manualMode==='save'&&currentFile()?.name||suggested,types:[{description:'Proyecto FV360 (JSON)',accept:{'application/json':['.json']}}]});fileHandle=h;handleOwner=owner;return h}
    catch(e){if(e?.name==='AbortError')return false;console.warn('FV360 selector:',e)}
   }
   fileHandle=null;handleOwner=null;return null;
  }
 };
 async function saveManual(mode='save'){
  if(isSaving)return false;isSaving=true;manualMode=mode;status();
  try{
   if(typeof app.saveJSON!=='function'){FV360Dialog.alert('No está disponible la exportación JSON de FV360.');return false}
   const result=await app.saveJSON();return result===true;
  }finally{isSaving=false;status()}
 }
 function onExport(e){if(e.detail?.format!=='json')return;
  dirty=false;const id=getId(),name=(fileHandle&&handleOwner===id?fileHandle.name:null)||e.detail.name;
  fileHistory[id]={name,at:new Date().toISOString(),method:e.detail.method};lsPut(FILES_KEY,fileHistory);status();
  if(e.detail.method==='download')notify(`Descarga iniciada: ${name}. Verifica su carpeta Descargas.`)
 }
 async function confirmExit(){
  if(!dirty||!settings.askBeforeLeave)return true;
  return new Promise(resolve=>{
   const modal=$('fvUnsavedDialog');modal.hidden=false;
   const finish=v=>{modal.hidden=true;resolve(v)};
   $('fvUnsavedCancel').onclick=()=>finish(false);
   $('fvUnsavedSkip').onclick=()=>finish(true);
   $('fvUnsavedSave').onclick=async()=>{const b=$('fvUnsavedSave');b.disabled=true;b.textContent='Guardando…';try{if(await saveManual('save'))finish(true)}finally{b.disabled=false;b.textContent='Guardar archivo y continuar'}};
  });
 }
 window.FV360UX={confirmExit,markDirty,saveManual,openSettings,status};
 function attachDialogs(){
  document.body.insertAdjacentHTML('beforeend',`<div id="fvUnsavedDialog" class="fv-ux-backdrop" hidden role="dialog" aria-modal="true" aria-label="Cambios pendientes"><div class="fv-ux-modal fv-ux-confirm"><div class="fv-ux-overline">DOCUMENTO MODIFICADO</div><h2>¿Guardar los cambios del proyecto?</h2><p>Hay modificaciones sin guardar en un archivo JSON. El borrador local puede seguir disponible, pero <strong>no sustituye un respaldo externo</strong>.</p><div class="fv-ux-dialog-actions"><button id="fvUnsavedCancel">Cancelar</button><button id="fvUnsavedSkip">No guardar archivo</button><button class="fv-ux-primary" id="fvUnsavedSave">Guardar archivo y continuar</button></div></div></div>
  <div id="fvSettingsOverlay" class="fv-ux-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="fvSettingsTitle"><div class="fv-ux-modal fv-ux-settings"><div class="fv-ux-modal-top"><div><div class="fv-ux-overline">ESPACIO DE TRABAJO · PREFERENCIAS</div><h2 id="fvSettingsTitle">Configuración de FV360</h2></div><button type="button" id="fvSettingsClose">Cerrar ×</button></div><div class="fv-ux-settings-inner"><section class="fv-ux-pref-section"><h3>Perfil de trabajo</h3><p class="fv-ux-muted">Ocultar una herramienta no la elimina del proyecto ni de los reportes.</p><div class="fv-ux-presets"><button data-fv-preset="all">Completo</button><button data-fv-preset="field">Visita en campo</button><button data-fv-preset="report">Documentación</button><button id="fvRestoreDefault">Restaurar todo</button></div></section><section class="fv-ux-pref-section"><h3>Herramientas visibles y orden</h3><p class="fv-ux-muted">Activa las casillas y usa ↑ ↓ para cambiar el orden. Siempre puedes recuperar todo.</p><div id="fvToolbarSettings" class="fv-ux-options"></div></section><section class="fv-ux-pref-section"><h3>Paneles del inspector</h3><div id="fvTabSettings" class="fv-ux-options"></div></section><section class="fv-ux-pref-section"><h3>Apariencia y seguridad</h3><label class="fv-ux-field">Tamaño de letra del interfaz <select id="fvSettingFont"><option value="small">Compacta</option><option value="medium">Normal</option><option value="large">Grande</option></select></label><label class="fv-ux-check"><input type="checkbox" id="fvSettingConfirm" checked> Avisar antes de cambiar de proyecto con cambios sin guardar en archivo</label><label class="fv-ux-check"><input type="checkbox" id="fvSettingMotion"> Reducir animaciones</label><label class="fv-ux-check"><input type="checkbox" id="fvSettingContrast"> Mejorar contraste de los controles</label><p class="fv-ux-muted">El guardado local de recuperación permanece habilitado. Elige «Guardar» para crear o actualizar una copia externa.</p><div class="fv-ux-presets"><button id="fvExportSettings">Exportar ajustes</button><button id="fvImportSettings">Importar ajustes</button><input type="file" id="fvSettingsFile" accept="application/json,.json" hidden></div></section></div><div class="fv-ux-modal-bottom"><span>Preferencias guardadas en este dispositivo.</span><button id="fvSettingsDone" class="fv-ux-primary">Listo</button></div></div></div>`);
  $('fvSettingsClose').onclick=closeSettings;$('fvSettingsDone').onclick=closeSettings;
  $('fvSettingsOverlay').addEventListener('click',e=>{if(e.target===$('fvSettingsOverlay'))closeSettings()});
  $('fvSettingFont').onchange=e=>{settings.font=e.target.value;saveSettings()};
  $('fvSettingConfirm').onchange=e=>{settings.askBeforeLeave=e.target.checked;saveSettings()};
  $('fvSettingMotion').onchange=e=>{settings.reduceMotion=e.target.checked;saveSettings()};
  $('fvSettingContrast').onchange=e=>{settings.contrast=e.target.checked;saveSettings()};
  document.querySelectorAll('[data-fv-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.fvPreset));
  $('fvRestoreDefault').onclick=()=>{Object.assign(settings,structuredClone(DEFAULT));saveSettings();buildToolOptions()};
  $('fvExportSettings').onclick=()=>{const blob=new Blob([JSON.stringify({app:'FV360',type:'preferences',version:1,settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='FV360_AJUSTES.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)};
  $('fvImportSettings').onclick=()=>$('fvSettingsFile').click();
  $('fvSettingsFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(x.type!=='preferences'||!x.settings)throw Error('No es un archivo de preferencias FV360');Object.assign(settings,structuredClone(DEFAULT),x.settings);saveSettings();buildToolOptions();FV360Dialog.alert('Preferencias restauradas.')}catch(err){FV360Dialog.alert(err.message)}finally{e.target.value=''}};
 }
 function getTools(kind){const host=kind==='tool'?$('viewer')?.previousElementSibling:document.querySelector('#inspector .tabs');
  const nodes=kind==='tool'?[...document.querySelectorAll('.toolbar button')]:[...document.querySelectorAll('#inspector .tabs [data-tab]')];
  return nodes.filter(el=>kind==='tab'||(el.id||el.dataset.tool)).map(el=>({el,key:kind==='tab'?'tab:'+el.dataset.tab:'tool:'+(el.id||el.dataset.tool),name:el.innerText.replace(/\s+/g,' ').trim()||el.title||'Herramienta'}));
 }
 function orderSettings(kind){return kind==='tool'?'toolbarOrder':'tabOrder'}
 function hiddenSettings(kind){return kind==='tool'?'toolbarHidden':'tabHidden'}
 function sortTools(kind){const order=settings[orderSettings(kind)]?.length?settings[orderSettings(kind)]:originalOrder[kind]||[];return getTools(kind).sort((a,b)=>{const ia=order.indexOf(a.key),ib=order.indexOf(b.key);return(ia===-1?10000:ia)-(ib===-1?10000:ib)})}
 function applySettings(){
  for(const kind of ['tool','tab']){
   const nodes=sortTools(kind);const host=kind==='tool'?document.querySelector('.toolbar'):document.querySelector('#inspector .tabs');
   if(!host)continue;
   nodes.forEach(n=>host.appendChild(n.el));
   const hidden=settings[hiddenSettings(kind)]||[];
   nodes.forEach(n=>{n.el.classList.toggle('fv-ux-hidden-tool',hidden.includes(n.key));});
   if(kind==='tool')host.querySelectorAll('.toolbar-divider').forEach(d=>d.classList.add('fv-ux-divider-hidden'));
  }
  document.documentElement.dataset.fvFont=settings.font;
  document.body.classList.toggle('fv-ux-reduced-motion',!!settings.reduceMotion);
  document.body.classList.toggle('fv-ux-contrast',!!settings.contrast);
  if($('fvSettingFont'))$('fvSettingFont').value=settings.font;
  if($('fvSettingConfirm'))$('fvSettingConfirm').checked=settings.askBeforeLeave;
  if($('fvSettingMotion'))$('fvSettingMotion').checked=settings.reduceMotion;
  if($('fvSettingContrast'))$('fvSettingContrast').checked=settings.contrast;
 }
 function moveTool(kind,key,delta){const nodes=sortTools(kind),i=nodes.findIndex(n=>n.key===key),j=i+delta;if(j<0||j>=nodes.length)return;
  [nodes[i],nodes[j]]=[nodes[j],nodes[i]];settings[orderSettings(kind)]=nodes.map(n=>n.key);saveSettings();buildToolOptions();}
 function buildToolOptions(){for(const kind of ['tool','tab']){
  const host=$(kind==='tool'?'fvToolbarSettings':'fvTabSettings'),hideKey=hiddenSettings(kind);if(!host)continue;
  const nodes=sortTools(kind);host.innerHTML=nodes.map((n,i)=>`<div class="fv-ux-option"><label><input type="checkbox" data-fv-check="${esc(n.key)}" ${!(settings[hideKey]||[]).includes(n.key)?'checked':''}><span>${esc(n.name)}</span></label><div><button data-fv-tool-move="${esc(n.key)}" data-fv-delta="-1" ${i===0?'disabled':''} title="Subir">↑</button><button data-fv-tool-move="${esc(n.key)}" data-fv-delta="1" ${i===nodes.length-1?'disabled':''} title="Bajar">↓</button></div></div>`).join('');
  host.querySelectorAll('[data-fv-check]').forEach(c=>c.onchange=()=>{const arr=new Set(settings[hideKey]||[]);if(c.checked)arr.delete(c.dataset.fvCheck);else{const currentlyVisible=nodes.filter(n=>!arr.has(n.key));if(currentlyVisible.length<=1){c.checked=true;return}arr.add(c.dataset.fvCheck)}settings[hideKey]=[...arr];saveSettings()});
  host.querySelectorAll('[data-fv-tool-move]').forEach(b=>b.onclick=()=>moveTool(kind,b.dataset.fvToolMove,Number(b.dataset.fvDelta)));
 }}
 function applyPreset(preset){settings.toolbarHidden=[];settings.tabHidden=[];
  if(preset==='field'){settings.toolbarHidden=getTools('tool').filter(n=>/guardar vista|cancelar|deshacer|borrar/i.test(n.name)).map(n=>n.key);settings.tabHidden=getTools('tab').filter(n=>/exportar|reporte|totales/i.test(n.name)).map(n=>n.key)}
  if(preset==='report'){settings.toolbarHidden=getTools('tool').filter(n=>/navegar|trazar|finalizar|cancelar/i.test(n.name)).map(n=>n.key);settings.tabHidden=getTools('tab').filter(n=>/capas|totales|dibujo/i.test(n.name)).map(n=>n.key)}
  saveSettings();buildToolOptions();}
 function openSettings(){$('fvSettingsOverlay').hidden=false;buildToolOptions();applySettings();}
 function closeSettings(){$('fvSettingsOverlay').hidden=true}
 // Una carpeta agrupa proyectos del historial local. Nunca mueve ni borra sus fotografías.
 let folderScreen='projects',editingFolderId=null,deleteArmed=false;
 // Biblioteca inspirada en los espacios "Your files" de los gestores creativos:
 // proyectos recientes y carpetas son vistas distintas, no dos barras apiladas.
 function setupFolders(){
  const heading=$('fvWorkspaceHome').querySelector('.fv-home-heading');if(!heading)return;
  heading.insertAdjacentHTML('afterend',`<div class="fv-library-navigation" role="tablist" aria-label="Organización de proyectos">
   <button type="button" id="fvLibraryProjects" role="tab" aria-selected="true">▦ Proyectos recientes</button>
   <button type="button" id="fvLibraryFolders" role="tab" aria-selected="false">▰ Carpetas</button>
   <button type="button" id="fvToggleHiddenRecent" class="fv-recent-toggle" aria-pressed="false">Ver ocultos (0)</button><div class="fv-library-spacer"></div><label class="fv-library-sort-label">Orden <select id="fvHomeSort" aria-label="Orden de proyectos"><option value="recent">Más recientes</option><option value="alpha">Nombre A–Z</option><option value="favorites">Favoritos primero</option></select></label>
  </div>
  <section class="fv-folder-workspace" id="fvFolderWorkspace" hidden aria-label="Administrador de carpetas">
   <div class="fv-folder-workspace-top"><div><span class="fv-home-eyebrow">TUS DOCUMENTOS · ORGANIZACIÓN LOCAL</span><h3>Carpetas de proyectos</h3><p>Organiza levantamientos sin mover ni borrar fotografías originales.</p></div>
   <button id="fvAddFolder" class="fv-folder-create" type="button">＋ Nueva carpeta</button></div>
   <div class="fv-folders-grid" id="fvFoldersRow" role="list" aria-label="Carpetas de proyectos"></div>
   <div class="fv-folder-location" id="fvFolderLocation" hidden><button type="button" id="fvFolderBack">← Todas las carpetas</button><span id="fvFolderCurrent"></span></div>
   <p class="fv-folder-tip" id="fvFolderTip">Selecciona una carpeta para ver sus proyectos. Puedes arrastrar tarjetas entre carpetas o usar «Mover a carpeta».</p>
  </section>
  <div id="fvFolderDialog" class="fv-ux-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="fvFolderDialogTitle">
   <div class="fv-ux-modal fv-folder-dialog"><div class="fv-ux-overline">BIBLIOTECA · CARPETAS</div><h2 id="fvFolderDialogTitle">Nueva carpeta</h2>
    <label for="fvFolderName" class="fv-folder-input-label">Nombre de la carpeta</label><input id="fvFolderName" type="text" maxlength="64" autocomplete="off" placeholder="Ej. Naves industriales" />
    <p id="fvFolderDialogHint">Esta carpeta organiza proyectos guardados en el dispositivo. No es una carpeta de Archivos ni de Google Drive.</p>
    <div class="fv-folder-dialog-bottom"><button id="fvFolderDelete" type="button" class="fv-folder-danger" hidden>Eliminar carpeta</button><span class="fv-library-spacer"></span><button id="fvFolderCancel" type="button">Cancelar</button><button id="fvFolderConfirm" class="fv-ux-primary" type="button">Crear carpeta</button></div>
   </div></div>`);
  $('fvToggleHiddenRecent').onclick=()=>{showHiddenRecent=!showHiddenRecent;drawCards()};
  $('fvLibraryProjects').onclick=()=>showFolderScreen('projects');
  $('fvLibraryFolders').onclick=()=>showFolderScreen('folders');
  $('fvAddFolder').onclick=()=>openFolderEditor();
  $('fvFolderBack').onclick=()=>{selectedFolder='all';renderFolders();drawCards()};
  $('fvHomeSort').value=settings.sort||'recent';$('fvHomeSort').onchange=e=>{settings.sort=e.target.value;saveSettings();drawCards()};
  $('fvFolderCancel').onclick=closeFolderEditor;
  $('fvFolderDialog').onclick=e=>{if(e.target===$('fvFolderDialog'))closeFolderEditor()};
  $('fvFolderName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submitFolder()}if(e.key==='Escape')closeFolderEditor()};
  $('fvFolderConfirm').onclick=submitFolder;
  $('fvFolderDelete').onclick=()=>{
   if(!editingFolderId)return;
   if(!deleteArmed){deleteArmed=true;$('fvFolderDelete').textContent='Confirmar eliminación';$('fvFolderDialogHint').textContent='Los proyectos de esta carpeta pasarán a «Sin carpeta». No se eliminará ningún proyecto ni fotografía.';return}
   const id=editingFolderId;folders.items=folders.items.filter(f=>f.id!==id);
   Object.keys(folders.placements).forEach(k=>{if(folders.placements[k]===id)delete folders.placements[k]});
   if(selectedFolder===id)selectedFolder='all';folderSave();closeFolderEditor();renderFolders();drawCards();
  };
  renderFolders();showFolderScreen('projects');
 }
 function showFolderScreen(screen){folderScreen=screen;
  $('fvFolderWorkspace').hidden=screen!=='folders';const heading=$('fvWorkspaceHome').querySelector('.fv-home-heading h2');if(heading)heading.textContent=screen==='folders'?'Tu biblioteca de carpetas':'Proyectos recientes';
  $('fvLibraryProjects').setAttribute('aria-selected',String(screen==='projects'));
  $('fvLibraryFolders').setAttribute('aria-selected',String(screen==='folders'));
  $('fvWorkspaceHome').classList.toggle('fv-library-folders-mode',screen==='folders');
  if(screen==='projects')selectedFolder='all';
  renderFolders();drawCards();
 }
 function openFolderEditor(id=null){editingFolderId=id;deleteArmed=false;
  const folder=folders.items.find(f=>f.id===id);$('fvFolderDialogTitle').textContent=folder?'Editar carpeta':'Nueva carpeta';
  $('fvFolderName').value=folder?.name||'';$('fvFolderConfirm').textContent=folder?'Guardar nombre':'Crear carpeta';
  $('fvFolderDelete').hidden=!folder;$('fvFolderDelete').textContent='Eliminar carpeta';
  $('fvFolderDialogHint').textContent='La organización es local a este dispositivo; los archivos de los proyectos no se borran ni se trasladan.';
  $('fvFolderDialog').hidden=false;$('fvFolderName').focus();
 }
 function closeFolderEditor(){$('fvFolderDialog').hidden=true;editingFolderId=null;deleteArmed=false}
 function submitFolder(){const name=$('fvFolderName').value.trim().slice(0,64);
  if(!name){$('fvFolderName').focus();return}
  if(editingFolderId){const folder=folders.items.find(f=>f.id===editingFolderId);if(folder)folder.name=name}
  else folders.items.push({id:newFolderId(),name});
  folderSave();closeFolderEditor();renderFolders();drawCards();
 }
 function renderFolders(){const host=$('fvFoldersRow');if(!host)return;
  const entries=[{id:'inbox',name:'Sin carpeta',count:countFolder('inbox'),fixed:true},...folders.items.map(f=>({...f,count:countFolder(f.id)}))];
  host.innerHTML=entries.map(f=>`<article class="fv-folder-tile ${selectedFolder===f.id?'is-active':''}" data-fv-folder-drop="${esc(f.id)}" role="listitem">
    <button type="button" class="fv-folder-tile-main" data-fv-select-folder="${esc(f.id)}" title="Abrir ${esc(f.name)}">
     <svg class="fv-folder-art" viewBox="0 0 92 72" aria-hidden="true"><path d="M6 19v-6c0-4 3-7 7-7h22l10 10h33c4 0 7 3 7 7v36c0 4-3 7-7 7H13c-4 0-7-3-7-7z" fill="#566675"/><path d="M6 27c0-4 3-7 7-7h65c4 0 7 3 7 7v32c0 4-3 7-7 7H13c-4 0-7-3-7-7z" fill="#9CACBA"/></svg>
     <strong>${esc(f.name)}</strong><span>${f.count} proyecto${f.count===1?'':'s'}</span>
    </button>${f.fixed?'':`<button type="button" class="fv-folder-more" data-fv-folder-edit="${esc(f.id)}" title="Renombrar o eliminar ${esc(f.name)}" aria-label="Opciones de la carpeta ${esc(f.name)}">⋯</button>`}
   </article>`).join('');
  host.querySelectorAll('[data-fv-select-folder]').forEach(b=>b.onclick=()=>{selectedFolder=b.dataset.fvSelectFolder;renderFolders();drawCards()});
  host.querySelectorAll('[data-fv-folder-edit]').forEach(b=>b.onclick=()=>openFolderEditor(b.dataset.fvFolderEdit));
  host.querySelectorAll('[data-fv-folder-drop]').forEach(el=>{
   el.ondragover=e=>{e.preventDefault();el.classList.add('fv-folder-over')};el.ondragleave=()=>el.classList.remove('fv-folder-over');
   el.ondrop=e=>{e.preventDefault();el.classList.remove('fv-folder-over');const pid=e.dataTransfer?.getData('text/fv360-project');if(pid)placeProject(pid,el.dataset.fvFolderDrop)};
  });
  const loc=$('fvFolderLocation');if(loc){loc.hidden=folderScreen!=='folders'||selectedFolder==='all';
   $('fvFolderCurrent').textContent=selectedFolder==='inbox'?'Sin carpeta':folders.items.find(f=>f.id===selectedFolder)?.name||'Carpeta';
  }
  $('fvFolderTip').hidden=selectedFolder!=='all';
 }
 function placeProject(pid,fid){if(!pid||fid==='all')return;if(fid==='inbox')delete folders.placements[pid];else folders.placements[pid]=fid;folderSave();renderFolders();drawCards()}
const EYE_OFF='<svg class="fv-hide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.55 5.16A10.9 10.9 0 0 1 12 5c5.2 0 9 5 9 7a12.3 12.3 0 0 1-3.1 3.9"/><path d="M6.1 6.1C3.8 7.7 3 10.3 3 12c0 2 3.8 7 9 7 1.5 0 3-.4 4.25-1.14"/><path d="M9.8 9.8a3.2 3.2 0 0 0 4.4 4.4"/></svg>';
const EYE_ON='<svg class="fv-hide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
 function drawCards(){const host=$('fvHomeProjects');if(!host)return;host.classList.toggle('fv-library-no-folder',folderScreen==='folders'&&selectedFolder==='all');
  const cards=[...host.querySelectorAll('[data-fv-project]')];
  cards.sort((a,b)=>{
   const aa=currentRows.find(x=>x.id===a.dataset.fvProject)||{},bb=currentRows.find(x=>x.id===b.dataset.fvProject)||{};
   if(settings.sort==='alpha')return String(aa.title||'').localeCompare(String(bb.title||''),'es');
   if(settings.sort==='favorites'){const ap=folders.favorites.includes(aa.id)?1:0,bp=folders.favorites.includes(bb.id)?1:0;if(ap!==bp)return bp-ap}
   return new Date(bb.updatedAt||0)-new Date(aa.updatedAt||0)
  }).forEach(c=>host.appendChild(c));
  cards.forEach(card=>{
   const id=card.dataset.fvProject,folder=folders.placements[id]||'inbox';
   card.hidden=(selectedFolder!=='all'&&folder!==selectedFolder)||(folderScreen==='projects'&&!showHiddenRecent&&hiddenRecent.has(id));
   card.ondragstart=e=>{e.dataTransfer.setData('text/fv360-project',id);e.dataTransfer.effectAllowed='move'};
   if(!card.querySelector('.fv-card-organize')){
    const actions=document.createElement('div');actions.className='fv-card-organize';
    actions.innerHTML=`<button class="fv-card-recent-hide" type="button" title="Ocultar del inicio sin borrar el proyecto" aria-label="Ocultar del inicio">${EYE_OFF}</button><button class="fv-card-drag" aria-label="Arrastrar proyecto hasta una carpeta" title="Arrastra a una carpeta" draggable="true">⠿</button><select aria-label="Mover a carpeta"><option value="inbox">Sin carpeta</option>${folders.items.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select><button class="fv-card-fav" type="button" title="Fijar proyecto como favorito">☆</button>`;
    card.appendChild(actions);
    actions.querySelector('.fv-card-recent-hide').onclick=()=>{if(hiddenRecent.has(id))hiddenRecent.delete(id);else hiddenRecent.add(id);lsPut(HIDDEN_KEY,[...hiddenRecent]);drawCards()};
    actions.querySelector('select').onchange=e=>placeProject(id,e.target.value);
    actions.querySelector('.fv-card-fav').onclick=()=>{folders.favorites=folders.favorites.includes(id)?folders.favorites.filter(x=>x!==id):[...folders.favorites,id];folderSave();drawCards()};
    actions.querySelector('.fv-card-drag').addEventListener('dragstart',e=>{e.dataTransfer.setData('text/fv360-project',id);e.stopPropagation()});
    let pos=null;const grip=actions.querySelector('.fv-card-drag');
    grip.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;pos={pid:id,x:e.clientX,y:e.clientY};grip.setPointerCapture(e.pointerId)});
    grip.addEventListener('pointermove',e=>{if(!pos)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-fv-folder-drop]');document.querySelectorAll('.fv-folder-over').forEach(n=>n.classList.remove('fv-folder-over'));if(target)target.classList.add('fv-folder-over')});
    grip.addEventListener('pointerup',e=>{if(!pos)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-fv-folder-drop]');pos=null;document.querySelectorAll('.fv-folder-over').forEach(n=>n.classList.remove('fv-folder-over'));if(target)placeProject(id,target.dataset.fvFolderDrop)});
   }
   const select=card.querySelector('.fv-card-organize select');if(select){select.innerHTML=`<option value="inbox">Sin carpeta</option>${folders.items.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}`;select.value=folder}
   const fav=card.querySelector('.fv-card-fav');if(fav)fav.textContent=folders.favorites.includes(id)?'★':'☆';const hb=card.querySelector('.fv-card-recent-hide');if(hb){hb.innerHTML=hiddenRecent.has(id)?EYE_ON:EYE_OFF;hb.title=hiddenRecent.has(id)?'Mostrar en inicio':'Ocultar del inicio sin borrar archivos';hb.setAttribute('aria-label',hb.title);hb.setAttribute('aria-pressed',String(hiddenRecent.has(id)))}
  });
  const toggle=$('fvToggleHiddenRecent');if(toggle){toggle.textContent=(showHiddenRecent?'Ocultar ocultos':'Ver ocultos')+' ('+hiddenRecent.size+')';toggle.setAttribute('aria-pressed',String(showHiddenRecent));toggle.hidden=folderScreen==='folders'}
  if(cards.length&&!cards.some(c=>!c.hidden)){
   let empty=host.querySelector('.fv-folder-empty');if(!empty){empty=document.createElement('p');empty.className='fv-folder-empty';host.appendChild(empty)}
   empty.textContent='No hay proyectos en esta carpeta. Arrastra aquí una tarjeta o usa «Mover».';
  }else host.querySelector('.fv-folder-empty')?.remove();
 }
 function init(){originalOrder.tool=getTools('tool').map(x=>x.key);originalOrder.tab=getTools('tab').map(x=>x.key);attachToolbox();attachDialogs();setupFolders();applySettings();status();
  const fileInput=$('projectInput');if(fileInput){const originalImport=fileInput.onchange;fileInput.onchange=async function(e){if(!(await confirmExit())){e.target.value='';return}if(originalImport)return originalImport.call(fileInput,e)}}
  window.addEventListener('fv360:home-rendered',e=>{currentRows=e.detail.rows||[];resetDocumentState();renderFolders();drawCards()});
  window.addEventListener('fv360:home-updated',()=>{const next=getId();if(next!==lastProjectId)resetDocumentState()});
  window.addEventListener('fv360:changed',markDirty);
  $('projectName')?.addEventListener('input',markDirty);
  document.addEventListener('input',e=>{if(e.target.closest('.fv-ux-backdrop')||e.target.closest('.fv-home-overlay'))return;if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))markDirty()});
  window.addEventListener('fv360:file-exported',onExport);
  window.addEventListener('fv360:project-imported',()=>setTimeout(()=>{dirty=false;resetDocumentState();status()},250));
  document.addEventListener('keydown',e=>{
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(e.shiftKey)saveManual('saveas');else saveManual('save')}
   if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();openSettings()}
   if(e.key==='Escape'&&!$('fvSettingsOverlay').hidden)closeSettings();
  });
  window.addEventListener('beforeunload',e=>{if(dirty&&settings.askBeforeLeave){e.preventDefault();e.returnValue=''}});
  let wait=0;const timer=setInterval(()=>{const provider=getProvider();if(provider?.active?.()){
    clearInterval(timer);lastProjectId=provider.active();ready=true;status();
    // el proveedor de PC emite el render inicial, pero actualizamos carpetas explícitamente.
    home.refresh?.();
   }else if(++wait>40){clearInterval(timer);ready=true;status()}
  },175);
 }
 init();
})();
