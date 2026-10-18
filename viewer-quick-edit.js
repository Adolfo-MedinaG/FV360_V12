/* FV360: acceso rapido no destructivo para mediciones y atributos.
 * Los controles originales del inspector siguen siendo la fuente de datos.
 * Nunca se guardan copias separadas de cotas, objetos o estilos.
 */
(()=>{'use strict';
 const $=id=>document.getElementById(id),api=window.FV360Bridge,host=$('fvQuickEdit');
 if(!api||!host)return;
 let currentKey='',isRendering=false;
 const sourceChange=(id,value,event='change')=>{
  const el=$(id);if(!el)return;
  if(el.type==='checkbox')el.checked=!!value;else el.value=value;
  el.dispatchEvent(new Event(event,{bubbles:true}));
 };
 const syncSelect=(dest,src)=>{
  if(!dest||!src)return;
  dest.innerHTML='';for(const o of src.options){const n=document.createElement('option');n.value=o.value;n.textContent=o.textContent;dest.appendChild(n)}
  dest.value=src.value;
 };
 const bindMirror=(quick,original,event='change')=>{
  $(quick)?.addEventListener(event,e=>{sourceChange(original,e.target.type==='checkbox'?e.target.checked:e.target.value,event);update(false)});
 };
 const addMoreLink=()=>{
  const b=$('fvQAllProperties');if(!b)return;
  b.addEventListener('click',()=>{const inspector=$('inspector');if(!inspector)return;inspector.scrollIntoView({behavior:'smooth',block:'start'});});
 };
 function routePanel(){
  host.innerHTML=`<div class="fv-quick-top"><strong id="fvQTitle">Edición rápida</strong><span>Valores de la selección</span></div>
   <div class="fv-quick-row">
    <label class="fv-q-length-label" for="fvQDistance">Longitud del tramo (m)
     <input id="fvQDistance" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Medir en sitio" autocomplete="off"></label>
    <button id="fvQMeasure" type="button" class="fv-quick-primary">✓ Aplicar</button>
    <button id="fvQMore" type="button" class="fv-quick-more" aria-expanded="false" aria-controls="fvQDetails">Ajustes <span>⌄</span></button>
   </div>
   <div id="fvQDetails" class="fv-quick-details" hidden>
    <label>Tipo de línea <select id="fvQCategory"></select></label>
    <label>Grosor <select id="fvQWidth"></select></label>
    <label>Patrón <select id="fvQPattern"></select></label>
    <label>Color <input type="color" id="fvQColor" aria-label="Color de la ruta"></label>
    <label>Tamaño de cota <select id="fvQLabelSize"></select></label>
    <label>Posición de cota <select id="fvQLabelPosition"></select></label>
    <button id="fvQAllProperties" type="button" class="fv-q-full">Todas las propiedades ↓</button>
   </div>`;
  const value=$('fvQDistance');
  const apply=()=>{
   if(value.disabled)return;
   const original=$('distance');if(!original)return;
   original.value=value.value;
   $('btnMeasure')?.click();
   // Apply invokes the same validation and persistence as the approved inspector.
   update(false);
  };
  $('fvQMeasure').onclick=apply;
  value.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();value.blur()}});
  $('fvQMore').onclick=()=>{const panel=$('fvQDetails');panel.hidden=!panel.hidden;$('fvQMore').setAttribute('aria-expanded',String(!panel.hidden))};
  for(const [dest,src] of [['fvQCategory','routeClass'],['fvQWidth','lineWidth'],['fvQLabelSize','labelSize'],['fvQLabelPosition','labelPosition']]){syncSelect($(dest),$(src));bindMirror(dest,src)}
  const pat=$('fvQPattern');const buttons=document.querySelectorAll('#patterns .pattern');
  buttons.forEach((b,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=b.querySelector('span')?.textContent||`Patrón ${i+1}`;pat.appendChild(o)});
  pat.onchange=()=>{buttons[Number(pat.value)]?.click();update(false)};
  bindMirror('fvQColor','lineColor');addMoreLink();
 }
 function objectPanel(kind){
  const isNote=kind==='note';
  host.innerHTML=`<div class="fv-quick-top"><strong id="fvQTitle">Edición rápida</strong><span>Propiedades de la selección</span></div>
   <div class="fv-quick-row">
     ${isNote?'<button id="fvQEditNote" class="fv-quick-primary" type="button">✎ Editar texto</button>':''}
     <label for="fvQScale">Tamaño <strong id="fvQScaleLabel">100 %</strong>
      <input id="fvQScale" type="range" min="25" max="400" step="5" value="100"></label>
     <button id="fvQMore" class="fv-quick-more" type="button" aria-expanded="false" aria-controls="fvQDetails">Ajustes <span>⌄</span></button>
   </div>
   <div id="fvQDetails" class="fv-quick-details" hidden>
    ${isNote?'<label>Tamaño del texto<select id="fvQFont"></select></label><label>Alineación<select id="fvQAlign"></select></label><label>Color de texto<input id="fvQTextColor" type="color"></label><label class="fv-q-check">Fondo <input id="fvQBg" type="checkbox"></label>':''}
    <label>Color de objeto <input id="fvQObjectColor" type="color"></label>
    <label>Grosor de contorno <select id="fvQStroke"></select></label>
    <button id="fvQAllProperties" type="button" class="fv-q-full">Todas las propiedades ↓</button>
   </div>`;
  $('fvQMore').onclick=()=>{const p=$('fvQDetails');p.hidden=!p.hidden;$('fvQMore').setAttribute('aria-expanded',String(!p.hidden))};
  if(isNote){$('fvQEditNote').onclick=()=>api.editSelectedNote?.();
   for(const [dest,src] of [['fvQFont','annFont'],['fvQAlign','annAlign']]){syncSelect($(dest),$(src));bindMirror(dest,src)}
   bindMirror('fvQTextColor','annTextColor');bindMirror('fvQBg','annBackground');}
  syncSelect($('fvQStroke'),$('annStroke'));bindMirror('fvQStroke','annStroke');bindMirror('fvQObjectColor','annColor');
  $('fvQScale').addEventListener('input',e=>{$('fvQScaleLabel').textContent=e.target.value+' %';sourceChange('annScale',e.target.value,'input')});
  addMoreLink();
 }
 function update(rebuild=true){
  if(isRendering)return;isRendering=true;
  try{
   const s=api.getQuickSelection?.();
   if(!s){host.hidden=true;host.replaceChildren();currentKey='';return}
   const key=s.kind+':'+s.id+':'+(s.kind==='route'?s.segment:'');
   if(key!==currentKey){currentKey=key;host.hidden=false;
    if(s.kind==='route')routePanel();else objectPanel(s.kind);}
   else if(rebuild){host.hidden=false;}
   if(s.kind==='route'){
    $('fvQTitle').textContent=`Ruta ${s.route+1} · ${s.segment>=0?'Tramo '+(s.segment+1)+' de '+s.count:'Selecciona un tramo'}`;
    const inp=$('fvQDistance');inp.disabled=s.segment<0;$('fvQMeasure').disabled=s.segment<0;
    if(document.activeElement!==inp)inp.value=s.segment>=0?s.length:'';
    const choose=(id,value)=>{const el=$(id);if(el&&document.activeElement!==el)el.value=value};
    choose('fvQCategory',s.category);choose('fvQWidth',s.width);choose('fvQPattern',s.pattern);
    choose('fvQLabelSize',s.labelSize);choose('fvQLabelPosition',s.labelPosition);choose('fvQColor',s.color);
   }else{
    $('fvQTitle').textContent=s.kind==='note'?'Nota seleccionada':s.description+' seleccionado';
    const scale=$('fvQScale');if(document.activeElement!==scale)scale.value=s.scale;
    $('fvQScaleLabel').textContent=s.scale+' %';
    const choose=(id,value)=>{const el=$(id);if(!el||document.activeElement===el)return;if(el.type==='checkbox')el.checked=!!value;else el.value=value};
    choose('fvQObjectColor',s.color);choose('fvQStroke',s.stroke);
    if(s.kind==='note'){choose('fvQFont',s.font);choose('fvQAlign',s.align);choose('fvQTextColor',s.textColor);choose('fvQBg',s.background)}
   }
  }finally{isRendering=false}
 }
 window.addEventListener('fv360:quick-selection',()=>update(true));
 window.addEventListener('fv360:selection-context',()=>requestAnimationFrame(()=>update(true)));
 window.addEventListener('fv360:changed',()=>requestAnimationFrame(()=>update(false)));
 window.addEventListener('fv360:project-imported',()=>requestAnimationFrame(()=>update(true)));
 setTimeout(()=>update(true),50);
})();
