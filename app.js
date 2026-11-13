'use strict';
(() => {
const $ = id => document.getElementById(id);
const DB_NAME='soundcore-audio-lab-v2';
let db=null, active=null, activeTab='original', ctx=null, mediaSource=null, connectedMediaElement=null, mediaSources=new WeakMap(), activeMediaElement=null, eqNodes=[], bassShelf=null, bassDynamic=null, bassDynamicFilter=null, deesserNode=null, compressorNode=null, limiterNode=null, masterNode=null, widthNodes=null, analyser=null, outputLimiter=null, recordDestination=null, recordingInProgress=false, raf=0, originalBlob=null;
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
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('original'))d.createObjectStore('original',{keyPath:'id'});if(!d.objectStoreNames.contains('edited'))d.createObjectStore('edited',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function store(bucket,item){return new Promise((resolve,reject)=>{const tx=db.transaction(bucket,'readwrite');tx.objectStore(bucket).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function all(bucket){return new Promise((resolve,reject)=>{const tx=db.transaction(bucket);const q=tx.objectStore(bucket).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
function del(bucket,id){return new Promise((resolve,reject)=>{const tx=db.transaction(bucket,'readwrite');tx.objectStore(bucket).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2)}
function loadSettings(){try{const s=JSON.parse(localStorage.getItem('soundcore-dsp-settings')||'{}');settings={...defaultSettings,...s};const saved=JSON.parse(localStorage.getItem('soundcore-dsp-bands')||'null');if(Array.isArray(saved)&&saved.length===8)saved.forEach((b,i)=>Object.assign(bands[i],b));}catch(e){}}
function persist(){try{localStorage.setItem('soundcore-dsp-settings',JSON.stringify(settings));localStorage.setItem('soundcore-dsp-bands',JSON.stringify(bands))}catch(e){}}
function renderEQ(){
 const host=$('eq');host.innerHTML='';
 bands.forEach((b,i)=>{const card=document.createElement('div');card.className='paramBand';
 const head=document.createElement('div');head.className='bandHead';head.innerHTML='<span>النطاق '+(i+1)+'</span><output>'+Math.round(b.gain)+' dB</output>';
 const freq=document.createElement('input');freq.type='number';freq.min='20';freq.max='20000';freq.step='1';freq.value=b.freq;freq.setAttribute('aria-label','تردد النطاق '+(i+1)+' هرتز');
 const freqLabel=document.createElement('label');freqLabel.className='muted';freqLabel.textContent='التردد Hz';
 const gain=document.createElement('input');gain.type='range';gain.min='-12';gain.max='12';gain.step='.5';gain.value=b.gain;gain.setAttribute('aria-label','كسب النطاق '+(i+1));
 const gainLabel=document.createElement('div');gainLabel.className='muted';gainLabel.textContent='Gain';
 freq.onchange=()=>{const n=Math.max(20,Math.min(20000,Number(freq.value)||b.freq));b.freq=n;freq.value=n;applyAudio();persist()};
 gain.oninput=()=>{b.gain=Number(gain.value);head.querySelector('output').textContent=b.gain.toFixed(1)+' dB';applyAudio();persist()};
 card.append(head,freqLabel,freq,gainLabel,gain);host.append(card);
 });
}
function audioSupported(){return !!(window.AudioContext||window.webkitAudioContext)}
function ensureGraph(element=getMediaElement()){
 if(!audioSupported())return false;
 try{
  if(!ctx){
   const AC=window.AudioContext||window.webkitAudioContext;ctx=new AC();
   eqNodes=bands.map(b=>{const n=ctx.createBiquadFilter();n.type='peaking';n.frequency.value=b.freq;n.Q.value=settings.q;return n});
   bassShelf=ctx.createBiquadFilter();bassShelf.type='lowshelf';bassShelf.frequency.value=100;
   bassDynamicFilter=ctx.createBiquadFilter();bassDynamicFilter.type='lowpass';bassDynamicFilter.frequency.value=160;bassDynamicFilter.Q.value=.7;bassDynamic=ctx.createGain();
   deesserNode=ctx.createBiquadFilter();deesserNode.type='highshelf';deesserNode.frequency.value=6500;
   compressorNode=ctx.createDynamicsCompressor();compressorNode.threshold.value=-18;compressorNode.knee.value=8;compressorNode.attack.value=.006;compressorNode.release.value=.18;
   limiterNode=ctx.createDynamicsCompressor();limiterNode.threshold.value=settings.limiter;limiterNode.knee.value=0;limiterNode.ratio.value=20;limiterNode.attack.value=.002;limiterNode.release.value=.1;
   masterNode=ctx.createGain();analyser=ctx.createAnalyser();analyser.fftSize=1024;mediaSources=new WeakMap();
   eqNodes.forEach((n,i)=>n.connect(eqNodes[i+1]||bassShelf));
   bassShelf.connect(deesserNode);eqNodes[eqNodes.length-1].connect(bassDynamicFilter);bassDynamicFilter.connect(bassDynamic);bassDynamic.connect(deesserNode);
   deesserNode.connect(compressorNode);compressorNode.connect(masterNode);masterNode.connect(limiterNode);limiterNode.connect(analyser);
   analyser.connect(ctx.destination);recordDestination=ctx.createMediaStreamDestination();limiterNode.connect(recordDestination);
  }
  if(connectedMediaElement!==element){
   if(mediaSource){try{mediaSource.disconnect()}catch(e){}}
   mediaSource=mediaSources.get(element);
   if(!mediaSource){mediaSource=ctx.createMediaElementSource(element);mediaSources.set(element,mediaSource)}
   mediaSource.connect(eqNodes[0]);connectedMediaElement=element;
  }
  applyAudio();return true;
 }catch(e){
  try{
   if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;ctx=new AC()}
   if(!mediaSource){mediaSource=mediaSources.get(element)||ctx.createMediaElementSource(element);mediaSources.set(element,mediaSource)}
   try{mediaSource.disconnect()}catch(_){}
   mediaSource.connect(ctx.destination);connectedMediaElement=element;
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
function setStatusState(s){$('state').textContent=s;try{if(navigator.mediaSession)navigator.mediaSession.playbackState=s==='يعمل الآن'?'playing':s==='انتهى التشغيل'?'none':'paused'}catch(e){}}
function updateExportButtons(video){$('export').textContent=video?'استخراج صوت الفيديو بعد المعالجة WAV':'تصدير الصوت بعد المعالجة WAV';$('exportVideo').hidden=!video}
function setupMediaSession(){try{if(!navigator.mediaSession)return false;if(active&&window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:active.name,artist:'Soundcore Audio Lab',album:'المعالجة الصوتية'});const h={play:()=>playNow(),pause:()=>getMediaElement().pause(),seekbackward:()=>{const p=getMediaElement();p.currentTime=Math.max(0,p.currentTime-10)},seekforward:()=>{const p=getMediaElement();p.currentTime=Math.min(p.duration||Infinity,p.currentTime+10)}};Object.entries(h).forEach(([k,v])=>{try{navigator.mediaSession.setActionHandler(k,v)}catch(e){}});return true}catch(e){return false}}
async function playNow(){if(!active&&!getMediaElement().src){status('اختر ملفاً صوتياً أولاً');return}try{if(audioSupported()){ensureGraph();if(ctx&&ctx.state==='suspended')await ctx.resume()}await getMediaElement().play();setStatusState('يعمل الآن');status('التشغيل مع إعدادات المعالجة الحالية');dynamicBassLoop()}catch(e){status('تعذر بدء التشغيل: '+e.message)}}
async function loadFile(file){
 if(!file)return;
 const video=isVideoFile(file),isAudio=(file.type||'').startsWith('audio/')||/\.(mp3|m4a|aac|wav|ogg|flac|aiff?)$/i.test(file.name);
 if(!video&&!isAudio){status('نوع الملف غير مدعوم. اختر ملف صوت أو فيديو');return}
 const audio=$('player'),v=$('videoPlayer');audio.pause();v.pause();setActiveMedia(video);const p=getMediaElement();
 if(p.src){try{URL.revokeObjectURL(p.src)}catch(e){}}
 active={id:uid(),name:file.name,size:file.size,type:file.type||(video?'video/mp4':'audio/unknown'),blob:file,created:Date.now(),mediaKind:video?'video':'audio'};originalBlob=file;
 $('track').textContent=file.name;$('meta').textContent=(file.size/1048576).toFixed(2)+' MB • '+(file.type||(video?'فيديو':'ملف صوتي'));
 p.removeAttribute('data-item-id');p.removeAttribute('data-bucket');p.src=URL.createObjectURL(file);p.load();updateExportButtons(video);
 setStatusState('تم اختيار الملف');status(video?'تم تحميل الفيديو. اضغط تشغيل لسماع مساره الصوتي':'تم تحميل الصوت. اضغط تشغيل');
 if(ctx&&audioSupported())ensureGraph(p);
}
async function saveOriginal(){if(!active){status('اختر ملفاً أولاً');return}await store('original',{...active});status('حُفظت النسخة الأصلية دون أي تعديل');renderLibrary()}
function applyProfile(id){
 settings.profile=id;
 if(id==='custom'){persist();return}
 const p=profileData[id];if(!p)return;
 p.g.forEach((v,i)=>{bands[i].gain=v});settings.bass=p.bass;settings.limiter=p.threshold;settings.width=p.width;
 $('bass').value=settings.bass;$('bassOut').textContent=settings.bass+' dB';$('limiter').value=settings.limiter;$('limOut').textContent=settings.limiter+' dB';
 renderEQ();syncControls();applyAudio();persist();status('تم تطبيق إعداد '+p.label+' — يمكنك تعديل كل نطاق يدوياً');
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
  const nm=document.createElement('div');nm.className='name';nm.textContent=item.name;const mt=document.createElement('div');mt.className='muted';mt.textContent=(item.size/1048576).toFixed(2)+' MB';info.append(nm,mt);
  const play=document.createElement('button');play.className='btn secondary';const itemVideo=item.mediaKind==='video'||(item.type||'').startsWith('video/')||isVideoFile(item);const current=getMediaElement();const isThis=current.dataset.itemId===item.id&&current.dataset.bucket===activeTab;
  play.textContent=isThis&&!current.paused?'إيقاف مؤقت':'تشغيل';play.onclick=async()=>{if(isThis&&!getMediaElement().paused){getMediaElement().pause();setStatusState('متوقف مؤقتاً');renderLibrary()}else{active=item;originalBlob=item.blob;setActiveMedia(itemVideo);$('track').textContent=item.name;$('meta').textContent=(item.size/1048576).toFixed(2)+' MB';const p=getMediaElement();if(p.src)URL.revokeObjectURL(p.src);p.src=URL.createObjectURL(item.blob);p.dataset.itemId=item.id;p.dataset.bucket=activeTab;p.load();updateExportButtons(itemVideo);await playNow();renderLibrary()}};
  const share=document.createElement('button');share.className='btn secondary';share.textContent='حفظ / مشاركة';share.onclick=async()=>{try{const file=new File([item.blob],item.name,{type:item.type||'application/octet-stream'});if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share)await navigator.share({files:[file],title:item.name});else{const u=URL.createObjectURL(item.blob),a=document.createElement('a');a.href=u;a.download=item.name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}status('تم تجهيز الملف للحفظ أو المشاركة')}catch(e){if(e.name!=='AbortError')status('تعذرت المشاركة: '+e.message)}};
  const remove=document.createElement('button');remove.className='btn danger';remove.textContent='حذف';remove.onclick=async()=>{if(!confirm('تأكيد حذف '+item.name+'؟'))return;await del(activeTab,item.id);if(isThis){getMediaElement().pause();getMediaElement().removeAttribute('src');getMediaElement().load();active=null;$('track').textContent='لم يتم اختيار ملف'}status('تم حذف الملف من هذا القسم');renderLibrary()};
  el.append(info,play,share,remove);host.append(el);
 });
}
function encodeWav(buffer){
 const ch=buffer.numberOfChannels,len=buffer.length*ch*2+44,ab=new ArrayBuffer(len),v=new DataView(ab);let p=0;
 const str=s=>{for(let i=0;i<s.length;i++)v.setUint8(p++,s.charCodeAt(i))};
 str('RIFF');v.setUint32(p,len-8,true);p+=4;str('WAVE');str('fmt ');v.setUint32(p,16,true);p+=4;v.setUint16(p,1,true);p+=2;v.setUint16(p,ch,true);p+=2;v.setUint32(p,buffer.sampleRate,true);p+=4;v.setUint32(p,buffer.sampleRate*ch*2,true);p+=4;v.setUint16(p,ch*2,true);p+=2;v.setUint16(p,16,true);p+=2;str('data');v.setUint32(p,len-p-4,true);p+=4;
 const channels=Array.from({length:ch},(_,i)=>buffer.getChannelData(i));for(let i=0;i<buffer.length;i++)for(let c=0;c<ch;c++){const x=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(p,x<0?x*32768:x*32767,true);p+=2}return ab;
}
function toggleAB(){
 if(!active){status('اختر ملفاً صوتياً أولاً');return}
 if(!ensureGraph()){status('المقارنة تحتاج Web Audio API');return}
 if(!abSnapshot){abSnapshot={settings:{...settings},bands:bands.map(b=>({...b}))};bands.forEach(b=>b.gain=0);settings.bass=0;settings.dynamicBass=0;settings.deesser=0;settings.compressor=1;settings.master=1;settings.limiter=0;settings.width=1;renderEQ();syncControls();applyAudio();$('compareAB').textContent='العودة إلى المعالجة';status('وضع A/B: تسمع الأصل دون EQ والمؤثرات');}
 else{settings={...abSnapshot.settings};abSnapshot.bands.forEach((b,i)=>Object.assign(bands[i],b));abSnapshot=null;renderEQ();syncControls();applyAudio();$('compareAB').textContent='مقارنة الأصل / المعالجة A/B';status('تمت العودة إلى إعدادات المعالجة');}
}
function downloadBlob(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportVideoAudioWav(){
 const video=$('videoPlayer');
 if(!active||!video.src){status('اختر فيديو أولاً');return}
 if(!audioSupported()||!window.MediaStream){status('متصفحك لا يدعم التقاط الصوت المعالج من الفيديو');return}
 if(!ensureGraph(video)||!ctx){status('تعذر تفعيل معالج الصوت للفيديو');return}
 if(!ctx.createScriptProcessor){status('تسجيل WAV المباشر غير مدعوم في هذا المتصفح');return}
 if(!Number.isFinite(video.duration)||video.duration<=0){status('انتظر تحميل معلومات الفيديو ثم أعد التصدير');return}
 if(video.duration>1800){status('الفيديو أطول من 30 دقيقة؛ اختر مقطعاً أقصر لتجنب استهلاك ذاكرة الجهاز أثناء WAV');return}
 let processor=null,silent=null,chunks=[],channels=2,frames=0,finished=false;
 try{
  status('جارٍ تشغيل الفيديو والتقاط الصوت بعد المعالجة لتصديره WAV…');
  if(ctx.state==='suspended')await ctx.resume();
  processor=ctx.createScriptProcessor(4096,2,2);silent=ctx.createGain();silent.gain.value=0;
  processor.onaudioprocess=e=>{
   const input=e.inputBuffer;channels=Math.max(1,Math.min(2,input.numberOfChannels));
   for(let c=0;c<channels;c++)chunks.push({c,data:new Float32Array(input.getChannelData(c))});
   frames+=input.length;
  };
  limiterNode.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
  if(video.ended||video.currentTime>=video.duration-.05)video.currentTime=0;
  await video.play();
  await new Promise((resolve,reject)=>{
   const ended=()=>resolve(),error=()=>reject(new Error('تعذر قراءة مسار الصوت في الفيديو'));
   video.addEventListener('ended',ended,{once:true});video.addEventListener('error',error,{once:true});
  });
  if(finished)return;finished=true;
  processor.disconnect();silent.disconnect();limiterNode.disconnect(processor);
  const buffer=ctx.createBuffer(channels,frames,ctx.sampleRate);
  let offset=0;
  for(let c=0;c<channels;c++){
   const target=buffer.getChannelData(c);offset=0;
   for(const part of chunks){if(part.c===c){target.set(part.data,offset);offset+=part.data.length}}
  }
  const blob=new Blob([encodeWav(buffer)],{type:'audio/wav'});
  const item={id:uid(),name:active.name.replace(/\.[^.]+$/,'')+'-processed.wav',size:blob.size,type:'audio/wav',blob,created:Date.now(),mediaKind:'audio'};
  await store('edited',item);downloadBlob(blob,item.name);status('اكتمل استخراج الصوت من الفيديو وتصديره WAV وحُفظ في المحفوظات المعدّلة');await renderLibrary();
 }catch(e){status('فشل تصدير صوت الفيديو: '+(e.message||e))}
 finally{
  if(processor){processor.onaudioprocess=null;try{processor.disconnect()}catch(e){}}
  if(silent)try{silent.disconnect()}catch(e){}
  if(processor&&limiterNode)try{limiterNode.disconnect(processor)}catch(e){}
  chunks=[];
 }
}
async function exportWav(){
 if(!active){status('اختر ملفاً أولاً');return}
 if(active.mediaKind==='video'||(active.type||'').startsWith('video/')||isVideoFile(active))return exportVideoAudioWav();
 if(abSnapshot){settings={...abSnapshot.settings};abSnapshot.bands.forEach((b,i)=>Object.assign(bands[i],b));abSnapshot=null;renderEQ();syncControls();$('compareAB').textContent='مقارنة الأصل / المعالجة A/B';applyAudio()}
 const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline){status('هذا المتصفح لا يدعم التصدير الصوتي غير المتصل');return}
 try{
  status('جارٍ تطبيق كل المؤثرات وتجهيز WAV…');const decodedCtx=new (window.AudioContext||window.webkitAudioContext)();const decoded=await decodedCtx.decodeAudioData((await active.blob.arrayBuffer()).slice(0));await decodedCtx.close();
  const off=new Offline(decoded.numberOfChannels,decoded.length,decoded.sampleRate),src=off.createBufferSource();src.buffer=decoded;
  const eq=bands.map(b=>{const n=off.createBiquadFilter();n.type='peaking';n.frequency.value=b.freq;n.Q.value=settings.q;n.gain.value=b.gain;return n});
  const bass=off.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=100;bass.gain.value=settings.bass;
  const dynamicFilter=off.createBiquadFilter();dynamicFilter.type='lowpass';dynamicFilter.frequency.value=160;dynamicFilter.Q.value=.7;
  const dynamicGain=off.createGain();dynamicGain.gain.value=1+settings.dynamicBass/12;
  const de=off.createBiquadFilter();de.type='highshelf';de.frequency.value=6500;de.gain.value=-settings.deesser;
  const comp=off.createDynamicsCompressor();comp.ratio.value=settings.compressor;comp.threshold.value=-18;comp.knee.value=8;comp.attack.value=.006;comp.release.value=.18;
  const lim=off.createDynamicsCompressor();lim.threshold.value=settings.limiter;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.002;lim.release.value=.1;
  const master=off.createGain();master.gain.value=settings.master*settings.volume;
  src.connect(eq[0]);eq.forEach((n,i)=>n.connect(eq[i+1]||bass));bass.connect(de);eq[eq.length-1].connect(dynamicFilter);dynamicFilter.connect(dynamicGain);dynamicGain.connect(de);de.connect(comp);comp.connect(master);master.connect(lim);
  const split=off.createChannelSplitter(2),merge=off.createChannelMerger(2),upmix=off.createGain();upmix.channelCount=2;upmix.channelCountMode='explicit';upmix.channelInterpretation='speakers';upmix.connect(split);lim.connect(upmix);
  const w=Math.max(0,Math.min(2,settings.width)),ll=off.createGain(),lr=off.createGain(),rl=off.createGain(),rr=off.createGain();
  ll.gain.value=(1+w)/2;rr.gain.value=(1+w)/2;lr.gain.value=(1-w)/2;rl.gain.value=(1-w)/2;
  split.connect(ll,0);split.connect(lr,0);split.connect(rl,1);split.connect(rr,1);ll.connect(merge,0,0);rl.connect(merge,0,0);lr.connect(merge,0,1);rr.connect(merge,0,1);
  const outLimit=off.createDynamicsCompressor();outLimit.threshold.value=-1;outLimit.knee.value=0;outLimit.ratio.value=20;outLimit.attack.value=.001;outLimit.release.value=.08;merge.connect(outLimit);outLimit.connect(off.destination);
  src.start();const rendered=await off.startRendering(),blob=new Blob([encodeWav(rendered)],{type:'audio/wav'});
  const item={id:uid(),name:active.name.replace(/\.[^.]+$/,'')+'-processed.wav',size:blob.size,type:'audio/wav',blob,created:Date.now(),mediaKind:'audio'};
  await store('edited',item);downloadBlob(blob,item.name);status('اكتمل تصدير WAV وحُفظت نسخة في المحفوظات المعدّلة');renderLibrary();
 }catch(e){status('فشل التصدير: '+(e.message||e)+' — جرّب ملفاً أقصر أو بصيغة WAV/MP3 مدعومة')}
}
async function exportProcessedVideo(){
 const video=$('videoPlayer');
 if(!active||!(active.mediaKind==='video'||(active.type||'').startsWith('video/')||isVideoFile(active))||!video.src){status('اختر فيديو أولاً');return}
 if(!window.MediaRecorder||!window.MediaStream||!HTMLCanvasElement.prototype.captureStream){status('تصدير الفيديو غير مدعوم في هذا المتصفح؛ استخدم Safari حديثاً أو افتح الأداة من جهاز يدعم Canvas Capture وMediaRecorder');return}
 if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth){status('انتظر تحميل الفيديو بالكامل ثم أعد التصدير');return}
 if(video.duration>1800){status('الفيديو أطول من 30 دقيقة؛ اختر مقطعاً أقصر لتجنب استهلاك ذاكرة الجهاز');return}
 if(!ensureGraph(video)||!recordDestination){status('تعذر تفعيل مسار الصوت المعالج للفيديو');return}
 const mimeChoices=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
 const mime=mimeChoices.find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime){status('المتصفح لا يوفّر صيغة فيديو مدعومة للتسجيل');return}
 const canvas=document.createElement('canvas'),scale=Math.min(1,1920/video.videoWidth,1080/video.videoHeight);
 canvas.width=Math.max(2,Math.floor(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.floor(video.videoHeight*scale/2)*2);
 const c2d=canvas.getContext('2d');if(!c2d){status('تعذر إنشاء مسار الصورة');return}
 const videoStream=canvas.captureStream(30),audioTracks=recordDestination.stream.getAudioTracks();
 if(!audioTracks.length){videoStream.getTracks().forEach(t=>t.stop());status('مسار الصوت المعالج غير جاهز؛ اضغط تشغيل مع المعالجة ثم أعد المحاولة');return}
 const stream=new MediaStream([...videoStream.getVideoTracks(),...audioTracks]);
 let recorder=null,drawFrame=0,chunks=[],blob=null;
 try{
  status('جارٍ تسجيل الفيديو مع الصوت بعد المعالجة… لا تغلق الصفحة حتى يكتمل التصدير');
  if(ctx.state==='suspended')await ctx.resume();
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(16000000,Math.max(5000000,canvas.width*canvas.height*6)),audioBitsPerSecond:256000});
  const recorded=new Promise((resolve,reject)=>{
   recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
   recorder.onerror=e=>reject(e.error||new Error('خطأ أثناء تسجيل الفيديو'));
   recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||mime}));
  });
  const draw=()=>{if(video.readyState>=2){try{c2d.drawImage(video,0,0,canvas.width,canvas.height)}catch(e){}}drawFrame=requestAnimationFrame(draw)};
  if(video.ended||video.currentTime>=video.duration-.05)video.currentTime=0;
  c2d.fillStyle='#000';c2d.fillRect(0,0,canvas.width,canvas.height);
  recorder.start(1000);draw();
  await video.play();
  await new Promise((resolve,reject)=>{video.addEventListener('ended',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('تعذر قراءة الفيديو أثناء التصدير')),{once:true})});
  if(recorder.state!=='inactive')recorder.stop();
  blob=await recorded;
  if(!blob||blob.size<1024)throw new Error('الملف الناتج فارغ أو غير مكتمل');
  const ext=mime.includes('mp4')?'mp4':'webm',item={id:uid(),name:active.name.replace(/\.[^.]+$/,'')+'-processed.'+ext,size:blob.size,type:blob.type||mime,blob,created:Date.now(),mediaKind:'video'};
  await store('edited',item);downloadBlob(blob,item.name);status('اكتمل تصدير الفيديو مع الصوت المعالج وحُفظ في المحفوظات المعدّلة');await renderLibrary();
 }catch(e){if(recorder&&recorder.state!=='inactive')try{recorder.stop()}catch(_){}status('فشل تصدير الفيديو: '+(e.message||e))}
 finally{
  cancelAnimationFrame(drawFrame);videoStream.getTracks().forEach(t=>t.stop());recordingInProgress=false;chunks=[];
 }
}
async function backup(){const pack={version:2,original:[],edited:[]};for(const bucket of ['original','edited'])for(const x of await all(bucket)){pack[bucket].push({...x,blobData:Array.from(new Uint8Array(await x.blob.arrayBuffer()))})}const blob=new Blob([JSON.stringify(pack)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='soundcore-audio-lab-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);status('تم إنشاء النسخة الاحتياطية')}
async function restore(file){try{const pack=JSON.parse(await file.text());for(const bucket of ['original','edited'])for(const x of pack[bucket]||[]){const {blobData,...rest}=x;await store(bucket,{...rest,blob:new Blob([new Uint8Array(blobData)],{type:x.type||'application/octet-stream'})})}status('تم استيراد النسخة الاحتياطية');renderLibrary()}catch(e){status('تعذر الاستيراد: '+e.message)}}
function bind(){
 $('pick').onclick=()=>$('files').click();$('files').onchange=async e=>{for(const f of e.target.files)await loadFile(f);e.target.value=''};
 for(const el of [$('player'),$('videoPlayer')]){
  el.addEventListener('play',async()=>{
   // Do not create AudioContext from the media "play" event: iOS Safari may treat it as non-user-activated and mute the media element.
   if(ctx&&ctx.state==='suspended'){try{await ctx.resume()}catch(e){status('اضغط زر «تشغيل مع المعالجة» لتفعيل الصوت في Safari')}}
   if(ctx&&ctx.state==='running'&&connectedMediaElement!==el)ensureGraph(el);
   if(ctx&&ctx.state==='running')dynamicBassLoop();
   setupMediaSession();
   setStatusState('يعمل الآن')
  });
  el.addEventListener('pause',()=>{cancelAnimationFrame(raf);setStatusState('متوقف مؤقتاً')});
  el.addEventListener('ended',()=>{cancelAnimationFrame(raf);setStatusState('انتهى التشغيل')});
  el.addEventListener('error',()=>status('تعذر تشغيل هذا الترميز في Safari. جرّب MP3 أو M4A أو MP4 أو MOV مدعوماً'));
 }
 $('playNow').onclick=playNow;$('pauseNow').onclick=()=>getMediaElement().pause();$('compareAB').onclick=toggleAB;$('saveOriginal').onclick=saveOriginal;$('export').onclick=exportWav;$('exportVideo').onclick=exportProcessedVideo;$('lockControls').onclick=()=>{if(setupMediaSession())status('تم تجهيز عناصر تحكم شاشة القفل حيث يدعمها Safari؛ استمرار الصوت بالخلفية غير مضمون من موقع ويب');else status('عناصر تحكم شاشة القفل غير مدعومة في هذا المتصفح')};
 $('volume').oninput=e=>{settings.volume=Number(e.target.value);$('volOut').textContent=Math.round(settings.volume*100)+'%';applyAudio();persist()};
 bindRange('eqQ','q',v=>v.toFixed(1));bindRange('stereoWidth','width',v=>Math.round(v*100)+'%');bindRange('deesser','deesser',v=>v+' dB');bindRange('dynamicBass','dynamicBass',v=>v+' dB');bindRange('compressor','compressor',v=>v+':1');bindRange('masterGain','master',v=>Math.round(v*100)+'%');bindRange('bass','bass',v=>v+' dB');bindRange('limiter','limiter',v=>v+' dB');
 $('headphoneProfile').onchange=e=>applyProfile(e.target.value);
 document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));activeTab=b.dataset.tab;renderLibrary()});
 $('saveProfile').onclick=()=>{persist();status('حُفظت إعدادات EQ والمؤثرات على هذا الجهاز')};
 $('resetDSP').onclick=()=>{settings={...defaultSettings};bands.forEach((b,i)=>{b.freq=bandDefaults[i];b.gain=0});renderEQ();syncControls();applyAudio();persist();status('تمت إعادة ضبط معالج الصوت')};
 $('backup').onclick=backup;$('restore').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=e=>{if(e.target.files[0])restore(e.target.files[0]);e.target.value=''};
 $('libraryBtn').onclick=()=>{document.querySelector('.tabs').scrollIntoView({behavior:'smooth'});renderLibrary()};
 const drop=$('drop');drop.ondragover=e=>{e.preventDefault();drop.style.borderColor='var(--a)'};drop.ondragleave=()=>drop.style.borderColor='';drop.ondrop=async e=>{e.preventDefault();drop.style.borderColor='';for(const file of Array.from(e.dataTransfer.files))await loadFile(file)};
}
(async()=>{loadSettings();renderEQ();syncControls();bind();try{db=await openDB();await renderLibrary();if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});}catch(e){status('اختيار وتشغيل الملفات متاح، لكن المحفوظات المحلية غير متاحة في هذا التصفح: '+(e.message||e));}if(!audioSupported())status('المتصفح لا يدعم Web Audio API؛ التشغيل الأصلي متاح دون مؤثرات');})();
})();