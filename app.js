'use strict';
const GROQ='https://api.groq.com/openai/v1',TXT='llama-3.3-70b-versatile',VIS='meta-llama/llama-4-scout-17b-16e-instruct',STT='whisper-large-v3-turbo';
const IMG_DEFAULT='https://image.pollinations.ai/prompt/{prompt}?width={w}&height={h}&seed={seed}&nologo=true&model=flux';
const $=s=>document.querySelector(s);
const S={key:localStorage.getItem('kaad_key')||'',img:localStorage.getItem('kaad_img')||IMG_DEFAULT,hist:[],lastPrompt:'',ref:null,cache:new Map(),speak:false,voice:false,busy:false,n:0};
const STY={Realistic:'photorealistic, ultra detailed, natural lighting',Anime:'anime style, vibrant colors, clean lineart','3D':'3D render, Pixar-like, soft studio lighting',Cinematic:'cinematic, dramatic lighting, shallow depth of field, film grain',Neon:'neon cyberpunk glow, dark background, vivid light trails','Oil Painting':'classical oil painting, rich brush strokes',Logo:'clean vector logo, minimal, centered, flat design'};
const SZ={'1:1':[1024,1024],'16:9':[1280,720],'9:16':[720,1280],'4:3':[1152,864]};
const VL={hindi:'hi-IN',urdu:'ur-PK',english:'en-IN',balochi:'ur-PK',auto:'hi-IN'};
const ERR={hi:'कुछ गड़बड़ हो गई, कृपया फिर कोशिश करें।',ur:'کچھ مسئلہ ہو گیا، دوبارہ کوشش کریں۔',en:'Something went wrong, please try again.'};
const SYS=`You are KAAD AI, a friendly creative assistant inside an AI image studio.
Understand Hindi (Devanagari), Urdu (Roman + Nastaliq), English, Hinglish and Balochi (Perso-Arabic script, RTL). Balochi dialects: Makrani, Rakhshani, Eastern — be careful with them; when unsure keep Balochi sentences simple and short.
Reply in the SAME language and script style the user uses (Hindi->Devanagari, Roman Urdu/Hinglish->Roman, Urdu->Urdu script, Balochi->Balochi script, English->English). If the user asks to write something in Balochi/Hindi/etc, do it in "reply". If a forced language is given in the note, use it.
Decide intent: "image" if the user wants an image created or edited (including follow-ups like "ab isko thoda dark karo" which modify the previous image; or an uploaded photo + instruction), else "chat".
For "image": "prompt_en" = a detailed ENGLISH image prompt (translate + enhance: subject, setting, lighting, mood, camera, details), max 70 words, one paragraph. If previous_image_prompt is given and the user wants a change, output the FULL revised prompt (previous prompt + the change). If an image is attached, describe its key content (subject, colors, composition) inside prompt_en and apply the user's instruction to it.
Output ONLY JSON: {"lang":"hi|ur|en|bal","intent":"image|chat","reply":"short friendly reply in user's language","prompt_en":""}`;

const isRtl=t=>/[\u0600-\u06FF]/.test(t);
const toast=(m,ms=2600)=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),ms)};
const openKey=()=>{$('#keyIn').value=S.key;$('#imgIn').value=S.img;$('#dlg').showModal()};
$('#keyBtn').onclick=openKey;$('#keyClose').onclick=()=>$('#dlg').close();
$('#keySave').onclick=()=>{S.key=$('#keyIn').value.trim();S.img=$('#imgIn').value.trim()||IMG_DEFAULT;localStorage.setItem('kaad_key',S.key);localStorage.setItem('kaad_img',S.img);$('#dlg').close();toast('Saved ✅')};
$('#theme').onclick=()=>{document.body.classList.toggle('flag');localStorage.setItem('kaad_theme',document.body.classList.contains('flag')?'flag':'neon')};
if(localStorage.getItem('kaad_theme')==='neon')document.body.classList.remove('flag');
$('#spk').onclick=()=>{S.speak=!S.speak;$('#spk').textContent=S.speak?'🔊':'🔇';if(!S.speak)speechSynthesis.cancel()};
$('#vc').onclick=()=>{S.voice=!S.voice;$('#vc').classList.toggle('on',S.voice);if(S.voice){S.speak=true;$('#spk').textContent='🔊';toast('Voice Chat: mic dabao aur bolo')}};
$('#lang').onchange=()=>{$('#note').hidden=$('#lang').value!=='balochi'};
const ta=$('#in');ta.oninput=()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px';ta.dir=isRtl(ta.value)?'rtl':'ltr'};
ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go()}};
$('#go').onclick=go;

async function groq(path,opts){
  const r=await fetch(GROQ+path,{...opts,headers:{Authorization:'Bearer '+S.key,...(opts.headers||{})}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||('HTTP '+r.status));return j;
}
async function transcribe(a){
  const f=new FormData(),L=$('#lang').value,lc={hindi:'hi',urdu:'ur',english:'en'}[L];
  f.append('model',STT);f.append('response_format','json');if(lc)f.append('language',lc);
  f.append('file',a.blob,'audio.'+(a.mime.split('/')[1]||'webm'));
  return (await groq('/audio/transcriptions',{method:'POST',body:f})).text||'';
}

/* ---------- image upload (compressed) ---------- */
$('#file').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  const url=URL.createObjectURL(f),im=new Image();im.src=url;await im.decode();
  const k=Math.min(1,1024/Math.max(im.width,im.height)),c=document.createElement('canvas');
  c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);
  setRef({mimeType:'image/jpeg',data:c.toDataURL('image/jpeg',.82).split(',')[1]});e.target.value='';
};
function setRef(img){S.ref=img;$('#refbar').hidden=!img;if(img)$('#refimg').src=`data:${img.mimeType};base64,${img.data}`}
$('#refx').onclick=()=>setRef(null);
document.body.ondragover=e=>e.preventDefault();
document.body.ondrop=e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/')){$('#file').files=e.dataTransfer.files;$('#file').onchange({target:$('#file')})}};

/* ---------- chat UI ---------- */
function addMsg(role,text){
  $('.empty')?.remove();
  const m=document.createElement('div');m.className='msg '+role;
  m.innerHTML='<div class="bub glass"><div class="txt"></div></div>';
  setTxt(m,text);$('#chat').append(m);m.scrollIntoView({behavior:'smooth',block:'end'});return m;
}
function setTxt(m,t){const x=m.querySelector('.txt');x.textContent=t;x.dir='auto';x.classList.toggle('rtl',isRtl(t))}
function card(im,id){
  const src=`data:${im.mimeType};base64,${im.data}`,d=document.createElement('div');d.className='card';d.dataset.id=id;
  d.innerHTML=`<img src="${src}" alt=""><div class="cb"><a href="${src}" download="kaad-ai-${id}.jpg" title="Download">⬇</a><button data-a="s" title="Share">↗</button><button data-a="r" title="Use as reference">🖼</button><button data-a="d" title="Delete">🗑</button></div>`;
  d.querySelector('[data-a=s]').onclick=async()=>{try{const b=await (await fetch(src)).blob(),f=new File([b],'kaad-ai.jpg',{type:b.type});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'KAAD AI'});else toast('Share is not supported here — use Download')}catch{}};
  d.querySelector('[data-a=r]').onclick=()=>{setRef(im);toast('Reference set ✅')};
  d.querySelector('[data-a=d]').onclick=()=>{document.querySelectorAll(`[data-id="${id}"]`).forEach(x=>x.remove());$('#gc').textContent=$('#gal').children.length};
  return d;
}
function addImg(box,im){const id=++S.n;box.append(card(im,id));$('#gal').prepend(card(im,id));$('#gc').textContent=$('#gal').children.length}

async function genOne(prompt,ar,seed){
  const [w,h]=SZ[ar];
  const url=S.img.replace('{prompt}',encodeURIComponent(prompt)).replace('{w}',w).replace('{h}',h).replace('{seed}',seed);
  const r=await fetch(url);if(!r.ok)throw new Error('Image service error '+r.status);
  const b=await r.blob();if(!b.type.startsWith('image/'))throw new Error('Image service did not return an image');
  return new Promise(res=>{const fr=new FileReader();fr.onload=()=>res({mimeType:b.type,data:fr.result.split(',')[1]});fr.readAsDataURL(b)});
}

/* ---------- main send ---------- */
async function go(){const t=ta.value.trim();if(!t&&!S.ref)return;ta.value='';ta.oninput();send(t)}
async function send(text,audio,regen){
  if(S.busy)return;if(!S.key)return openKey();
  S.busy=true;speechSynthesis.cancel();
  const L=$('#lang').value,ref=regen?regen.ref:S.ref;
  const um=regen?null:addMsg('user',text||'🎤 …');
  const ai=addMsg('ai','…');
  try{
    let o=regen?.o;
    if(!o){
      if(audio){text=await transcribe(audio);setTxt(um,'🎤 '+(text||'…'));if(!text.trim())throw new Error('Awaaz samajh nahi aayi / could not hear speech')}
      const note=`${text||'(no text, only an image)'}\n[note: forced_language=${L}; image_attached=${!!ref}; previous_image_prompt="${S.lastPrompt}"]`;
      const user=ref?[{type:'text',text:note},{type:'image_url',image_url:{url:`data:${ref.mimeType};base64,${ref.data}`}}]:note;
      const j=await groq('/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:ref?VIS:TXT,messages:[{role:'system',content:SYS},...S.hist.slice(-10),{role:'user',content:user}],response_format:{type:'json_object'},temperature:.7,max_tokens:900})});
      o=JSON.parse(j.choices[0].message.content);
      S.hist.push({role:'user',content:text||'(image)'},{role:'assistant',content:o.reply||''});
    }
    setTxt(ai,o.reply||'');
    if(S.speak)say(o.reply,o.lang);
    if(o.intent==='image'&&o.prompt_en)await makeImages(ai,o,ref,regen);else addActs(ai,o,null);
  }catch(e){
    console.error(e);
    setTxt(ai,ERR[L==='hindi'?'hi':(L==='urdu'||L==='balochi')?'ur':'en']+'\n('+e.message.slice(0,200)+')');
  }
  if(!regen&&S.ref)setRef(null);S.busy=false;
}
async function makeImages(ai,o,ref,regen){
  const st=$('#style').value,ar=$('#ar').value,n=+$('#count').value;
  const prompt=o.prompt_en+(STY[st]?', '+STY[st]:'');
  const ck=JSON.stringify([prompt,ar,n]);
  const bub=ai.querySelector('.bub'),det=document.createElement('details');det.className='enh';
  det.innerHTML='<summary>Enhanced prompt</summary>';det.append(prompt);bub.append(det);
  const box=document.createElement('div');box.className='grid';bub.append(box);
  S.lastPrompt=o.prompt_en;
  if(!regen&&S.cache.has(ck)){S.cache.get(ck).forEach(im=>addImg(box,im));addActs(ai,o,{ref});return}
  const sk=document.createElement('div');sk.innerHTML='<div class="grid">'+'<div class="sk"></div>'.repeat(n)+'</div><div class="prog"></div>';bub.append(sk);
  const got=[],seed=Math.floor(Math.random()*1e6);
  const rs=await Promise.allSettled(Array.from({length:n},(_,i)=>genOne(prompt,ar,seed+i).then(im=>{got.push(im);addImg(box,im);sk.querySelector('.sk')?.remove()})));
  sk.remove();
  if(got.length)S.cache.set(ck,got);
  const bad=rs.find(r=>r.status==='rejected');if(!got.length&&bad)throw bad.reason;
  addActs(ai,o,{ref});
}
function addActs(ai,o,img){
  const a=document.createElement('div');a.className='acts';
  a.innerHTML='<button class="pill" data-a="v">🔊 Read</button>'+(img?'<button class="pill" data-a="g">🔄 Regenerate</button>':'');
  a.querySelector('[data-a=v]').onclick=()=>say(o.reply,o.lang);
  a.querySelector('[data-a=g]')?.addEventListener('click',()=>send('',null,{o,ref:img.ref}));
  ai.querySelector('.bub').append(a);ai.scrollIntoView({behavior:'smooth',block:'end'});
}

/* ---------- text to speech (browser voices) ---------- */
function say(t,lang){
  if(!t||!window.speechSynthesis)return;speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang=lang==='hi'?'hi-IN':lang==='ur'||lang==='bal'?'ur-PK':lang==='en'?'en-IN':VL[$('#lang').value];
  if(lang==='bal')toast('Balochi pronunciation approximate hai (Urdu voice)');
  speechSynthesis.speak(u);
}

/* ---------- voice input ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let stop=null,stream,raf,actx;
$('#mic').onclick=async()=>{
  if(stop)return stop();
  if(!S.key)return openKey();
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch{return toast('Mic permission chahiye')}
  const L=$('#lang').value,fast=SR&&['hindi','urdu','english'].includes(L);
  speechSynthesis.cancel();viz(fast);$('#mic').classList.add('rec');
  if(fast){
    const r=new SR();r.lang=VL[L];r.interimResults=true;r.continuous=false;
    r.onresult=e=>{ta.value=[...e.results].map(x=>x[0].transcript).join('');ta.oninput()};
    r.onerror=()=>{};
    r.onend=()=>{cleanup();if(ta.value.trim()&&(S.voice||$('#auto').checked))go()};
    stop=()=>r.stop();r.start();
  }else{
    const ch=[],mr=new MediaRecorder(stream);
    mr.ondataavailable=e=>ch.push(e.data);
    mr.onstop=()=>{const mime=(mr.mimeType||'audio/webm').split(';')[0];cleanup();send('',{mime,blob:new Blob(ch,{type:mime})})};
    stop=()=>mr.stop();mr.start();
  }
};
function cleanup(){
  cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());actx?.close().catch(()=>{});
  $('#wave').hidden=true;$('#mic').classList.remove('rec');stop=null;
}
function viz(fast){
  actx=new (window.AudioContext||window.webkitAudioContext)();
  const an=actx.createAnalyser();an.fftSize=128;actx.createMediaStreamSource(stream).connect(an);
  const cv=$('#wave'),c=cv.getContext('2d'),d=new Uint8Array(an.frequencyBinCount),w=new Uint8Array(an.fftSize);
  cv.hidden=false;cv.width=cv.clientWidth*2;cv.height=92;
  let heard=false,last=Date.now();
  const draw=()=>{
    raf=requestAnimationFrame(draw);an.getByteFrequencyData(d);an.getByteTimeDomainData(w);
    c.clearRect(0,0,cv.width,cv.height);
    const g=c.createLinearGradient(0,0,cv.width,0);g.addColorStop(0,'#8B5CF6');g.addColorStop(.5,'#38BDF8');g.addColorStop(1,'#EC4899');c.fillStyle=g;
    const bw=cv.width/d.length;d.forEach((v,i)=>{const h=Math.max(4,v/255*cv.height);c.fillRect(i*bw+2,(cv.height-h)/2,bw-4,h)});
    const lv=Math.max(...w.map(x=>Math.abs(x-128)))/128;
    if(lv>.06){heard=true;last=Date.now()}
    if(heard&&Date.now()-last>1800&&(S.voice||!fast))stop?.();
  };draw();
}
