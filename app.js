'use strict';
const API='https://generativelanguage.googleapis.com/v1beta/models/',TXT='gemini-2.5-flash',IMG='gemini-2.5-flash-image';
const $=s=>document.querySelector(s);
const S={key:localStorage.getItem('kaad_key')||'',hist:[],last:null,ref:null,cache:new Map(),speak:false,voice:false,busy:false,n:0};
const STY={Realistic:'photorealistic, ultra detailed, natural lighting',Anime:'anime style, vibrant colors, clean lineart','3D':'3D render, Pixar-like, soft studio lighting','Cinematic':'cinematic, dramatic lighting, shallow depth of field, film grain',Neon:'neon cyberpunk glow, dark background, vivid light trails','Oil Painting':'classical oil painting, rich brush strokes',Logo:'clean vector logo, minimal, centered, flat design'};
const VL={hindi:'hi-IN',urdu:'ur-PK',english:'en-IN',balochi:'ur-PK',auto:'hi-IN'};
const ERR={hi:'कुछ गड़बड़ हो गई, कृपया फिर कोशिश करें।',ur:'کچھ مسئلہ ہو گیا، دوبارہ کوشش کریں۔',en:'Something went wrong, please try again.'};
const SYS=`You are KAAD AI, a friendly creative assistant inside an AI image studio.
Understand Hindi (Devanagari), Urdu (Roman + Nastaliq), English, Hinglish and Balochi (Perso-Arabic script, RTL). Balochi dialects: Makrani, Rakhshani, Eastern — be careful with them; when unsure keep Balochi sentences simple and short.
Reply in the SAME language and script style the user uses (Hindi->Devanagari, Roman Urdu/Hinglish->Roman, Urdu->Urdu script, Balochi->Balochi script, English->English). If the user asks to write something in Balochi/Hindi/etc, do it in "reply". If a forced language is given in the note, use it.
If audio is attached, transcribe it faithfully into "transcript".
Decide intent: "image" if the user wants an image created or edited (including follow-ups like "ab isko thoda dark karo" which edit the previous image; or an uploaded photo + instruction), else "chat".
For "image": write "prompt_en" = a detailed English image prompt (translate + enhance: subject, setting, lighting, mood, camera, details). For edits, describe the change to apply to the given image and keep the rest unchanged.
Output ONLY JSON: {"transcript":"","lang":"hi|ur|en|bal","intent":"image|chat","reply":"short friendly reply in user's language","prompt_en":""}`;

const isRtl=t=>/[\u0600-\u06FF]/.test(t);
const toast=(m,ms=2600)=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),ms)};
const openKey=()=>{$('#keyIn').value=S.key;$('#dlg').showModal()};
$('#keyBtn').onclick=openKey;$('#keyClose').onclick=()=>$('#dlg').close();
$('#keySave').onclick=()=>{S.key=$('#keyIn').value.trim();localStorage.setItem('kaad_key',S.key);$('#dlg').close();toast('Key saved ✅')};
$('#theme').onclick=()=>{document.body.classList.toggle('flag');localStorage.setItem('kaad_theme',document.body.classList.contains('flag')?'flag':'neon')};
if(localStorage.getItem('kaad_theme')==='neon')document.body.classList.remove('flag');
$('#spk').onclick=()=>{S.speak=!S.speak;$('#spk').textContent=S.speak?'🔊':'🔇';if(!S.speak)speechSynthesis.cancel()};
$('#vc').onclick=()=>{S.voice=!S.voice;$('#vc').classList.toggle('on',S.voice);if(S.voice){S.speak=true;$('#spk').textContent='🔊';toast('Voice Chat: mic dabao aur bolo')}};
$('#lang').onchange=()=>{$('#note').hidden=$('#lang').value!=='balochi'};
const ta=$('#in');ta.oninput=()=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+'px';ta.dir=isRtl(ta.value)?'rtl':'ltr'};
ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go()}};
$('#go').onclick=go;

async function gem(model,body){
  const r=await fetch(API+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':S.key},body:JSON.stringify(body)});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||('HTTP '+r.status));return j;
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
const dz=document.body;dz.ondragover=e=>e.preventDefault();
dz.ondrop=e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/')){$('#file').files=e.dataTransfer.files;$('#file').onchange({target:$('#file')})}};

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
  d.innerHTML=`<img src="${src}" alt=""><div class="cb"><a href="${src}" download="kaad-ai-${id}.png" title="Download">⬇</a><button data-a="s" title="Share">↗</button><button data-a="r" title="Use as reference">🖼</button><button data-a="d" title="Delete">🗑</button></div>`;
  d.querySelector('[data-a=s]').onclick=async()=>{try{const b=await (await fetch(src)).blob(),f=new File([b],'kaad-ai.png',{type:b.type});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'KAAD AI'});else toast('Share is not supported here — use Download')}catch{}};
  d.querySelector('[data-a=r]').onclick=()=>{setRef(im);S.last=im;toast('Reference set ✅')};
  d.querySelector('[data-a=d]').onclick=()=>{document.querySelectorAll(`[data-id="${id}"]`).forEach(x=>x.remove());$('#gc').textContent=$('#gal').children.length;if(S.last===im)S.last=null};
  return d;
}
function addImg(box,im){const id=++S.n;box.append(card(im,id));$('#gal').prepend(card(im,id));$('#gc').textContent=$('#gal').children.length;S.last=im}
const pick=j=>j.candidates?.[0]?.content?.parts?.find(p=>p.inlineData)?.inlineData;

/* ---------- main send ---------- */
async function go(){const t=ta.value.trim();if(!t&&!S.ref)return;ta.value='';ta.oninput();send(t)}
async function send(text,audio,regen){
  if(S.busy)return;if(!S.key)return openKey();
  S.busy=true;speechSynthesis.cancel();
  const um=regen?null:addMsg('user',text||'🎤 …');
  const L=$('#lang').value,ref=S.ref,ai=addMsg('ai','…');
  try{
    let o=regen?.o;
    if(!o){
      const parts=[];if(audio)parts.push({inlineData:{mimeType:audio.mime,data:audio.b64}});
      parts.push({text:(text||'(see audio)')+`\n[note: forced_language=${L}; user_uploaded_image=${!!ref}; previous_image_exists=${!!S.last}]`});
      const j=await gem(TXT,{systemInstruction:{parts:[{text:SYS}]},contents:[...S.hist.slice(-10),{role:'user',parts}],generationConfig:{responseMimeType:'application/json',temperature:.7}});
      o=JSON.parse(j.candidates[0].content.parts.map(p=>p.text||'').join('').replace(/```json|```/g,''));
      if(audio&&um)setTxt(um,'🎤 '+(o.transcript||'…'));
      S.hist.push({role:'user',parts:[{text:o.transcript||text}]},{role:'model',parts:[{text:o.reply||''}]});
    }
    setTxt(ai,o.reply||'');
    if(S.speak)say(o.reply,o.lang);
    if(o.intent==='image'&&o.prompt_en){await makeImages(ai,o,ref,regen)}
    else addActs(ai,o,null);
  }catch(e){
    console.error(e);
    const lg=L==='hindi'?'hi':(L==='urdu'||L==='balochi')?'ur':'en';
    setTxt(ai,ERR[lg]+'\n('+e.message.slice(0,160)+')');
  }
  if(ref)setRef(null);S.busy=false;
}
async function makeImages(ai,o,ref,regen){
  const st=$('#style').value,ar=$('#ar').value,n=+$('#count').value;
  const prompt=o.prompt_en+(STY[st]?', '+STY[st]:'');
  const base=ref||S.last;
  const ck=JSON.stringify([prompt,ar,n,base?base.data.length:0]);
  const bub=ai.querySelector('.bub'),det=document.createElement('details');det.className='enh';
  det.innerHTML='<summary>Enhanced prompt</summary>';det.append(prompt);bub.append(det);
  const box=document.createElement('div');box.className='grid';bub.append(box);
  if(!regen&&S.cache.has(ck)){S.cache.get(ck).forEach(im=>addImg(box,im));addActs(ai,o,null);return}
  const sk=document.createElement('div');sk.innerHTML='<div class="grid">'+'<div class="sk"></div>'.repeat(n)+'</div><div class="prog"></div>';bub.append(sk);
  const got=[];
  const one=()=>gem(IMG,{contents:[{parts:[...(base?[{inlineData:base}]:[]),{text:base?`Edit this image: ${prompt}`:prompt}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:ar}}})
    .then(j=>{const im=pick(j);if(!im)throw new Error('No image returned (prompt may be blocked)');got.push(im);addImg(box,im);sk.querySelector('.sk')?.remove()});
  const rs=await Promise.allSettled(Array.from({length:n},one));sk.remove();
  if(got.length)S.cache.set(ck,got);
  const bad=rs.find(r=>r.status==='rejected');if(!got.length&&bad)throw bad.reason;
  addActs(ai,o,{ref,prompt});
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
    mr.onstop=()=>{
      const mime=(mr.mimeType||'audio/webm').split(';')[0],fr=new FileReader();cleanup();
      fr.onload=()=>send('',{mime,b64:fr.result.split(',')[1]});fr.readAsDataURL(new Blob(ch,{type:mime}));
    };
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
