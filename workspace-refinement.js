/* FV360 v11: atajos contextuales, borrador unificado y borrado visible de notas. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),api=window.FV360Bridge;
 if(!api)return;
 const erase=document.createElement('button');erase.type='button';erase.className='tool';erase.id='fvEraseTop';
 erase.title='Borrador universal: toca cualquier línea, nota, rectángulo, círculo o PNG para eliminarlo';
 erase.innerHTML='<span class="tool-symbol">⌫</span><span>Borrador</span>';
 const select=$('toolSelect');if(select)select.insertAdjacentElement('afterend',erase);
 erase.onclick=()=>{api.beginErase?.();if(matchMedia('(max-width:820px)').matches)requestAnimationFrame(()=>document.getElementById('viewer')?.scrollIntoView({behavior:'instant',block:'center'}));};
 const add=$('fvAddText');if(add){
  const del=document.createElement('button');del.id='fvDeleteText';del.type='button';del.textContent='⌫ Eliminar nota seleccionada';
  add.insertAdjacentElement('afterend',del);
  del.onclick=()=>{const selected=api.getSelectedAnnotation?.();
   if(selected?.type!=='note'){const info=$('fvNoteSelection');if(info)info.textContent='Selecciona primero la nota en la foto o en la lista.';return}
   api.deleteSelectedAnnotation?.();const info=$('fvNoteSelection');if(info)info.textContent='Nota eliminada correctamente.';
  };
 }
 window.addEventListener('fv360:selection-context',e=>{
  const tab=e.detail?.tab;if(!['styles','objects','notes'].includes(tab))return;
  const target=document.querySelector(`[data-tab="${tab}"]`),panel=document.querySelector(`[data-content="${tab}"]`);
  if(!target||!panel)return;
  // Una herramienta ocultada por preferencias se revela al seleccionar su objeto,
  // sin alterar la configuración guardada del usuario.
  target.classList.remove('fv-ux-hidden-tool');
  target.classList.add('fv-context-selected');setTimeout(()=>target.classList.remove('fv-context-selected'),1250);
  document.querySelectorAll('[data-tab]').forEach(b=>{const active=b===target;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
  document.querySelectorAll('[data-content]').forEach(b=>b.classList.toggle('active',b===panel));
  // Cambia el inspector activo sin desplazar la pagina. En campo el visor conserva el foco:
  // la persona baja manualmente para ajustar las propiedades seleccionadas.
  const inspector=$('inspector');
  if(inspector&&matchMedia('(min-width:821px)').matches)inspector.scrollTop=0;
 });
})();
