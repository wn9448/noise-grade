(() => {
  'use strict';
  const canvas = document.querySelector('#stage');
  const ctx = canvas.getContext('2d');
  const start = document.querySelector('#start');
  const status = document.querySelector('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0, height = 0, items = [], assets = [], active = false;
  let previous = null, lastShake = -Infinity, frame = 0, lastTime = 0, count = 0, sensorSeen = false;
  const ready = Promise.all(Array.from({length:11}, (_,i) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `shake-assets/Im${i}.png`;
  }))).then(images => { assets = images.filter(Boolean); });

  function resize() {
    const oldWidth = width || innerWidth;
    width = innerWidth; height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    items.forEach(p => { p.x = Math.min(width - p.size/2, Math.max(p.size/2,p.x*width/oldWidth)); p.y = Math.min(p.y,height-65-p.size/2); });
    wake();
  }
  function wake() { if (!frame) { lastTime = 0; frame = requestAnimationFrame(draw); } }
  function burst() {
    if (!active || !assets.length) return;
    count++;
    status.textContent = '움직임이 소음이 되어 쌓입니다.';
    const amount = reduced ? 1 : 3;
    for (let i=0; i<amount; i++) {
      const size = Math.min(width * .34, 175) * (.7 + Math.random()*.45);
      items.push({image:assets[(count*3+i-3)%assets.length],size,
        x:width*(.3+Math.random()*.4), y:reduced ? height-75-size/2 : height*.55,
        vx:(Math.random()-.5)*320,vy:-330-Math.random()*200,
        angle:(Math.random()-.5)*.65,spin:(Math.random()-.5)*2,settled:reduced});
    }
    items = items.slice(-24); wake();
  }
  function draw(time) {
    frame=0;
    const dt = lastTime ? Math.min((time-lastTime)/1000,.033) : 1/60; lastTime=time;
    ctx.clearRect(0,0,width,height);
    let moving=false;
    for (const p of items) {
      if (!p.settled) {
        p.vy+=950*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;
        const edge=p.size*.48, floor=height-65-p.size*.45;
        if(p.x<edge){p.x=edge;p.vx=Math.abs(p.vx)*.6;}
        if(p.x>width-edge){p.x=width-edge;p.vx=-Math.abs(p.vx)*.6;}
        if(p.y>=floor){p.y=floor;p.vy=-Math.abs(p.vy)*.33;p.vx*=.65;p.spin*=.5;if(Math.abs(p.vy)<40){p.settled=true;}}
        moving ||= !p.settled;
      }
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.drawImage(p.image,-p.size/2,-p.size/2,p.size,p.size);ctx.restore();
    }
    if(moving) frame=requestAnimationFrame(draw);
  }
  function onMotion(event) {
    if(!active || document.hidden) return;
    const a=event.accelerationIncludingGravity || event.acceleration;
    if(!a || ![a.x,a.y,a.z].every(Number.isFinite)) return;
    sensorSeen=true;
    const current=[a.x,a.y,a.z], now=performance.now();
    if(previous && now-previous.time<250){
      const change=Math.hypot(...current.map((v,i)=>v-previous.values[i]));
      if(change>13 && now-lastShake>650){lastShake=now;burst();}
    }
    previous={values:current,time:now};
  }
  start.addEventListener('click', async () => {
    start.disabled=true;
    let allowed=false, message='휴대폰을 가볍게 흔들어 보세요.';
    try {
      const Motion=window.DeviceMotionEvent;
      if(!Motion) message='이 환경에서는 아래 버튼으로 체험해 주세요.';
      else if(typeof Motion.requestPermission === 'function') {
        allowed=(await Motion.requestPermission())==='granted';
        if(!allowed) message='동작 접근이 꺼져 있어요. 버튼으로 체험할 수 있습니다.';
      } else allowed=true;
    } catch {message='흔들기를 연결하지 못했어요. 버튼으로 체험해 주세요.';}
    await ready;
    if(!assets.length){start.disabled=false;status.textContent='';start.textContent='새로고침 후 다시 시도해 주세요';return;}
    active=true;document.querySelector('#intro').hidden=true;
    document.querySelector('#controls').hidden=false;document.querySelector('#reset').hidden=false;
    status.textContent=message;
    if(allowed){window.addEventListener('devicemotion',onMotion,{passive:true});setTimeout(()=>{if(!sensorSeen && count===0)status.textContent='흔들기가 감지되지 않으면 아래 버튼을 눌러 주세요.';},7000);}
  });
  document.querySelector('#demo').addEventListener('click',burst);
  document.querySelector('#reset').addEventListener('click',()=>{items=[];count=0;previous=null;status.textContent='다시 흔들거나 버튼을 눌러 보세요.';wake();});
  document.addEventListener('visibilitychange',()=>{previous=null;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();});
  window.addEventListener('resize',resize);resize();
})();
