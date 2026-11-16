'use strict';
const CACHE_PREFIX='soundcore-audio-lab-shell-';
const CACHE_NAME=CACHE_PREFIX+'v3';
const APP_SHELL='/';
const STATIC_ASSETS=['/manifest.json','/icons/soundcore.svg'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll([APP_SHELL,...STATIC_ASSETS]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  const url=new URL(request.url);
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response&&response.ok){
          const cache=await caches.open(CACHE_NAME);
          await cache.put(APP_SHELL,response.clone());
        }
        return response;
      }catch(error){
        return (await caches.match(APP_SHELL))||new Response('التطبيق غير متاح دون اتصال. افتحه مرة واحدة أثناء الاتصال بالإنترنت.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }
  if(STATIC_ASSETS.includes(url.pathname)){
    event.respondWith((async()=>{
      const cached=await caches.match(request);
      if(cached)return cached;
      try{
        const response=await fetch(request);
        if(response&&response.ok){
          const cache=await caches.open(CACHE_NAME);
          await cache.put(request,response.clone());
        }
        return response;
      }catch(error){
        return new Response('ملف التطبيق غير متاح دون اتصال.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
  }
});
