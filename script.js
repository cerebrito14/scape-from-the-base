/* Fuga de la base de Eggman: lógica del juego (candados, reloj, mapa, sonido) */
(function(){
'use strict';
var $=function(s){return document.querySelector(s)};
var RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var TOTAL=1800,ERR=20,HINT=30;

/* ---------- audio ---------- */
var ac=null,muted=false;
function tone(f,d,type,v,when){
  if(muted||!ac)return;
  try{
    var o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime+(when||0);
    o.type=type||'square';o.frequency.value=f;
    g.gain.setValueAtTime(v||.04,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+d+.02);
  }catch(e){}
}
var sfx={
  click:function(){tone(880,.04,'square',.025)},
  tick:function(){tone(1300,.03,'square',.03)},
  ok:function(){[523,659,784,1047].forEach(function(f,i){tone(f,.14,'square',.04,i*.09)})},
  bad:function(){tone(130,.28,'sawtooth',.06);tone(98,.3,'sawtooth',.05,.12)},
  door:function(){tone(90,1,'sawtooth',.03);tone(170,.7,'triangle',.03,.25)},
  win:function(){[523,659,784,1047,784,1047,1319].forEach(function(f,i){tone(f,.16,'square',.04,i*.12)})},
  lose:function(){for(var i=0;i<6;i++)tone(i%2?420:640,.3,'sawtooth',.045,i*.32)}
};

/* ---------- música de fondo ---------- */
var bgm=$('#bgm'),musicBtn=$('#music'),musicOn=true;
bgm.volume=.45;
function paintMusic(playing){
  musicBtn.textContent='♪ Música: '+(playing?'sí':'no');
  musicBtn.setAttribute('aria-pressed',String(playing));
  musicBtn.classList.toggle('on',playing);
}
function playMusic(fromStart){
  if(!musicOn)return;
  if(fromStart)try{bgm.currentTime=0}catch(e){}
  var p=bgm.play();
  if(p&&p.then)p.then(function(){paintMusic(true)},function(){paintMusic(false)});
  else paintMusic(true);
}
musicBtn.addEventListener('click',function(){
  if(bgm.paused){musicOn=true;playMusic(false)}
  else{musicOn=false;bgm.pause();paintMusic(false)}
});

/* ---------- state ---------- */
var S={room:0,t:TOTAL,run:false,paused:false,sealed:false,opened:[false,false,false,false],err:0,hints:0,hu:[0,0,0,0],iv:null,last:0,sec:0,alarm:''};

/* ---------- helpers ---------- */
function fmt(sec,pad){var s=Math.max(0,Math.ceil(sec)),m=Math.floor(s/60),r=s%60;return (pad&&m<10?'0':'')+m+':'+(r<10?'0':'')+r}
function show(id){['intro','game','end'].forEach(function(k){$('#'+k).hidden=(k!==id)});window.scrollTo(0,0)}

/* ---------- map ---------- */
var MAPR=[
  {n:['Celdas'],x:0,y:0},{n:['Reactor'],x:105,y:0},{n:['Comunicaciones'],x:210,y:0},
  {n:['Laboratorio'],x:210,y:85},{n:['Centro de','mando'],x:105,y:85},{n:['Pista de','despegue'],x:0,y:85}
];
var DOORS=[{x:97.5,y:27.5},{x:202.5,y:27.5},{x:255,y:70},{x:202.5,y:112.5},{x:97.5,y:112.5}];
function renderMap(sel,cur,op){
  var el=$(sel),s='',i,k;
  function cx(j){return MAPR[j].x+45}
  function cy(j){return MAPR[j].y+27.5}
  for(k=0;k<5;k++)s+='<line class="m-pipe" x1="'+cx(k)+'" y1="'+cy(k)+'" x2="'+cx(k+1)+'" y2="'+cy(k+1)+'"/>';
  MAPR.forEach(function(r,j){
    var st=j===cur?'cur':(j<cur?'past':'next');
    var lines=r.n.map(function(t,m){return '<text x="'+(r.x+45)+'" y="'+(r.y+(r.n.length===1?32:25+m*14))+'" text-anchor="middle">'+t+'</text>'}).join('');
    s+='<g class="m-room '+st+'"><rect x="'+r.x+'" y="'+r.y+'" width="90" height="55"/>'+lines+'</g>';
  });
  DOORS.forEach(function(d,j){
    var st=j===0?'free':(op[j-1]?'open':'lock');
    s+='<g class="m-door '+st+'"><rect x="'+(d.x-7)+'" y="'+(d.y-7)+'" width="14" height="14"/>'+(j?'<text x="'+d.x+'" y="'+(d.y+3.5)+'" text-anchor="middle">'+j+'</text>':'')+'</g>';
  });
  el.setAttribute('viewBox','-2 -2 304 144');
  el.setAttribute('role','img');
  el.setAttribute('aria-label','Plano de la base. Posición actual: '+MAPR[cur].n.join(' '));
  el.innerHTML=s;
}

/* ---------- log ---------- */
function say(who,text){
  var log=$('#log'),d=document.createElement('div'),w=document.createElement('b'),sp=document.createElement('span');
  d.className='line '+(who==='Sage'?'ec':'tl');
  w.textContent=who+': ';d.appendChild(w);d.appendChild(sp);log.appendChild(d);
  while(log.children.length>6)log.removeChild(log.firstChild);
  if(RM){sp.textContent=text;return}
  var i=0;(function n(){sp.textContent=text.slice(0,++i);if(i<text.length)setTimeout(n,14)})();
}

/* ---------- clock & HUD ---------- */
function renderClock(){
  var c=$('#clk');c.textContent=fmt(S.t,true);
  c.classList.toggle('warn',S.t<300);
  document.body.classList.toggle('crit',S.run&&S.t<300);
  var a=S.t<60?'.5s':S.t<300?'.9s':S.t<900?'1.8s':'3s';
  if(a!==S.alarm){S.alarm=a;document.documentElement.style.setProperty('--alarm',a)}
}
function renderBolts(){
  $('#bolts').innerHTML=S.opened.map(function(o,i){
    return '<li class="bolt '+(o?'open':(i===S.room?'cur':''))+'" aria-label="Candado '+(i+1)+': '+(o?'abierto':'cerrado')+'">'+(i+1)+'</li>';
  }).join('');
}
function tick(){
  if(!S.run)return;
  var now=Date.now(),dt=(now-S.last)/1000;S.last=now;
  if(S.paused)return;
  S.t-=dt;
  if(S.t<=0){S.t=0;renderClock();lose();return}
  var sec=Math.ceil(S.t);
  if(sec!==S.sec){S.sec=sec;if(sec<=10)sfx.tick()}
  renderClock();
}
function penalize(sec){
  S.t-=sec;
  var p=$('#pen');p.textContent='−'+fmt(sec,false);p.classList.remove('pop');void p.offsetWidth;p.classList.add('pop');
  if(S.t<=0){S.t=0;renderClock();lose()}else renderClock();
}

/* ---------- puzzles ---------- */
function chart(){
  var pts=[[0,4],[5,8],[10,10],[15,6],[20,2]];
  function X(t){return 46+t*17.5}
  function Y(p){return 170-p*13}
  var s='',i;
  for(i=0;i<=12;i+=2){s+='<line class="c-grid" x1="46" x2="396" y1="'+Y(i)+'" y2="'+Y(i)+'"/><text class="c-txt" x="38" y="'+(Y(i)+4)+'" text-anchor="end">'+i+'</text>'}
  for(i=0;i<4;i++){s+='<polygon class="c-trap" points="'+X(pts[i][0])+',170 '+X(pts[i][0])+','+Y(pts[i][1])+' '+X(pts[i+1][0])+','+Y(pts[i+1][1])+' '+X(pts[i+1][0])+',170"/>'}
  s+='<polyline class="c-line" points="'+pts.map(function(p){return X(p[0])+','+Y(p[1])}).join(' ')+'"/>';
  pts.forEach(function(p){
    s+='<circle class="c-dot" cx="'+X(p[0])+'" cy="'+Y(p[1])+'" r="4"/><text class="c-val" x="'+X(p[0])+'" y="'+(Y(p[1])-10)+'" text-anchor="middle">'+p[1]+'</text>';
    s+='<text class="c-txt" x="'+X(p[0])+'" y="188" text-anchor="middle">'+p[0]+'</text>';
  });
  s+='<text class="c-txt" x="46" y="12">P (MW)</text><text class="c-txt" x="396" y="206" text-anchor="end">t (min)</text>';
  return '<svg class="chart" viewBox="0 0 420 212" role="img" aria-label="Potencia en MW cada 5 minutos: 4, 8, 10, 6 y 2">'+s+'</svg>';
}
function alpha(){
  var s='',i;for(i=0;i<26;i++)s+='<div class="ab"><b>'+String.fromCharCode(65+i)+'</b><i>'+(i+1)+'</i></div>';
  return '<div class="abc" role="img" aria-label="Tabla de letras: A es 1, B es 2, hasta Z que es 26">'+s+'</div>';
}
function letterFld(id,label){return '<div class="fld let"><label for="'+id+'">'+label+'</label><input id="'+id+'" maxlength="1" autocapitalize="characters" spellcheck="false" aria-label="'+label+'"></div>'}

var R=[
{
  title:'Sala 1 · Reactor de energía',kind:'Candado 1 de 4 · Regla del trapecio',
  brief:'El cañón láser de la base gasta energía de forma irregular. Un sensor midió la potencia cada 5 minutos. Calcula la energía total consumida entre t = 0 y t = 20 min con la Regla del Trapecio y 4 subintervalos. Ese valor, en MW·min, abre la puerta.',
  form:function(){
    return '<div class="viz">'+chart()+'<table class="data"><tr><th scope="row">t (min)</th><td>0</td><td>5</td><td>10</td><td>15</td><td>20</td></tr><tr><th scope="row">P (MW)</th><td>4</td><td>8</td><td>10</td><td>6</td><td>2</td></tr></table></div>'+
    '<div class="fields"><div class="fld num"><label for="f0">Energía total (MW·min)</label><input id="f0" inputmode="decimal" autocomplete="off" spellcheck="false"></div></div>';
  },
  clean:function(v){return v.replace(/[^0-9.,]/g,'').slice(0,8)},
  check:function(v){return [Math.abs(parseFloat(v[0].replace(',','.'))-135)<0.01]},
  miss:function(){return 'Ese valor no abre la puerta. Revisa la fórmula y cada dato de la tabla.'},
  hints:['Cada tramo de 5 minutos forma un trapecio. Su área es el promedio de las dos alturas por el ancho.','E ≈ (h/2)·[f₀ + 2(f₁ + f₂ + f₃) + f₄], con h = 5.','Con h/2 = 2,5, el corchete vale 4 + 2(8 + 10 + 6) + 2 = 54. Multiplícalo por 2,5.'],
  enter:'Estoy en el reactor, Sonic vigila la puerta! Descifro el candado y salimos (⇀‸↼‵‵)',
  ok:'Consumo calculado el reactor desbloqueado, Esto no estaba en mi protocolo...',
  clue:'Los números de la próxima terminal son coordenadas de letras: A = 1, B = 2, … Z = 26.',
  next:'Cruzar a la Sala 2'
},
{
  title:'Sala 2 · Terminal de comunicaciones',kind:'Candado 2 de 4 · Sistemas de ecuaciones 2×2',
  brief:'La terminal guarda su contraseña como dos sistemas de ecuaciones. Resuelve cada uno y convierte x e y en letras con A = 1 hasta Z = 26. Escribe las cuatro letras en este orden: x de A, y de A, x de B, y de B.',
  form:function(){
    return '<div class="systems"><div class="sys"><h3>Sistema A</h3><div class="eq">2x + y = 45</div><div class="eq">x − y = 9</div></div><div class="sys"><h3>Sistema B</h3><div class="eq">3x + 2y = 56</div><div class="eq">x − y = 7</div></div></div>'+alpha()+
    '<div class="fields">'+letterFld('f0','x de A')+letterFld('f1','y de A')+letterFld('f2','x de B')+letterFld('f3','y de B')+'</div>';
  },
  clean:function(v){return v.toUpperCase().replace(/[^A-Z]/g,'').slice(0,1)},auto:true,
  check:function(v){var k=['R','I','N','G'];return v.map(function(x,i){return x.toUpperCase()===k[i]})},
  miss:function(n,t){return n+' de '+t+' letras correctas. Las correctas quedan fijas; revisa las demás.'},
  hints:['Resuelve cada sistema por separado. En ambos, la segunda ecuación te deja despejar x en función de y.','Sustituye x = y + 9 en 2x + y = 45. En el sistema B, x = y + 7.','El sistema A da x = 18 e y = 9. El B da x = 14 e y = 7. Falta pasarlos a letras.'],
  enter:'Estamos en la terminal de comunicaciones, La contraseña está cifrada con letras, deve ser una palabra clave',
  ok:'Clave aceptada, Reiniciando la terminal... Mi padre va a estar molesto (-_-;)',
  clue:'El laboratorio usa tres cerraduras de secuencias, cada una necesita el término que sigue',
  next:'Cruzar a la Sala 3'
},
{
  title:'Sala 3 · Laboratorio de código',kind:'Candado 3 de 4 · Patrones y progresiones',
  brief:'Tres paneles muestran una secuencia incompleta cada uno. Escribe el número que falta en cada panel. Cada secuencia sigue una regla distinta.',
  form:function(){
    var seqs=[['Panel A',[7,12,17,22]],['Panel B',[2,6,18,54]],['Panel C',[1,1,2,3,5,8]]];
    return '<div class="seqs">'+seqs.map(function(q,i){
      return '<div class="seq"><span class="seq-n">'+q[0]+'</span><div class="terms">'+q[1].map(function(n){return '<span class="tile">'+n+'</span>'}).join('')+'<input id="f'+i+'" inputmode="numeric" autocomplete="off" aria-label="Término que falta en el '+q[0]+'" placeholder="?"></div></div>';
    }).join('')+'</div>';
  },
  clean:function(v){return v.replace(/[^0-9]/g,'').slice(0,5)},auto:true,
  check:function(v){var k=[27,162,13];return v.map(function(x,i){return parseInt(x,10)===k[i]})},
  miss:function(n,t){return n+' de '+t+' paneles correctos. Los correctos quedan fijos; revisa los demás.'},
  hints:['Mira cómo pasa cada término al siguiente. Cada fila usa una regla distinta.','Una suma una cantidad fija. Otra multiplica por una razón fija. La tercera suma los dos términos anteriores.','Panel A: +5. Panel B: ×3. Panel C: 5 + 8.'],
  enter:'Ya estamos cerca de irnos! , estas son tres cerraduras, tres secuencias （⌒▽⌒）',
  ok:'La secuencia fue válida,  Sigo calculando tu tiempo erizo...',
  clue:'Sage solo se deja engañar con lógica pura.',
  next:'Cruzar a la Sala 4'
},
{
  title:'Sala 4 · Centro de mando',kind:'Candado 4 de 4 · Lógica de premisas',
  brief:'La puerta final analiza tu razonamiento antes de abrirse. Con las cuatro premisas, deduce qué salida es la correcta. Un error cuesta 0:20 y descarta esa opción.',choice:true,
  form:function(){
    var P=['Si el Núcleo se sobrecarga, entonces suena la alarma.','La alarma no sonó.','O el Núcleo se sobrecargó, o el Panel Rojo está activo.','Si el Panel Rojo está activo, entonces la salida es la Puerta 3.'];
    var O=['Puerta 1','Puerta 2','Puerta 3','No se puede determinar'];
    return '<ul class="prems">'+P.map(function(t,i){return '<li class="prem"><b>P'+(i+1)+'</b><span>'+t+'</span></li>'}).join('')+'</ul>'+
    '<p class="q">¿Qué puerta lleva a la pista de despegue?</p>'+
    '<div class="opts">'+O.map(function(t,i){return '<button type="button" class="opt" data-i="'+i+'"><b>'+String.fromCharCode(65+i)+'</b><span>'+t+'</span></button>'}).join('')+'</div>';
  },
  correct:2,
  miss:function(){return 'Esa conclusión no se deduce de las premisas.'},
  hints:['Empieza juntando las premisas 1 y 2.','Si la alarma no sonó, el Núcleo no pudo sobrecargarse. Con eso y la premisa 3, ¿qué queda activo?','El Panel Rojo está activo. Aplica la premisa 4.'],
  enter:'Es el centro de mando soni! Última puerta y nos vamos (●ゝω)ノヽ(∀＜●)',
  ok:'Premisas consistentes. Puerta final abierta. Probabilidad de fuga: no deseada.',
  clue:'La pista de despegue está del otro lado. Corre.',
  next:'Salir a la pista de despegue'
}
];

/* ---------- room flow ---------- */
function consoleHTML(i){
  var r=R[i];
  return '<div class="room-head"><h2 class="room-title">'+r.title+'</h2><p class="lock-kind">'+r.kind+'</p></div>'+
    '<p class="brief">'+r.brief+'</p>'+
    '<form id="f" novalidate autocomplete="off">'+r.form()+
    '<div class="actions">'+(r.choice?'':'<button class="btn primary" type="submit">Verificar código</button>')+'<button class="btn ghost" type="button" id="hint"></button></div></form>'+
    '<ol id="hints" class="hints"></ol><p id="fb" class="fb" role="status"></p>';
}
function updHint(i){
  var b=$('#hint');if(!b)return;
  b.textContent='Pedir pista (−0:30) · '+S.hu[i]+'/3';
  b.disabled=S.hu[i]>=3;
}
function fb(m){$('#fb').textContent=m}
function shake(){
  var p=$('#cplate');p.classList.remove('shake','bad');void p.offsetWidth;p.classList.add('shake','bad');
  setTimeout(function(){p.classList.remove('shake','bad')},650);
}
function loadRoom(i){
  var r=R[i];
  S.room=i;S.sealed=false;S.paused=false;S.last=Date.now();
  renderMap('#map',i+1,S.opened);renderBolts();
  $('#console').innerHTML=consoleHTML(i);
  updHint(i);
  wire(i);
  var first=$('#f input');if(first)first.focus({preventScroll:true});
  if(i>0)say('Tails',r.enter);
}
function wire(i){
  var r=R[i],f=$('#f'),inputs=Array.prototype.slice.call(f.querySelectorAll('input'));
  inputs.forEach(function(inp,k){
    inp.addEventListener('input',function(){
      inp.value=r.clean(inp.value);sfx.click();
      if(r.auto&&inp.value&&inputs[k+1]&&!inputs[k+1].readOnly)inputs[k+1].focus();
    });
  });
  f.addEventListener('submit',function(e){
    e.preventDefault();
    if(S.sealed||!S.run)return;
    var vals=inputs.map(function(x){return x.value.trim()});
    if(vals.some(function(v){return !v})){fb('Completa todos los campos antes de verificar.');return}
    attempt(i,inputs,r.check(vals));
  });
  Array.prototype.forEach.call(f.querySelectorAll('.opt'),function(b){
    b.addEventListener('click',function(){
      if(S.sealed||!S.run)return;
      attempt(i,[],[parseInt(b.getAttribute('data-i'),10)===r.correct],b);
    });
  });
  $('#hint').addEventListener('click',function(){hint(i)});
}
function attempt(i,inputs,res,btn){
  if(res.every(Boolean)){success(i);return}
  S.err++;penalize(ERR);
  if(!S.run)return;
  sfx.bad();shake();
  inputs.forEach(function(inp,k){if(res[k]){inp.classList.add('ok');inp.readOnly=true}});
  if(btn){btn.disabled=true}
  var n=res.filter(Boolean).length;
  fb(R[i].miss(n,res.length));
  say('Sage','Código rechazado. Penalización de 0:20.');
}
function hint(i){
  if(S.sealed||!S.run)return;
  var u=S.hu[i];if(u>=3)return;
  S.hu[i]++;S.hints++;
  penalize(HINT);
  if(!S.run)return;
  sfx.click();
  var li=document.createElement('li');li.textContent=R[i].hints[u];$('#hints').appendChild(li);
  updHint(i);
}
function success(i){
  S.sealed=true;S.paused=true;S.opened[i]=true;
  renderBolts();renderMap('#map',i+1,S.opened);
  sfx.ok();setTimeout(sfx.door,350);
  var r=R[i];
  $('#console').innerHTML='<div class="door-scene"><div class="doorway" aria-hidden="true"><div class="corridor"></div><div class="dp l"></div><div class="dp r"></div><div class="lamp"></div></div>'+
    '<div class="door-text"><h2>Candado '+(i+1)+' abierto</h2><p class="clue">'+r.clue+'</p><button id="next" class="btn primary" type="button" hidden>'+r.next+'</button></div></div>';
  requestAnimationFrame(function(){requestAnimationFrame(function(){var d=$('.doorway');if(d)d.classList.add('open')})});
  setTimeout(function(){var b=$('#next');if(b){b.hidden=false;b.focus({preventScroll:true})}},RM?0:1500);
  $('#next').onclick=function(){if(i<3)loadRoom(i+1);else win()};
  say('Sage',r.ok);
}

/* ---------- start / end ---------- */
function startGame(){
  playMusic(true);
  try{
    if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();
    if(ac.state==='suspended')ac.resume();
  }catch(e){ac=null}
  S.t=TOTAL;S.run=true;S.paused=false;S.opened=[false,false,false,false];S.err=0;S.hints=0;S.hu=[0,0,0,0];S.sec=0;S.alarm='';
  $('#log').innerHTML='';
  show('game');
  document.body.classList.add('live');
  clearInterval(S.iv);S.last=Date.now();S.iv=setInterval(tick,200);
  renderClock();loadRoom(0);
  say('Sage','Intrusión detectada en el pasillo C. Puertas selladas. Autodestrucción en 30:00.');
  setTimeout(function(){if(S.run)say('Tails',R[0].enter)},2200);
}
function stop(){S.run=false;clearInterval(S.iv);document.body.classList.remove('live','crit')}
function stat(k,v){return '<div><dt>'+k+'</dt><dd>'+v+'</dd></div>'}
function win(){
  stop();sfx.win();
  var left=S.t,rank=left>=900?'Salida limpia':(left>=300?'Salida ajustada':'Salida por segundos');
  show('end');
  $('#end-h').textContent=rank;
  $('#end-p').textContent='Sonic y Tails cruzan la última puerta, llegan a la pista y salen antes de que Sage pueda detenerlos';
  $('#stats').innerHTML=stat('Tiempo restante',fmt(left,true))+stat('Códigos incorrectos',S.err)+stat('Pistas usadas',S.hints);
  $('#again').textContent='Jugar de nuevo';
  renderMap('#map-end',5,[true,true,true,true]);
}
function lose(){
  if(!S.run)return;
  stop();sfx.lose();
  var n=S.opened.filter(Boolean).length;
  show('end');
  $('#end-h').textContent='Tiempo agotado';
  $('#end-p').textContent='Sage completó la cuenta atrás, todo exploto y te moriste ☠︎, Abriste '+n+' de 4 candados. Los códigos son los mismos si reintentas, pero tendrás que volver a calcularlos';
  $('#stats').innerHTML=stat('Candados abiertos',n+'/4')+stat('Códigos incorrectos',S.err)+stat('Pistas usadas',S.hints);
  $('#again').textContent='Reintentar';
  renderMap('#map-end',Math.min(n+1,4),S.opened);
}

$('#start').addEventListener('click',startGame);
$('#again').addEventListener('click',startGame);
$('#mute').addEventListener('click',function(){
  muted=!muted;this.textContent='Efectos: '+(muted?'no':'sí');this.setAttribute('aria-pressed',String(muted));
});
renderMap('#map-intro',0,[false,false,false,false]);
})();
