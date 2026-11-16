'use strict';
const CACHE_NAME='soundcore-audio-lab-shell-v1';
const SHELL=['/','/app.js'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(SHELL);
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('soundcore-audio-lab-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request);
    if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put('/',response.clone());}
    return response;
   }catch(error){
    return (await caches.match(request))||(await caches.match('/'))||Response.error();
   }
  })());
  return;
 }
 if(url.pathname==='/app.js'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   const cached=await cache.match('/app.js');
   const update=fetch(request).then(response=>{
    if(response&&response.ok)cache.put('/app.js',response.clone());
    return response;
   }).catch(()=>null);
   return cached||await update||Response.error();
  })());
 }
});