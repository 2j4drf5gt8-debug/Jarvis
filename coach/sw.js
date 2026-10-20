const CACHE="coach-v25";
const ASSETS=["./","index.html","app.js","config.js","supabase.js","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png","jv-body.webp","jv-wl.webp","jv-wr.webp"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE&&(x.startsWith("coach-")||/^jarvis-v\d{2,}$/.test(x))).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin) return;
  e.respondWith(fetch(e.request,{cache:"no-store"}).then(r=>{const c=r.clone(); if(r.ok) caches.open(CACHE).then(x=>x.put(e.request,c)); return r;}).catch(()=>caches.match(e.request)));
});
self.addEventListener("push",e=>{
  let d={}; try{d=e.data.json();}catch(_){d={title:"Jarvis",body:e.data?e.data.text():""};}
  e.waitUntil(self.registration.showNotification(d.title||"Jarvis",{body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",tag:d.tag||"jarvis",data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{ for(const w of ws){ if("focus" in w) return w.focus(); } return clients.openWindow(e.notification.data?.url||"./"); }));
});
