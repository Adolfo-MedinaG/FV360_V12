/* FV360: mobile viewer-first toolbar and contextual inspector without automatic page jumps. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const container=document.querySelector('.viewer-buttons');
 const hand=$('fvHandPan'),full=$('btnFullscreen');
 if(!container||!hand||!full)return;
 const originalHand=hand.innerHTML;
 hand.innerHTML='<svg aria-hidden="true" class="fv-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v6c0 4-3 7-7 7h-2a7 7 0 0 1-5.5-2.5L3 16a1.7 1.7 0 0 1 2.4-2.4L8 16"/></svg><span class="fv-control-word">Mano</span>';
 hand.setAttribute('aria-label','Mano: mover la imagen sin alterar trazos');
 const toggle=document.createElement('button');
 toggle.id='fvViewToolsToggle';toggle.type='button';toggle.className='fv-view-toggle';
 toggle.setAttribute('aria-label','Mostrar controles de zoom y vista');
 toggle.setAttribute('aria-expanded','false');
 toggle.title='Opciones de zoom y vista';
 toggle.innerHTML='<svg aria-hidden="true" class="fv-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="#1a222a"/><circle cx="16" cy="17" r="2.5" fill="#1a222a"/></svg>';
 container.insertBefore(toggle,full);
 const small=matchMedia('(max-width:760px)');
 let open=false;
 function setOpen(flag){
  open=!!flag&&small.matches;
  document.body.classList.toggle('fv-view-tools-expanded',open);
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Ocultar controles de zoom y vista':'Mostrar controles de zoom y vista');
  toggle.title=open?'Ocultar opciones de vista':'Mostrar opciones de vista';
 }
 toggle.addEventListener('click',()=>setOpen(!open));
 const onResize=()=>{if(!small.matches)setOpen(false)};
 small.addEventListener?.('change',onResize);
 // Once a user touches the canvas again, free all the space for the photograph.
 $('drawing')?.addEventListener('pointerdown',()=>{if(open)setOpen(false)},{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)setOpen(false)});
 const status=document.querySelector('.status-line');
 if(status){
  const context=document.createElement('button');context.id='fvViewerContext';context.type='button';
  context.className='fv-viewer-context';context.hidden=true;
  context.setAttribute('aria-label','Ver las propiedades del elemento seleccionado');
  context.title='Puedes deslizar la pantalla hacia abajo para editar las propiedades';
  status.appendChild(context);
  const labels={styles:'Linea seleccionada',objects:'Objeto seleccionado',notes:'Texto seleccionado'};
  const destinations={styles:'Dibujo',objects:'Objetos',notes:'Texto'};
  window.addEventListener('fv360:selection-context',e=>{
   const name=e.detail?.tab;
   if(!labels[name])return;
   context.textContent=labels[name]+' \u00b7 Ajustes en '+destinations[name]+' \u2193';
   context.hidden=false;
   // No scrollIntoView here. The user's finger or explicit button is the only navigation.
  });
  context.addEventListener('click',()=>{$('inspector')?.scrollIntoView({behavior:'smooth',block:'start'})});
  document.querySelectorAll('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.tool!=='select')context.hidden=true}));
 }
})();
