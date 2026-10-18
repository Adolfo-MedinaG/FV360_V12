/* FV360 Studio v2. Edición fotográfica / trazos no métricos sobre panorámicas. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const pano=$('panorama'),overlay=$('drawing'),viewer=$('viewer');
const ov=overlay.getContext('2d');
const CATEGORIES=[
 {id:'DC',name:'Corriente directa · C.D.',short:'C.D.',color:'#f04d4d',cad:'FV_DC'},
 {id:'AC',name:'Corriente alterna · C.A.',short:'C.A.',color:'#39aafa',cad:'FV_AC'},
 {id:'GROUND',name:'Tierra física',short:'Tierra',color:'#40cc8a',cad:'FV_TIERRA'},
 {id:'COMMS',name:'Comunicaciones / control',short:'Comunic.',color:'#c691fa',cad:'FV_COMUNIC'},
 {id:'TRAY',name:'Charola / bandeja',short:'Charola',color:'#f9b34c',cad:'FV_CHAROLA'},
 {id:'OTHER',name:'Otro / referencia',short:'Otro',color:'#e5e9ee',cad:'FV_OTROS'}
];
const PATTERNS=[
 {name:'Continua',dash:[]},{name:'Guion corto',dash:[7,5]},{name:'Guion largo',dash:[20,8]},
 {name:'Guion abierto',dash:[14,14]},{name:'Puntos finos',dash:[1,5]},
 {name:'Puntos separados',dash:[1,11]},{name:'Guion + punto',dash:[17,5,1,5]},
 {name:'Guion + 2 puntos',dash:[17,4,1,4,1,4]},{name:'Centro',dash:[25,5,6,5]},
 {name:'Oculta',dash:[5,4]},{name:'Fantasma',dash:[25,5,5,5,5,5]},{name:'Mixta',dash:[11,3,2,3]}
];
const visible=Object.fromEntries(CATEGORIES.map(c=>[c.id,true]));
let routes=[],activeRoute=null,selectedRoute=-1,selectedSegment=-1,selectedVertex=-1;
let mode='navigate',styleIndex=0,history=[],yaw=0,pitch=0,fov=78,flatZoom=1,flatPan={x:0,y:0};
let image=new Image(),imageReady=false,imageWidth=0,imageHeight=0,currentSrc='',originalBlob=null,originalFilename='ejemplo_dji_360.jpg',flatMode=false;
let viewW=1,viewH=1,pointer=null,ghost=null,dirty=true,framePending=false,toastTimer;
const fvTouchPointers=new Map();let fvPinchDistance=0,temporaryHandMode=null;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),rad=180/Math.PI;
const category=id=>CATEGORIES.find(c=>c.id===id)||CATEGORIES[0];
const num=x=>Number.isFinite(Number(x))?Number(x):0;
function mobileNotify(){window.dispatchEvent(new Event('fv360:changed'))}
function info(text,showToast=false){$('statusText').textContent=text;if(showToast){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500)}}
function snapshot(){history.push(JSON.stringify(routes));if(history.length>70)history.shift();mobileNotify()}
function vecNormalize(a){const l=Math.hypot(a.x,a.y,a.z)||1;return{x:a.x/l,y:a.y/l,z:a.z/l}}
function addv(a,b){return{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}}
function interp(a,b,t){if(flatMode&&(a.flat||b.flat)){const uv=p=>{if(p.flat)return p;const q=sphereProject(p,viewW,viewH);return q?{x:q.x/viewW,y:q.y/viewH}:{x:.5,y:.5}};const x=uv(a),y=uv(b);return{x:x.x*(1-t)+y.x*t,y:x.y*(1-t)+y.y*t,z:0,flat:true}}if(a.flat&&b.flat)return{x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t,z:0,flat:true};return vecNormalize({x:a.x*(1-t)+b.x*t,y:a.y*(1-t)+b.y*t,z:a.z*(1-t)+b.z*t})}
function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z}
function basis(){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);return{f:{x:sy*cp,y:sp,z:-cy*cp},r:{x:cy,y:0,z:sy},u:{x:-sy*sp,y:cp,z:cy*sp}}}
// Flat photographs use their own normalized image coordinates; panoramas keep the original 3D projection.
function flatRect(w,h){const iw=Math.max(1,imageWidth),ih=Math.max(1,imageHeight),scale=Math.min(w/iw,h/ih)*flatZoom,rw=iw*scale,rh=ih*scale;return{x:(w-rw)/2+flatPan.x*w,y:(h-rh)/2+flatPan.y*h,w:rw,h:rh}}
function normalizeFlatPan(){const rw=Math.min(viewW/imageWidth,viewH/imageHeight)*imageWidth*flatZoom,rh=Math.min(viewW/imageWidth,viewH/imageHeight)*imageHeight*flatZoom;flatPan.x=clamp(flatPan.x,-Math.max(0,(rw-viewW)/(2*viewW)),Math.max(0,(rw-viewW)/(2*viewW)));flatPan.y=clamp(flatPan.y,-Math.max(0,(rh-viewH)/(2*viewH)),Math.max(0,(rh-viewH)/(2*viewH)))}
function setViewZoom(z){if(flatMode){flatZoom=clamp(z,1,6);normalizeFlatPan();if(flatZoom>1&&mode!=='navigate'&&!activeRoute){setMode('navigate');info('Mano activa: arrastra la fotografía sin modificar líneas ni objetos. Para editar, elige Editar.',true)}}else fov=clamp(78/z,25,112);dirty=true;queueFrame()}
function zoomView(factor){setViewZoom(flatMode?flatZoom*factor:78/fov*factor)}
function sphereDirAt(px,py){const b=basis(),t=Math.tan(fov*Math.PI/360),a=viewW/viewH,nx=(2*px/viewW-1)*t*a,ny=(1-2*py/viewH)*t;return vecNormalize({x:b.f.x+nx*b.r.x+ny*b.u.x,y:b.f.y+nx*b.r.y+ny*b.u.y,z:b.f.z+nx*b.r.z+ny*b.u.z})}
function dirAt(px,py){if(flatMode){const r=flatRect(viewW,viewH);if(px<r.x||py<r.y||px>r.x+r.w||py>r.y+r.h)return null;return{x:clamp((px-r.x)/r.w,0,1),y:clamp((py-r.y)/r.h,0,1),z:0,flat:true}}return sphereDirAt(px,py)}
function sphereProject(d,w,h){const b=basis(),t=Math.tan(fov*Math.PI/360),z=dot(d,b.f);if(z<.07)return null;const sx=dot(d,b.r)/(z*t*(w/h)),sy=dot(d,b.u)/(z*t);return{x:(sx+1)*w/2,y:(1-sy)*h/2,inside:Math.abs(sx)<1.1&&Math.abs(sy)<1.1}}
function project(d,w=viewW,h=viewH){if(!d)return null;if(!flatMode)return sphereProject(d,w,h);const rect=flatRect(w,h);let u=d.x,v=d.y;if(!d.flat){/* Older projects drew flat photos as stretched images: preserve approximate position. */const prev=sphereProject(d,w,h);if(!prev)return null;u=prev.x/w;v=prev.y/h;}return{x:rect.x+u*rect.w,y:rect.y+v*rect.h,inside:u>=0&&u<=1&&v>=0&&v<=1}}
function linePoints(a,b,w,h){if(flatMode)return[project(a,w,h),project(b,w,h)];const v=[];for(let i=0;i<=14;i++)v.push(project(interp(a,b,i/14),w,h));return v}
function pointDistance(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy))}
function screenPoint(e){const r=overlay.getBoundingClientRect();return{x:(e.clientX-r.left)*viewW/r.width,y:(e.clientY-r.top)*viewH/r.height}}
function dimensions(){const r=viewer.getBoundingClientRect();viewW=Math.max(1,r.width);viewH=Math.max(1,r.height);const dpr=Math.min(window.devicePixelRatio||1,2);const dw=Math.round(Math.min(3200,viewW*dpr)),dh=Math.round(Math.min(2300,viewH*dpr));if(pano.width!==dw||pano.height!==dh){pano.width=dw;pano.height=dh}if(overlay.width!==dw||overlay.height!==dh){overlay.width=dw;overlay.height=dh}ov.setTransform(dw/viewW,0,0,dh/viewH,0,0);dirty=true;queueFrame()}
// WebGL: sample directly from full-resolution source texture. No coarse pixel-grid rendering.
let gl=null,shaderProgram=null,uniforms={},texture=null,webglError='';
function compileShader(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh}
function initWebGL(){try{
 gl=pano.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'})||pano.getContext('experimental-webgl',{alpha:false,preserveDrawingBuffer:true});
 if(!gl)throw Error('WebGL no disponible en este navegador');
 const vertex=compileShader(gl.VERTEX_SHADER,`attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=(aPosition+1.0)*0.5;gl_Position=vec4(aPosition,0.0,1.0);}`);
 const fragment=compileShader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 vUv;uniform sampler2D uImage;uniform vec3 uFront;uniform vec3 uRight;uniform vec3 uUp;uniform float uTan;uniform float uAspect;uniform float uFlat;uniform vec2 uFlatScale;uniform vec2 uFlatOffset;const float PI=3.14159265359;void main(){vec2 coord=vUv*2.0-1.0;if(uFlat>0.5){vec2 imageUv=(vUv-vec2(0.5)-uFlatOffset)/uFlatScale+vec2(0.5);if(any(lessThan(imageUv,vec2(0.0)))||any(greaterThan(imageUv,vec2(1.0)))){gl_FragColor=vec4(0.05,0.06,0.075,1.0);return;}gl_FragColor=texture2D(uImage,imageUv);return;}vec3 ray=normalize(uFront+uRight*coord.x*uTan*uAspect+uUp*coord.y*uTan);float lon=atan(ray.x,-ray.z);float lat=asin(clamp(ray.y,-1.0,1.0));vec2 texCoord=vec2(fract(0.5+lon/(2.0*PI)),0.5+lat/PI);gl_FragColor=texture2D(uImage,texCoord);}`);
 shaderProgram=gl.createProgram();gl.attachShader(shaderProgram,vertex);gl.attachShader(shaderProgram,fragment);gl.linkProgram(shaderProgram);if(!gl.getProgramParameter(shaderProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(shaderProgram));gl.useProgram(shaderProgram);
 const vertices=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);const loc=gl.getAttribLocation(shaderProgram,'aPosition');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 for(const key of ['uImage','uFront','uRight','uUp','uTan','uAspect','uFlat','uFlatScale','uFlatOffset'])uniforms[key]=gl.getUniformLocation(shaderProgram,key);
 gl.uniform1i(uniforms.uImage,0);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(.02,.025,.035,1);
 return true;
 }catch(e){webglError=e.message;console.error('FV360 WebGL:',e);return false}}
function uploadTexture(){if(!gl)return;try{if(texture)gl.deleteTexture(texture);texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,(imageWidth&(imageWidth-1))?gl.CLAMP_TO_EDGE:gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);if(imageWidth&(imageWidth-1)||imageHeight&(imageHeight-1)){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)}else{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D)}}catch(e){console.error(e);info('No se pudo usar la fotografía como textura. '+e.message,true)}}
function renderPano(){if(!imageReady)return;if(!gl){const c=pano.getContext('2d');if(c){c.fillStyle='#181b20';c.fillRect(0,0,pano.width,pano.height);flatMode?(c.drawImage(image,flatRect(pano.width,pano.height).x,flatRect(pano.width,pano.height).y,flatRect(pano.width,pano.height).w,flatRect(pano.width,pano.height).h)):c.drawImage(image,0,0,pano.width,pano.height)}return}const b=basis();gl.viewport(0,0,pano.width,pano.height);gl.useProgram(shaderProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform3f(uniforms.uFront,b.f.x,b.f.y,b.f.z);gl.uniform3f(uniforms.uRight,b.r.x,b.r.y,b.r.z);gl.uniform3f(uniforms.uUp,b.u.x,b.u.y,b.u.z);gl.uniform1f(uniforms.uTan,Math.tan(fov*Math.PI/360));gl.uniform1f(uniforms.uAspect,pano.width/pano.height);gl.uniform1f(uniforms.uFlat,flatMode?1:0);const rect=flatRect(pano.width,pano.height);gl.uniform2f(uniforms.uFlatScale,rect.w/pano.width,rect.h/pano.height);gl.uniform2f(uniforms.uFlatOffset,flatPan.x,-flatPan.y);gl.drawArrays(gl.TRIANGLES,0,6)}
function drawAnnotations(ctx,w,h,opts={}){
 const lines=opts.lines!==false,measures=opts.measures!==false,points=opts.points!==false,highlight=opts.highlight!==false;
 const scale=w/viewW;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.textAlign='center';ctx.textBaseline='middle';
 function routeDraw(r,index,drawing=false){if(!routeInReport(r,renderReportId)||!visible[r.category]||r.points.length<1)return;
 const width=(r.width||3)*scale;
 if(lines&&r.points.length>=2){for(let j=1;j<r.points.length;j++){
 const path=linePoints(r.points[j-1],r.points[j],w,h);ctx.beginPath();let started=false;for(const p of path){if(!p||Math.abs(p.x)>w*6||Math.abs(p.y)>h*6){started=false;continue}if(!started){ctx.moveTo(p.x,p.y);started=true}else ctx.lineTo(p.x,p.y)}
 ctx.lineWidth=width+(highlight&&index===selectedRoute&&j-1===selectedSegment?3*scale:0);ctx.strokeStyle=highlight&&index===selectedRoute&&j-1===selectedSegment?'#ffffff':r.color;ctx.setLineDash((PATTERNS[r.pattern||0]?.dash||[]).map(v=>v*scale));ctx.stroke();
 if(highlight&&index===selectedRoute&&j-1===selectedSegment){ctx.beginPath();started=false;for(const p of path){if(!p){started=false;continue}if(!started){ctx.moveTo(p.x,p.y);started=true}else ctx.lineTo(p.x,p.y)}ctx.lineWidth=width;ctx.strokeStyle=r.color;ctx.stroke()}
 }}ctx.setLineDash([]);
 if(measures){for(let j=1;j<r.points.length;j++){
 const len=r.lengths?.[j-1];if(len===null||len===undefined||!Number.isFinite(Number(len)))continue;
 const p=project(interp(r.points[j-1],r.points[j],.5),w,h);if(!p||p.x<0||p.x>w||p.y<0||p.y>h)continue;
 const fontSize=(r.labelSize||18)*scale;const y=p.y+(r.labelPosition==='below'?fontSize*1.15:r.labelPosition==='center'?0:-fontSize*.95);
 const txt=`${Number(len).toFixed(2)} m`;ctx.font=`700 ${fontSize}px Inter,Arial,sans-serif`;const metrics=ctx.measureText(txt),pad=7*scale,boxWidth=metrics.width+2*pad;
 ctx.fillStyle='rgba(16,19,23,.82)';ctx.beginPath();const x=p.x-boxWidth/2,by=y-fontSize*.76,bh=fontSize*1.45;if(ctx.roundRect)ctx.roundRect(x,by,boxWidth,bh,4*scale);else ctx.rect(x,by,boxWidth,bh);ctx.fill();ctx.fillStyle=r.labelColor||'#ffffff';ctx.fillText(txt,p.x,y)
 }}
 if(points&&(drawing||index===selectedRoute||opts.allPoints)){r.points.forEach((pt,j)=>{const p=project(pt,w,h);if(!p||!p.inside)return;ctx.beginPath();ctx.arc(p.x,p.y,(j===selectedVertex&&index===selectedRoute?9:5)*scale,0,Math.PI*2);ctx.fillStyle=j===selectedVertex&&index===selectedRoute?'#f0f3f8':'#171a1e';ctx.fill();ctx.lineWidth=2*scale;ctx.strokeStyle=drawing?'#ffffff':r.color;ctx.stroke();if(drawing&&j===0){ctx.beginPath();ctx.arc(p.x,p.y,12*scale,0,Math.PI*2);ctx.strokeStyle='#ffffff88';ctx.lineWidth=1.5*scale;ctx.stroke()}})}
 }
 routes.forEach((r,i)=>routeDraw(r,i));if(activeRoute&&opts.active!==false){routeDraw(activeRoute,-99,true);if(ghost&&activeRoute.points.length&&lines){const a=project(activeRoute.points.at(-1),w,h),b=project(ghost,w,h);if(a&&b){ctx.setLineDash([7*scale,5*scale]);ctx.strokeStyle='#f1f3f6aa';ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([])}}}
 renderObjects(ctx,w,h,opts);
 ctx.restore();
}
function queueFrame(){if(framePending)return;framePending=true;requestAnimationFrame(()=>{framePending=false;if(dirty){renderPano();dirty=false}if(inlineNoteIndex>=0)syncInlineNoteVisual(annotations[inlineNoteIndex]);ov.clearRect(0,0,viewW,viewH);drawAnnotations(ov,viewW,viewH,{lines:$('showLines').checked,measures:$('showMeasurements').checked,points:$('showVertices').checked});$('heading').textContent='N '+String(Math.round((yaw*rad%360+360)%360)).padStart(3,'0')+'°';$('zoomText').textContent=flatMode?'ZOOM '+Math.round(flatZoom*100)+'%':'FOV '+Math.round(fov)+'°';const zoomLabel=$('fvZoomValue');if(zoomLabel)zoomLabel.textContent=flatMode?Math.round(flatZoom*100)+'%':Math.round(78/fov*100)+'%';const slider=$('fvZoomRange');if(slider&&!slider.matches(':active'))slider.value=Math.round(clamp(flatMode?flatZoom:78/fov,1,6)*100)})}
function resetImage(src,name,blob){imageReady=false;$('viewerLoading').hidden=false;image=new Image();image.onload=()=>{imageReady=true;imageWidth=image.naturalWidth;imageHeight=image.naturalHeight;flatMode=Math.abs(imageWidth/imageHeight-2)>.2;if(flatMode){normalizeFlatPan()}if(flatMode)info('Foto convencional detectada: se presenta en vista frontal (sin navegación esférica).',true);$('photoPixels').textContent=imageWidth+' × '+imageHeight;uploadTexture();$('viewerLoading').hidden=true;dirty=true;queueFrame()};image.onerror=()=>{imageReady=false;$('viewerLoading').textContent='No se pudo abrir la fotografía. Selecciona Importar foto.';info('Error al cargar foto: '+name,true)};currentSrc=src;originalFilename=name;originalBlob=blob;image.src=src}
function currentStyle(){return{category:$('routeClass').value,color:$('lineColor').value,width:Number($('lineWidth').value),pattern:styleIndex,labelSize:Number($('labelSize').value),labelColor:$('labelColor').value,labelPosition:$('labelPosition').value}}
function routeNew(){return{reportId:activeReportId,id:Date.now()+'-'+Math.floor(Math.random()*100000),points:[],lengths:[],...currentStyle()}}
function setMode(value){const handBtn=$('fvHandPan');if(handBtn){handBtn.classList.toggle('is-active',value==='navigate');handBtn.setAttribute('aria-pressed',String(value==='navigate'))}if(value!=='annotate'&&activePolygon)cancelPolygon();mode=value;pointer=null;ghost=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===value));overlay.style.cursor=value==='draw'||value==='annotate'?'crosshair':value==='select'||value==='erase'?'pointer':'grab';$('btnDelete')?.classList.toggle('active',value==='erase');$('btnFinish').disabled=!(activeRoute&&activeRoute.points.length>=2);$('mobileFinish').hidden=value!=='draw';$('mobileFinish').disabled=!(activeRoute&&activeRoute.points.length>=2);$('drawInstruction').hidden=value!=='draw';$('hint').hidden=value==='draw';instruction();$('hint').textContent=value==='draw'?'Toca el primer punto, después cada cambio de dirección. Pulsa «Finalizar».':value==='select'?'Toca una línea, texto o figura para editar sus propiedades.':value==='erase'?'BORRAR · Toca una nota, figura, PNG o trayectoria para eliminarla.':'Arrastra la foto para girar. Rueda del mouse o usa + / − para acercarte.';queueFrame();window.dispatchEvent(new Event('fv360:quick-selection'))}
function instruction(){const n=activeRoute?.points.length||0;$('instructionTitle').textContent=n===0?'PASO 1 · Marca el primer punto':'PASO '+(n+1)+' · Marca el siguiente punto';$('instructionBody').textContent=n===0?'Haz clic o toca el inicio del recorrido eléctrico.':'Toca cada cambio de dirección. Al terminar pulsa ✓ Finalizar.';$('instruction-dot')?.remove;$('btnFinish').disabled=n<2;$('mobileFinish').disabled=n<2}
function finish(){if(!activeRoute||activeRoute.points.length<2){if(activeRoute)info('Marca al menos dos puntos para terminar la línea.',true);return}snapshot();routes.push(activeRoute);selectedRoute=routes.length-1;selectedSegment=activeRoute.lengths.length-1;selectedVertex=-1;activeRoute=null;ghost=null;setMode('select');syncSelection();updateTotals();info('Trayectoria guardada. Toca un tramo para escribir su distancia real; puedes arrastrar los vértices para corregir.',true)}
function cancel(){activeRoute=null;ghost=null;setMode('navigate');info('Trazado en curso cancelado. Las rutas guardadas siguen intactas.')}
function getHit(p){let bestVert={d:Infinity,route:-1,vertex:-1},bestSeg={d:Infinity,route:-1,segment:-1};routes.forEach((r,i)=>{if(!routeInReport(r)||!visible[r.category])return;r.points.forEach((pt,j)=>{const q=project(pt);if(!q)return;const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bestVert.d)bestVert={d,route:i,vertex:j}});for(let j=1;j<r.points.length;j++){const path=linePoints(r.points[j-1],r.points[j],viewW,viewH);for(let k=1;k<path.length;k++){if(!path[k]||!path[k-1])continue;const d=pointDistance(p.x,p.y,path[k-1],path[k]);if(d<bestSeg.d)bestSeg={d,route:i,segment:j-1}}}});if(bestVert.d<19)return{type:'vertex',...bestVert};if(bestSeg.d<21)return{type:'segment',...bestSeg};return null}
function syncSelection(){if(selectedRoute<0||!routes[selectedRoute]){$('selectedDescriptor').textContent='Ningún tramo seleccionado';$('distance').value='';$('editHelp').textContent='Elige «Trazar línea» y toca el primer punto sobre la fotografía.';queueFrame();window.dispatchEvent(new Event('fv360:quick-selection'));return}
 const r=routes[selectedRoute];$('routeClass').value=r.category;$('lineColor').value=r.color;$('colorHex').textContent=r.color.toUpperCase();$('lineWidth').value=String(r.width);$('labelSize').value=String(r.labelSize);$('labelColor').value=r.labelColor;$('labelPosition').value=r.labelPosition;styleIndex=r.pattern||0;markPattern();$('distance').value=selectedSegment>=0?(r.lengths[selectedSegment]??''):'';$('selectedDescriptor').textContent=`Ruta ${selectedRoute+1} · Tramo ${selectedSegment+1} / ${r.lengths.length}`+(selectedVertex>=0?` · Vértice ${selectedVertex+1}`:'');$('editHelp').textContent='Arrastra un punto blanco de la ruta en la foto para corregir su posición.';queueFrame();window.dispatchEvent(new Event('fv360:quick-selection'))}
function markPattern(){document.querySelectorAll('.pattern').forEach((b,i)=>b.classList.toggle('active',i===styleIndex));if($('selectedPatternLabel'))$('selectedPatternLabel').textContent=PATTERNS[styleIndex]?.name||'Continua'}
function updateTotals(){mobileNotify();let total=0,segments=0,measured=0;const values={};CATEGORIES.forEach(c=>values[c.id]={meters:0,measured:0,pending:0,routes:0});allPhotoRoutes().forEach(({r})=>{const v=values[r.category]||values.OTHER;v.routes++;(r.lengths||[]).forEach(x=>{segments++;if(x!==null&&x!==undefined&&Number.isFinite(Number(x))&&Number(x)>=0){const m=Number(x);measured++;total+=m;v.meters+=m;v.measured++}else v.pending++})});$('metricRoutes').textContent=allPhotoRoutes().length;$('metricMeasured').textContent=measured+' / '+segments;$('metricTotal').innerHTML=total.toFixed(2)+' <small>m</small>';$('grandTotal').innerHTML=total.toFixed(2)+' <small>m</small>';$('totalsFooter').textContent=(segments-measured)+' tramos pendientes de medir · '+allPhotoRoutes().length+' rutas trazadas en '+photos.length+' fotos';
 $('totalRows').innerHTML=CATEGORIES.map(c=>`<div class="total-item"><span class="total-dot" style="background:${c.color}"></span><div><strong>${c.name}</strong><small>${values[c.id].measured} medidos · ${values[c.id].pending} pendientes · ${values[c.id].routes} rutas</small></div><span>${values[c.id].meters.toFixed(2)} m</span></div>`).join('');
 $('layerList').innerHTML=CATEGORIES.map(c=>`<div class="layer-item"><span class="layer-swatch" style="background:${c.color}"></span><span class="layer-name">${c.name}</span><span class="layer-length">${values[c.id].meters.toFixed(2)} m</span><input class="layer-toggle" data-layer="${c.id}" type="checkbox" ${visible[c.id]?'checked':''} aria-label="Mostrar ${c.name}"/></div>`).join('');document.querySelectorAll('[data-layer]').forEach(t=>t.onchange=()=>{visible[t.dataset.layer]=t.checked;queueFrame()});if($('cadPreview')&&$('cadCategories'))updateCADPreview();queueFrame()}
let lastEraseKind='route';
function removeSelected(){
 if(mode==='annotate'&&selectedAnnotation>=0&&annotations[selectedAnnotation]){deleteAnnotation();return}
 if(selectedRoute>=0&&routes[selectedRoute]){lastEraseKind='route';snapshot();routes.splice(selectedRoute,1);selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;syncSelection();updateTotals();info('Ruta eliminada.',true);return}
 if(selectedAnnotation>=0&&annotations[selectedAnnotation]){deleteAnnotation();return}
 if(mode!=='erase'){setMode('erase');info('Modo borrar activo: toca cualquier texto, forma, imagen PNG o trayectoria para eliminarla.',true);if(matchMedia('(max-width:820px)').matches)requestAnimationFrame(()=>viewer.scrollIntoView({behavior:'instant',block:'center'}))}
 else info('Toca el elemento que deseas borrar. Para salir pulsa Navegar o Editar.',true);
}
function undo(){if((mode==='annotate'||(mode==='erase'&&lastEraseKind==='annotation'))&&annotationHistory.length){annotations=JSON.parse(annotationHistory.pop());const p=photoById(currentPhotoId);if(p)p.annotations=annotations;setSelectedAnnotation(-1);annotationChanged();return}if(activeRoute&&activeRoute.points.length){activeRoute.points.pop();if(activeRoute.lengths.length>=activeRoute.points.length)activeRoute.lengths.pop();if(!activeRoute.points.length)activeRoute=null;instruction();queueFrame();return}if(!history.length)return info('No hay más cambios para deshacer.',true);routes=JSON.parse(history.pop());selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;syncSelection();updateTotals();info('Última modificación deshecha.')}
function addVertex(){if(selectedRoute<0||selectedSegment<0)return info('Selecciona primero un segmento.',true);const r=routes[selectedRoute],j=selectedSegment;const mid=interp(r.points[j],r.points[j+1],.5);snapshot();r.points.splice(j+1,0,mid);r.lengths.splice(j,1,null,null);selectedVertex=j+1;selectedSegment=j;syncSelection();updateTotals();info('Vértice añadido. Los dos nuevos tramos quedan pendientes de medir.',true)}
function removeVertex(){if(selectedRoute<0||selectedVertex<0)return info('Selecciona un punto de la ruta antes de quitarlo.',true);const r=routes[selectedRoute],j=selectedVertex;if(r.points.length<=2)return info('Una ruta necesita al menos dos puntos. Puedes borrar toda la ruta.',true);snapshot();r.points.splice(j,1);if(j===0)r.lengths.shift();else if(j>=r.points.length)r.lengths.pop();else r.lengths.splice(j-1,2,null);selectedVertex=-1;selectedSegment=Math.min(j,r.lengths.length-1);syncSelection();updateTotals();info('Vértice eliminado. Verifica las medidas de los tramos modificados.',true)}
function applyStyle(){const color=$('lineColor').value;$('colorHex').textContent=color.toUpperCase();if(selectedRoute<0){queueFrame();return}snapshot();Object.assign(routes[selectedRoute],currentStyle());updateTotals()}
function selectTab(id){document.querySelectorAll('[data-tab]').forEach(b=>{const sel=b.dataset.tab===id;b.classList.toggle('active',sel);b.setAttribute('aria-selected',String(sel))});document.querySelectorAll('[data-content]').forEach(el=>el.classList.toggle('active',el.dataset.content===id));}
function focusSelectionTab(id){selectTab(id);window.dispatchEvent(new CustomEvent('fv360:selection-context',{detail:{tab:id}}));}
let fvPageSwipe=null;
function beginFVPageSwipe(e){
 fvPageSwipe={id:e.pointerId,startX:e.clientX,startY:e.clientY,scrollLastClientY:e.clientY,scrolling:false};
 try{overlay.setPointerCapture(e.pointerId)}catch(_){ }
}
function updateFVPageSwipe(e,state){
 if(!state)return false;
 const dx=e.clientX-state.startX,dy=e.clientY-state.startY;
 if(!state.scrolling&&Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)*1.15)state.scrolling=true;
 if(state.scrolling){const delta=e.clientY-state.scrollLastClientY;if(delta)window.scrollBy(0,-delta);}
 state.scrollLastClientY=e.clientY;return state.scrolling;
}
function functionallyClearFVPageSwipe(e){
 if(fvPageSwipe?.id!==e.pointerId)return false;
 fvPageSwipe=null;try{overlay.releasePointerCapture(e.pointerId)}catch(_){}return true;
}
function pointerDown(e){if(!imageReady)return;if(e.button!==undefined&&e.button!==0)return;if(inlineNoteIndex>=0)closeInlineNoteEditor();e.preventDefault();const p=screenPoint(e);
 // A touch started on empty viewer space is reserved for page scrolling in editing mode.
 // Do not deselect a route or note merely because the user wants to reach the properties.
 if(e.pointerType==='touch'&&((mode==='annotate'&&annotationAction==='edit'&&!objectHit(p)&&!getHit(p))||(mode==='erase'&&!objectHit(p)&&!getHit(p)))){beginFVPageSwipe(e);return;}
if(mode==='navigate'&&e.pointerType==='touch'){fvTouchPointers.set(e.pointerId,p);if(fvTouchPointers.size===2){const a=[...fvTouchPointers.values()];fvPinchDistance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);pointer=null;return}}if(mode==='erase'){
  const obj=objectHit(p);if(obj){setSelectedAnnotation(obj.index);deleteAnnotation();if(matchMedia('(max-width:820px)').matches)requestAnimationFrame(()=>viewer.scrollIntoView({behavior:'instant',block:'center'}));return}
  const route=getHit(p);if(route){selectedRoute=route.route;selectedAnnotation=-1;removeSelected();return}
  info('Toca una línea, nota, figura o imagen para borrarla.',true);return
 }pointer={id:e.pointerId,lastX:p.x,lastY:p.y,startX:p.x,startY:p.y,startClientX:e.clientX,startClientY:e.clientY,lastClientY:e.clientY,scrollLastClientY:e.clientY,mode,moved:false,hit:null,editing:false,scrolling:false};overlay.setPointerCapture(e.pointerId);
 if(mode==='annotate'){
  if(annotationAction==='edit'&&!objectHit(p)&&getHit(p)){const handover=pointer;setMode('select');pointer=handover;pointer.mode='select';const hit=getHit(p);pointer.hit=hit;
   selectedRoute=hit.route;selectedVertex=hit.type==='vertex'?hit.vertex:-1;selectedSegment=hit.type==='segment'?hit.segment:Math.min(hit.vertex,routes[hit.route].lengths.length-1);
   syncSelection();focusSelectionTab('styles');if(hit.type==='vertex'){pointer.editing=true;pointer.snapshotted=false}return}
  pointer.ann=annotationPointerDown(p);if(annotationAction==='edit'&&pointer.ann?.operation==='move')overlay.style.cursor='grabbing';return} 
 if(mode==='select'){
 const hit=getHit(p);pointer.hit=hit;
 if(!hit){const object=objectHit(p);if(object){const handover=pointer;setAnnotationAction('edit');pointer=handover;pointer.mode='annotate';pointer.ann=annotationPointerDown(p);return}}
 if(hit){selectedAnnotation=-1;selectedRoute=hit.route;focusSelectionTab('styles');selectedVertex=hit.type==='vertex'?hit.vertex:-1;selectedSegment=hit.type==='segment'?hit.segment:Math.min(hit.vertex,routes[hit.route].lengths.length-1);syncSelection();if(hit.type==='vertex'){pointer.editing=true;pointer.snapshotted=false;overlay.style.cursor='grabbing'}}else if(e.pointerType!=='touch'){selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;syncSelection()}}
}
function pointerMove(e){if(!imageReady)return;
 if(fvPageSwipe?.id===e.pointerId){updateFVPageSwipe(e,fvPageSwipe);return}
 const p=screenPoint(e);if(mode==='navigate'&&fvTouchPointers.has(e.pointerId)){fvTouchPointers.set(e.pointerId,p);if(fvTouchPointers.size>=2){const a=[...fvTouchPointers.values()],distance=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(fvPinchDistance>5&&distance>5)zoomView(clamp(distance/fvPinchDistance,.8,1.2));fvPinchDistance=distance;return}}if(!pointer||pointer.id!==e.pointerId){if(mode==='draw'&&activeRoute){ghost=dirAt(p.x,p.y);queueFrame()}return}
 const dx=p.x-pointer.lastX,dy=p.y-pointer.lastY;
 // Touch swipe from a non-draggable place scrolls the document, not the editor.
 // Vertices and selected shape handles keep their normal drag behavior.
 if(e.pointerType==='touch'&&!pointer.editing&&(pointer.mode==='select'||pointer.mode==='draw')){
   if(updateFVPageSwipe(e,pointer)){pointer.scrolling=true;pointer.moved=true;pointer.lastX=p.x;pointer.lastY=p.y;return;}
 }
 if(Math.hypot(p.x-pointer.startX,p.y-pointer.startY)>6)pointer.moved=true;
 if(pointer.mode==='annotate'&&pointer.ann&&pointer.moved)annotationPointerMove(pointer.ann,p);
 if(pointer.mode==='navigate'&&pointer.moved){if(flatMode){flatPan.x+=dx/viewW;flatPan.y+=dy/viewH;normalizeFlatPan()}else{yaw-=dx/viewH*1.36;pitch=clamp(pitch+dy/viewH*1.36,-1.52,1.52)}dirty=true;queueFrame()}
 if(pointer.mode==='select'&&pointer.editing&&pointer.moved){if(!pointer.snapshotted){snapshot();pointer.snapshotted=true}const movedPoint=dirAt(p.x,p.y);if(movedPoint)routes[selectedRoute].points[selectedVertex]=movedPoint;queueFrame()}
 pointer.lastX=p.x;pointer.lastY=p.y;
}
function pointerUp(e){if(functionallyClearFVPageSwipe(e))return;if(fvTouchPointers.has(e.pointerId)){fvTouchPointers.delete(e.pointerId);if(fvTouchPointers.size<2)fvPinchDistance=0}if(!pointer||pointer.id!==e.pointerId)return;const p=screenPoint(e);const move=pointer.moved;const original=pointer;pointer=null;try{overlay.releasePointerCapture(e.pointerId)}catch{}overlay.style.cursor=mode==='annotate'&&annotationAction==='edit'?'grab':mode==='draw'||mode==='annotate'?'crosshair':mode==='select'?'pointer':'grab';
 if(original.scrolling)return; if(original.mode==='annotate'){const a=original.ann;if(a&&a.operation==='move'&&!move&&annotations[a.hit]?.type==='note'&&a.wasSelected)openInlineNoteEditor(a.hit);else annotationPointerUp(a,p);return}
 if(mode==='draw'&&!move){const newPoint=dirAt(p.x,p.y);if(!newPoint){info('Toca dentro de la fotografía para marcar el punto.',true);return}if(!activeRoute)activeRoute=routeNew();activeRoute.points.push(newPoint);if(activeRoute.points.length>=2)activeRoute.lengths.push(null);ghost=null;instruction();queueFrame();if(activeRoute.points.length===1)info('Primer punto marcado. Toca ahora el siguiente punto o cambio de dirección.',true);else info('Punto '+activeRoute.points.length+' colocado. Puedes añadir más o finalizar la ruta.')}
 if(original.mode==='navigate'&&!move){const hit=objectHit(p);if(hit&&annotations[hit.index]?.type==='note'&&(!hit.handle||hit.handle.kind==='move')){setAnnotationAction('edit');setSelectedAnnotation(hit.index);return}}
 if(original.mode==='navigate'&&temporaryHandMode){const was=temporaryHandMode;temporaryHandMode=null;setMode(was)} // Pure view movement never changes routes.
 if(original.mode==='select'&&original.editing&&move){mobileNotify();info('Vértice reposicionado. Las medidas reales se conservaron; verifica si cambiaron en campo.',true)}
}
async function loadPhotoFile(file){if(file)await addPhotos([file])}
function reportFileTag(){return (activeReport()?.name||'REPORTE').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').slice(0,45)}
function slug(){return ($('projectName').value||'FV360').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').slice(0,70)}
function download(name,blobOrText,mime='application/octet-stream'){const blob=blobOrText instanceof Blob?blobOrText:new Blob([blobOrText],{type:mime});const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),12000)}
function canvasBlob(canvas,mime='image/png'){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo convertir la vista en una imagen.')),mime,1))}
// Fallback for PNG exports if GPU/WebGL isn't available: preserve the real photo.
function renderCPU(ctx,w,h){
 if(flatMode){ctx.fillStyle='#0c0f13';ctx.fillRect(0,0,w,h);const r=flatRect(w,h);ctx.drawImage(image,r.x,r.y,r.w,r.h);return}
 const src=document.createElement('canvas');src.width=Math.min(imageWidth,4096);src.height=Math.max(1,Math.round(src.width*imageHeight/imageWidth));
 const sourceCtx=src.getContext('2d',{willReadFrequently:true});sourceCtx.drawImage(image,0,0,src.width,src.height);
 const input=sourceCtx.getImageData(0,0,src.width,src.height).data,output=ctx.createImageData(w,h),dest=output.data;
 const b=basis(),tan=Math.tan(fov*Math.PI/360),asp=w/h,pi=Math.PI;
 for(let y=0;y<h;y++){
   const sy=(1-2*(y+.5)/h)*tan;
   for(let x=0;x<w;x++){
     const sx=(2*(x+.5)/w-1)*tan*asp;
     const xx=b.f.x+b.r.x*sx+b.u.x*sy,yy=b.f.y+b.r.y*sx+b.u.y*sy,zz=b.f.z+b.r.z*sx+b.u.z*sy;
     const length=Math.hypot(xx,yy,zz),lon=Math.atan2(xx,-zz),lat=Math.asin(clamp(yy/length,-1,1));
     const tx=((Math.round((.5+lon/(2*pi))*src.width)%src.width)+src.width)%src.width;
     const ty=clamp(Math.round((.5-lat/pi)*src.height),0,src.height-1);
     const a=(ty*src.width+tx)*4,c=(y*w+x)*4;
     dest[c]=input[a];dest[c+1]=input[a+1];dest[c+2]=input[a+2];dest[c+3]=255;
   }
 }
 ctx.putImageData(output,0,0);
}
async function composite(opts,forceWidth,forceHeight){await readyObjectImages();if(!imageReady)throw Error('Primero carga una imagen 360°.');const target=forceWidth||Number($('exportResolution').value)||2560;let w=Math.min(target,gl?gl.getParameter(gl.MAX_RENDERBUFFER_SIZE):target),h=forceHeight?Math.max(1,Math.round(forceHeight*w/target)):Math.max(1,Math.round(w*viewH/viewW));if(flatMode&&!forceHeight){w=Math.min(w,imageWidth);h=Math.round(w*imageHeight/imageWidth);const cap=6144;if(h>cap){w=Math.round(w*cap/h);h=cap}}const origW=pano.width,origH=pano.height;
 const result=document.createElement('canvas');result.width=w;result.height=h;const ctx=result.getContext('2d',{alpha:false});
 try{if(flatMode){renderCPU(ctx,w,h)}else if(gl&&texture){pano.width=w;pano.height=h;renderPano();ctx.drawImage(pano,0,0,w,h)}else{try{renderCPU(ctx,w,h)}catch(err){console.warn('Render CPU no disponible',err);ctx.drawImage(image,0,0,w,h)}}if(opts.lines||opts.measures||opts.points||opts.annotations){drawAnnotations(ctx,w,h,{lines:opts.lines,measures:opts.measures,points:opts.points,annotations:opts.annotations,highlight:false,active:false,allPoints:true})}return result}finally{pano.width=origW;pano.height=origH;dirty=true;queueFrame()}}
async function exportPNG(clean=false,quick=false){if(!imageReady)return info('Carga una fotografía antes de exportar.',true);try{info('Preparando fotografía en alta resolución…');const opts=clean?{lines:false,measures:false,points:false,annotations:false}:quick?{lines:true,measures:$('showMeasurements').checked,points:false,annotations:true}:{lines:$('exportLines').checked,measures:$('exportMeasures').checked,points:$('exportPoints').checked,annotations:$('exportAnnotations').checked};
 const c=await composite(opts);const b=await canvasBlob(c);download(slug()+(clean?'_sin_anotaciones':opts.measures?'_lineas_y_medidas':'_lineas_sin_medidas')+'.png',b,'image/png');info(`PNG exportado ${c.width} × ${c.height}, con fotografía y anotaciones seleccionadas.`,true)}catch(e){console.error(e);info('Error al exportar PNG: '+e.message,true)}}
function originalDownload(){if(originalBlob){download(originalFilename,originalBlob,originalBlob.type);return}const a=document.createElement('a');a.href=currentSrc;a.download=originalFilename;document.body.appendChild(a);a.click();a.remove();info('Descargando fotografía original sin modificar.',true)}
const csvCell=v=>'"'+String(v).replace(/"/g,'""')+'"';
function buildCsv(summary=false){const all=allPhotoRoutes(),rows=summary?[['Capa','Longitud medida (m)','Tramos medidos','Tramos pendientes','Rutas']]:[['Fotografía','Ruta','Capa','Tramo','Longitud real (m)','Estado']];if(summary){CATEGORIES.forEach(c=>{const rr=all.filter(x=>x.r.category===c.id).map(x=>x.r),lens=rr.flatMap(r=>r.lengths||[]);rows.push([c.name,lens.reduce((a,v)=>a+(v!=null?Number(v):0),0).toFixed(2),lens.filter(v=>v!=null).length,lens.filter(v=>v==null).length,rr.length])})}else all.forEach(({r,photo})=>(r.lengths||[]).forEach((v,j)=>rows.push([photo.name,photo.routes.indexOf(r)+1,category(r.category).name,j+1,v??'',v!=null?'MEDIDO':'PENDIENTE'])));return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')}
function exportDXF(){return exportCAD()}
async function saveProject(){return saveProjectZip()}
async function openProject(file){return loadProjectV3(file)}
async function report(){return reportMultipage()}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
/* FV360 v3: fotografías por proyecto, vistas guardadas y reporte multipágina. */
let photos=[],currentPhotoId=null,reportViews=[],idSerial=1,previewQueue=Promise.resolve();
// An independent report contains its own sheets, routes and technical annotations.
// Untagged objects from older FV360 projects belong to the first report.
let reports=[],activeReportId=null,renderReportId=null;
function activeReport(){return reports.find(r=>r.id===activeReportId)||reports[0]||null}
function routeInReport(route,which=renderReportId||activeReportId){return route?.reportId?route.reportId===which:which===reports[0]?.id}
function annotationInReport(a,which=renderReportId||activeReportId){return a?.reportId?a.reportId===which:which===reports[0]?.id}
function photosForReport(which=activeReportId){
 const r=reports.find(r=>r.id===which);return r?photos.filter(p=>(r.photoIds||[]).includes(p.id)):[];
}
function attachPhotoToReport(id,which=activeReportId,createView=false){
 const r=reports.find(x=>x.id===which),p=photoById(id);if(!r||!p)return;
 if(!Array.isArray(r.photoIds))r.photoIds=[];
 if(!r.photoIds.includes(id))r.photoIds.push(id);
 if(createView&&which===activeReportId&&!reportViews.some(v=>v.photoId===id))createReportView(p,true);
 if(which===activeReportId){renderPhotos();renderLibraryPhotos();mobileNotifySafe();}
}
async function detachPhotoFromReport(id){
 const r=activeReport();if(!r||!(r.photoIds||[]).includes(id))return;
 if(!await FV360Dialog.confirm('¿Retirar esta fotografía solo de «'+r.name+'»? Las fotografías originales, rutas y notas se conservarán en la biblioteca y podrás volver a añadirla. Las láminas de este reporte que usen la foto se retirarán.'))return;
 persistPhoto();r.photoIds=r.photoIds.filter(x=>x!==id);reportViews=reportViews.filter(v=>v.photoId!==id);saveActiveReportViews();
 if(currentPhotoId===id){const first=photosForReport()[0];if(first){currentPhotoId=null;switchPhoto(first.id)}else window.FV360Bridge?.clearViewer()}
 renderPhotos();renderLibraryPhotos();renderReportViews();updateTotals();mobileNotifySafe();
 info('Foto retirada del reporte; sigue disponible en la biblioteca general.',true);
}
function renderLibraryPhotos(){
 const host=$('globalPhotoList');if(!host)return;
 const inReport=new Set(activeReport()?.photoIds||[]);
 host.innerHTML=photos.map(p=>`<div class="fv-media-card"><img src="${p.src}" alt="${esc(p.name)}" loading="lazy"><div class="fv-media-detail"><strong>${esc(p.caption)}</strong><small>${esc(p.name)} · ${photoType(p)} · ${p.width||'?'}×${p.height||'?'}</small><div class="fv-media-actions"><span class="fv-media-status ${inReport.has(p.id)?'is-added':''}">${inReport.has(p.id)?'EN ESTE REPORTE':'BIBLIOTECA GENERAL'}</span><button type="button" data-fv-use-photo="${p.id}">${inReport.has(p.id)?'Abrir en reporte':'＋ Añadir al reporte'}</button><button type="button" data-fv-delete-global="${p.id}" class="fv-media-danger">Eliminar original</button></div></div></div>`).join('')||'<p class="helper">Todavía no hay fotografías. Añade una desde el teléfono o la computadora.</p>';
 host.querySelectorAll('[data-fv-use-photo]').forEach(b=>b.onclick=()=>{const id=b.dataset.fvUsePhoto,added=inReport.has(id);if(!added)attachPhotoToReport(id,activeReportId,true);if(currentPhotoId===id){renderPhotos();renderLibraryPhotos()}else switchPhoto(id);info(added?'Fotografía abierta.':'Fotografía incorporada a '+activeReport().name+'.',true)});
 host.querySelectorAll('[data-fv-delete-global]').forEach(b=>b.onclick=()=>removePhoto(b.dataset.fvDeleteGlobal));
 const total=$('globalPhotoCount');if(total)total.textContent=photos.length+' fotografías originales · '+inReport.size+' vinculadas al reporte activo';
}
function ensureReports(){
 if(reports.length)return;
 const r={id:newId('reporte'),name:'Reporte 01 - Propuesta principal',views:reportViews,photoIds:photos.map(p=>p.id)};
 reports=[r];activeReportId=r.id;renderReportId=r.id;
}
function saveActiveReportViews(){const current=activeReport();if(current)current.views=reportViews}
function allReportsForSave(){saveActiveReportViews();return reports.map(r=>({id:r.id,name:r.name,photoIds:[...(r.photoIds||[])],views:(r.views||[]).map(({thumb,...v})=>({...v,reportId:r.id}))}))}
function loadReports(raw,selected,oldViews){
 reports=Array.isArray(raw)&&raw.length?raw.map((r,i)=>({id:r.id||newId('reporte'),name:r.name||`Reporte ${String(i+1).padStart(2,'0')}`,views:Array.isArray(r.views)?r.views:[],photoIds:Array.isArray(r.photoIds)?r.photoIds.filter(id=>photos.some(p=>p.id===id)):null})):[{id:newId('reporte'),name:'Reporte 01 - Propuesta principal',views:oldViews||[],photoIds:null}];
 // Migración v8: reconstruir la lista por láminas, rutas y objetos; el primer reporte
 // conserva todas las fotos originales de los proyectos antiguos.
 reports.forEach((r,i)=>{if(r.photoIds!==null)return;
  const linked=new Set((r.views||[]).map(v=>v.photoId));
  for(const p of photos){if((p.routes||[]).some(x=>x.reportId===r.id||(!x.reportId&&i===0))||(p.annotations||[]).some(x=>x.reportId===r.id||(!x.reportId&&i===0)))linked.add(p.id)}
  r.photoIds=i===0?photos.map(p=>p.id):[...linked];
 });
 activeReportId=reports.some(r=>r.id===selected)?selected:reports[0].id;
 renderReportId=activeReportId;reportViews=activeReport().views;
 for(const r of reports)for(const v of r.views||[])v.reportId=r.id;
 updateReportControls();
}
function updateReportControls(){
 const select=$('reportSelector'),label=$('activeReportLabel'),name=$('reportTitle');if(!select)return;
 select.innerHTML=reports.map((r,i)=>`<option value="${esc(r.id)}">${String(i+1).padStart(2,'0')} - ${esc(r.name)}</option>`).join('');
 select.value=activeReportId;const active=activeReport();if(name)name.value=active?.name||'';
 if(label)label.textContent=`REPORTE ACTIVO: ${active?.name||'Sin reporte'}`;
 const index=reports.findIndex(r=>r.id===activeReportId);
 document.body.dataset.reportTheme=String(Math.max(0,index)%6+1);
 const tag=$('fvReportThemeName');if(tag)tag.textContent=`TEMA ${String(index+1).padStart(2,'0')} · ${active?.name||'Reporte'}`;
 const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=['#111214','#252c35','#152432','#1a2d28','#28232e','#2d2925'][Math.max(0,index)%6];
 if($('reportRemove'))$('reportRemove').disabled=reports.length<=1;
}
async function switchReport(id){
 closeInlineNoteEditor();
 if(id===activeReportId)return;
 const target=reports.find(r=>r.id===id);if(!target)return;
 if(activeRoute?.points?.length&&!await FV360Dialog.confirm('Hay una trayectoria sin finalizar. ¿Descartarla y cambiar de reporte?')){updateReportControls();return}
 persistPhoto();if(reports.some(r=>r.id===activeReportId))saveActiveReportViews();activeReportId=id;renderReportId=id;reportViews=target.views||[];
 activeRoute=null;selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;selectedAnnotation=-1;
 history=[];annotationHistory=[];setMode('navigate');syncSelection();renderAnnotationList();
 updateReportControls();
 const next=photosForReport()[0];
 if(next&&!((target.photoIds||[]).includes(currentPhotoId))){currentPhotoId=null;switchPhoto(next.id)}
 else if(!next)window.FV360Bridge?.clearViewer();
 renderPhotos();renderLibraryPhotos();renderReportViews();updateTotals();dirty=true;queueFrame();
 info('Ahora editas: '+target.name+'. Las rutas y los totales de este reporte son independientes.',true);
}
function addReport(copy=false){
 persistPhoto();saveActiveReportViews();
 const source=activeReport();const number=reports.length+1;
 const r={id:newId('reporte'),name:copy?`${source.name} - copia`:`Reporte ${String(number).padStart(2,'0')} - Nueva propuesta`,views:[],photoIds:copy?[...(source.photoIds||[])]:[]};
 if(copy){
  r.views=(source.views||[]).map(v=>({...structuredClone(v),id:newId('vista'),reportId:r.id}));
  for(const p of photos){
   const routeCopies=(p.routes||[]).filter(x=>routeInReport(x,source.id)).map(x=>({...structuredClone(x),id:newId('ruta'),reportId:r.id}));
   p.routes.push(...routeCopies);
   const objects=(p.annotations||[]).filter(x=>annotationInReport(x,source.id)).map(x=>({...structuredClone(x),id:newId('obj'),reportId:r.id}));
   p.annotations.push(...objects);
  }
 }
 reports.push(r);switchReport(r.id);
 info(copy?'Reporte duplicado con sus rutas, notas y laminas.':'Reporte independiente creado. Agrega sus propias trayectorias y vistas.',true);
}
async function deleteReport(){
 if(reports.length<2)return;
 const old=activeReport();if(!await FV360Dialog.confirm(`Eliminar el reporte "${old.name}" y sus rutas, notas y láminas? Las fotos originales y los otros reportes permanecen.`))return;
 persistPhoto();reports=reports.filter(r=>r.id!==old.id);
 for(const p of photos){p.routes=(p.routes||[]).filter(r=>r.reportId!==old.id);p.annotations=(p.annotations||[]).filter(a=>a.reportId!==old.id)}
 routes=photoById(currentPhotoId)?.routes||[];annotations=photoById(currentPhotoId)?.annotations||[];
 activeReportId=null;switchReport(reports[0].id);
}
function initReportsUI(){
 ensureReports();$('reportSelector').addEventListener('change',e=>switchReport(e.target.value));
 $('reportNew').onclick=()=>addReport(false);$('reportDuplicate').onclick=()=>addReport(true);
 $('reportRemove').onclick=deleteReport;
 $('reportTitle').addEventListener('change',e=>{const r=activeReport();if(!r)return;r.name=e.target.value.trim().slice(0,90)||r.name;updateReportControls();renderReportViews();mobileNotifySafe()});
 updateReportControls();
}
function mobileNotifySafe(){window.dispatchEvent(new Event('fv360:changed'))}

const newId=prefix=>prefix+'_'+Date.now().toString(36)+'_'+(idSerial++);
const photoById=id=>photos.find(p=>p.id===id);
function persistPhoto(){const p=photoById(currentPhotoId);if(!p)return;p.routes=routes;p.annotations=annotations;p.orientation={yaw,pitch,fov,flatZoom,flatPan:{...flatPan}};p.caption=$('viewName').value||p.caption}
function allPhotoRoutes(){persistPhoto();return photos.flatMap(p=>(p.routes||[]).filter(r=>routeInReport(r)).map(r=>({r,photo:p}))) }
function photoType(p){return p.width&&p.height&&Math.abs(p.width/p.height-2)<.2?'360°':'frontal'}
function esc(s){return escapeHTML(s??'')}
function renderPhotos(){mobileNotify();const el=$('photoList');if(!el)return;const scoped=photosForReport();const count=$('reportPhotoCount');if(count)count.textContent=scoped.length+' fotos de '+(activeReport()?.name||'reporte');el.innerHTML=scoped.map(p=>`<div class="collection-card ${p.id===currentPhotoId?'active-card':''}"><img class="collection-thumb" src="${p.src}" alt="${esc(p.name)}"><div class="collection-details"><div class="collection-title">${esc(p.caption)}</div><div class="collection-subtitle">${esc(p.name)} · ${photoType(p)} · ${p.width||'?'}×${p.height||'?'}</div><div class="collection-actions"><button type="button" data-open-photo="${p.id}">Abrir y dibujar</button><button type="button" data-remove-photo="${p.id}" class="danger">Retirar de reporte</button></div></div></div>`).join('');el.querySelectorAll('[data-open-photo]').forEach(b=>b.onclick=()=>switchPhoto(b.dataset.openPhoto));el.querySelectorAll('[data-remove-photo]').forEach(b=>b.onclick=()=>detachPhotoFromReport(b.dataset.removePhoto));renderLibraryPhotos();}
function moveReportCard(fromId,toId,after=false){
 const from=reportViews.findIndex(v=>v.id===fromId),to=reportViews.findIndex(v=>v.id===toId);
 if(from<0||to<0||from===to)return;
 const [v]=reportViews.splice(from,1);reportViews.splice(Math.max(0,Math.min(to,reportViews.length)),0,v);
 saveActiveReportViews();renderReportViews();mobileNotifySafe();info('Orden actualizado en '+activeReport().name+'.',true);
}
let reportDrag=null;
function clearReportDrag(){
 if(reportDrag?.scrollFrame)cancelAnimationFrame(reportDrag.scrollFrame);
 document.querySelectorAll('.fv-drag-source,.fv-drop-before,.fv-drop-after').forEach(x=>x.classList.remove('fv-drag-source','fv-drop-before','fv-drop-after'));
 document.removeEventListener('pointermove',reportDragMove);document.removeEventListener('pointerup',reportDragEnd);document.removeEventListener('pointercancel',clearReportDrag);reportDrag=null;
}
function reportDragMove(e){
 if(!reportDrag||e.pointerId!==reportDrag.pointerId)return;
 reportDrag.nowX=e.clientX;reportDrag.nowY=e.clientY;
 if(Math.hypot(e.clientX-reportDrag.x,e.clientY-reportDrag.y)<7)return;
 reportDrag.moved=true;updateReportDragTarget(e.clientX,e.clientY);
}
function updateReportDragTarget(x,y){
 if(!reportDrag||!reportDrag.moved)return;
 const row=document.elementFromPoint(x,y)?.closest('[data-report-card]');
 document.querySelectorAll('.fv-drop-before,.fv-drop-after').forEach(n=>n.classList.remove('fv-drop-before','fv-drop-after'));
 const target=row?.dataset.reportCard;if(!target||target===reportDrag.id){reportDrag.target=null;return}
 const bounds=row.getBoundingClientRect(),after=y>bounds.top+bounds.height/2;
 row.classList.add(after?'fv-drop-after':'fv-drop-before');reportDrag.target=target;reportDrag.after=after;
}
function reportAutoScroll(){
 if(!reportDrag)return;
 const y=reportDrag.nowY??reportDrag.y;
 const box=$('inspector'),scrollInside=getComputedStyle(box).overflowY;
 const panelCanScroll=/auto|scroll/.test(scrollInside)&&box.scrollHeight>box.clientHeight+4;
 const host=panelCanScroll?box:(document.scrollingElement||document.documentElement);
 const rect=panelCanScroll?box.getBoundingClientRect():{top:0,bottom:window.innerHeight};
 const bottom=Math.min(rect.bottom,window.innerHeight-(matchMedia('(max-width:620px)').matches?67:0));
 const top=Math.max(rect.top,0),margin=65;
 let step=0;
 if(y>bottom-margin)step=clamp((y-(bottom-margin))/3,0,24);
 else if(y<top+margin)step=-clamp(((top+margin)-y)/3,0,24);
 if(reportDrag.moved&&step){host.scrollTop+=step;updateReportDragTarget(reportDrag.nowX,reportDrag.nowY)}
 reportDrag.scrollFrame=requestAnimationFrame(reportAutoScroll);
}
function reportDragEnd(e){if(!reportDrag||e.pointerId!==reportDrag.pointerId)return;const {id,target,after}=reportDrag;clearReportDrag();if(target)moveReportCard(id,target,after)}
function startReportDrag(e){
 if(e.button!==undefined&&e.button!==0)return;e.preventDefault();const id=e.currentTarget.dataset.sortReport;
 clearReportDrag();reportDrag={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,target:null,after:false};
 e.currentTarget.closest('[data-report-card]')?.classList.add('fv-drag-source');
 document.addEventListener('pointermove',reportDragMove,{passive:false});document.addEventListener('pointerup',reportDragEnd);document.addEventListener('pointercancel',clearReportDrag);
 reportDrag.scrollFrame=requestAnimationFrame(reportAutoScroll);
}
function renderReportViews(){
 saveActiveReportViews();mobileNotifySafe();const el=$('reportList');if(!el)return;
 $('reportCount').textContent=`${reportViews.length} laminas - ${activeReport()?.name||'Reporte'}`;
 if($('reportIndicator'))$('reportIndicator').textContent=`EDITANDO ${activeReport()?.name||'Reporte'}`;
 el.innerHTML=reportViews.map((v,i)=>{const p=photoById(v.photoId);return `<div class="collection-card report-card fv-sort-card" data-report-card="${esc(v.id)}"><img class="collection-thumb" src="${v.thumb||(p?p.src:'')}" alt="Lamina ${i+1}"><div class="collection-details"><div class="fv-card-order"><button type="button" class="fv-sort-handle" data-sort-report="${esc(v.id)}" aria-label="Arrastrar lamina ${i+1} para reordenar" title="Arrastrar para ordenar">⠿</button><span>FOTO ${sheetNumber(i)} - ${esc(p?.name||'')}</span></div><div class="collection-title">${esc(v.title||'Vista')}</div><div class="mini-switches"><label class="cad-check"><input type="checkbox" data-report-lines="${v.id}" ${v.lines?'checked':''}> Trazos</label><label class="cad-check"><input type="checkbox" data-report-measures="${v.id}" ${v.measures?'checked':''}> Numeros</label><label class="cad-check"><input type="checkbox" data-report-objects="${v.id}" ${v.objects!==false?'checked':''}> Objetos</label></div><div class="collection-actions"><button data-edit-view="${v.id}">Editar foto</button><button data-download-view="${v.id}">PNG</button><button data-open-view="${v.id}">Ver</button><button data-move-up="${v.id}" ${i===0?'disabled':''} aria-label="Mover arriba">↑</button><button data-move-down="${v.id}" ${i===reportViews.length-1?'disabled':''} aria-label="Mover abajo">↓</button><button data-remove-view="${v.id}" class="danger" aria-label="Retirar lamina">×</button></div></div></div>`}).join('')||'<p class="helper">Este reporte esta vacio. Usa Guardar encuadre actual para agregar una foto.</p>';
 el.querySelectorAll('[data-report-lines]').forEach(b=>b.onchange=()=>{const v=reportViews.find(v=>v.id===b.dataset.reportLines);if(v){v.lines=b.checked;mobileNotifySafe()}});
 el.querySelectorAll('[data-report-measures]').forEach(b=>b.onchange=()=>{const v=reportViews.find(v=>v.id===b.dataset.reportMeasures);if(v){v.measures=b.checked;mobileNotifySafe()}});
 el.querySelectorAll('[data-report-objects]').forEach(b=>b.onchange=()=>{const v=reportViews.find(v=>v.id===b.dataset.reportObjects);if(v){v.objects=b.checked;mobileNotifySafe()}});
 el.querySelectorAll('[data-edit-view]').forEach(b=>b.onclick=()=>openSheetEditor(b.dataset.editView));
 el.querySelectorAll('[data-download-view]').forEach(b=>b.onclick=()=>downloadSheet(b.dataset.downloadView));
 el.querySelectorAll('[data-open-view]').forEach(b=>b.onclick=()=>openReportView(b.dataset.openView));
 el.querySelectorAll('[data-remove-view]').forEach(b=>b.onclick=()=>{reportViews=reportViews.filter(v=>v.id!==b.dataset.removeView);saveActiveReportViews();renderReportViews();info('Lamina retirada solo de este reporte.',true)});
 const reorder=(id,delta)=>{const i=reportViews.findIndex(v=>v.id===id),j=i+delta;if(j<0||j>=reportViews.length)return;[reportViews[i],reportViews[j]]=[reportViews[j],reportViews[i]];saveActiveReportViews();renderReportViews()};
 el.querySelectorAll('[data-move-up]').forEach(b=>b.onclick=()=>reorder(b.dataset.moveUp,-1));
 el.querySelectorAll('[data-move-down]').forEach(b=>b.onclick=()=>reorder(b.dataset.moveDown,1));
 el.querySelectorAll('[data-sort-report]').forEach(b=>{b.addEventListener('pointerdown',startReportDrag);b.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const id=b.dataset.sortReport;reorder(id,e.key==='ArrowUp'?-1:1);el.querySelector(`[data-sort-report="${id}"]`)?.focus()})});
}
function makeReportPreview(v){
 previewQueue=previewQueue.then(async()=>{
  const p=photoById(v.photoId);if(!p||!reportViews.some(item=>item.id===v.id))return;
  let im=p.img;if(!im||!im.complete||!im.naturalWidth){im=await new Promise((res,rej)=>{const x=new Image();x.onload=()=>res(x);x.onerror=rej;x.src=p.src});p.img=im;p.width=im.naturalWidth;p.height=im.naturalHeight}
  const w=360,h=203,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});
  if(Math.abs(im.naturalWidth/im.naturalHeight-2)>.2){(ctx.fillStyle='#16191d',ctx.fillRect(0,0,w,h),(()=>{const scale=Math.min(w/im.naturalWidth,h/im.naturalHeight),fw=im.naturalWidth*scale,fh=im.naturalHeight*scale;ctx.drawImage(im,(w-fw)/2,(h-fh)/2,fw,fh)})())}else{
   const inputCanvas=document.createElement('canvas');inputCanvas.width=Math.min(im.naturalWidth,4096);inputCanvas.height=Math.round(inputCanvas.width*im.naturalHeight/im.naturalWidth);const ic=inputCanvas.getContext('2d',{willReadFrequently:true});ic.drawImage(im,0,0,inputCanvas.width,inputCanvas.height);
   const input=ic.getImageData(0,0,inputCanvas.width,inputCanvas.height).data,out=ctx.createImageData(w,h),dst=out.data;
   const cy=Math.cos(v.yaw),sy=Math.sin(v.yaw),cp=Math.cos(v.pitch),sp=Math.sin(v.pitch);
   const front={x:sy*cp,y:sp,z:-cy*cp},right={x:cy,y:0,z:sy},up={x:-sy*sp,y:cp,z:cy*sp},tan=Math.tan(v.fov*Math.PI/360),asp=w/h;
   for(let iy=0;iy<h;iy++){const v0=(1-2*(iy+.5)/h)*tan;for(let ix=0;ix<w;ix++){const u0=(2*(ix+.5)/w-1)*tan*asp,px=front.x+right.x*u0+up.x*v0,py=front.y+right.y*u0+up.y*v0,pz=front.z+right.z*u0+up.z*v0;const lon=Math.atan2(px,-pz),lat=Math.asin(clamp(py/Math.hypot(px,py,pz),-1,1)),sx=((Math.round((.5+lon/(Math.PI*2))*inputCanvas.width)%inputCanvas.width)+inputCanvas.width)%inputCanvas.width,sy=clamp(Math.round((.5-lat/Math.PI)*inputCanvas.height),0,inputCanvas.height-1),idx=(sy*inputCanvas.width+sx)*4,d=(iy*w+ix)*4;dst[d]=input[idx];dst[d+1]=input[idx+1];dst[d+2]=input[idx+2];dst[d+3]=255}}
   ctx.putImageData(out,0,0)
  }
  v.thumb=c.toDataURL('image/jpeg',.78);renderReportViews();
 }).catch(e=>console.warn('Miniatura FV360:',e));return previewQueue
}
function createReportView(p,automatic=false){if(!(activeReport()?.photoIds||[]).includes(p.id))attachPhotoToReport(p.id);persistPhoto();const nth=reportViews.length+1;const v={id:newId('vista'),reportId:activeReportId,photoId:p.id,title:automatic?(p.caption||'Fotografía '+nth):($('viewName').value.trim()||'Vista '+nth),notes:'',yaw:p.id===currentPhotoId?yaw:(p.orientation?.yaw??0),pitch:p.id===currentPhotoId?pitch:(p.orientation?.pitch??0),fov:p.id===currentPhotoId?fov:(p.orientation?.fov??78),flatZoom:p.id===currentPhotoId?flatZoom:(p.orientation?.flatZoom??1),flatPan:p.id===currentPhotoId?{...flatPan}:{...(p.orientation?.flatPan||{x:0,y:0})},lines:true,objects:true,measures:$('showMeasurements').checked,ratio:p.width&&p.height&&p.height>p.width?'3:4':'16:9',scale:100,offsetX:0,offsetY:0};reportViews.push(v);renderReportViews();makeReportPreview(v);return v}
function saveCurrentView(){const p=photoById(currentPhotoId);if(!p)return info('Primero añade una fotografía al proyecto.',true);const v=createReportView(p);selectTab('report');info('Vista '+reportViews.length+' guardada. Cambia el título y ordénala en el reporte.',true);return v}
function switchPhoto(id){closeInlineNoteEditor();if(id===currentPhotoId)return;const p=photoById(id);if(!p)return;persistPhoto();currentPhotoId=id;routes=p.routes||[];annotations=p.annotations||[];annotationHistory=[];activePolygon=null;annotationPreview=null;selectedAnnotation=-1;renderAnnotationList();yaw=p.orientation?.yaw??0;pitch=p.orientation?.pitch??0;fov=p.orientation?.fov??78;flatZoom=clamp(p.orientation?.flatZoom??1,1,6);flatPan={x:p.orientation?.flatPan?.x??0,y:p.orientation?.flatPan?.y??0};history=[];activeRoute=null;selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;$('viewName').value=p.caption||p.name;resetImage(p.src,p.name,p.blob||null);setMode('navigate');syncSelection();updateTotals();renderPhotos();info('Fotografía activa: '+p.name,true)}
function openReportView(id){const v=reportViews.find(v=>v.id===id);if(!v)return;switchPhoto(v.photoId);yaw=v.yaw;pitch=v.pitch;fov=v.fov;flatZoom=clamp(v.flatZoom??1,1,6);flatPan={x:v.flatPan?.x??0,y:v.flatPan?.y??0};$('viewName').value=v.title;dirty=true;queueFrame();info('Encuadre del reporte recuperado. Los trazos son los actuales de esta fotografía.',true)}
async function removePhoto(id){const p=photoById(id);if(!p)return;if(!await FV360Dialog.confirm(`¿Eliminar definitivamente «${p.name}» y sus ${p.routes.length} rutas de TODO el proyecto? Se quitará de todos los reportes. Para quitarla solo de este reporte, utiliza «Quitar del reporte».`))return;const wasActive=id===currentPhotoId;photos=photos.filter(p=>p.id!==id);saveActiveReportViews();reports.forEach(r=>{r.views=r.views.filter(v=>v.photoId!==id);r.photoIds=(r.photoIds||[]).filter(k=>k!==id)});reportViews=activeReport().views;if(wasActive){currentPhotoId=null;const next=photosForReport()[0];if(next)switchPhoto(next.id);else window.FV360Bridge?.clearViewer()}if(p.blob&&p.src.startsWith('blob:'))URL.revokeObjectURL(p.src);renderPhotos();renderLibraryPhotos();renderReportViews();updateTotals()}
async function addPhotos(files){const chosen=Array.from(files||[]).filter(f=>f.type.startsWith('image/'));if(!chosen.length)return info('Elige fotografías JPG, PNG o WEBP.',true);let firstId=null;for(const f of chosen){const p={id:newId('foto'),name:f.name,caption:f.name.replace(/\.[^.]+$/,''),src:URL.createObjectURL(f),blob:f,routes:[],annotations:[],orientation:{yaw:0,pitch:0,fov:78},width:0,height:0,img:null};photos.push(p);attachPhotoToReport(p.id);if(!firstId)firstId=p.id;const im=new Image();im.onload=()=>{p.img=im;p.width=im.naturalWidth;p.height=im.naturalHeight;if(p.height>p.width){reportViews.filter(v=>v.photoId===p.id&&v.ratio==='16:9').forEach(v=>{v.ratio='3:4';makeReportPreview(v)})}renderPhotos()};im.src=p.src;createReportView(p,true)}switchPhoto(firstId);renderPhotos();renderReportViews();selectTab('photos');info(chosen.length+' fotografía(s) añadida(s) al proyecto y al reporte.',true)}
async function setFramePhoto(v){const p=photoById(v.photoId);if(!p)throw Error('Fotografía no encontrada para '+v.title);if(!p.img||!p.img.complete||!p.img.naturalWidth){p.img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('No se pudo leer '+p.name));i.src=p.src})}image=p.img;imageReady=true;imageWidth=p.img.naturalWidth;imageHeight=p.img.naturalHeight;flatMode=Math.abs(imageWidth/imageHeight-2)>.2;routes=p.routes||[];annotations=p.annotations||[];yaw=v.yaw;pitch=v.pitch;fov=v.fov;flatZoom=clamp(v.flatZoom??1,1,6);flatPan={x:v.flatPan?.x??0,y:v.flatPan?.y??0};uploadTexture();return p}
async function frameForView(v,{lines=v.lines,measures=v.measures,objects=v.objects!==false,width=1920,height=1080}={}){persistPhoto();const old={image,imageReady,imageWidth,imageHeight,flatMode,routes,annotations,yaw,pitch,fov,flatZoom,flatPan:{...flatPan},renderReportId};try{renderReportId=v.reportId||activeReportId;await setFramePhoto(v);return await composite({lines,measures,points:false,annotations:objects},width,height)}finally{image=old.image;imageReady=old.imageReady;imageWidth=old.imageWidth;imageHeight=old.imageHeight;flatMode=old.flatMode;routes=old.routes;annotations=old.annotations;renderReportId=old.renderReportId;yaw=old.yaw;pitch=old.pitch;fov=old.fov;flatZoom=old.flatZoom;flatPan=old.flatPan;uploadTexture();dirty=true;queueFrame()}}
function layerSummaries(){const result=Object.fromEntries(CATEGORIES.map(c=>[c.id,{total:0,measured:0,pending:0}]));allPhotoRoutes().forEach(({r})=>(r.lengths||[]).forEach(v=>{const o=result[r.category]||result.OTHER;if(v==null||!Number.isFinite(Number(v)))o.pending++;else{o.total+=Number(v);o.measured++}}));return result}
function cleanTitle(s){return String(s||'Vista').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'').replace(/[\r\n]/g,' ').slice(0,65)||'Vista'}
// Cadena DXF generada a partir de plantillas R2010 previamente validadas con ezdxf.
// Cada imagen es IMAGE raster enlazada, y cada tramo es LINE/TEXT en capas CAD editables.
function cadGeometry(view,index){const startX=20+(index%2)*345,topY=-(Math.floor(index/2)*235),width=320,height=180;
 const srcW=1920,srcH=1080,result=[];let handleBase=0xf00000+index*0x100000;
 const push=(...parts)=>result.push(...parts.map(String));const code=n=>String(n).padStart(3,' ');
 const pointXY=p=>[startX+width*p.x/srcW,topY-height*p.y/srcH];
 function segmentClipped(a,b){let t0=0,t1=1,dx=b.x-a.x,dy=b.y-a.y;for(const [p,q] of [[-dx,a.x],[dx,srcW-a.x],[-dy,a.y],[dy,srcH-a.y]]){if(!p){if(q<0)return null;continue}const r=q/p;if(p<0){if(r>t1)return null;if(r>t0)t0=r}else{if(r<t0)return null;if(r<t1)t1=r}}return[{x:a.x+t0*dx,y:a.y+t0*dy},{x:a.x+t1*dx,y:a.y+t1*dy}]}
 function line(a,b,cat,r){const [ax,ay]=pointXY(a),[bx,by]=pointXY(b);let col=parseInt(String(r.color||cat.color).slice(1),16);if(!Number.isFinite(col))col=16777215;
 push('  0','LINE','  5',(handleBase++).toString(16).toUpperCase(),'330','17','100','AcDbEntity','  8',cat.cad,'  6',r.pattern?'FV_PATRON_'+r.pattern:'CONTINUOUS','420',col,'370',r.width>=8?70:r.width>=5?50:r.width>=3?35:18,'100','AcDbLine',' 10',ax.toFixed(5),' 20',ay.toFixed(5),' 30','0.0',' 11',bx.toFixed(5),' 21',by.toFixed(5),' 31','0.0')}
 function text(p,label,r){const [x,y]=pointXY(p);const col=parseInt(String(r.labelColor||'#ffffff').slice(1),16)||16777215;push('  0','TEXT','  5',(handleBase++).toString(16).toUpperCase(),'330','17','100','AcDbEntity','  8','FV_COTAS','420',col,'100','AcDbText',' 10',x.toFixed(5),' 20',(y+3).toFixed(5),' 30','0.0',' 40','3.5','  1',cleanTitle(label))}
 routes.forEach(r=>{if(!visible[r.category]||r.points?.length<2)return;for(let j=1;j<r.points.length;j++){if(view.lines){const pts=linePoints(r.points[j-1],r.points[j],srcW,srcH);for(let k=1;k<pts.length;k++){if(!pts[k-1]||!pts[k])continue;const clip=segmentClipped(pts[k-1],pts[k]);if(clip)line(clip[0],clip[1],category(r.category),r)}}const len=r.lengths?.[j-1];if(view.measures&&len!==undefined&&len!==null&&Number.isFinite(Number(len))){const p=project(interp(r.points[j-1],r.points[j],.5),srcW,srcH);if(p&&p.x>0&&p.x<srcW&&p.y>0&&p.y<srcH)text(p,Number(len).toFixed(2)+' m',r)}}});return result.join('\n')+'\n'}
function injectCAD(template,drawings){const marker='  0\nENDSEC\n  0\nSECTION\n  2\nOBJECTS\n';const index=template.indexOf(marker);if(index<0)throw Error('Plantilla DXF sin sección OBJECTS');return template.slice(0,index)+drawings+template.slice(index)}
async function exportCAD(){if(!reportViews.length)return info('Guarda al menos una vista en la pestaña Reporte.',true);if(reportViews.length>24)return info('Por ahora, exporta hasta 24 vistas por paquete CAD.',true);await previewQueue;info('Preparando DXF con fotografías vinculadas…',true);$('btnDXF').disabled=true;try{persistPhoto();const images=[],annotated=[];let vectors='';for(let i=0;i<reportViews.length;i++){const v=reportViews[i];const clean=await frameForView(v,{lines:false,measures:false,width:1920,height:1080});const raw=await canvasBlob(clean);images.push({name:`imagenes/VISTA_${String(i+1).padStart(2,'0')}.png`,data:raw});const marked=await frameForView(v,{lines:v.lines,measures:v.measures,width:1920,height:1080});annotated.push({name:`vistas_anotadas/VISTA_${String(i+1).padStart(2,'0')}.png`,data:await canvasBlob(marked)});
const state={image,imageReady,imageWidth,imageHeight,flatMode,routes,yaw,pitch,fov,flatZoom,flatPan:{...flatPan}};try{await setFramePhoto(v);vectors+=cadGeometry(v,i)}finally{image=state.image;imageReady=state.imageReady;imageWidth=state.imageWidth;imageHeight=state.imageHeight;flatMode=state.flatMode;routes=state.routes;yaw=state.yaw;pitch=state.pitch;fov=state.fov;flatZoom=state.flatZoom;flatPan=state.flatPan;uploadTexture();dirty=true;queueFrame()}}
 const template=window.FV_DXF_TEMPLATES?.[String(reportViews.length)];if(!template)throw Error('La plantilla CAD no está disponible');let dxf=injectCAD(template,vectors);reportViews.forEach((v,i)=>{dxf=dxf.replace(`TITULO_${String(i+1).padStart(2,'0')}`,cleanTitle(v.title))});
 const instructions=`FV360 Studio v3 - PAQUETE CAD\r\n\r\n1. EXTRAER TODO el contenido del ZIP en una misma carpeta.\r\n2. Abrir FV360_REPORTE.dxf en AutoCAD 2010 o posterior.\r\n3. Mantener la carpeta imagenes/ junto al DXF; las fotografias son referencias raster relativas.\r\n4. Si AutoCAD no encuentra la imagen, revisar referencias externas o la ruta de busqueda.\r\n5. Las fotografias y polilineas no estan a escala geometrica; las cifras son mediciones de campo.\r\n6. Las capas FV_DC/FV_AC/... contienen las lineas editables; FV_COTAS contiene las medidas.\r\n7. Las imagenes de vistas_anotadas/ ya tienen dibujos incorporados y sirven para reportes.\r\n8. Las imagenes del DXF son limpias, y el CAD dibuja encima elementos separados editables.\r\n\r\nOrden del reporte: dos vistas por fila.\r\n`;
 const manifest=reportViews.map((v,i)=>`${String(i+1).padStart(2,'0')} - ${v.title} | ${photoById(v.photoId)?.name||''} | lineas=${v.lines} | cotas=${v.measures}`).join('\r\n');
 const pkg=await FVZip.build([{name:'FV360_REPORTE.dxf',data:dxf},...images,...annotated,{name:'LEEME_CAD.txt',data:instructions+manifest}]);download(slug()+'_CAD_con_fotos.zip',pkg,'application/zip');info(`CAD exportado con ${reportViews.length} vista(s), imágenes vinculadas y trazos editables. Extrae todo el ZIP.`,true)
 }catch(e){console.error('Error CAD',e);info('No fue posible exportar CAD: '+e.message,true)}finally{$('btnDXF').disabled=false;persistPhoto();dirty=true;queueFrame()}}
async function reportMultipage(){return exportPhotoPDF()}
async function saveProjectZip(){try{persistPhoto();const meta={app:'FV360 Studio',version:6,project:$('projectName').value,technician:$('technicianName').value,reportSubtitle:$('reportSubtitle').value,reportNotes:$('reportNotes').value,activePhotoId:currentPhotoId,photos:[],reportViews,reports:allReportsForSave(),activeReportId,customCategories:CATEGORIES.filter(c=>!baseCategoryIds.has(c.id))};const files=[];for(let i=0;i<photos.length;i++){const p=photos[i],ext=(p.name.match(/\.(jpe?g|png|webp)$/i)?.[1]||'jpg').toLowerCase(),name=`fotos/FOTO_${String(i+1).padStart(2,'0')}.${ext}`;meta.photos.push({id:p.id,name:p.name,caption:p.caption,orientation:p.orientation,routes:p.routes,annotations:p.annotations||[],asset:name});files.push({name,data:p.blob||await (await fetch(p.src)).blob()})}files.unshift({name:'proyecto.json',data:JSON.stringify(meta,null,2)});download(slug()+'_PROYECTO.fv360.zip',await FVZip.build(files),'application/zip');info('Proyecto completo guardado en ZIP con todas las fotos, trazos y vistas.',true)}catch(e){console.error(e);info('No se pudo guardar el proyecto: '+e.message,true)}}
// Respaldo JSON autosuficiente: incluye fotos originales en base64, rutas y láminas.
// Puede ser grande si hay muchas fotografías. Para proyectos muy grandes también existe el ZIP.
async function photoDataURL(p){
 if(typeof p.src==='string'&&p.src.startsWith('data:image/'))return p.src;
 const blob=p.blob||await (await fetch(p.src)).blob();
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo leer '+p.name));reader.readAsDataURL(blob)});
}
async function saveProjectJSON(){
 try{
  const name=slug()+'_'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)+'_PROYECTO_COMPLETO.json';
  // Mostrar el selector de carpeta antes de procesar fotografías pesadas (gesto del usuario).
  const handle=window.FV360FileSave?await window.FV360FileSave.prepare(name):null;
  if(handle===false)return false;
  persistPhoto();info('Preparando JSON con fotografías originales…',true);
  const metadata={app:'FV360 Studio',version:6,format:'FV360_JSON_AUTOSUFICIENTE',savedAt:new Date().toISOString(),project:$('projectName').value,
   reportSubtitle:$('reportSubtitle').value,reportNotes:$('reportNotes').value,technician:$('technicianName').value,photos:[],reportViews:JSON.parse(JSON.stringify(reportViews)),reports:allReportsForSave(),activeReportId,customCategories:CATEGORIES.filter(c=>!baseCategoryIds.has(c.id))};
  for(const p of photos){metadata.photos.push({id:p.id,name:p.name,caption:p.caption,orientation:p.orientation,
   routes:JSON.parse(JSON.stringify(p.routes)),annotations:JSON.parse(JSON.stringify(p.annotations||[])),inlineData:await photoDataURL(p)});}
  const json=JSON.stringify(metadata,null,2);
  const payload=new Blob([json],{type:'application/json;charset=utf-8'});
  const result=window.FV360FileSave?await window.FV360FileSave.save(name,payload,handle):(download(name,payload,'application/json'),{mode:'download'});
  if(result?.cancelled){info('Exportación JSON cancelada. El proyecto local no ha cambiado.',true);return false}
  window.dispatchEvent(new CustomEvent('fv360:file-exported',{detail:{format:'json',name,project:$('projectName').value,method:result?.mode||'download'}}));
  info(result?.mode==='file-picker'?'Archivo JSON guardado en la carpeta elegida.':result?.mode==='share'?'JSON enviado a la opción Compartir. Comprueba la carpeta elegida.':'JSON preparado para descargar. Comprueba Descargas o la carpeta elegida por tu navegador.',true);
  return true;
 }catch(e){console.error('Error guardando JSON:',e);info('No se pudo guardar JSON: '+e.message,true);return false}
}
async function loadProjectV3(file){try{let metadata,assets=null;if(file.name.toLowerCase().endsWith('.zip')){assets=await FVZip.read(file);const json=assets.get('proyecto.json');if(!json)throw Error('El ZIP no contiene proyecto.json');metadata=JSON.parse(await json.text())}else metadata=JSON.parse(await file.text());if(metadata.version===2){const src=metadata.photoData||(metadata.photoIsDemo?window.FV_DEMO_DATA:null);if(!src)throw Error('El proyecto v2 necesita su fotografía original.');metadata={version:3,project:metadata.project,reportViews:[],photos:[{id:newId('foto'),name:metadata.photoName||'foto.jpg',caption:metadata.view||'Vista importada',orientation:metadata.orientation||{yaw:0,pitch:0,fov:78},routes:metadata.routes||[],inlineData:src}]};metadata.reportViews=[{id:newId('vista'),photoId:metadata.photos[0].id,title:metadata.view||'Vista importada',notes:'',...metadata.orientation,lines:true,measures:true}]}
 if(![3,4,5,6].includes(metadata.version)||!Array.isArray(metadata.photos))throw Error('Archivo de proyecto no compatible.');const newPhotos=[];for(const p of metadata.photos){let blob=null,src=p.inlineData;if(assets){blob=assets.get(p.asset);if(!blob)throw Error('Falta fotografía '+p.asset);src=URL.createObjectURL(blob)}if(!src)throw Error('No está incluida la foto '+p.name);newPhotos.push({id:p.id,name:p.name,caption:p.caption||p.name,src,blob,routes:p.routes||[],annotations:p.annotations||[],orientation:p.orientation||{yaw:0,pitch:0,fov:78},width:0,height:0,img:null})}
 photos.forEach(p=>{if(p.blob&&p.src.startsWith('blob:'))URL.revokeObjectURL(p.src)});photos=newPhotos;annotationImageCache.clear();pendingPNG=null;loadReports(metadata.reports,metadata.activeReportId,metadata.reportViews||[]);currentPhotoId=null;resetCustomCategories(metadata.customCategories||[]);$('projectName').value=metadata.project||'Nuevo proyecto';$('reportSubtitle').value=metadata.reportSubtitle||'Levantamiento fotovoltaico';$('reportNotes').value=metadata.reportNotes||'';$('technicianName').value=metadata.technician||'';{const linked=photosForReport();const requested=linked.find(p=>p.id===metadata.activePhotoId);if(requested||linked[0])switchPhoto((requested||linked[0]).id);else window.FV360Bridge?.clearViewer();}renderPhotos();renderReportViews();reportViews.forEach(v=>makeReportPreview(v));selectTab('report');mobileNotify();window.dispatchEvent(new CustomEvent('fv360:project-imported',{detail:{filename:file.name,project:$('projectName').value}}));info('Proyecto cargado con '+photos.length+' fotografías y '+reportViews.length+' vistas.',true);return true
 }catch(e){console.error(e);info('Error al abrir proyecto: '+e.message,true);return false}}

/* FV360 v4 — reporte visual, control de encuadre y tabla CAD. */
const sheetRatio=(v)=>{const [a,b]=String(v.ratio||'16:9').split(':').map(Number);return a>0&&b>0?a/b:16/9};
const sheetWidth=()=>Number($('reportQuality').value)||3840;
const sheetNumber=index=>String(index+1).padStart(2,'0');
let currentEditId=null,editorTimer=null,editorGeneration=0,reportBusy=false;
function sheetLayout(v){return{zoom:clamp(num(v.scale)||100,100,240)/100,x:clamp(num(v.offsetX),-60,60)/100,y:clamp(num(v.offsetY),-60,60)/100}}
async function renderSheet(v,index,width=3840,number=true){
 const ratio=sheetRatio(v),w=Math.round(width),h=Math.round(w/ratio);
 const base=await frameForView(v,{lines:v.lines,measures:v.measures,width:w,height:h});
 const out=document.createElement('canvas');out.width=base.width;out.height=base.height;
 const ctx=out.getContext('2d',{alpha:false});ctx.fillStyle='#ffffff';ctx.fillRect(0,0,out.width,out.height);
 const {zoom,x,y}=sheetLayout(v),scaledW=out.width*zoom,scaledH=out.height*zoom;
 ctx.drawImage(base,(out.width-scaledW)/2+x*out.width,(out.height-scaledH)/2+y*out.height,scaledW,scaledH);
 if(number){const fs=Math.max(19,Math.round(w*.016));const pad=Math.round(fs*.72),margin=Math.round(w*.015),label=sheetNumber(index);
 ctx.font=`700 ${fs}px Arial, sans-serif`;const tw=Math.ceil(ctx.measureText(label).width);const rectW=tw+pad*2,rectH=fs+pad*1.4,rx=out.width-margin-rectW,ry=out.height-margin-rectH;
 ctx.fillStyle='rgba(13,17,22,.84)';ctx.fillRect(rx,ry,rectW,rectH);ctx.fillStyle='#ffffff';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(label,rx+rectW/2,ry+rectH/2+1);}
 return out;
}
function syncEditorControls(v){$('editorTitle').textContent=`LÁMINA ${sheetNumber(reportViews.indexOf(v))} · ${v.title||'Foto'}`;$('editorRatio').value=v.ratio||'16:9';$('editorScale').value=v.scale||100;$('editorX').value=v.offsetX||0;$('editorY').value=v.offsetY||0;$('editorLines').checked=!!v.lines;$('editorMeasures').checked=!!v.measures;$('editorObjects').checked=v.objects!==false;syncEditorNumbers()}
function syncEditorNumbers(){$('scaleVal').textContent=$('editorScale').value+'%';$('xVal').textContent=$('editorX').value+'%';$('yVal').textContent=$('editorY').value+'%'}
function readEditor(v){mobileNotify();v.ratio=$('editorRatio').value;v.scale=Number($('editorScale').value);v.offsetX=Number($('editorX').value);v.offsetY=Number($('editorY').value);v.lines=$('editorLines').checked;v.measures=$('editorMeasures').checked;v.objects=$('editorObjects').checked;syncEditorNumbers()}
function openSheetEditor(id){const v=reportViews.find(x=>x.id===id);if(!v)return;currentEditId=id;$('reportEditor').hidden=false;document.body.classList.add('modal-open');syncEditorControls(v);scheduleEditorPreview()}
function closeSheetEditor(){currentEditId=null;editorGeneration++;$('reportEditor').hidden=true;document.body.classList.remove('modal-open');clearTimeout(editorTimer);renderReportViews()}
function scheduleEditorPreview(){const v=reportViews.find(x=>x.id===currentEditId);if(!v)return;readEditor(v);clearTimeout(editorTimer);const job=++editorGeneration;editorTimer=setTimeout(async()=>{try{const r=sheetRatio(v),canvas=$('reportEditCanvas'),w=960,h=Math.round(w/r);$('editorProgress').textContent='Generando vista previa…';const img=await renderSheet(v,reportViews.indexOf(v),w);if(job!==editorGeneration)return;canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);$('editorProgress').textContent=`Vista previa ${w} × ${h} · foto y trazos en una sola lámina`;}catch(e){console.error(e);$('editorProgress').textContent='Error de vista previa: '+e.message}},130)}
async function withReportLock(fn){if(reportBusy)return info('Espera a que termine la exportación anterior.',true);reportBusy=true;try{await previewQueue;persistPhoto();return await fn()}catch(e){console.error(e);info('No se pudo exportar: '+e.message,true)}finally{reportBusy=false}}
async function downloadSheet(id){return withReportLock(async()=>{const i=reportViews.findIndex(v=>v.id===id);if(i<0)return;info('Generando lámina '+sheetNumber(i)+' en alta calidad…',true);const c=await renderSheet(reportViews[i],i,sheetWidth());const blob=await canvasBlob(c);download(`${slug()}_${reportFileTag()}_LAMINA_${sheetNumber(i)}.png`,blob,'image/png');info(`Lámina ${sheetNumber(i)} descargada: ${c.width} × ${c.height} PNG.`,true)})}
async function exportAllSheets(){if(!reportViews.length)return info('Agrega por lo menos una lámina al reporte.',true);return withReportLock(async()=>{const entries=[],w=sheetWidth();for(let i=0;i<reportViews.length;i++){info(`ZIP: preparando lámina ${i+1}/${reportViews.length}…`);const c=await renderSheet(reportViews[i],i,w);entries.push({name:`LAMINA_${sheetNumber(i)}.png`,data:await canvasBlob(c)});}entries.push({name:'LEEME.txt',data:'FV360 Studio v4 - laminas fotograficas\nLas imagenes PNG contienen los trazos y las medidas visibles elegidas en el editor.\nLas medidas son registros de campo, no una escala metrica automatica.\nFotografias 360 originales conservadas en el proyecto FV360.\n'});download(`${slug()}_${reportFileTag()}_LAMINAS_PNG.zip`,await FVZip.build(entries),'application/zip');info(`${entries.length-1} láminas PNG incluidas en el ZIP.`,true)})}
const textBytes=(s)=>new TextEncoder().encode(s);
const concatBytes=(arr)=>{const total=arr.reduce((a,x)=>a+x.length,0),o=new Uint8Array(total);let pos=0;for(const a of arr){o.set(a,pos);pos+=a.length}return o};
async function createPhotoPDF(canvases){
 const objects=[null,null];
 const obj=(content)=>{objects.push(content);return objects.length};
 const pageIds=[];
 for(const c of canvases){const jpg=await canvasBlob(c,'image/jpeg');const raw=new Uint8Array(await jpg.arrayBuffer());const img=obj(concatBytes([textBytes(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raw.length} >>\nstream\n`),raw,textBytes('\nendstream')]));
 const portrait=c.height>c.width,pageW=portrait?595:842,pageH=portrait?842:595,maxW=pageW-37,maxH=pageH-37,sc=Math.min(maxW/c.width,maxH/c.height),cw=c.width*sc,ch=c.height*sc,x=(pageW-cw)/2,y=(pageH-ch)/2;
 const commands=textBytes(`q\n${cw.toFixed(4)} 0 0 ${ch.toFixed(4)} ${x.toFixed(4)} ${y.toFixed(4)} cm\n/Im0 Do\nQ\n`);
 const stream=obj(concatBytes([textBytes(`<< /Length ${commands.length} >>\nstream\n`),commands,textBytes('endstream')]));
 const page=obj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${stream} 0 R >>`);
 pageIds.push(page);
 }
 objects[0]='<< /Type /Catalog /Pages 2 0 R >>';objects[1]=`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`;
 const output=[textBytes('%PDF-1.4\n%FV360\n')],offsets=[0];let length=output[0].length;
 for(let i=0;i<objects.length;i++){const id=i+1;offsets[id]=length;const payload=typeof objects[i]==='string'?textBytes(objects[i]):objects[i];const data=concatBytes([textBytes(`${id} 0 obj\n`),payload,textBytes('\nendobj\n')]);output.push(data);length+=data.length}
 const xrefStart=length;let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<=objects.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 xref+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
 output.push(textBytes(xref));return new Blob(output,{type:'application/pdf'});
}
async function exportPhotoPDF(){if(!reportViews.length)return info('Agrega al menos una foto al reporte.',true);return withReportLock(async()=>{const frames=[];for(let i=0;i<reportViews.length;i++){info(`PDF: preparando fotografía ${i+1}/${reportViews.length}…`);frames.push(await renderSheet(reportViews[i],i,sheetWidth()))}const pdf=await createPhotoPDF(frames);download(`${slug()}_${reportFileTag()}_REPORTE_FOTOGRAFICO.pdf`,pdf,'application/pdf');info(`PDF generado con ${frames.length} página(s) de fotografía grande y numerada.`,true)})}
/* DXF independiente de las imágenes: tabla limpia con filas/columnas configurables. */
const CAD_LABELS={DC:'TRAYECTORIA C.D.',AC:'TRAYECTORIA C.A.',GROUND:'TIERRA FISICA',COMMS:'COMUNICACIONES',TRAY:'CHAROLA / BANDEJA',OTHER:'OTROS / REFERENCIA'};
function cadSelection(){return CATEGORIES.filter(c=>$('cadcat_'+c.id)?.checked).map(c=>c.id)}
function cadData(){const sums=layerSummaries(),ids=cadSelection(),cols=[{id:'label',name:'CLASIFICACION',width:72}];if($('cadShowRoutes').checked)cols.push({id:'routes',name:'RUTAS',width:25});if($('cadShowSegments').checked)cols.push({id:'measured',name:'TRAMOS MED.',width:38});if($('cadShowPending').checked)cols.push({id:'pending',name:'PENDIENTES',width:40});cols.push({id:'total',name:'LONGITUD (m)',width:49});const countRoutes=(id)=>allPhotoRoutes().filter(x=>x.r.category===id).length;
 const rows=ids.map(id=>({label:CAD_LABELS[id]||category(id).name.toUpperCase(),routes:countRoutes(id),measured:sums[id].measured,pending:sums[id].pending,total:sums[id].total}));if($('cadShowTotal').checked)rows.push({label:'TOTAL GENERAL',routes:rows.reduce((n,r)=>n+r.routes,0),measured:rows.reduce((n,r)=>n+r.measured,0),pending:rows.reduce((n,r)=>n+r.pending,0),total:rows.reduce((n,r)=>n+r.total,0),summary:true});return{cols,rows}}
function updateCADPreview(){const el=$('cadPreview');if(!el)return;const {cols,rows}=cadData();const tbody=rows.map(r=>`<tr${r.summary?' class="sum"':''}>${cols.map(c=>`<td>${c.id==='total'?r[c.id].toFixed(2):esc(r[c.id])}</td>`).join('')}</tr>`).join('');const selectedTotal=rows.filter(r=>!r.summary).reduce((sum,r)=>sum+num(r.total),0);const globalTotal=Object.values(layerSummaries()).reduce((sum,r)=>sum+num(r.total),0);el.innerHTML=`<div class="cad-options-title">VISTA PREVIA DE TABLA</div><div class="fv-cad-preview-summary"><div><span>Total de categorías seleccionadas</span><strong>${selectedTotal.toFixed(2)} m</strong></div><div><span>Todas las distancias del reporte</span><strong>${globalTotal.toFixed(2)} m</strong></div></div><div class="cad-table-scroll"><table><thead><tr>${cols.map(c=>`<th>${c.name}</th>`).join('')}</tr></thead><tbody>${tbody||`<tr><td colspan="${cols.length}">Selecciona una categoría</td></tr>`}</tbody></table></div>`}
function exportDistanceDXF(){
 const {cols,rows}=cadData();
 if(!rows.length)return info('Selecciona al menos una fila de capa en el panel CAD.',true);
 if(!window.FV_DXF_R12_TEMPLATE)return info('No se cargó la plantilla CAD compatible. Extrae todos los archivos del ZIP.',true);
 persistPhoto();
 // El dibujo se escribe en DXF R12 (AC1009), compatible con AutoCAD clásico y moderno.
 // Partimos de una plantilla con HEADER, TABLES, BLOCKS y LAYER válidos.
 const asc=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').slice(0,160);
 const pairs=[];let handle=0x1000;
 const push=(code,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw Error('Coordenada CAD inválida');pairs.push(String(code).padStart(3,' '),String(value))};
 const entity=(type,layer)=>{push(0,type);push(5,(handle++).toString(16).toUpperCase());push(8,layer)};
 const line=(x1,y1,x2,y2,layer='FV_TABLA')=>{entity('LINE',layer);for(const [c,n] of [[10,x1],[20,y1],[30,0],[11,x2],[21,y2],[31,0]])push(c,Number(n).toFixed(4))};
 const cadText=(x,y,content,height=4,layer='FV_TEXTO')=>{entity('TEXT',layer);push(10,Number(x).toFixed(4));push(20,Number(y).toFixed(4));push(30,0);push(40,Number(height).toFixed(3));push(1,asc(content));push(7,'STANDARD')};
 const width=cols.reduce((a,c)=>a+c.width,0),left=10,top=0,rowH=14,titleH=25,bodyTop=top-titleH,numRows=rows.length+1,bottom=bodyTop-rowH*numRows;
 cadText(left+3,top-7,'FV360 / CUANTIFICACION DE CANALIZACIONES',5.8);
 cadText(left+3,top-17,slug().replace(/_/g,' ').slice(0,58),3.2);
 line(left,bodyTop,left+width,bodyTop);line(left,bottom,left+width,bottom);line(left,bodyTop,left,bottom);line(left+width,bodyTop,left+width,bottom);
 let acc=left;for(const c of cols.slice(0,-1)){acc+=c.width;line(acc,bodyTop,acc,bottom)}
 for(let r=1;r<numRows;r++)line(left,bodyTop-r*rowH,left+width,bodyTop-r*rowH);
 let off=left;for(const c of cols){cadText(off+2,bodyTop-9,c.name,3);off+=c.width}
 rows.forEach((r,i)=>{let x=left;const y=bodyTop-(i+2)*rowH+4.7;for(const c of cols){const val=c.id==='total'?r.total.toFixed(2):r[c.id];cadText(x+2,y,val,r.summary?3.8:3.5);x+=c.width}});
 cadText(left,bottom-11,'UNIDADES: METROS - LONGITUDES REGISTRADAS EN CAMPO',3);
 cadText(left,bottom-18,'DOCUMENTO REFERENCIAL. NO CONSTITUYE PLANO A ESCALA.',3);
 const marker='  0\nENDSEC\n  0\nEOF\n';
 const base=window.FV_DXF_R12_TEMPLATE;
 const cut=base.lastIndexOf(marker);
 if(cut<0||!base.includes('  2\nENTITIES\n'))throw Error('Plantilla CAD incompleta');
 const dxf=(base.slice(0,cut)+pairs.join('\n')+'\n'+base.slice(cut)).replace(/\r?\n/g,'\r\n');
 download(slug()+'_'+reportFileTag()+'_TABLA_DISTANCIAS.dxf',new Blob([dxf],{type:'application/dxf'}),'application/dxf');
 info(`Tabla DXF compatible R12: ${rows.length} filas, ${cols.length} columnas.`,true);
}

function initV4(){
 $('btnAllReportZIP').onclick=exportAllSheets;$('btnExportReportZIP').onclick=exportAllSheets;
 const cats=$('cadCategories');cats.innerHTML=CATEGORIES.map(c=>`<label class="cad-check"><input id="cadcat_${c.id}" type="checkbox" checked><span class="layer-swatch" style="background:${c.color}"></span>${esc(c.name)}</label>`).join('');$('cadOptions').querySelectorAll('input').forEach(el=>el.addEventListener('change',updateCADPreview));updateCADPreview();
 $('editorClose').onclick=closeSheetEditor;$('editorSave').onclick=()=>{const v=reportViews.find(x=>x.id===currentEditId),c=$('reportEditCanvas');if(v&&c.width&&c.height)v.thumb=c.toDataURL('image/jpeg',.86);closeSheetEditor();info('Ajustes de lámina guardados en el proyecto.',true)};
 ['editorRatio','editorScale','editorX','editorY','editorLines','editorMeasures','editorObjects'].forEach(id=>$(id).addEventListener('input',scheduleEditorPreview));
 $('editorCenter').onclick=()=>{$('editorX').value=0;$('editorY').value=0;scheduleEditorPreview()};
 $('editorReset').onclick=()=>{$('editorRatio').value='16:9';$('editorScale').value=100;$('editorX').value=0;$('editorY').value=0;scheduleEditorPreview()};
 $('editorDownload').onclick=()=>{const id=currentEditId;closeSheetEditor();downloadSheet(id)};
 $('reportEditor').addEventListener('click',e=>{if(e.target===$('reportEditor'))closeSheetEditor()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('reportEditor').hidden){e.stopImmediatePropagation();closeSheetEditor()}},true);
}


/* FV360 extension: representational objects, notes and project-defined route categories. */
let annotations=[],selectedAnnotation=-1,annotationAction='edit',annotationPreview=null,annotationHistory=[];
let pendingPNG=null,activePolygon=null,selectedShapeVertex=-1;
const annotationImageCache=new Map();
const baseCategoryIds=new Set(CATEGORIES.map(c=>c.id));
const annotationChanged=()=>{persistPhoto();window.dispatchEvent(new Event('fv360:changed'));queueFrame()};
function announceObject(msg){const el=$('annotationHelp');if(el)el.textContent=msg;info(msg,true)}
function objectSnapshot(){annotationHistory.push(JSON.stringify(annotations));if(annotationHistory.length>30)annotationHistory.shift()}
function setAnnotationAction(action){
 closeInlineNoteEditor();
 if(annotationAction==='polygon'&&action!=='polygon')cancelPolygon();
 annotationAction=action;selectedAnnotation=-1;selectedShapeVertex=-1;annotationPreview=null;setMode('annotate');overlay.style.cursor=action==='edit'?'grab':'crosshair';
 $('annotationFinishFloating').hidden=action!=='polygon'||!activePolygon||activePolygon.length<3;
 $('annotationPolygonFinish').disabled=!(activePolygon&&activePolygon.length>=3);
 document.querySelectorAll('[data-ann-action]').forEach(b=>b.classList.toggle('fv-chosen',b.dataset.annAction===action));
 const tips={rect:'Arrastra para crear. En Editar, mueve sus cuatro vértices.',circle:'Arrastra para crear y edita los ocho controles.',polygon:'Marca al menos tres puntos; luego pulsa Cerrar figura.',note:'Escribe la nota y toca dónde colocarla.',png:'Elige un PNG transparente y toca dónde colocarlo.',edit:'Toca el objeto. Arrastra vértices o controles blancos para editarlo.'};
 $('annotationHelp').textContent=tips[action]||'';
 $('drawInstruction').hidden=true;queueFrame();
 if(action==='png'&&!pendingPNG)$('annotationPNGFile').click();
}
function screenVertices(a,w=viewW,h=viewH){
 if(a.type==='polygon'&&Array.isArray(a.vertices))return a.vertices.map(p=>project(p,w,h));
 return [];
}
function screenBounds(a,w=viewW,h=viewH){
 if(a.type==='polygon'&&Array.isArray(a.vertices)&&a.vertices.length){
  const pts=screenVertices(a,w,h).filter(Boolean);if(!pts.length)return null;
  const x=Math.min(...pts.map(p=>p.x)),y=Math.min(...pts.map(p=>p.y));
  return{x,y,w:Math.max(8*w/viewW,Math.max(...pts.map(p=>p.x))-x),h:Math.max(8*w/viewW,Math.max(...pts.map(p=>p.y))-y)};
 }
 const v=project(a.start,w,h),z=project(a.end,w,h);if(!v||!z)return null;
 return{x:Math.min(v.x,z.x),y:Math.min(v.y,z.y),w:Math.max(8*w/viewW,Math.abs(z.x-v.x)),h:Math.max(8*w/viewW,Math.abs(z.y-v.y))};
}
function objectHandles(a){
 const b=screenBounds(a);if(!b)return[];
 if(a.type==='polygon')return screenVertices(a).map((p,i)=>p?{x:p.x,y:p.y,index:i,kind:'vertex'}:null).filter(Boolean);
 const x=b.x,y=b.y,w=b.w,h=b.h;
 const v=[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]];
 return v.map((p,i)=>({x:p[0],y:p[1],index:i,kind:a.type==='rect'&&i<4?'vertex':'resize'}));
}
function polygonContains(pt,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
 const a=poly[i],b=poly[j];if(!a||!b)continue;
 if(((a.y>pt.y)!==(b.y>pt.y))&&(pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x))inside=!inside;
 }return inside}
function objectHit(p){
 // Prioritize handles on the selected object, then other objects in reverse stacking order.
 const order=[selectedAnnotation,...annotations.map((_,i)=>i).reverse()].filter((i,j,a)=>i>=0&&a.indexOf(i)===j);
 for(const i of order){const a=annotations[i];if(!a||!annotationInReport(a))continue;
  // Avoid accidentally resizing a different object when attempting to select/move it.
  if(i===selectedAnnotation)for(const handle of objectHandles(a))if(Math.hypot(handle.x-p.x,handle.y-p.y)<12)return{index:i,handle};
  const b=screenBounds(a);if(!b)continue;
  if(a.type==='polygon'){
   const pts=screenVertices(a);if(polygonContains(p,pts)||pts.some((q,j)=>q&&pts[(j+1)%pts.length]&&pointDistance(p.x,p.y,q,pts[(j+1)%pts.length])<12))return{index:i,handle:null};
  }else if(p.x>=b.x-6&&p.x<=b.x+b.w+6&&p.y>=b.y-6&&p.y<=b.y+b.h+6)return{index:i,handle:null};
 }return null;
}
function selectedType(a){return{rect:'Rectángulo',circle:'Círculo / elipse',polygon:'Polígono',png:'Imagen PNG',note:'Nota'}[a?.type]||'Objeto'}
function setSelectedAnnotation(index){
 selectedAnnotation=index;selectedShapeVertex=-1;
 const a=annotations[index];if(a){const tab=a.type==='note'?'notes':'objects';focusSelectionTab(tab)}$('annSelected').textContent=a?`Seleccionado: ${selectedType(a)} ${index+1}`:'Sin objeto seleccionado';
 if(a){
  $('annText').value=a.text||'';$('annColor').value=a.color||'#ffb74d';$('annFont').value=String(a.fontSize||17);
  $('annAlign').value=a.align||'left';$('annBold').checked=a.bold!==false;$('annItalic').checked=!!a.italic;
  $('annBackground').checked=a.background!==false;$('annTextColor').value=a.textColor||'#ffffff';
  $('annStroke').value=String(a.strokeWidth||3);$('annScale').value=String(a.uiScale||100);
 }
 $('annScaleValue').textContent=(a?.uiScale||100)+'%';
 if($('annotationVertexTools'))$('annotationVertexTools').hidden=!a||a.type!=='polygon';
 if($('annotationConvertRow'))$('annotationConvertRow').hidden=!a||!['rect','circle'].includes(a.type);
 renderAnnotationList();window.FV360Workspace?.refreshNotes?.();queueFrame();window.dispatchEvent(new Event('fv360:quick-selection'));
}
function clampToPhoto(x,y){const a=flatMode?flatRect(viewW,viewH):{x:0,y:0,w:viewW,h:viewH};return{x:clamp(x,a.x,a.x+a.w),y:clamp(y,a.y,a.y+a.h)}}
function rectanglePoints(x,y,w,h){
 const p=clampToPhoto(x,y),q=clampToPhoto(x+w,y+h);
 const a=dirAt(p.x,p.y),b=dirAt(q.x,q.y);return a&&b?{start:a,end:b}:null;
}
function defaultObjectAt(p,type){
 const area=flatMode?flatRect(viewW,viewH):{x:0,y:0,w:viewW,h:viewH};
 const w=Math.min(type==='note'?210:type==='png'?170:150,Math.max(12,area.w-12));
 const h=Math.min(type==='note'?84:type==='png'?135:100,Math.max(12,area.h-12));
 const xx=clamp(p.x,area.x+2,Math.max(area.x+2,area.x+area.w-w-2));
 const yy=clamp(p.y,area.y+2,Math.max(area.y+2,area.y+area.h-h-2));
 return rectanglePoints(xx,yy,w,h);
}
function recordObject(type,first,end){
 const shape=type==='note'||type==='png'?defaultObjectAt(first,type):rectanglePoints(Math.min(first.x,end.x),Math.min(first.y,end.y),Math.abs(first.x-end.x)>12?Math.abs(first.x-end.x):150,Math.abs(first.y-end.y)>12?Math.abs(first.y-end.y):100);
 if(!shape)return announceObject('Selecciona un punto dentro de la fotografía.');
 if(type==='png'&&!pendingPNG)return announceObject('Primero selecciona un PNG.');
 const a={id:newId('obj'),reportId:activeReportId,type,...shape,color:$('annColor').value,strokeWidth:Number($('annStroke').value)||3,
  fontSize:Number($('annFont').value)||17,text:($('annText').value||'').slice(0,500),src:type==='png'?pendingPNG:null,
  align:$('annAlign').value,bold:$('annBold').checked,italic:$('annItalic').checked,background:$('annBackground').checked,
  textColor:$('annTextColor').value,uiScale:100};
 if(type==='note'&&!a.text.trim())a.text='Nota técnica';
 objectSnapshot();annotations.push(a);setSelectedAnnotation(annotations.length-1);annotationChanged();
 if(type==='png')cacheAnnotationImage(a.src);if(type==='note'){setAnnotationAction('edit');setSelectedAnnotation(annotations.length-1);openInlineNoteEditor(annotations.length-1)}
 announceObject('Objeto colocado. Selecciona «Editar objetos» para moverlo o modificarlo.');
}
function finishPolygon(){
 if(!activePolygon||activePolygon.length<3)return announceObject('Marca al menos tres vértices para cerrar el polígono.');
 const a={id:newId('obj'),reportId:activeReportId,type:'polygon',vertices:activePolygon.map(p=>({...p})),
  start:activePolygon[0],end:activePolygon[activePolygon.length-1],color:$('annColor').value,
  strokeWidth:Number($('annStroke').value)||3,uiScale:100};
 objectSnapshot();annotations.push(a);activePolygon=null;annotationPreview=null;$('annotationFinishFloating').hidden=true;
 setAnnotationAction('edit');setSelectedAnnotation(annotations.length-1);annotationChanged();
 announceObject('Polígono guardado. Arrastra cada vértice para darle la forma que necesites.');
}
function cancelPolygon(){activePolygon=null;annotationPreview=null;$('annotationFinishFloating').hidden=true;$('annotationPolygonFinish').disabled=true;queueFrame()}
function cacheAnnotationImage(src){if(!src||!String(src).startsWith('data:image/png;base64,'))return null;
 if(annotationImageCache.has(src))return annotationImageCache.get(src);
 const im=new Image();const job=new Promise((resolve,reject)=>{im.onload=()=>{queueFrame();resolve(im)};im.onerror=()=>reject(Error('PNG inválido'));});
 annotationImageCache.set(src,{image:im,ready:job});im.src=src;return annotationImageCache.get(src);
}
async function readyObjectImages(){const pngs=annotations.filter(a=>a.type==='png'&&a.src);await Promise.all(pngs.map(a=>cacheAnnotationImage(a.src)?.ready.catch(()=>null)))}
function wrapAnnotationLines(ctx,text,maxW){
 const out=[];
 for(const para of String(text||'Nota').split('\n')){
  if(!para.trim()){out.push({text:'',last:true});continue}
  let line='';
  for(const word of para.trim().split(/\s+/)){
   const next=line?line+' '+word:word;
   if(line&&ctx.measureText(next).width>maxW){out.push({text:line,last:false});line=word}else line=next;
  }
  out.push({text:line,last:true});
 }return out;
}
function drawNoteText(ctx,a,r,scale){
 // In a small/reshaped annotation, keep the text visible rather than drawing only a black background.
 // Coordinates and font are scaled together, for live previews and high-resolution exports.
 const fullText=String(a.text??'Nota'),align=a.align||'left';
 const pad=Math.max(2*scale,Math.min(8*scale,r.w/9,r.h/8));
 const roomW=Math.max(5*scale,r.w-2*pad),roomH=Math.max(5*scale,r.h-2*pad);
 let fs=Math.min((a.fontSize||17)*scale,Math.max(7*scale,roomH*.80));
 const font=()=>`${a.italic?'italic ':''}${a.bold===false?'400':'600'} ${fs}px Arial,sans-serif`;
 ctx.textBaseline='top';ctx.fillStyle=a.textColor||'#ffffff';
 let lines=[];
 for(let pass=0;pass<12;pass++){
  ctx.font=font();lines=wrapAnnotationLines(ctx,fullText,roomW);
  if(lines.length*fs*1.27<=roomH||fs<=7*scale)break;
  fs=Math.max(7*scale,fs*.88);
 }
 // Very long notes remain editable. Show as many lines as fit plus an ellipsis.
 const maxLines=Math.max(1,Math.floor(roomH/(fs*1.27)));
 if(lines.length>maxLines){lines=lines.slice(0,maxLines);const last=lines.at(-1);last.text=(last.text||'').replace(/\s+$/,'')+'…';last.last=true}
 let y=r.y+pad;
 for(const item of lines){
  ctx.font=font();ctx.fillStyle=a.textColor||'#ffffff';
  const words=item.text.split(' ');
  if(align==='justify'&&!item.last&&words.length>1){
   const textLen=words.reduce((n,t)=>n+ctx.measureText(t).width,0),gap=(roomW-textLen)/(words.length-1);
   if(gap>=0){let x=r.x+pad;for(const w of words){ctx.fillText(w,x,y,roomW);x+=ctx.measureText(w).width+gap}}else ctx.fillText(item.text,r.x+pad,y,roomW);
  }else{
   ctx.textAlign=align==='center'?'center':align==='right'?'right':'left';
   const x=align==='center'?r.x+r.w/2:align==='right'?r.x+r.w-pad:r.x+pad;
   ctx.fillText(item.text,x,y,roomW);ctx.textAlign='left';
  }
  y+=fs*1.27;
 }
}

function renderObjects(ctx,w,h,opts={}){
 if(opts.annotations===false||(opts.annotations===undefined&&!($('showAnnotations')?.checked??true)))return;
 const scale=w/viewW;ctx.save();ctx.textBaseline='top';ctx.textAlign='left';ctx.lineJoin='round';
 const list=annotationPreview?[...annotations,annotationPreview]:annotations;
 for(let i=0;i<list.length;i++){
  const a=list[i];if(!annotationInReport(a))continue;const r=screenBounds(a,w,h);if(!r||r.x>w||r.y>h||r.x+r.w<0||r.y+r.h<0)continue;
  ctx.save();ctx.strokeStyle=a.color||'#ffb74d';ctx.lineWidth=(a.strokeWidth||3)*scale;ctx.setLineDash([]);
  if(a.type==='rect')ctx.strokeRect(r.x,r.y,r.w,r.h);
  if(a.type==='circle'){ctx.beginPath();ctx.ellipse(r.x+r.w/2,r.y+r.h/2,r.w/2,r.h/2,0,0,Math.PI*2);ctx.stroke()}
  if(a.type==='polygon'){
   const pts=screenVertices(a,w,h);if(pts.length>=2&&pts.every(Boolean)){
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let j=1;j<pts.length;j++)ctx.lineTo(pts[j].x,pts[j].y);
    ctx.closePath();ctx.stroke();
   }
  }
  if(a.type==='note'){
   // During on-screen editing the textarea owns the pixels. Exports always render the canvas note.
   const editingHere=inlineNoteIndex===i&&opts.highlight!==false&&w===viewW&&h===viewH;
   if(!editingHere){
    if(a.background!==false){ctx.fillStyle='rgba(14,19,26,.82)';ctx.fillRect(r.x,r.y,r.w,r.h)}
    drawNoteText(ctx,a,r,scale);
   }
  }
  if(a.type==='png'){
   const ref=cacheAnnotationImage(a.src),im=ref?.image;
   if(im?.complete&&im.naturalWidth){
    const s=Math.min(r.w/im.naturalWidth,r.h/im.naturalHeight),dw=im.naturalWidth*s,dh=im.naturalHeight*s;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(im,r.x+(r.w-dw)/2,r.y+(r.h-dh)/2,dw,dh);
   }else{ctx.fillStyle='#28303b';ctx.fillRect(r.x,r.y,r.w,r.h)}
   // No outline on the PNG in normal viewing or exported files.
  }
  if(opts.highlight!==false&&i===selectedAnnotation&&mode==='annotate'){
   ctx.strokeStyle='#dceaf7';ctx.lineWidth=1.5*scale;ctx.setLineDash([5*scale,4*scale]);
   ctx.strokeRect(r.x-3*scale,r.y-3*scale,r.w+6*scale,r.h+6*scale);ctx.setLineDash([]);
   for(const handle of objectHandles(a)){
    const px=handle.x*(w/viewW),py=handle.y*(h/viewH),sz=(selectedShapeVertex===handle.index?7:5)*scale;
    ctx.fillStyle=selectedShapeVertex===handle.index?'#f7a944':'#ffffff';ctx.strokeStyle='#151c23';ctx.lineWidth=1*scale;
    ctx.fillRect(px-sz,py-sz,2*sz,2*sz);ctx.strokeRect(px-sz,py-sz,2*sz,2*sz);
   }
  }
  ctx.restore();
 }
 if(activePolygon&&activePolygon.length&&opts.highlight!==false){
  ctx.save();ctx.strokeStyle=$('annColor').value;ctx.lineWidth=(Number($('annStroke').value)||3)*scale;
  const pts=activePolygon.map(p=>project(p,w,h));ctx.beginPath();pts.forEach((p,i)=>{if(!p)return;i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.stroke();
  for(const p of pts)if(p){ctx.fillStyle='#fff';ctx.fillRect(p.x-4*scale,p.y-4*scale,8*scale,8*scale)}ctx.restore();
 }
 ctx.restore();
}
// A note has one stable image-anchored geometry. Text-edit mode never changes its bounds.
let inlineNoteIndex=-1,inlineNoteOriginal='';
function syncInlineNoteVisual(a){
 const ed=$('inlineNoteEditor');if(!ed||ed.hidden||!a)return;
 const r=screenBounds(a);if(!r)return;
 Object.assign(ed.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',fontSize:(a.fontSize||17)+'px',textAlign:a.align||'left',color:a.textColor||'#ffffff',fontWeight:a.bold===false?'400':'600',fontStyle:a.italic?'italic':'normal'});
 ed.classList.toggle('fv-note-clear',a.background===false);
}
function openInlineNoteEditor(index){
 const a=annotations[index],ed=$('inlineNoteEditor'),bar=$('fvNoteEditActions');
 if(!a||a.type!=='note'||!annotationInReport(a)||!ed)return;
 if(inlineNoteIndex===index&&!ed.hidden){ed.focus();return}
 closeInlineNoteEditor();setSelectedAnnotation(index);
 inlineNoteIndex=index;inlineNoteOriginal=a.text||'';objectSnapshot();if($('annText'))$('annText').disabled=true;
 ed.value=a.text||'';ed.hidden=false;if(bar)bar.hidden=false;
 syncInlineNoteVisual(a);
 ed.oninput=()=>{a.text=ed.value.slice(0,500);$('annText').value=a.text;queueFrame()};
 ed.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeInlineNoteEditor(false)}else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();closeInlineNoteEditor(true)}};
 ed.focus();ed.setSelectionRange(ed.value.length,ed.value.length);queueFrame();
}
function closeInlineNoteEditor(save=true){
 const ed=$('inlineNoteEditor'),bar=$('fvNoteEditActions');if(!ed||inlineNoteIndex<0)return;
 const i=inlineNoteIndex,a=annotations[i];
 if(a)a.text=save?ed.value.slice(0,500):inlineNoteOriginal;
 inlineNoteIndex=-1;inlineNoteOriginal='';ed.hidden=true;if($('annText'))$('annText').disabled=false;
 if(bar)bar.hidden=true;
 ed.oninput=null;ed.onkeydown=null;
 if(a){$('annText').value=a.text;setSelectedAnnotation(i);annotationChanged()}
 queueFrame();
}
function initNoteEditorActions(){
 $('fvNoteEditApply')?.addEventListener('click',()=>closeInlineNoteEditor(true));
 $('fvNoteEditCancel')?.addEventListener('click',()=>closeInlineNoteEditor(false));
 $('fvEditSelectedNote')?.addEventListener('click',()=>{
  if(selectedAnnotation<0||annotations[selectedAnnotation]?.type!=='note'){
   info('Selecciona primero una nota sobre la fotografía.',true);return;
  }
  openInlineNoteEditor(selectedAnnotation);
 });
}
function renderAnnotationList(){const host=$('annotationList');if(!host)return;
 host.innerHTML=annotations.map((a,i)=>annotationInReport(a)?`<div class="fv-annotation-row ${i===selectedAnnotation?'fv-current':''}"><span>${a.type==='rect'?'▭':a.type==='circle'?'◯':a.type==='polygon'?'⬡':a.type==='png'?'▧':'✎'} ${escapeHTML(a.type==='note'?a.text.slice(0,35):a.type==='png'?'Imagen de equipo':selectedType(a))}</span><button type="button" data-choose-ann="${i}">Editar</button></div>`:'').join('')||'<p class="helper">Aún no hay formas, notas ni imágenes en esta foto.</p>';
 host.querySelectorAll('[data-choose-ann]').forEach(b=>b.onclick=()=>{setAnnotationAction('edit');setSelectedAnnotation(Number(b.dataset.chooseAnn));viewer.scrollIntoView({block:'nearest',behavior:'smooth'})});
}
function updateAnnotationFields(){const a=annotations[selectedAnnotation];if(!a)return;
 objectSnapshot();a.color=$('annColor').value;a.fontSize=Number($('annFont').value)||17;a.text=$('annText').value.slice(0,500);
 a.align=$('annAlign').value;a.bold=$('annBold').checked;a.italic=$('annItalic').checked;
 a.background=$('annBackground').checked;a.textColor=$('annTextColor').value;a.strokeWidth=Number($('annStroke').value)||3;
 if(inlineNoteIndex===selectedAnnotation){const ed=$('inlineNoteEditor');a.text=ed.value.slice(0,500);syncInlineNoteVisual(a)}
 annotationChanged();renderAnnotationList();
}
function scaleSelectedAnnotation(){const a=annotations[selectedAnnotation];if(!a)return;
 const target=Number($('annScale').value),previous=a.uiScale||100;
 if(!Number.isFinite(target)||!previous||target===previous)return;
 const factor=target/previous;
 if(a.type==='polygon'&&a.vertices?.length){
  const pts=screenVertices(a);if(pts.some(p=>!p))return;
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const updated=pts.map(p=>{const q=clampToPhoto(cx+(p.x-cx)*factor,cy+(p.y-cy)*factor);return dirAt(q.x,q.y)});
  if(updated.some(p=>!p))return;objectSnapshot();a.vertices=updated;
 }else{
  const r=screenBounds(a);if(!r)return;
  const w=Math.max(12,r.w*factor),h=Math.max(12,r.h*factor),cx=r.x+r.w/2,cy=r.y+r.h/2;
  const rect=rectanglePoints(cx-w/2,cy-h/2,w,h);if(!rect)return;
  objectSnapshot();a.start=rect.start;a.end=rect.end;
 }
 a.uiScale=target;$('annScaleValue').textContent=target+'%';annotationChanged();
}
function convertObjectToPolygon(){
 const a=annotations[selectedAnnotation];if(!a||!['rect','circle'].includes(a.type))return;
 const b=screenBounds(a);if(!b)return;
 const pts=a.type==='rect'?[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]]:
  Array.from({length:16},(_,i)=>{const th=2*Math.PI*i/16;return[b.x+b.w/2+Math.cos(th)*b.w/2,b.y+b.h/2+Math.sin(th)*b.h/2]});
 const vertices=pts.map(([x,y])=>{const p=clampToPhoto(x,y);return dirAt(p.x,p.y)});
 if(vertices.some(p=>!p))return announceObject('La figura debe quedar dentro de la fotografía.');
 objectSnapshot();a.type='polygon';a.vertices=vertices;a.uiScale=100;
 setSelectedAnnotation(selectedAnnotation);annotationChanged();
 announceObject('Forma liberada: puedes mover todos sus vértices individualmente.');
}
function deleteAnnotation(){if(selectedAnnotation<0)return announceObject('Selecciona un objeto antes de eliminarlo.');lastEraseKind='annotation';objectSnapshot();annotations.splice(selectedAnnotation,1);setSelectedAnnotation(-1);annotationChanged()}
function insertPolygonVertex(){const a=annotations[selectedAnnotation];if(!a||a.type!=='polygon')return;
 const ps=screenVertices(a);let idx=selectedShapeVertex;
 if(idx<0){let len=-1;for(let i=0;i<ps.length;i++){const j=(i+1)%ps.length,d=Math.hypot(ps[i].x-ps[j].x,ps[i].y-ps[j].y);if(d>len){len=d;idx=i}}}
 const next=(idx+1)%ps.length,aPt=ps[idx],bPt=ps[next],m=clampToPhoto((aPt.x+bPt.x)/2,(aPt.y+bPt.y)/2),d=dirAt(m.x,m.y);
 if(!d)return;objectSnapshot();a.vertices.splice(idx+1,0,d);selectedShapeVertex=idx+1;annotationChanged();announceObject('Vértice añadido. Puedes arrastrarlo sobre la fotografía.');
}
function deletePolygonVertex(){const a=annotations[selectedAnnotation];if(!a||a.type!=='polygon'||a.vertices.length<=3)return announceObject('La forma necesita al menos tres vértices.');
 objectSnapshot();a.vertices.splice(selectedShapeVertex>=0?selectedShapeVertex:a.vertices.length-1,1);selectedShapeVertex=-1;annotationChanged();
}
function pointerShapeBounds(original,deltaX,deltaY,handle){
 const old=screenBounds(original);if(!old)return null;
 let x1=old.x,y1=old.y,x2=old.x+old.w,y2=old.y+old.h;
 // Handle ordering: top-left, top-right, bottom-right, bottom-left, top, right, bottom, left.
 if([0,3,7].includes(handle)){x1+=deltaX}else if([1,2,5].includes(handle)){x2+=deltaX}
 if([0,1,4].includes(handle)){y1+=deltaY}else if([2,3,6].includes(handle)){y2+=deltaY}
 if(x2<x1+16){if([0,3,7].includes(handle))x1=x2-16;else x2=x1+16}
 if(y2<y1+16){if([0,1,4].includes(handle))y1=y2-16;else y2=y1+16}
 return rectanglePoints(x1,y1,x2-x1,y2-y1);
}
function initAnnotationUI(){
 document.querySelectorAll('[data-fv-open-cad]').forEach(b=>b.addEventListener('click',()=>{document.getElementById('mobileProjectPanel')?.setAttribute('hidden','');document.body.classList.remove('mobile-modal-open');selectTab('export');$('cadOptions').scrollIntoView({block:'start',behavior:'smooth'});updateCADPreview()}));
 $('btnObjectsTop').onclick=()=>{selectTab('objects');setAnnotationAction('edit');$('inspector').scrollIntoView({block:'nearest',behavior:'smooth'})};
 document.querySelectorAll('[data-ann-action]').forEach(b=>b.addEventListener('click',()=>{setAnnotationAction(b.dataset.annAction);viewer.scrollIntoView({block:'nearest',behavior:'smooth'})}));
 $('annotationPNGFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(!(file.type==='image/png'||/\.png$/i.test(file.name))||file.size>12*1024*1024)return announceObject('Selecciona un PNG de máximo 12 MB.');
  const header=new Uint8Array(await file.slice(0,8).arrayBuffer());if(header.join(',')!=='137,80,78,71,13,10,26,10')return announceObject('El archivo no es un PNG válido.');
  pendingPNG=await new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(file)});
  try{await cacheAnnotationImage(pendingPNG).ready}catch{return announceObject('No se pudo leer el PNG.');}
  setAnnotationAction('png');announceObject('PNG cargado. Toca en la fotografía donde quieras colocarlo.');
 });
 $('annotationPickPNG').onclick=()=>$('annotationPNGFile').click();
 $('annotationDelete').onclick=deleteAnnotation;
 ['annText','annColor','annFont','annAlign','annBold','annItalic','annBackground','annTextColor','annStroke'].forEach(id=>$(id).addEventListener('change',updateAnnotationFields));
 $('annScale').addEventListener('input',scaleSelectedAnnotation);
 $('annotationPolygonFinish').onclick=finishPolygon;
 $('annotationPolygonCancel').onclick=()=>{cancelPolygon();$('annotationFinishFloating').hidden=true;$('annotationPolygonFinish').disabled=true;announceObject('Polígono cancelado.');};
 $('annotationAddVertex').onclick=insertPolygonVertex;$('annotationRemoveVertex').onclick=deletePolygonVertex;
 $('annotationConvertPolygon').onclick=convertObjectToPolygon;
 $('annotationFinishFloating').onclick=finishPolygon;
 $('showAnnotations').onchange=queueFrame;
 $('customCategoryAdd').onclick=createCustomCategory;
 renderAnnotationList();refreshCategories();initNoteEditorActions();
}
function annotationPointerDown(p){
 if(annotationAction==='edit'){
  const hit=objectHit(p),wasSelected=!!hit&&hit.index===selectedAnnotation;setSelectedAnnotation(hit?hit.index:-1);
  return hit?{operation:hit.handle?.kind||'move',hit:hit.index,wasSelected,handle:hit.handle?.index??-1,
   start:p,initial:JSON.stringify(annotations[hit.index]),snap:false}:null;
 }
 if(annotationAction==='polygon')return dirAt(p.x,p.y)?{operation:'polygon',start:p}:null;
 if((annotationAction==='note'||annotationAction==='png')&&!dirAt(p.x,p.y))return null;
 return{operation:'create',type:annotationAction,start:p,end:p};
}
function annotationPointerMove(data,p){
 if(!data)return;
 if(data.operation==='create'){
  if(data.type==='rect'||data.type==='circle'){
   const r=rectanglePoints(Math.min(p.x,data.start.x),Math.min(p.y,data.start.y),Math.max(8,Math.abs(p.x-data.start.x)),Math.max(8,Math.abs(p.y-data.start.y)));
   annotationPreview=r?{...r,reportId:activeReportId,type:data.type,color:$('annColor').value,strokeWidth:Number($('annStroke').value)||3}:null;queueFrame();
  }return;
 }
 if(data.operation==='polygon')return;
 const a=annotations[data.hit];if(!a)return;
 const original=JSON.parse(data.initial),dx=p.x-data.start.x,dy=p.y-data.start.y;
 if(data.operation==='vertex'){
  const dest=clampToPhoto(p.x,p.y),point=dirAt(dest.x,dest.y);if(!point)return;
  if(!data.snap){objectSnapshot();data.snap=true}
  if(a.type==='rect'){
   const old=screenBounds(original),corners=[[old.x,old.y],[old.x+old.w,old.y],[old.x+old.w,old.y+old.h],[old.x,old.y+old.h]];
   a.type='polygon';a.vertices=corners.map(([x,y])=>dirAt(clampToPhoto(x,y).x,clampToPhoto(x,y).y));
  }
  if(a.type==='polygon'&&a.vertices?.length){a.vertices[data.handle]=point;selectedShapeVertex=data.handle}
  a.uiScale=100;annotationChanged();return;
 }
 if(data.operation==='move'){
  if(a.type==='polygon'&&original.vertices?.length){
   const pts=screenVertices(original),updated=pts.map(q=>{if(!q)return null;const dest=clampToPhoto(q.x+dx,q.y+dy);return dirAt(dest.x,dest.y)});
   if(updated.some(q=>!q))return;if(!data.snap){objectSnapshot();data.snap=true}a.vertices=updated;
  }else{
   const old=screenBounds(original);if(!old)return;const dest=rectanglePoints(old.x+dx,old.y+dy,old.w,old.h);
   if(!dest)return;if(!data.snap){objectSnapshot();data.snap=true}a.start=dest.start;a.end=dest.end;
  }
  annotationChanged();return;
 }
 if(data.operation==='resize'){
  const dest=pointerShapeBounds(original,dx,dy,data.handle);if(!dest)return;
  if(!data.snap){objectSnapshot();data.snap=true}a.start=dest.start;a.end=dest.end;a.uiScale=100;
  annotationChanged();
 }
}
function annotationPointerUp(data,p){annotationPreview=null;if(!data)return;
 if(data.operation==='polygon'){
  const d=dirAt(p.x,p.y);if(!d)return;
  if(!activePolygon)activePolygon=[];
  if(activePolygon.length>=3&&Math.hypot(p.x-(project(activePolygon[0])?.x||0),p.y-(project(activePolygon[0])?.y||0))<18){finishPolygon();return}
  activePolygon.push(d);$('annotationFinishFloating').hidden=activePolygon.length<3;
  $('annotationPolygonFinish').disabled=activePolygon.length<3;
  queueFrame();announceObject('Vértice '+activePolygon.length+' marcado. Pulsa «Cerrar figura» para terminar.');return;
 }
 if(data.operation==='create')recordObject(data.type,data.start,p);
 else if(data.snap){setSelectedAnnotation(data.hit);annotationChanged()}
 queueFrame();
}
function resetCustomCategories(items){
 CATEGORIES.splice(0,CATEGORIES.length,...CATEGORIES.filter(c=>baseCategoryIds.has(c.id)));
 (Array.isArray(items)?items:[]).slice(0,35).forEach(c=>{
  if(!c||typeof c.name!=='string'||!/^(CUSTOM_[A-Za-z0-9_]{1,45})$/.test(c.id)||CATEGORIES.some(old=>old.id===c.id))return;
  CATEGORIES.push({id:c.id,name:c.name.slice(0,45),short:(c.short||c.name).slice(0,22),color:/^#[0-9a-fA-F]{6}$/.test(c.color)?c.color:'#eab308',cad:c.id});
 });
 for(const k of Object.keys(visible))delete visible[k];for(const c of CATEGORIES)visible[c.id]=true;
 refreshCategories();
}
function refreshCategories(){const last=$('routeClass').value;
 $('routeClass').innerHTML=CATEGORIES.map(c=>`<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');$('routeClass').value=CATEGORIES.some(c=>c.id===last)?last:'DC';
 $('cadCategories').innerHTML=CATEGORIES.map(c=>`<label class="cad-check"><input id="cadcat_${c.id}" type="checkbox" checked><span class="layer-swatch" style="background:${c.color}"></span>${escapeHTML(c.name)}</label>`).join('');
 $('cadCategories').querySelectorAll('input').forEach(e=>e.addEventListener('change',updateCADPreview));
 $('customCategoryList').innerHTML=CATEGORIES.filter(c=>!baseCategoryIds.has(c.id)).map(c=>`<div class="fv-annotation-row"><span style="color:${c.color}">●</span><span>${escapeHTML(c.name)}</span></div>`).join('')||'<small class="helper">Sin categorías adicionales.</small>';
 if(typeof updateTotals==='function')updateTotals();if(typeof updateCADPreview==='function')updateCADPreview();
}
function createCustomCategory(){const name=($('customCategoryName').value||'').trim().slice(0,45);
 if(!name)return announceObject('Escribe el nombre de la nueva categoría.');
 if(CATEGORIES.some(c=>c.name.toLowerCase()===name.toLowerCase()))return announceObject('Esta categoría ya existe.');
 const id='CUSTOM_'+newId('x').replace(/[^A-Za-z0-9]/g,'').slice(0,24).toUpperCase();
 const color=$('customCategoryColor').value;CATEGORIES.push({id,name,short:name.slice(0,22),color,cad:id});visible[id]=true;
 $('customCategoryName').value='';refreshCategories();$('routeClass').value=id;$('lineColor').value=color;$('colorHex').textContent=color.toUpperCase();annotationChanged();announceObject('Categoría «'+name+'» añadida a dibujo, capas, totales y DXF.');
}
function register(){
 $('exportQuickNav')?.addEventListener('change',e=>$(e.target.value)?.scrollIntoView({block:'start',behavior:'smooth'}));
 CATEGORIES.forEach(c=>{const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.name;$('routeClass').append(opt)});$('routeClass').value='DC';$('lineColor').value=category('DC').color;$('colorHex').textContent=category('DC').color.toUpperCase();
 PATTERNS.forEach((p,i)=>{const b=document.createElement('button');b.className='pattern'+(i===styleIndex?' active':'');b.type='button';b.innerHTML=`<svg viewBox="0 0 104 14"><path d="M2 7H102" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="${p.dash.length?p.dash.join(' '):'none'}"/></svg><span>${p.name}</span>`;b.onclick=()=>{styleIndex=i;markPattern();applyStyle();if($('linePatternPicker'))$('linePatternPicker').open=false};$('patterns').append(b)});
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setMode(b.dataset.tool));document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
 $('railDraw').onclick=()=>setMode('draw');$('railPhoto').onclick=()=>selectTab('photos');$('btnImport').onclick=()=>$('photoInput').click();$('btnAddPhotos').onclick=()=>$('photoInput').click();$('railReport').onclick=()=>selectTab('report');$('btnCaptureView').onclick=saveCurrentView;$('btnSaveViewFromGallery').onclick=saveCurrentView;$('btnSaveReportView').onclick=saveCurrentView;$('btnReportFromManager').onclick=exportPhotoPDF;$('btnCADFromManager').onclick=exportDistanceDXF;$('railTotals').onclick=$('btnGoTotals').onclick=()=>{selectTab('totals');$('inspector').scrollIntoView({behavior:'smooth',block:'nearest'})};$('railHelp').onclick=()=>FV360Dialog.alert('FV360: añade fotos, dibuja y registra medidas. Guarda encuadres panorámicos, exporta PDF o ZIP PNG y configura la tabla DXF en Exportar.');
 $('btnFinish').onclick=finish;$('mobileFinish').onclick=finish;$('btnCancel').onclick=cancel;$('btnUndo').onclick=undo;$('btnDelete').onclick=removeSelected;$('btnAddVertex').onclick=addVertex;$('btnRemoveVertex').onclick=removeVertex;
 $('routeClass').onchange=()=>{$('lineColor').value=category($('routeClass').value).color;applyStyle()};['lineColor','lineWidth','labelSize','labelColor','labelPosition'].forEach(id=>$(id).addEventListener('change',applyStyle));$('lineColor').addEventListener('input',()=>{$('colorHex').textContent=$('lineColor').value.toUpperCase();queueFrame()});
 $('btnMeasure').onclick=()=>{if(selectedRoute<0||selectedSegment<0)return info('Toca primero un tramo en «Editar línea».',true);const v=$('distance').value;if(v===''||!Number.isFinite(Number(v))||Number(v)<0)return info('Escribe una distancia válida (metros, mayor o igual a cero).',true);snapshot();routes[selectedRoute].lengths[selectedSegment]=Number(v);updateTotals();info('Tramo '+(selectedSegment+1)+' guardado: '+Number(v).toFixed(2)+' m.',true)};$('distance').onkeydown=e=>{if(e.key==='Enter'){$('btnMeasure').click();e.preventDefault()}};
 const mirror=(a,b)=>{const v=$(a).checked;$(b).checked=v;queueFrame()};$('showMeasurements').onchange=()=>mirror('showMeasurements','showMeasures2');$('showMeasures2').onchange=()=>mirror('showMeasures2','showMeasurements');$('showVertices').onchange=()=>mirror('showVertices','showPoints2');$('showPoints2').onchange=()=>mirror('showPoints2','showVertices');$('showLines').onchange=queueFrame;
 $('fvHandPan').onclick=()=>{setMode('navigate');info(flatMode?'Mano activa: arrastra cualquier área de la foto para mover el encuadre. Las líneas permanecen intactas.':'Navegación activa: arrastra para mirar alrededor.',true)};$('btnFront').onclick=()=>{yaw=0;pitch=0;fov=70;flatZoom=1;flatPan={x:0,y:0};dirty=true;queueFrame()};$('btnPlus').onclick=()=>zoomView(1.25);$('btnMinus').onclick=()=>zoomView(1/1.25);$('fvZoomRange').oninput=e=>setViewZoom(Number(e.target.value)/100);$('fvZoomReset').onclick=()=>{if(flatMode){flatZoom=1;flatPan={x:0,y:0}}else fov=78;dirty=true;queueFrame()};$('btnFullscreen').onclick=()=>{if(!document.fullscreenElement)viewer.requestFullscreen?.();else document.exitFullscreen?.()};
 $('btnExportPNG').onclick=()=>exportPNG(false);$('btnExportClean').onclick=()=>exportPNG(true);$('quickAnnotated').onclick=()=>exportPNG(false,true);$('btnOriginal').onclick=originalDownload;$('btnDXF').onclick=exportDistanceDXF;$('btnCADShortcut').onclick=()=>{selectTab('export');$('cadOptions').scrollIntoView({block:'nearest',behavior:'smooth'});updateCADPreview()};$('btnCSV').onclick=()=>{download(slug()+'_tramos.csv',buildCsv(false),'text/csv;charset=utf-8');info('CSV de tramos descargado.',true)};$('btnTotalsCSV').onclick=()=>{download(slug()+'_resumen_capas.csv',buildCsv(true),'text/csv;charset=utf-8');info('Resumen de capas descargado.',true)};$('btnReport').onclick=exportPhotoPDF;$('btnSave').onclick=saveProject;$('btnSaveAgain').onclick=saveProject;$('btnSaveJSON').onclick=saveProjectJSON;$('btnSaveJSONAgain').onclick=saveProjectJSON;
 $('photoInput').onchange=e=>{addPhotos(e.target.files);e.target.value=''};
 document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')&&!document.activeElement?.isContentEditable&&mode!=='navigate'&&flatMode){e.preventDefault();temporaryHandMode=mode;setMode('navigate')}});document.addEventListener('keyup',e=>{if(e.code==='Space'&&temporaryHandMode&&!pointer){const was=temporaryHandMode;temporaryHandMode=null;setMode(was)}});overlay.addEventListener('pointerdown',pointerDown);overlay.addEventListener('pointermove',pointerMove);overlay.addEventListener('pointerup',pointerUp);overlay.addEventListener('pointercancel',e=>{functionallyClearFVPageSwipe(e);fvTouchPointers.delete(e.pointerId);if(fvTouchPointers.size<2)fvPinchDistance=0;if(pointer&&pointer.id===e.pointerId)pointer=null});overlay.addEventListener('wheel',e=>{e.preventDefault();zoomView(e.deltaY<0?1.12:1/1.12)},{passive:false});
 overlay.addEventListener('dblclick',e=>{if(mode==='draw'&&activeRoute&&activeRoute.points.length>=2){e.preventDefault();finish()}});
 overlay.addEventListener('dragover',e=>e.preventDefault());overlay.addEventListener('drop',e=>{e.preventDefault();loadPhotoFile(e.dataTransfer.files[0])});
 window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;if(e.key==='Escape'){if(activeRoute)cancel();else setMode('navigate')}if(e.key==='Enter'&&mode==='draw')finish();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}if((e.key==='Delete'||e.key==='Backspace')&&(mode==='select'||mode==='annotate'||mode==='erase')){e.preventDefault();removeSelected()}});
 new ResizeObserver(dimensions).observe(viewer);window.addEventListener('resize',dimensions);document.addEventListener('visibilitychange',()=>{if(!document.hidden){dirty=true;queueFrame()}});
 document.addEventListener('dragover',e=>e.preventDefault());
 $('btnImport').insertAdjacentHTML('afterend','<button class="action-btn" id="btnLoadProject">Abrir JSON / ZIP</button>');$('btnLoadProject').onclick=()=>$('projectInput').click();$('projectInput').onchange=e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value=''};
 }
/* API interna para la aplicación móvil. Sin incrustar fotos grandes en el JSON del autoguardado. */
window.FV360Bridge={
 snapshot(){
  persistPhoto();
  return {app:'FV360 Studio Mobile',version:6,format:'FV360_MOBILE_LOCAL',project:$('projectName').value,
   reportSubtitle:$('reportSubtitle').value,reportNotes:$('reportNotes').value,technician:$('technicianName').value,
   activePhotoId:currentPhotoId, savedAt:new Date().toISOString(),
   photos:photos.map(p=>({id:p.id,name:p.name,caption:p.caption,orientation:structuredClone(p.orientation),routes:structuredClone(p.routes),annotations:structuredClone(p.annotations||[]),
    source:p.src,blob:p.blob||null})),
   reportViews:structuredClone(reportViews.map(({thumb,...v})=>v)),reports:structuredClone(allReportsForSave()),activeReportId,customCategories:CATEGORIES.filter(c=>!baseCategoryIds.has(c.id))};
 },
 async restore(snap,blobMap={}){
  if(!snap||!Array.isArray(snap.photos))throw Error('Proyecto local no válido');
  const entries=[];
  for(const p of snap.photos){let blob=blobMap[p.id]||p.blob||null;
   if(!blob&&p.source&&String(p.source).startsWith('data:image/'))blob=await (await fetch(p.source)).blob();
   if(!blob)throw Error('Falta la fotografía original: '+p.name);
   entries.push({id:p.id,name:p.name,caption:p.caption||p.name,orientation:p.orientation||{yaw:0,pitch:0,fov:78},
    routes:structuredClone(p.routes||[]),annotations:structuredClone(p.annotations||[]),blob,src:URL.createObjectURL(blob),width:0,height:0,img:null});
  }
  photos.forEach(p=>{if(p.blob&&p.src?.startsWith('blob:'))URL.revokeObjectURL(p.src)});
  photos=entries;annotationImageCache.clear();pendingPNG=null;loadReports(structuredClone(snap.reports||[]),snap.activeReportId,structuredClone(snap.reportViews||[]));currentPhotoId=null;resetCustomCategories(snap.customCategories||[]);
  routes=[];annotations=[];history=[];activeRoute=null;selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;
  $('projectName').value=snap.project||'Proyecto sin nombre';
  $('reportSubtitle').value=snap.reportSubtitle||'Reporte fotográfico';$('reportNotes').value=snap.reportNotes||'';$('technicianName').value=snap.technician||localStorage.getItem('fv360.technician')||'';
  {const linked=photosForReport();const requested=linked.find(p=>p.id===snap.activePhotoId);if(requested||linked[0])switchPhoto((requested||linked[0]).id);else this.clearViewer();}
  renderPhotos();renderReportViews();updateTotals();syncSelection();selectTab('photos');
  reportViews.forEach(v=>makeReportPreview(v));
 },
 clearViewer(){
  imageReady=false;currentPhotoId=null;routes=[];annotations=[];annotationImageCache.clear();pendingPNG=null;activePolygon=null;selectedShapeVertex=-1;yaw=0;pitch=0;fov=78;currentSrc='';
  $('photoPixels').textContent='SIN FOTOGRAFÍAS';$('viewName').value='Nueva vista';
  $('viewerLoading').textContent='Añade una fotografía para comenzar el levantamiento.';
  $('viewerLoading').hidden=false;ov.clearRect(0,0,viewW,viewH);
  const ctx=gl?null:pano.getContext('2d');if(ctx){ctx.fillStyle='#15181d';ctx.fillRect(0,0,pano.width,pano.height)}
  setMode('navigate');
 },
 fresh(name){
  photos.forEach(p=>{if(p.blob&&p.src?.startsWith('blob:'))URL.revokeObjectURL(p.src)});
  photos=[];reportViews=[];reports=[];activeReportId=null;renderReportId=null;ensureReports();updateReportControls();activeRoute=null;routes=[];annotations=[];activePolygon=null;selectedShapeVertex=-1;resetCustomCategories([]);history=[];selectedRoute=-1;selectedSegment=-1;selectedVertex=-1;
  $('projectName').value=name||'Nuevo levantamiento';
  $('reportSubtitle').value='Reporte fotográfico';$('reportNotes').value='';
  this.clearViewer();renderPhotos();renderReportViews();updateTotals();syncSelection();selectTab('photos');
 },
 notify:mobileNotify,
 openTab:selectTab,
 addPhotoFiles:addPhotos,
 saveJSON:saveProjectJSON,
 importProject:loadProjectV3,
 changeMode:setMode,
 finishRoute:finish,
 getStats(){persistPhoto();return{photos:photos.length,views:reportViews.length,routes:photos.reduce((n,p)=>n+(p.routes||[]).length,0)}},
 getProjectName(){return $('projectName').value||'Nuevo levantamiento'},
 getReportName(){return activeReport()?.name||'Reporte 01'},
 beginNote(){selectTab('notes');setAnnotationAction('note')},
 getNotes(){return annotations.map((a,i)=>({index:i,type:a.type,text:a.text||''})).filter(a=>a.type==='note'&&annotationInReport(annotations[a.index]))},
 getSelectedAnnotation(){const a=annotations[selectedAnnotation];return a?{index:selectedAnnotation,type:a.type,uiScale:a.uiScale||100}:null},
 getQuickSelection(){
  const a=annotations[selectedAnnotation];
  if(a&&annotationInReport(a)&&mode==='annotate')return{kind:a.type==='note'?'note':'object',id:a.id,index:selectedAnnotation,type:a.type,description:selectedType(a),text:a.text||'',font:a.fontSize||17,align:a.align||'left',background:a.background!==false,textColor:a.textColor||'#ffffff',scale:a.uiScale||100,color:a.color||'#ffb74d',stroke:a.strokeWidth||3};
  if(mode!=='select')return null;
  const r=routes[selectedRoute];
  if(r&&routeInReport(r))return{kind:'route',id:r.id,route:selectedRoute,segment:selectedSegment,category:r.category,length:selectedSegment>=0?(r.lengths[selectedSegment]??''):'',count:r.lengths.length,width:r.width,color:r.color,pattern:r.pattern||0,labelSize:r.labelSize,labelPosition:r.labelPosition};
  return null;
 },
 deleteSelectedAnnotation(){if(selectedAnnotation<0||!annotations[selectedAnnotation])return false;deleteAnnotation();return true},
 beginErase(){setSelectedAnnotation(-1);selectedRoute=-1;selectedSegment=-1;setMode('erase');info('Borrador activo. Toca un objeto, texto o trayectoria para eliminarlo.',true);return true},
 selectNote(i){if(!annotations[i]||annotations[i].type!=='note')return;setAnnotationAction('edit');setSelectedAnnotation(i);selectTab('notes');openInlineNoteEditor(i)},
 editSelectedNote(){if(annotations[selectedAnnotation]?.type==='note')openInlineNoteEditor(selectedAnnotation)},
 getLibraryStats(){return {photos:photos.length,reportPhotos:photosForReport().length,reports:reports.length,views:allReportsForSave().reduce((n,r)=>n+(r.views||[]).length,0)}}
};
 register();markPattern();initV4();initReportsUI();initAnnotationUI();initWebGL();window.FV360Bridge.fresh('Nuevo levantamiento');dimensions();

})();
