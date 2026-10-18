/* FV360 v12: branded project dialogues; no browser prompt/confirm/alert. */
(()=>{'use strict';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const host=document.createElement('div');host.className='fv12-dialog-root';host.hidden=true;
 host.innerHTML=`<section class="fv12-dialog" role="dialog" aria-modal="true" aria-labelledby="fv12DialogTitle"><div class="fv12-dialog-eyebrow">FV360 STUDIO · ESPACIO DE TRABAJO</div><h2 id="fv12DialogTitle"></h2><p id="fv12DialogMessage"></p><label class="fv12-dialog-label" id="fv12DialogLabel" for="fv12DialogInput">Nombre</label><input id="fv12DialogInput" type="text" autocomplete="off" maxlength="120"/><div class="fv12-dialog-actions"><button type="button" id="fv12DialogCancel">Cancelar</button><button type="button" id="fv12DialogOK" class="fv12-dialog-primary">Aceptar</button></div></section>`;
 document.body.appendChild(host);
 const title=host.querySelector('#fv12DialogTitle'),message=host.querySelector('#fv12DialogMessage'),input=host.querySelector('#fv12DialogInput'),label=host.querySelector('#fv12DialogLabel'),cancel=host.querySelector('#fv12DialogCancel'),ok=host.querySelector('#fv12DialogOK');
 let queue=Promise.resolve();
 function show(mode,txt,defaultText='',opt={}){return new Promise(resolve=>{
  const origin=document.activeElement;
  title.textContent=mode==='prompt'?'Nombre del elemento':mode==='confirm'?'Confirmar acción':'Información';
  message.textContent=String(txt??'');input.hidden=mode!=='prompt';label.hidden=mode!=='prompt';cancel.hidden=mode==='alert';
  input.value=defaultText??'';ok.textContent=mode==='alert'?'Entendido':mode==='confirm'?'Confirmar':'Guardar nombre';
  host.hidden=false;document.body.classList.add('fv12-dialog-open');
  let finished=false;
  const done=v=>{if(finished)return;finished=true;host.hidden=true;document.body.classList.remove('fv12-dialog-open');host.removeEventListener('keydown',keyHandler);host.removeEventListener('click',clickHandler);ok.removeEventListener('click',yes);cancel.removeEventListener('click',no);origin?.focus?.({preventScroll:true});resolve(v)};
  const yes=()=>done(mode==='prompt'?input.value:true),no=()=>done(mode==='prompt'?null:false);
  const keyHandler=e=>{if(e.key==='Escape'){e.preventDefault();no()}else if(e.key==='Enter'&&(mode!=='prompt'||e.target===input)){e.preventDefault();yes()}else if(e.key==='Tab'){const active=[...(mode==='prompt'?[input]:[]),...(mode==='alert'?[]:[cancel]),ok];const idx=active.indexOf(document.activeElement);if(e.shiftKey&&idx<=0){e.preventDefault();active.at(-1).focus()}else if(!e.shiftKey&&idx===active.length-1){e.preventDefault();active[0].focus()}}};
  const clickHandler=e=>{if(e.target===host)no()};
  ok.addEventListener('click',yes);cancel.addEventListener('click',no);host.addEventListener('keydown',keyHandler);host.addEventListener('click',clickHandler);
  requestAnimationFrame(()=>{(mode==='prompt'?input:ok).focus();if(mode==='prompt')input.select()});
 })}
 function dialog(mode,txt,defaultText){const job=queue.then(()=>show(mode,txt,defaultText));queue=job.then(()=>undefined,()=>undefined);return job}
 function improveHeader(){
  const bar=document.querySelector('.fv-ux-actions'),header=document.querySelector('.topbar .header-actions'),strip=document.querySelector('.project-strip');
  if(!bar||!header||!strip)return;
  let menu=document.getElementById('fv12FileMenuHost');
  if(!menu){menu=document.createElement('div');menu.className='fv12-file-host';menu.id='fv12FileMenuHost';menu.innerHTML='<button type="button" id="fv12FileMenuToggle" aria-expanded="false" aria-label="Menú de archivo">Archivo ▾</button><div id="fv12FilePopup" class="fv12-file-popup" hidden></div>';header.append(menu);
   const toggle=menu.querySelector('button'),popup=menu.querySelector('#fv12FilePopup');toggle.onclick=()=>{popup.hidden=!popup.hidden;toggle.setAttribute('aria-expanded',String(!popup.hidden))};document.addEventListener('click',e=>{if(!menu.contains(e.target)){popup.hidden=true;toggle.setAttribute('aria-expanded','false')}});popup.addEventListener('click',e=>{if(e.target.closest('button')){popup.hidden=true;toggle.setAttribute('aria-expanded','false')}})}
  const popup=menu.querySelector('#fv12FilePopup');
  if(matchMedia('(min-width:1350px)').matches){bar.classList.remove('fv-ux-mobile-strip');bar.classList.add('fv12-actions-top');header.insertBefore(bar,header.firstChild);
   for(const id of ['btnSaveJSON','btnSave','btnLoadProject']){const button=document.getElementById(id);if(button&&button.parentElement!==popup)popup.appendChild(button)}
   menu.hidden=false;
  }else{bar.classList.remove('fv12-actions-top');bar.classList.add('fv-ux-mobile-strip');strip.insertAdjacentElement('afterend',bar);
   for(const id of ['btnSaveJSON','btnSave','btnLoadProject']){const button=document.getElementById(id);if(button&&button.parentElement!==header)header.appendChild(button)}
   menu.hidden=true;
  }
 }
 window.addEventListener('load',()=>{improveHeader();setTimeout(improveHeader,350)});
 window.addEventListener('resize',()=>{clearTimeout(window.__fv12LayoutTimer);window.__fv12LayoutTimer=setTimeout(improveHeader,120)});
 window.FV360Dialog={prompt:(msg,val='')=>dialog('prompt',msg,val),confirm:msg=>dialog('confirm',msg),alert:msg=>dialog('alert',msg)};
})();
