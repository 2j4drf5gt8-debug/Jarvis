/* Jarvis-Szene: Höhle, Globus, Fledermäuse, Ton. Abgeleitet vom freigegebenen Stilprototyp v12. */
(()=>{
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let lt=false,listen=0,talk=0;

/* Landmaske 1024x512, 1 Bit/Pixel, MSB zuerst */
const LAND=Uint8Array.from(atob(window.JARVIS_LAND||''),c=>c.charCodeAt(0));
function isLand(lon,lat){let x=Math.floor((lon+180)/360*1024);x=((x%1024)+1024)%1024;const y=Math.min(511,Math.max(0,Math.floor((90-lat)/180*512)));const i=y*1024+x;return (LAND[i>>3]>>(7-(i&7)))&1}

/* Boot */
const lines=['> J.A.R.V.I.S KERNEL 6.0 ……… OK','> HÖHLENSYSTEM ……………… ONLINE','> GLOBALE KARTE …………… GELADEN','> GMAIL-BRÜCKE ……………… OK','> SPRACHMODUL ……………… BEREIT','> ZUGRIFF AUTORISIERT.','> WILLKOMMEN ZURÜCK, MASTER LEON.'];
let bootBurst=true;const boot=document.getElementById('boot'),bl=document.getElementById('bootlog'),bb=document.getElementById('bootbar');
if(reduce)boot.classList.add('off');else{let i=0;const iv=setInterval(()=>{bl.textContent+=lines[i]+'\n';bb.style.width=((i+1)/lines.length*100)+'%';if(++i>=lines.length){clearInterval(iv);setTimeout(()=>boot.classList.add('off'),450)}},220)}

/* ---------- Höhle (Foto + Effekte) ---------- */
const env=document.getElementById('env'),ex=env.getContext('2d'),IW=1672,IH=941;
const photo=new Image();photo.src='assets/cave.jpg';
let EW=0,EH=0;
function envSize(){const r=env.getBoundingClientRect(),d=Math.min(devicePixelRatio,1.5);EW=env.width=Math.max(2,Math.round(r.width*d));EH=env.height=Math.max(2,Math.round(r.height*d))}
const streak=(()=>{const c=document.createElement('canvas');c.width=128;c.height=512;const x=c.getContext('2d');
  for(let i=0;i<280;i++){const sx=Math.random()*128,len=30+Math.random()*170,w=.6+Math.random()*1.8,cx=Math.abs(sx-64)/64,a=(1-cx*cx)*(.12+Math.random()*.5),sy=Math.random()*512;
    const g=x.createLinearGradient(0,0,0,len);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(235,242,250,${a.toFixed(3)})`);g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;
    x.save();x.translate(sx,sy);x.fillRect(0,0,w,len);x.restore();if(sy+len>512){x.save();x.translate(sx,sy-512);x.fillRect(0,0,w,len);x.restore()}}
  return c})();
function blob(cx,cy,r,a,c){const g=ex.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ex.fillStyle=g;ex.beginPath();ex.arc(cx,cy,r,0,7);ex.fill()}
function drawEnv(T){if(!EW)return;const pmx=typeof mx==='number'?mx:0,pmy=typeof my==='number'?my:0;
  const s=Math.max(EW/IW,EH/IH)*1.04,ox=(EW-IW*s)/2-pmx*EW*.014,oy=(EH-IH*s)/2-pmy*EH*.01,X=v=>ox+v*s,Y=v=>oy+v*s;
  ex.globalCompositeOperation='source-over';ex.globalAlpha=1;
  if(photo.complete&&photo.naturalWidth)ex.drawImage(photo,ox,oy,IW*s,IH*s);else{ex.fillStyle='#030406';ex.fillRect(0,0,EW,EH)}
  ex.globalCompositeOperation='screen';
  const wx0=X(1035),ww=150*s,wy0=Y(40),wh=600*s;ex.save();ex.beginPath();ex.rect(wx0,wy0,ww,wh);ex.clip();ex.globalAlpha=.5;
  const th=streak.height*(ww/streak.width),off=((T*1.3)%1)*th;for(let y=wy0-th+off;y<wy0+wh;y+=th)ex.drawImage(streak,wx0,y,ww,th);ex.restore();ex.globalAlpha=1;
  for(let i=0;i<7;i++){const a=T*.25+i*1.7;blob(X(1100+Math.sin(a)*70+i*6-20),Y(570-((T*12+i*40)%120)),(90+i*14)*s,.065,'200,215,230')}
  for(let i=0;i<6;i++){blob(X(((i*330+T*18)%2000)-160),Y(655+Math.sin(T*.05+i)*14),220*s,.04,'170,185,200')}
  ex.save();ex.globalAlpha=.045+.03*Math.sin(T*.7);ex.fillStyle='#dce8f5';ex.beginPath();ex.moveTo(X(1060),Y(0));ex.lineTo(X(1160),Y(0));ex.lineTo(X(1260),Y(620));ex.lineTo(X(930),Y(620));ex.fill();ex.restore();
  const gl2=listen+talk*.6;
  ex.save();ex.translate(X(836),Y(752));ex.scale(1,.2);blob(0,0,340*s,.2+gl2*.18,'120,170,220');ex.restore();
  ex.save();ex.translate(X(836),Y(820));ex.scale(.16,1);blob(0,0,240*s,.12+gl2*.1,'150,190,230');ex.restore();
  ex.globalCompositeOperation='source-over';
  const vg=ex.createRadialGradient(EW/2,EH*.48,Math.min(EW,EH)*.35,EW/2,EH*.48,Math.max(EW,EH)*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.55)');ex.fillStyle=vg;ex.fillRect(0,0,EW,EH)}

/* ---------- 2D-Instrumente ---------- */
function cv(id){const c=document.getElementById(id);return{c,x:c.getContext('2d')}}
const MAP=cv('map'),FEED=cv('feed'),SPK=cv('spk'),W2=cv('w2');
const HOME=[-5.85,43.36];let places=[];
function fit(o){const w=o.c.clientWidth*2,h=o.c.clientHeight*2;if(o.c.width!==w||o.c.height!==h){o.c.width=w;o.c.height=h}return[w,h]}
let mapDots=null;
function drawMap(T){const [w,h]=fit(MAP),x=MAP.x;if(!w)return;x.clearRect(0,0,w,h);
  const L0=-14,L1=24,B0=34,B1=61,P=(lo,la)=>[(lo-L0)/(L1-L0)*w,(B1-la)/(B1-B0)*h];
  if(!mapDots||mapDots.w!==w){mapDots={w,p:[]};for(let px=0;px<w;px+=6)for(let py=0;py<h;py+=6){const lo=L0+px/w*(L1-L0),la=B1-py/h*(B1-B0);if(isLand(lo,la))mapDots.p.push([px,py])}}
  x.fillStyle='rgba(228,230,232,.35)';mapDots.p.forEach(([a,b])=>x.fillRect(a,b,2.4,2.4));
  const o=P(...HOME);places.forEach((pl,i)=>{const p=P(pl.lon,pl.lat);x.strokeStyle=`rgba(255,255,255,${.35+.3*Math.sin(T*2+i)})`;x.lineWidth=1.4;x.beginPath();x.moveTo(o[0],o[1]);x.quadraticCurveTo((o[0]+p[0])/2-20,Math.min(o[1],p[1])-h*.22,p[0],p[1]);x.stroke()});
  [{lon:HOME[0],lat:HOME[1],name:'OVIEDO'},...places].forEach(pl=>{const p=P(pl.lon,pl.lat),q=Math.sin(T*3+p[0])*.5+.5;x.fillStyle=`rgba(255,255,255,${.18*q})`;x.beginPath();x.arc(p[0],p[1],6+q*6,0,7);x.fill();x.fillStyle='#fff';x.beginPath();x.arc(p[0],p[1],3,0,7);x.fill()});
  x.fillStyle='rgba(228,230,232,.75)';x.font='500 18px "Saira Semi Condensed",sans-serif';x.fillText('OVIEDO',o[0]+10,o[1]+5);
  const seen=new Set();places.forEach(pl=>{if(seen.has(pl.name))return;seen.add(pl.name);const p=P(pl.lon,pl.lat);x.fillText(pl.name.toUpperCase(),p[0]+8,p[1]-8)})}
let bld=null;
function drawFeed(T){const [w,h]=fit(FEED),x=FEED.x;if(!w)return;
  if(!bld||bld.w!==w){bld={w,b:[]};let px=0;while(px<w){const bw=14+Math.random()*34,bh=h*(.18+Math.random()*.45);bld.b.push({x:px,w:bw,h:bh,win:Array.from({length:40},()=>Math.random()<.22)});px+=bw+2}}
  const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,'#05070a');g.addColorStop(1,'#11151a');x.fillStyle=g;x.fillRect(0,0,w,h);
  x.fillStyle='rgba(200,210,220,.05)';x.beginPath();x.ellipse(w*.7,h*.25,w*.3,h*.12,0,0,7);x.fill();
  {const a=Math.sin(T*.35)*.5-.15,bxp=w*.78,lx=bxp+Math.sin(a)*h*1.4,ly=h-Math.cos(a)*h*1.4;const sg=x.createLinearGradient(bxp,h,lx,ly);sg.addColorStop(0,'rgba(230,225,190,.35)');sg.addColorStop(1,'rgba(230,225,190,0)');
   x.fillStyle=sg;x.beginPath();x.moveTo(bxp-3,h);x.lineTo(lx-26,ly);x.lineTo(lx+26,ly);x.lineTo(bxp+3,h);x.fill();
   const cg=x.createRadialGradient(w*.3,h*.2,0,w*.3,h*.2,w*.13);cg.addColorStop(0,'rgba(235,230,200,.28)');cg.addColorStop(.6,'rgba(235,230,200,.12)');cg.addColorStop(1,'rgba(235,230,200,0)');x.fillStyle=cg;x.beginPath();x.ellipse(w*.3,h*.2,w*.13,h*.16,0,0,7);x.fill()}
  const cx=w*.42;x.fillStyle='#07090c';x.beginPath();x.moveTo(cx-10,h);x.lineTo(cx-10,h*.32);x.lineTo(cx,h*.08);x.lineTo(cx+10,h*.32);x.lineTo(cx+10,h);x.fill();
  bld.b.forEach((b,i)=>{x.fillStyle='#090b0e';x.fillRect(b.x,h-b.h,b.w,b.h);x.fillStyle='rgba(225,220,200,.55)';let k=0;for(let wy=h-b.h+6;wy<h-6;wy+=9)for(let wx=b.x+4;wx<b.x+b.w-4;wx+=8){const on=b.win[k++%40]&&(Math.sin(T*.5+i*7+k)>-0.9);if(on)x.fillRect(wx,wy,3,4)}});
  x.strokeStyle='rgba(200,210,220,.22)';x.lineWidth=1;x.beginPath();for(let i=0;i<70;i++){const rx=(i*97+T*420*(1+(i%3)*.3))%(w+40)-20,ry=(i*53+T*900*(1+(i%4)*.2))%(h+30)-15;x.moveTo(rx,ry);x.lineTo(rx-5,ry+14)}x.stroke();
  x.fillStyle='rgba(255,255,255,.035)';for(let y=0;y<h;y+=3)x.fillRect(0,y,w,1);
  for(let i=0;i<350;i++){x.fillStyle=`rgba(255,255,255,${Math.random()*.06})`;x.fillRect(Math.random()*w,Math.random()*h,1.5,1.5)}
  x.fillStyle='rgba(228,230,232,.7)';x.font='16px "Share Tech Mono",monospace';x.fillText('REC '+new Date().toLocaleTimeString('de-DE'),10,22)}
let pro=[];
function drawSpk(){const [w,h]=fit(SPK),x=SPK.x;if(!w)return;x.clearRect(0,0,w,h);if(pro.length<2)return;const mn=Math.min(...pro)-10,mxv=Math.max(...pro)+10,P=i=>[i/(pro.length-1)*(w-8)+4,h-6-(pro[i]-mn)/(mxv-mn)*(h-12)];
  x.strokeStyle='rgba(255,255,255,.08)';x.lineWidth=1;[.33,.66].forEach(f=>{x.beginPath();x.moveTo(0,h*f);x.lineTo(w,h*f);x.stroke()});
  const gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(228,230,232,.22)');gr.addColorStop(1,'rgba(228,230,232,0)');x.fillStyle=gr;x.beginPath();x.moveTo(...P(0));pro.forEach((_,i)=>x.lineTo(...P(i)));x.lineTo(w-4,h);x.lineTo(4,h);x.fill();
  x.strokeStyle='#e4e6e8';x.lineWidth=2;x.beginPath();pro.forEach((_,i)=>i?x.lineTo(...P(i)):x.moveTo(...P(i)));x.stroke();const e=P(pro.length-1);x.fillStyle='#fff';x.beginPath();x.arc(e[0],e[1],4,0,7);x.fill()}
function drawWave(T){const [w,h]=fit(W2),x=W2.x;if(!w)return;x.clearRect(0,0,w,h);x.strokeStyle='#e4e6e8';x.lineWidth=2;x.beginPath();const amp=.12+listen*.8+talk*.7,n=110;
  for(let i=0;i<=n;i++){const en=Math.exp(-Math.pow((i/n-.5)*3.4,2));const y=h/2+(Math.sin(T*11+i*1.3)*.6+Math.sin(T*17+i*2.1)*.4)*h*.45*amp*en;i?x.lineTo(i*w/n,y):x.moveTo(0,y)}x.stroke()}

/* ---------- Holo-Globus ---------- */
const gl=document.getElementById('gl'),T3=window.THREE;let R,comp,bloom,scene,cam,tilt,spin,mO,mL,arcPulse,orbits=[],base,beam,glowS;
const geoO=document.getElementById('geoO'),geoL=document.getElementById('geoL');
const RAD=1.75,ll=(lon,lat,r=RAD)=>{const a=lat*Math.PI/180,b=lon*Math.PI/180;return new T3.Vector3(r*Math.cos(a)*Math.sin(b),r*Math.sin(a),r*Math.cos(a)*Math.cos(b))};
function tex(fn){const c=document.createElement('canvas');c.width=c.height=256;fn(c.getContext('2d'));return new T3.CanvasTexture(c)}
if(T3){try{
  R=new T3.WebGLRenderer({canvas:gl,antialias:true,alpha:false});R.setClearColor(0,1);
  scene=new T3.Scene();cam=new T3.PerspectiveCamera(32,1,.1,100);
  const ADD={transparent:true,blending:T3.AdditiveBlending,depthWrite:false};
  const dot=tex(x=>{const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'#fff');g.addColorStop(.25,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,256,256)});
  tilt=new T3.Group();tilt.rotation.x=.62;scene.add(tilt);spin=new T3.Group();tilt.add(spin);
  spin.add(new T3.Mesh(new T3.SphereGeometry(RAD*.992,64,48),new T3.MeshBasicMaterial({color:0x000000})));
  const lp=[],lcol=[],cp=[],N=90000,ga=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<N;i++){const y=1-(i/(N-1))*2,r=Math.sqrt(1-y*y),th=ga*i,lat=Math.asin(y)*180/Math.PI;let lon=(Math.atan2(Math.cos(th)*r,Math.sin(th)*r))*180/Math.PI;
    if(isLand(lon,lat)){const v=ll(lon,lat,RAD*1.002);lp.push(v.x,v.y,v.z);const b=.35+Math.random()*.35;lcol.push(b*.92,b*.97,b);if(Math.random()<.035)cp.push(v.x,v.y,v.z)}}
  const lg=new T3.BufferGeometry();lg.setAttribute('position',new T3.Float32BufferAttribute(lp,3));lg.setAttribute('color',new T3.Float32BufferAttribute(lcol,3));
  spin.add(new T3.Points(lg,new T3.PointsMaterial({size:.022,vertexColors:true,map:dot,transparent:true,blending:T3.AdditiveBlending,depthWrite:false})));
  const cg=new T3.BufferGeometry();cg.setAttribute('position',new T3.Float32BufferAttribute(cp,3));
  spin.add(new T3.Points(cg,new T3.PointsMaterial({size:.06,color:0xf2f6ff,map:dot,...ADD})));
  const grat=[];for(let la=-75;la<=75;la+=15){for(let lo=-180;lo<180;lo+=3){const a=ll(lo,la,RAD*1.004),b=ll(lo+3,la,RAD*1.004);grat.push(a.x,a.y,a.z,b.x,b.y,b.z)}}
  for(let lo=-180;lo<180;lo+=15){for(let la=-87;la<87;la+=3){const a=ll(lo,la,RAD*1.004),b=ll(lo,la+3,RAD*1.004);grat.push(a.x,a.y,a.z,b.x,b.y,b.z)}}
  const gg=new T3.BufferGeometry();gg.setAttribute('position',new T3.Float32BufferAttribute(grat,3));spin.add(new T3.LineSegments(gg,new T3.LineBasicMaterial({color:0xcfe2f1,opacity:.09,...ADD})));
  const cities=[[-74,40.7],[-0.1,51.5],[2.35,48.85],[13.4,52.5],[139.7,35.7],[-122.4,37.8],[77.2,28.6],[103.8,1.35],[-46.6,-23.5],[18.4,-33.9],[151.2,-33.9],[37.6,55.75],[31.2,30],[-99.1,19.4],[55.3,25.2],[121.5,31.2],[-3.7,40.4],[12.5,41.9],[-5.85,43.36],[7.45,53.23]];
  function arc(a,b,h,col,op){const A=ll(...a,1).normalize(),B=ll(...b,1).normalize(),pts=[];const ang=A.angleTo(B);for(let i=0;i<=64;i++){const t=i/64,v=new T3.Vector3().copy(A).multiplyScalar(Math.sin((1-t)*ang)).add(new T3.Vector3().copy(B).multiplyScalar(Math.sin(t*ang))).divideScalar(Math.sin(ang));pts.push(v.multiplyScalar(RAD*(1+h*Math.sin(Math.PI*t)*ang/2)))}
    const l=new T3.Line(new T3.BufferGeometry().setFromPoints(pts),new T3.LineBasicMaterial({color:col,opacity:op,transparent:true,blending:T3.AdditiveBlending,depthWrite:false}));spin.add(l);return pts}
  for(let i=0;i<34;i++){const a=cities[Math.floor(Math.random()*cities.length)],b=cities[Math.floor(Math.random()*cities.length)];if(a!==b)arc(a,b,.35,0xdfe9f2,.22)}
  const main=arc([-5.85,43.36],[7.45,53.23],1.6,0xffffff,.95);
  arcPulse=new T3.Sprite(new T3.SpriteMaterial({map:dot,color:0xffffff,...ADD}));arcPulse.scale.setScalar(.14);arcPulse.userData.pts=main;spin.add(arcPulse);
  const mk=()=>{const s=new T3.Sprite(new T3.SpriteMaterial({map:dot,color:0xffffff,...ADD}));s.scale.setScalar(.2);spin.add(s);return s};
  mO=mk();mO.position.copy(ll(-5.85,43.36,RAD*1.01));mL=mk();mL.position.copy(ll(7.45,53.23,RAD*1.01));
  const rim=new T3.Sprite(new T3.SpriteMaterial({map:tex(x=>{const g=x.createRadialGradient(128,128,96,128,128,128);g.addColorStop(0,'rgba(200,225,245,0)');g.addColorStop(.35,'rgba(200,225,245,.35)');g.addColorStop(1,'rgba(200,225,245,0)');x.fillStyle=g;x.fillRect(0,0,256,256)}),...ADD}));rim.scale.setScalar(RAD*2*1.33);scene.add(rim);
  glowS=new T3.Sprite(new T3.SpriteMaterial({map:tex(x=>{const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.2,'rgba(210,230,250,.35)');g.addColorStop(1,'rgba(150,190,230,0)');x.fillStyle=g;x.fillRect(0,0,256,256)}),...ADD}));glowS.scale.setScalar(.9);glowS.position.set(.25,.35,RAD*.6);
  const circ=(r,seg=240)=>{const a=[];for(let i=0;i<=seg;i++){const t=i/seg*Math.PI*2;a.push(new T3.Vector3(Math.cos(t)*r,0,Math.sin(t)*r))}return new T3.BufferGeometry().setFromPoints(a)};
  [[2.45,.42,-.2,.55,0],[2.7,-.3,.25,.4,1],[2.95,1.15,.3,.3,0],[2.3,-1.0,-.4,.25,1]].forEach(([r,rx,rz,o,d])=>{const g=new T3.Group();g.rotation.set(rx,0,rz);const m=d?new T3.LineDashedMaterial({color:0xe6eef5,dashSize:.05,gapSize:.07,opacity:o,...ADD}):new T3.LineBasicMaterial({color:0xe6eef5,opacity:o,...ADD});const l=new T3.Line(circ(r),m);if(d)l.computeLineDistances();g.add(l);
    const sat=new T3.Sprite(new T3.SpriteMaterial({map:dot,color:0xffffff,...ADD}));sat.scale.setScalar(.1);g.add(sat);scene.add(g);orbits.push({g,sat,r,s:.15+Math.random()*.2,o:Math.random()*6})});
  base=new T3.Group();base.position.y=-2.3;scene.add(base);
  const disk=new T3.Mesh(new T3.CylinderGeometry(1.25,1.4,.16,96),new T3.MeshBasicMaterial({color:0x0c0e11}));disk.position.y=-.08;base.add(disk);
  [[.3,.9],[.55,.6],[.8,.45],[1.05,.55],[1.32,.35],[1.7,.22],[2.2,.14]].forEach(([r,o],i)=>{const m=i%2?new T3.LineDashedMaterial({color:0xe6eef5,dashSize:.05+i*.02,gapSize:.05,opacity:o,...ADD}):new T3.LineBasicMaterial({color:0xe6eef5,opacity:o,...ADD});const l=new T3.Line(circ(r),m);if(i%2)l.computeLineDistances();l.position.y=.005;l.userData.s=(i%2?-1:1)*(.002+.0007*i);base.add(l)});
  const disc=new T3.Mesh(new T3.CircleGeometry(.6,64),new T3.MeshBasicMaterial({map:dot,color:0xdfe9f2,opacity:.8,...ADD}));disc.rotation.x=-Math.PI/2;disc.position.y=.01;base.add(disc);
  beam=new T3.Mesh(new T3.CylinderGeometry(.12,.42,1.1,48,1,true),new T3.MeshBasicMaterial({map:tex(x=>{const g=x.createLinearGradient(0,0,0,256);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(220,235,250,1)');x.fillStyle=g;x.fillRect(0,0,256,256)}),color:0xdfe9f2,opacity:.35,side:T3.DoubleSide,...ADD}));beam.scale.y=.5;beam.position.y=-2.03;scene.add(beam);
  if(T3.EffectComposer&&T3.UnrealBloomPass){comp=new T3.EffectComposer(R);comp.addPass(new T3.RenderPass(scene,cam));bloom=new T3.UnrealBloomPass(new T3.Vector2(512,512),.7,.5,.18);comp.addPass(bloom)}
}catch(err){console.error('Globus:',err);R=null;comp=null}}
let camZ=11,lookY=-.3,zoomK=1,zoomT=1;
function size(){envSize();if(!R)return;const r=gl.getBoundingClientRect(),w=r.width,h=r.height,a=w/h;R.setPixelRatio(Math.min(devicePixelRatio,1.75));R.setSize(w,h,false);
  const narrow=w<1150;cam.aspect=a;camZ=(narrow?13:12)*Math.max(1,.95/a);lookY=-.3;cam.position.set(0,.45,camZ*zoomK);cam.lookAt(0,lookY,0);cam.updateProjectionMatrix();
  if(comp){comp.setPixelRatio(Math.min(devicePixelRatio,1.5));comp.setSize(w,h)}}
size();addEventListener('resize',size);
let mx=0,my=0;addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5});
const v3=T3?new T3.Vector3():null;
function place(el,obj){if(!obj)return;obj.getWorldPosition(v3);const n=v3.clone().sub(new T3.Vector3(0,0,0)).normalize(),toCam=cam.position.clone().sub(v3).normalize();const vis=n.dot(toCam)>.15;v3.project(cam);const r=gl.getBoundingClientRect();
  el.style.left=((v3.x+1)/2*r.width)+'px';el.style.top=((1-v3.y)/2*r.height)+'px';el.style.opacity=vis?1:0}

/* ---------- Loop ---------- */
let last=0;
function loop(t){const T=t/1000;listen+=((lt?1:0)-listen)*.05;talk*=.95;const e=Math.min(1,listen+talk*.7);
  if(t-last>30){drawEnv(T);last=t}
  drawMap(T);drawFeed(T);drawWave(T);if(typeof drawBats==='function')drawBats(T);
  if(R){zoomK+=(zoomT-zoomK)*.04;cam.position.set(0,.45+(1-zoomK)*.6,camZ*zoomK);cam.lookAt(0,lookY+(1-zoomK)*1.2,0);
    spin.rotation.y=Math.sin(T*.08)*.7+mx*.25+e*Math.sin(T*.6)*.1;tilt.rotation.x=.62+my*.12;
    const p=Math.sin(T*2.2)*.5+.5;[mO,mL].forEach((m,i)=>m.scale.setScalar(.16+.1*Math.sin(T*3+i*1.5)**2));
    const pts=arcPulse.userData.pts,k=(T*.35)%1;arcPulse.position.copy(pts[Math.floor(k*(pts.length-1))]);
    orbits.forEach(o=>{const a=T*o.s*(1+e*2)+o.o;o.sat.position.set(Math.cos(a)*o.r,0,Math.sin(a)*o.r);o.g.rotation.y+=.0006*(1+e*3)});
    base.children.forEach(l=>{if(l.userData.s)l.rotation.y+=l.userData.s*(1+e*2)});
    beam.material.opacity=.28+p*.06+e*.2;if(bloom)bloom.strength=.65+e*.5+p*.05;
    comp?comp.render():R.render(scene,cam);place(geoO,mO);place(geoL,mL)}
  if(!reduce)requestAnimationFrame(loop)}
requestAnimationFrame(loop);drawSpk();addEventListener('resize',drawSpk);
if(reduce){drawEnv(0)}

/* ---------- Interaktion (API für main.js) ---------- */
const mode=document.getElementById('mode'),say=document.getElementById('say');let typeIv=null;
function type(s,done){clearInterval(typeIv);say.textContent='';let i=0;typeIv=setInterval(()=>{say.textContent=s.slice(0,++i);talk=1;if(i>=s.length){clearInterval(typeIv);if(done)done()}},22)}
/* ---------- Fledermäuse & Tropfen ---------- */
const BC=document.getElementById('bats'),bx=BC.getContext('2d');let bats=[],drops=[],nextSwarm=2.5;
function batsSize(){const r=BC.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);BC.width=Math.round(r.width*d);BC.height=Math.round(r.height*d)}
batsSize();addEventListener('resize',batsSize);
function spawnSwarm(T){const w=BC.width,h=BC.height,n=18+Math.floor(Math.random()*14),dir=Math.random()<.5?-1:1;
  for(let i=0;i<n;i++)bats.push({x:w*(.62+Math.random()*.06),y:h*(.08+Math.random()*.08),vx:dir*(2.2+Math.random()*2.6)*(w/1400),vy:(.4+Math.random()*1.1)*(h/900),s:(5+Math.random()*9)*(w/1400),ph:Math.random()*6,fr:14+Math.random()*8,wob:Math.random()*6,born:T+i*.06})}
function drawBat(b,T){const s=b.s,f=Math.sin(T*b.fr+b.ph);bx.save();bx.translate(b.x,b.y);bx.rotate(Math.atan2(b.vy,b.vx)*.15);
  const wy=f*s*.75;bx.beginPath();bx.moveTo(0,-s*.15);
  bx.quadraticCurveTo(-s*.9,-s*.25+wy,-s*2,wy-s*.1);bx.lineTo(-s*1.55,wy+s*.25);bx.lineTo(-s*1.15,wy*.6+s*.15);bx.lineTo(-s*.75,wy*.4+s*.3);bx.lineTo(-s*.35,s*.25);
  bx.lineTo(0,s*.45);bx.lineTo(s*.35,s*.25);bx.lineTo(s*.75,wy*.4+s*.3);bx.lineTo(s*1.15,wy*.6+s*.15);bx.lineTo(s*1.55,wy+s*.25);bx.lineTo(s*2,wy-s*.1);bx.quadraticCurveTo(s*.9,-s*.25+wy,0,-s*.15);
  bx.fillStyle='#030303';bx.fill();bx.strokeStyle='rgba(190,205,220,'+(.18+flash*.6)+')';bx.lineWidth=1;bx.stroke();bx.restore()}
const FL=document.getElementById('flash');let flash=0,nextBolt=6,bolt=[];
const hang=Array.from({length:9},(_,i)=>({fx:.08+i*.1+Math.random()*.04,fy:.2+Math.random()*.05,s:.8+Math.random()*.6,ph:Math.random()*6}));
function drawHang(b,T,w,h){const s=b.s*7*(w/1400),x=b.fx*w,y=b.fy*h;bx.save();bx.translate(x,y);bx.rotate(Math.sin(T*.8+b.ph)*.08);
  bx.strokeStyle='rgba(0,0,0,.9)';bx.lineWidth=1;bx.beginPath();bx.moveTo(0,-s*1.2);bx.lineTo(0,-s*.4);bx.stroke();
  bx.beginPath();bx.moveTo(0,-s*.5);bx.quadraticCurveTo(s*.9,-s*.2,s*.5,s*1.4);bx.quadraticCurveTo(0,s*1.9,-s*.5,s*1.4);bx.quadraticCurveTo(-s*.9,-s*.2,0,-s*.5);
  bx.moveTo(-s*.25,s*1.55);bx.lineTo(-s*.35,s*2);bx.lineTo(-s*.1,s*1.75);bx.moveTo(s*.25,s*1.55);bx.lineTo(s*.35,s*2);bx.lineTo(s*.1,s*1.75);
  bx.fillStyle='#020202';bx.fill();bx.strokeStyle='rgba(170,185,200,'+(.12+flash*.5)+')';bx.stroke();bx.restore()}
function drawBats(T){const w=BC.width,h=BC.height;bx.clearRect(0,0,w,h);
  if(T>nextBolt&&!reduce){bolt=[0,.09,.18,.32].map((d,i)=>({t:T+d+Math.random()*.05,a:i===2?.55:1}));nextBolt=T+9+Math.random()*14;setTimeout(thunder,250+Math.random()*500)}
  bolt.forEach(b=>{if(Math.abs(T-b.t)<.03)flash=Math.max(flash,b.a)});flash*=.86;FL.style.opacity=flash.toFixed(3);
  hang.forEach(b=>drawHang(b,T,w,h));
  if(bootBurst&&boot.classList.contains('off')){bootBurst=false;for(let i=0;i<46;i++){const a=Math.random()*6.283;bats.push({x:w*.5,y:h*.42,vx:Math.cos(a)*(3+Math.random()*5)*(w/1400),vy:Math.sin(a)*(2+Math.random()*4)*(h/900)-1,s:(8+Math.random()*16)*(w/1400),ph:Math.random()*6,fr:16+Math.random()*8,wob:Math.random()*6,born:T+Math.random()*.4,grow:1.012})}nextSwarm=T+12}
  if(T>nextSwarm){spawnSwarm(T);nextSwarm=T+14+Math.random()*10}
  bats=bats.filter(b=>b.x>-200&&b.x<w+200&&b.y>-200&&b.y<h*.9);bats.forEach(b=>{if(T<b.born)return;b.x+=b.vx;b.y+=b.vy+Math.sin(T*3+b.wob)*.8;b.vy*=.995;if(b.grow){b.s*=b.grow;b.vx*=1.01;b.vy*=1.01}drawBat(b,T)});
  if(Math.random()<.06)drops.push({x:w*(.1+Math.random()*.8),y:h*(.12+Math.random()*.12),v:0});
  bx.strokeStyle='rgba(200,215,230,.35)';bx.lineWidth=1.2;bx.beginPath();drops=drops.filter(d=>{d.v+=.35;d.y+=d.v;bx.moveTo(d.x,d.y);bx.lineTo(d.x,d.y-6-d.v);return d.y<h*.8});bx.stroke()}

/* ---------- Sound ---------- */
let AC=null,amb=null,soundOn=false,sirenIv=null;
function initAudio(){AC=new (window.AudioContext||window.webkitAudioContext)();const len=AC.sampleRate*4,buf=AC.createBuffer(1,len,AC.sampleRate),d=buf.getChannelData(0);let l=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;l=(l+.02*w)/1.02;d[i]=l*3.5}
  const src=AC.createBufferSource();src.buffer=buf;src.loop=true;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1100;const g=AC.createGain();g.gain.value=0;src.connect(lp);lp.connect(g);g.connect(AC.destination);src.start();
  const o=AC.createOscillator();o.frequency.value=46;const og=AC.createGain();og.gain.value=0;o.connect(og);og.connect(AC.destination);o.start();amb={g,og,buf}}
function setSound(on){soundOn=on;const b=document.getElementById('snd');b.setAttribute('aria-pressed',on);b.style.color=on?'var(--ink)':'';b.querySelector('i').style.background=on?'var(--ok)':'';
  try{if(on&&!AC)initAudio();if(!AC)return;if(AC.state==='suspended')AC.resume();const t=AC.currentTime;amb.g.gain.cancelScheduledValues(t);amb.og.gain.cancelScheduledValues(t);amb.g.gain.linearRampToValueAtTime(on?.2:0,t+1.2);amb.og.gain.linearRampToValueAtTime(on?.05:0,t+1.2)}catch(e){console.error(e)}}
function thunder(){if(!soundOn||!AC)return;const s=AC.createBufferSource();s.buffer=amb.buf;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=200;const g=AC.createGain(),t=AC.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(1,t+.1);g.gain.exponentialRampToValueAtTime(.001,t+3.4);s.connect(f);f.connect(g);g.connect(AC.destination);s.start(t,Math.random()*2);s.stop(t+3.5)}
function blip(fr){if(!soundOn||!AC)return;const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;o.frequency.setValueAtTime(fr||880,t);o.frequency.exponentialRampToValueAtTime((fr||880)*1.5,t+.08);g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+.17)}
function siren(on){clearInterval(sirenIv);if(!on||!soundOn||!AC)return;const tone=()=>{const o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;o.type='triangle';o.frequency.setValueAtTime(520,t);o.frequency.linearRampToValueAtTime(820,t+.5);o.frequency.linearRampToValueAtTime(520,t+1);g.gain.setValueAtTime(.05,t);g.gain.linearRampToValueAtTime(0,t+1);o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+1)};tone();sirenIv=setInterval(tone,1100)}
const B=document.body,caseEl=document.getElementById('case');let tScan,tSig;
function openCase(on){caseEl.hidden=!on;if(on)document.getElementById('cclose').focus()}
document.getElementById('cclose').addEventListener('click',()=>openCase(false));
caseEl.addEventListener('click',e=>{if(e.target===caseEl)openCase(false)});
function setAlarm(on){B.classList.toggle('alarm',on);siren(on)}
addEventListener('keydown',e=>{if(e.key==='Escape'){openCase(false);if(B.classList.contains('alarm'))setAlarm(false)}});
window.JarvisScene={
  type,setMode:t=>{mode.textContent=t},
  setListening:on=>{lt=!!on},
  openCase,setAlarm,isAlarm:()=>B.classList.contains('alarm'),
  scan:()=>{B.classList.add('scan');zoomT=.55;clearTimeout(tScan);tScan=setTimeout(()=>{B.classList.remove('scan');zoomT=1},7000)},
  signal:()=>{B.classList.add('signal');flash=1;thunder();clearTimeout(tSig);tSig=setTimeout(()=>B.classList.remove('signal'),8000)},
  setSound,soundOn:()=>soundOn,blip,
  setPlaces:list=>{places=list||[]},
  setProtein:list=>{pro=(list||[]).filter(v=>Number.isFinite(v));drawSpk()},
};
function clock(){const d=new Date(),p=n=>String(n).padStart(2,'0');document.getElementById('t').textContent=`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  document.getElementById('d').textContent=d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).toUpperCase()}
clock();setInterval(clock,1000);
})();
