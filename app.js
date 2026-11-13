'use strict';
(() => {
const $ = id => document.getElementById(id);
const DB_NAME='soundcore-audio-lab-v2';
let db=null, active=null, activeTab='original', ctx=null, mediaSource=null, connectedMediaElement=null, mediaSources=new WeakMap(), activeMediaElement=null, eqNodes=[], bassShelf=null, bassDynamic=null, bassDynamicFilter=null, deesserNode=null, compressorNode=null, limiterNode=null, masterNode=null, widthNodes=null, analyser=null, outputLimiter=null, recordDestination=null, activeRecorder=null, recordingInProgress=false, cancelCurrentExport=null, raf=0, originalBlob=null;
const bandDefaults=[60,120,250,500,1000,2000,4000,8000];
const bands=bandDefaults.map((freq,i)=>({freq,gain:0,q:1}));
const profileData={
 a20i:{label:'Soundcore A20i',g:[2,2,1,0,0,1,2,2],bass:3,threshold:-2,width:1.05},
 r50inc:{label:'Soundcore R50i NC',g:[1,2,1,0,0,1,2,1],bass:2,threshold:-2,width:1},
 p20i:{label:'Soundcore P20i',g:[3,2,1,0,-1,0,1,2],bass:4,threshold:-3,width:1.05},
 life2neo:{label:'Soundcore Life 2 Neo',g:[2,1,0,0,1,1,2,1],bass:2,threshold:-2,width:1},
 k20i:{label:'Soundcore K20i',g:[2,1,0,0,1,2,2,1],bass:2,threshold:-2,width:1}
};
const defaultSettings={q:1,width:1,deesser:0,dynamicBass:0,compressor:4,master:1,bass:0,limiter:-1,volume:1,profile:'custom'};
let settings={...defaultSettings}, abSnapshot=null;
function status(s){$('status').textContent=s}
function getMediaElement(){return activeMediaElement||$('player')}
function isVideoFile(file){return !!(file&&((file.type||'').startsWith('video/')||/\.(mp4|mov|m4v|webm|avi)$/i.test(file.name||'')))}
function setActiveMedia(video){const audio=$('player'),v=$('videoPlayer');activeMediaElement=video?v:audio;audio.hidden=!!video;v.hidden=!video;}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('original'))d.createObjectStore('original',{keyPath:'id'});if(!d.objectStoreNames.contains('edited'))d.createObje...[truncated]   mediaSource.connect(ctx.destination);connectedMediaElement=element;
  }catch(f){}
  status('تعذر تفعيل بعض المؤثرات؛ حاول التشغيل الأصلي. '+(e.message||e));return false;
 }
}
function applyAudio(){
 if(!ctx||!eqNodes.length)return;
 bands.forEach((b,i)=>{eqNodes[i].frequency.setTargetAtTime(b.freq,ctx.currentTime,.03);eqNodes[i].gain.setTargetAtTime(b.gain,ctx.currentTime,.03);eqNodes[i].Q.setTargetAtTime(settings.q,ctx.currentTime,.03)});
 bassShelf.gain.setTargetAtTime(settings.bass,ctx.currentTime,.03);bassDynamic.gain.setTargetAtTime(1+settings.dynamicBass/12,ctx.currentTime,.03);
 deesserNode.gain.setTargetAtTime(-settings.deesser,ctx.currentTime,.03);compressorNode.ratio.setTargetAtTime(settings.compressor,ctx.currentTime,.03);
 limiterNode.threshold.setTargetAtTime(settings.limiter,ctx.currentTime,.03);masterNode.gain.setTargetAtTime(settings.master*settings.volume,ctx.currentTime,.03);
 const vol=$('volume');if(vol)vol.value=settings.volume;
}
function dynamicBassLoop(){
 cancelAnimationFrame(raf);const p=getMediaElement();if(!analyser||!settings.dynamicBass||p.paused)return;
 const data=new Uint8Array(analyser.fftSize);
 const tick=()=>{if(!analyser||getMediaElement().paused){cancelAnimationFrame(raf);return}analyser.getByteTimeDomainData(data);let sum=0;for(let i=0;i<data.length;i++){const x=(data[i]-128)/128;sum+=x*x}const rms=Math.sqrt(sum/data.length);const reduction=Math.min(settings.dynamicBass,rms*settings.dynamicBass*2.4);bassDynamic.gain.setTargetAtTime(1+Math.max(0,settings.dynamicBass-reduction)/12,ctx.currentTime,.08);raf=requestAnimationFrame(tick)};
 raf=requestAnimationFrame(tick);
}
function setStatusState(s){
 $('state').textContent=s;
 try{if(navigator.mediaSession)navigator.mediaSession.playbackState=s==='يعمل الآن'?'playing':s==='انتهى التشغيل'?'none':'paused'}catch(e){}
}
function setupMediaSession(){
 try{
  if(!navigator.mediaSession)return false;
  if(active&&window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({...[truncated] renderEQ();syncControls();applyAudio();persist();status('تم تطبيق إعداد '+p.label+' — يمكنك تعديل كل نطاق يدوياً');
}
function syncControls(){
 const map={eqQ:['q',v=>v.toFixed(1)],stereoWidth:['width',v=>Math.round(v*100)+'%'],deesser:['deesser',v=>v+' dB'],dynamicBass:['dynamicBass',v=>v+' dB'],compressor:['compressor',v=>v+':1'],masterGain:['master',v=>Math.round(v*100)+'%'],bass:['bass',v=>v+' dB'],limiter:['limiter',v=>v+' dB'],volume:['volume',v=>Math.round(v*100)+'%']};
 Object.entries(map).forEach(([id,[key,fmt]])=>{if($(id)){$(id).value=settings[key];const out=$(id+'Out');if(out)out.textContent=fmt(settings[key])}});
 $('headphoneProfile').value=settings.profile||'custom';
}
function bindRange(id,key,format){$(id).addEventListener('input',e=>{settings[key]=Number(e.target.value);const out=$(id+'Out');if(out)out.textContent=format(settings[key]);applyAudio();persist()})}
function preset(id){
 const sets={flat:[0,0,0,0,0,0,0,0],bass:[6,4,2,0,0,0,1,1],vocal:[-2,-1,1,3,4,3,2,1],a20i:profileData.a20i.g};
 const arr=sets[id]||sets.flat;arr.forEach((v,i)=>bands[i].gain=v);settings.bass=id==='bass'?6:(id==='a20i'?3:0);
 if(id==='a20i'){settings.profile='a20i';settings.width=1.05}else settings.profile='custom';
 $('bass').value=settings.bass;$('bassOut').textContent=settings.bass+' dB';renderEQ();syncControls();applyAudio();persist();status('تم تطبيق الإعداد: '+id);
}
async function renderLibrary(){
 if(!db)return;const rows=await all(activeTab);const host=$('library');host.innerHTML='';
 if(!rows.length){host.innerHTML='<div class="note">لا توجد ملفات في هذا القسم.</div>';return}
 rows.sort((a,b)=>b.created-a.created).forEach(item=>{
  const el=document.createElement('div');el.className='file';const info=document.createElement('div');info.className='grow';
  const nm=document.createElement('div');nm.className='name';nm.textContent=item.name;const mt=document.createElement('div');mt.className='muted';mt.textContent=(item.size/1048576).toFixed(2)+' MB';info.append(n...[truncated] try{
  const resumePromise=ctx.state==='suspended'?ctx.resume():Promise.resolve();
  processor=ctx.createScriptProcessor(4096,2,2);silent=ctx.createGain();silent.gain.value=0;
  processor.onaudioprocess=e=>{
   const input=e.inputBuffer;channels=Math.max(1,Math.min(2,input.numberOfChannels));
   for(let c=0;c<channels;c++)parts[c].push(new Float32Array(input.getChannelData(c)));
   frames+=input.length;
   setExportProgress(video.duration?video.currentTime/video.duration*100:0,true,Math.floor((video.currentTime||0)/video.duration*100)+'%');
  };
  limiterNode.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
  const playbackPromise=new Promise((resolve,reject)=>{
   rejectPlayback=reject;endedHandler=()=>{if(!settled){settled=true;resolve()}};errorHandler=()=>{if(!settled){settled=true;reject(new Error('تعذر قراءة مسار الصوت في الفيديو'))}};
   video.addEventListener('ended',endedHandler,{once:true});video.addEventListener('error',errorHandler,{once:true});
   timeoutId=setTimeout(()=>{if(!settled){settled=true;reject(new Error('انتهت مهلة استخراج الصوت'))}},Math.max(30000,video.duration*2000+15000));
  });
  cancelCurrentExport=()=>{if(!settled){settled=true;rejectPlayback(new Error('تم إلغاء التصدير'))}video.pause()};
  status('جارٍ استخراج الصوت بعد المعالجة إلى WAV… لا تغلق الصفحة حتى يكتمل');
  setExportProgress(0,true,'0%');
  if(video.currentTime>0.05)video.currentTime=0;
  const playPromise=video.play();
  await Promise.all([resumePromise,playPromise,playbackPromise]);
  if(frames<1)throw new Error('لم يصل صوت من الفيديو إلى معالج الصوت');
  const buffer=ctx.createBuffer(channels,frames,ctx.sampleRate);
  for(let c=0;c<channels;c++){
   const target=buffer.getChannelData(c);let offset=0;
   for(const part of parts[c]){target.set(part,offset);offset+=part.length}
  }
  const blob=new Blob([encodeWav(buffer)],{type:'audio/wav'});
  if(blob.size<44)throw new Error('ملف WAV الناتج فارغ');
  const base=active.name.replace(/\.[^.]+$/,'...[truncated]   rejectPlayback=reject;endedHandler=()=>{if(!settled){settled=true;resolve()}};errorHandler=()=>{if(!settled){settled=true;reject(new Error('تعذر قراءة الفيديو أثناء التصدير'))}};
   video.addEventListener('ended',endedHandler,{once:true});video.addEventListener('error',errorHandler,{once:true});
   timeoutId=setTimeout(()=>{if(!settled){settled=true;reject(new Error('انتهت مهلة تصدير الفيديو؛ تأكد أن الصفحة بقيت مفتوحة'))}},Math.max(30000,video.duration*2000+15000));
  });
  cancelCurrentExport=()=>{if(!settled){settled=true;rejectPlayback(new Error('تم إلغاء التصدير'))}video.pause();if(recorder&&recorder.state!=='inactive')recorder.stop()};
  status('جارٍ تسجيل الفيديو مع الصوت بعد المعالجة… اترك الصفحة مفتوحة حتى يكتمل');setExportProgress(0,true,'0%');
  if(video.currentTime>0.05)video.currentTime=0;
  context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
  const resumePromise=ctx.state==='suspended'?ctx.resume():Promise.resolve();
  recorder.start(1000);
  const playPromise=video.play();
  const draw=()=>{
   if(video.readyState>=2){try{context.drawImage(video,0,0,canvas.width,canvas.height)}catch(e){}}
   const percent=video.duration?Math.min(100,video.currentTime/video.duration*100):0;setExportProgress(percent,true,Math.floor(percent)+'%');
   if(!video.ended&&recordingInProgress)drawFrame=requestAnimationFrame(draw);
  };
  draw();
  await Promise.all([resumePromise,playPromise,playbackPromise]);
  if(recorder.state!=='inactive')recorder.stop();
  const blob=await recorded;
  if(!blob||blob.size<1024)throw new Error('الملف الناتج فارغ أو غير مكتمل');
  const outputType=(blob.type||mime).toLowerCase(),extension=outputType.includes('mp4')?'mp4':outputType.includes('webm')?'webm':null;
  if(!extension)throw new Error('صيغة الفيديو الناتج غير معروفة: '+outputType);
  const previewUrl=URL.createObjectURL(blob);
  try{
   const check=document.createElement('video');check.preload='metadata';check.src=previewUrl;
   await new Promise((resolve,r...[truncated]