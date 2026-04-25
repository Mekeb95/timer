const cfgMin={'ft-tc':60,'amrap-dur':60,'emom-work':5,'emom-rest':5,'emom-tc':60};
const cfgDefaults={'ft-tc':20*60,'amrap-dur':20*60,'emom-work':40,'emom-rest':20,'emom-tc':30*60,'emom-rounds':10};
const CFG_KEYS=['ft-tc','amrap-dur','emom-work','emom-rest','emom-tc','emom-rounds'];

function loadCfg(){
  try{
    const s=localStorage.getItem('cf-timer-cfg');
    if(!s)return Object.assign({},cfgDefaults);
    const raw=JSON.parse(s);
    const safe={};
    for(const k of CFG_KEYS){if(typeof raw[k]==='number'&&isFinite(raw[k])&&raw[k]>0)safe[k]=raw[k];}
    return Object.assign({},cfgDefaults,safe);
  }catch(e){return Object.assign({},cfgDefaults);}
}
function saveCfg(){try{localStorage.setItem('cf-timer-cfg',JSON.stringify(cfg));}catch(e){}}
const cfg=loadCfg();

let mode='fortime',state='idle';
let elapsed=0,interval=null,cdCount=10;
let emomPhase='work',emomRound=1,emomPhaseElapsed=0;
let modalKey='';
let repCount=0,repCooldown=false;

// AUDIO
const AC=new (window.AudioContext||window.webkitAudioContext)();
function beep(f,d,t='sine',g=.6){const o=AC.createOscillator(),gn=AC.createGain();o.connect(gn);gn.connect(AC.destination);o.type=t;o.frequency.value=f;gn.gain.setValueAtTime(g,AC.currentTime);gn.gain.exponentialRampToValueAtTime(.001,AC.currentTime+d);o.start();o.stop(AC.currentTime+d);}
function sndCd(){beep(880,.12,'sine',.7);vibCd();}
function sndGo(){beep(1046,.08);setTimeout(()=>beep(1318,.08),90);setTimeout(()=>beep(1760,.22,'sine',.9),180);vibGo();}
function sndWork(){beep(1174,.07);setTimeout(()=>beep(1568,.18,'sine',.8),80);vibWork();}
function sndRest(){beep(523,.07);setTimeout(()=>beep(392,.22,'sine',.7),80);vibRest();}
function sndBuzzerFull(){sndBuzzer();vibBuzzer();}
function sndBuzzer(){[0,700,1400].forEach(t=>setTimeout(()=>{const o=AC.createOscillator(),g=AC.createGain();o.connect(g);g.connect(AC.destination);o.type='sawtooth';o.frequency.setValueAtTime(220,AC.currentTime);g.gain.setValueAtTime(1.0,AC.currentTime);g.gain.setValueAtTime(1.0,AC.currentTime+.48);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+.52);o.start();o.stop(AC.currentTime+.55);},t));}

// VIBRATION
function vib(pattern){if(navigator.vibrate)navigator.vibrate(pattern);}
function vibGo(){vib([100,50,100,50,300]);}
function vibWork(){vib([200]);}
function vibRest(){vib([80,60,80]);}
function vibCd(){vib([40]);}
function vibBuzzer(){vib([400,150,400,150,400]);}

// WAKE LOCK
let wakeLock=null;
async function requestWakeLock(){if(!('wakeLock' in navigator))return;try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}}
async function releaseWakeLock(){if(wakeLock){try{await wakeLock.release();}catch(e){}wakeLock=null;}}
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&(state==='running'||state==='countdown'))await requestWakeLock();});

// FORMAT
function fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;}

// REP COUNTER
function addRep(){
  if(repCooldown)return;
  repCount++;
  document.getElementById('repCount').textContent=repCount;
  repCooldown=true;
  const btn=document.getElementById('repBtn');
  btn.classList.add('tapped');
  vib([30]);
  setTimeout(()=>{repCooldown=false;btn.classList.remove('tapped');},1000);
}
function resetReps(){repCount=0;repCooldown=false;document.getElementById('repCount').textContent='0';document.getElementById('repBtn').classList.remove('tapped');}
function showRepBtn(v){document.getElementById('repBtn').classList.toggle('hidden',!v);}

// HELPERS
function showTabs(v){document.querySelector('.tabs').classList.toggle('hidden',!v);}
function setPauseVisible(v){document.getElementById('btnPause').classList.toggle('hidden',!v);}
function setStartVisible(v){document.getElementById('btnStart').classList.toggle('hidden',!v);}
function showSettings(v){document.getElementById('settingsPanel').classList.toggle('hidden',!v);}
function setStartBtn(type){
  const b=document.getElementById('btnStart');
  if(type==='start'){b.replaceChildren();b.textContent='START';b.style.fontSize='15px';}
  else if(type==='play'){b.replaceChildren(document.getElementById('tplPlay').content.cloneNode(true));b.style.fontSize='';}
}

// STEPPERS
function adjSec(k,d){cfg[k]=Math.max(cfgMin[k]||5,cfg[k]+d);document.getElementById(k+'-val').textContent=fmt(cfg[k]);saveCfg();resetTimer();}
function adjRounds(d){cfg['emom-rounds']=Math.max(1,cfg['emom-rounds']+d);document.getElementById('emom-rounds-val').textContent=cfg['emom-rounds'];saveCfg();resetTimer();}

// MODALS
function openModal(k,title){modalKey=k;document.getElementById('modalTitle').textContent=title;document.getElementById('mMin').value=Math.floor(cfg[k]/60);document.getElementById('mSec').value=cfg[k]%60;document.getElementById('modal').classList.remove('hidden');setTimeout(()=>document.getElementById('mMin').focus(),150);}
function closeModal(){document.getElementById('modal').classList.add('hidden');}
function confirmModal(){const m=parseInt(document.getElementById('mMin').value)||0;const s=parseInt(document.getElementById('mSec').value)||0;cfg[modalKey]=Math.max(cfgMin[modalKey]||5,m*60+s);document.getElementById(modalKey+'-val').textContent=fmt(cfg[modalKey]);saveCfg();closeModal();resetTimer();}
function openRoundsModal(){document.getElementById('mRounds').value=cfg['emom-rounds'];document.getElementById('roundsModal').classList.remove('hidden');setTimeout(()=>document.getElementById('mRounds').focus(),150);}
function closeRoundsModal(){document.getElementById('roundsModal').classList.add('hidden');}
function confirmRoundsModal(){cfg['emom-rounds']=Math.max(1,parseInt(document.getElementById('mRounds').value)||1);document.getElementById('emom-rounds-val').textContent=cfg['emom-rounds'];saveCfg();closeRoundsModal();resetTimer();}

// TC TOGGLE
function onTcToggle(){
  document.getElementById('ft-tc-row').style.display=document.getElementById('ft-tc-on').checked?'flex':'none';
  document.getElementById('emom-tc-row').style.display=document.getElementById('emom-tc-on').checked?'flex':'none';
  updateClockUI();
}

// MODE SWITCH
function switchMode(m){
  resetTimer();mode=m;
  ['fortime','amrap','emom'].forEach(x=>{
    document.getElementById('tab-'+x).className='tab'+(x===m?' active':'');
    document.getElementById('panel-'+x).classList.toggle('hidden',x!==m);
  });
  onTcToggle();updateClockUI();
}

// TIMER
function startStop(){AC.resume();if(state==='idle'||state==='done')startCd();else if(state==='paused')resumeFromPause();}
function startCd(){
  state='countdown';cdCount=10;elapsed=0;
  emomPhase='work';emomRound=1;emomPhaseElapsed=0;
  resetReps();requestWakeLock();
  setStartVisible(false);showSettings(false);showTabs(false);setPauseVisible(true);showRepBtn(false);
  updateClockUI();interval=setInterval(tickCd,1000);
}
function tickCd(){
  cdCount--;
  if(cdCount<=3&&cdCount>0)sndCd();
  if(cdCount<=0){clearInterval(interval);sndGo();state='running';showRepBtn(true);interval=setInterval(tickRun,1000);}
  updateClockUI();
}
function resumeFromPause(){
  const wasCd=cdCount>0&&elapsed===0;
  state=wasCd?'countdown':'running';
  requestWakeLock();
  setStartVisible(false);showSettings(false);showTabs(false);setPauseVisible(true);showRepBtn(!wasCd);
  interval=setInterval(wasCd?tickCd:tickRun,1000);
}
function tickRun(){
  elapsed++;
  if(mode==='emom')emomPhaseElapsed++;
  checkTC();
  if(mode==='amrap')checkAmrap();
  if(mode==='emom')checkEmom();
  updateClockUI();
}
function checkTC(){
  let on=false,lim=0;
  if(mode==='fortime'){on=document.getElementById('ft-tc-on').checked;lim=cfg['ft-tc'];}
  if(mode==='emom'){on=document.getElementById('emom-tc-on').checked;lim=cfg['emom-tc'];}
  if(on&&elapsed>=lim)finish();
}
function checkAmrap(){if(elapsed>=cfg['amrap-dur'])finish();}
function checkEmom(){
  const dur=emomPhase==='work'?cfg['emom-work']:cfg['emom-rest'];
  if(emomPhaseElapsed>=dur){
    emomPhaseElapsed=0;
    if(emomPhase==='work'){emomPhase='rest';sndRest();}
    else{emomRound++;if(emomRound>cfg['emom-rounds']){finish();return;}emomPhase='work';sndWork();}
  }
}
function finish(){
  clearInterval(interval);state='done';releaseWakeLock();sndBuzzerFull();
  setStartBtn('start');setStartVisible(true);showSettings(true);showTabs(true);setPauseVisible(false);showRepBtn(false);
  updateClockUI();
}
function pauseTimer(){
  clearInterval(interval);state='paused';releaseWakeLock();
  const isCd=cdCount>0&&elapsed===0;
  setStartBtn('play');setStartVisible(true);
  if(!isCd&&mode!=='emom')showSettings(true);
  showTabs(true);setPauseVisible(false);showRepBtn(!isCd);
  updateClockUI();
}
function resetTimer(){
  clearInterval(interval);state='idle';elapsed=0;cdCount=10;
  emomPhase='work';emomRound=1;emomPhaseElapsed=0;
  resetReps();releaseWakeLock();
  setStartBtn('start');setStartVisible(true);showSettings(true);showTabs(true);setPauseVisible(false);showRepBtn(false);
  updateClockUI();
}

// UI
function updateClockUI(){
  const cl=document.getElementById('clock');
  const lbl=document.getElementById('clockLabel');
  const rl=document.getElementById('roundLabel');
  const pl=document.getElementById('phaseLabel');
  const tb=document.getElementById('tcBadge');
  const ib=document.getElementById('infoBar');

  cl.className='clock';rl.textContent='';pl.textContent='';
  tb.classList.add('hidden');ib.classList.add('hidden');

  const pb=document.getElementById('progressBar');
  const pf=document.getElementById('progressFill');

  let tcOn=false,tcSec=0;
  if(mode==='fortime'){tcOn=document.getElementById('ft-tc-on').checked;tcSec=cfg['ft-tc'];}
  if(mode==='emom'){tcOn=document.getElementById('emom-tc-on').checked;tcSec=cfg['emom-tc'];}
  if(tcOn){tb.classList.remove('hidden');tb.textContent='⏱ Timecap '+fmt(tcSec);}

  if(state==='idle'||state==='done'){
    pb.style.display='none';
  } else if(state==='countdown'||(state==='paused'&&elapsed===0&&cdCount>0)){
    pb.style.display='block';
    pf.style.width=((10-cdCount)/10*100)+'%';
    pf.style.background='#FF9F0A';
  } else {
    pb.style.display='block';
    let pct=0,color='#0A84FF';
    if(mode==='fortime'){
      if(tcOn){pct=Math.min(1,elapsed/tcSec);color='#0A84FF';}
      else{pb.style.display='none';}
    } else if(mode==='amrap'){
      pct=Math.min(1,elapsed/cfg['amrap-dur']);color='#FF9F0A';
    } else if(mode==='emom'){
      const dur=emomPhase==='work'?cfg['emom-work']:cfg['emom-rest'];
      pct=Math.min(1,emomPhaseElapsed/dur);
      color=emomPhase==='work'?'#30D158':'#FF9F0A';
    }
    pf.style.width=(pct*100)+'%';
    pf.style.background=color;
  }

  if(state==='countdown'||(state==='paused'&&elapsed===0&&cdCount>0)){
    lbl.textContent='10 SECONDS ON THE CLOCK!';
    cl.textContent=cdCount;cl.classList.add('cd');return;
  }
  if(state==='done')cl.classList.add('done');

  if(state==='running'||state==='paused'){
    if(mode==='emom'){ib.classList.remove('hidden');ib.textContent='Work '+fmt(cfg['emom-work'])+'  ·  Rest '+fmt(cfg['emom-rest'])+'  ·  '+cfg['emom-rounds']+' runder';}
    else if(mode==='amrap'){ib.classList.remove('hidden');ib.textContent='Varighet '+fmt(cfg['amrap-dur']);}
  }

  if(mode==='fortime'){
    lbl.textContent=state==='done'?'FERDIG!':'FOR TIME';
    cl.textContent=fmt(elapsed);
  } else if(mode==='amrap'){
    lbl.textContent=state==='done'?'AMRAP FERDIG':'AMRAP';
    cl.textContent=fmt(state==='idle'&&elapsed===0?cfg['amrap-dur']:Math.max(0,cfg['amrap-dur']-elapsed));
  } else if(mode==='emom'){
    lbl.textContent=state==='done'?'EMOM FERDIG':'EMOM';
    if(state==='idle'&&elapsed===0){cl.textContent=fmt(cfg['emom-work']);}
    else{
      const dur=emomPhase==='work'?cfg['emom-work']:cfg['emom-rest'];
      cl.textContent=fmt(Math.max(0,dur-emomPhaseElapsed));
      if(state!=='done'){
        rl.textContent='Runde '+emomRound+' av '+cfg['emom-rounds'];
        pl.textContent=emomPhase==='work'?'● WORK':'● REST';
        pl.className='phase-label'+(emomPhase==='rest'?' rest':'');
      }
    }
  }
}

// INIT
function initUI(){
  document.getElementById('ft-tc-val').textContent=fmt(cfg['ft-tc']);
  document.getElementById('amrap-dur-val').textContent=fmt(cfg['amrap-dur']);
  document.getElementById('emom-work-val').textContent=fmt(cfg['emom-work']);
  document.getElementById('emom-rest-val').textContent=fmt(cfg['emom-rest']);
  document.getElementById('emom-tc-val').textContent=fmt(cfg['emom-tc']);
  document.getElementById('emom-rounds-val').textContent=cfg['emom-rounds'];
}

// EVENT LISTENERS — no inline handlers in HTML
document.querySelector('.btn-reset').addEventListener('click', resetTimer);
document.getElementById('btnStart').addEventListener('click', startStop);
document.getElementById('btnPause').addEventListener('click', pauseTimer);
document.getElementById('repBtn').addEventListener('click', addRep);

// Tabs
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>switchMode(btn.dataset.mode));
});

// Stepper buttons (delegated)
document.addEventListener('click',e=>{
  const sb=e.target.closest('.sb');
  if(!sb)return;
  if(sb.dataset.key!==undefined)adjSec(sb.dataset.key,parseInt(sb.dataset.delta));
  else if(sb.dataset.rounds!==undefined)adjRounds(parseInt(sb.dataset.rounds));
});

// Value spans (delegated)
document.addEventListener('click',e=>{
  const sv=e.target.closest('.sv');
  if(!sv)return;
  if(sv.dataset.modalKey)openModal(sv.dataset.modalKey,sv.dataset.modalTitle);
  else if(sv.hasAttribute('data-open-rounds'))openRoundsModal();
});

// Checkboxes
document.getElementById('ft-tc-on').addEventListener('change',onTcToggle);
document.getElementById('emom-tc-on').addEventListener('change',onTcToggle);

// Modal backgrounds (click outside to close)
document.getElementById('modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
document.getElementById('roundsModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeRoundsModal();});

// Modal buttons
document.querySelector('#modal .modal-btn.cancel').addEventListener('click',closeModal);
document.querySelector('#modal .modal-btn.ok').addEventListener('click',confirmModal);
document.querySelector('#roundsModal .modal-btn.cancel').addEventListener('click',closeRoundsModal);
document.querySelector('#roundsModal .modal-btn.ok').addEventListener('click',confirmRoundsModal);

// Keyboard
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;
  if(!document.getElementById('modal').classList.contains('hidden'))confirmModal();
  else if(!document.getElementById('roundsModal').classList.contains('hidden'))confirmRoundsModal();
});

// Audio context resume on first interaction
document.addEventListener('touchstart',()=>AC.resume(),{once:true});
document.addEventListener('click',()=>AC.resume(),{once:true});

initUI();onTcToggle();switchMode('fortime');
