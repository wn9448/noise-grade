(() => {
  'use strict';
  const canvas = document.querySelector('#stage');
  const ctx = canvas.getContext('2d');
  const intro = document.querySelector('#intro');
  const start = document.querySelector('#start');
  const demo = document.querySelector('#demo');
  const status = document.querySelector('#status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width=innerWidth,height=innerHeight,items=[],assets=[],enabled=false,revealed=false;
  let previous=null,lastShake=-Infinity,frame=0,lastTime=0,sensorSeen=false;
  const ready=Promise.all(Array.from({length:11},(_,i)=>new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);
    image.src=`shake-assets/Im${i}.png`;
  }))).then(images=>{assets=images.filter(Boolean);});
  const random=(a,b)=>a+Math.random()*(b-a);
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function bounds(p){
    // Rotated image bounds, not just the center, stay inside the viewport.
    const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle));
    return {x:(c*p.w+s*p.h)/2,y:(s*p.w+c*p.h)/2};
  }
  function resize(){
    const oldW=width,oldH=height;width=innerWidth;height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    items.forEach(p=>{
      const scale=Math.min(1,width/oldW,height/oldH);p.w*=scale;p.h*=scale;p.radius*=scale;
      p.x*=width/oldW;p.y*=height/oldH;const b=bounds(p);
      p.x=clamp(p.x,b.x+2,width-b.x-2);if(p.entered)p.y=clamp(p.y,b.y+2,height-b.y-2);
    });wake();
  }
  function wake(){if(!frame&&!document.hidden){lastTime=0;frame=requestAnimationFrame(draw);}}
  function reveal(){
    if(revealed||!assets.length)return;
    revealed=true;intro.hidden=true;
    // Exactly one set of the PDF's eleven original transparent images.
    items=assets.map((image,i)=>{
      const w=Math.min(width*.28,height*.18,155)*random(.78,1.13),h=w*image.height/image.width;
      return {image,w,h,radius:Math.min(w,h)*.40,x:random(w,width-w),y:reduced?random(h,height-h):-h-i*height*.10,
        vx:random(-45,45),vy:random(80,140),angle:random(-.25,.25),spin:random(-.8,.8),entered:reduced};
    });wake();
  }
  function shake(dx=0,dy=0){
    if(!enabled||!assets.length)return;
    if(!revealed){reveal();return;}
    // Later shakes only stir the existing objects; never append new ones.
    items.forEach(p=>{
      const strength=reduced?.28:1;
      p.vx=clamp(p.vx+(dx*17+random(-250,250))*strength,-850,850);
      p.vy=clamp(p.vy+(dy*12-random(300,600))*strength,-950,850);
      p.spin=clamp(p.spin+random(-3,3)*strength,-5,5);
    });wake();
  }
  function constrain(p){
    const b=bounds(p),left=b.x+2,right=width-b.x-2,bottom=height-b.y-2;
    if(p.x<left){p.x=left;p.vx=Math.abs(p.vx)*.5;p.spin*=.7;}
    if(p.x>right){p.x=right;p.vx=-Math.abs(p.vx)*.5;p.spin*=.7;}
    if(!p.entered&&p.y>=b.y+2)p.entered=true;
    if(p.entered&&p.y<b.y+2){p.y=b.y+2;p.vy=Math.abs(p.vy)*.4;}
    if(p.y>bottom){p.y=bottom;p.vy=-Math.abs(p.vy)*.3;p.vx*=.94;p.spin*=.90;if(Math.abs(p.vy)<20)p.vy=0;}
  }
  function step(dt){
    for(const p of items){p.vy+=900*dt;p.vx*=Math.pow(.995,dt*60);p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;p.spin*=Math.pow(.997,dt*60);constrain(p);}
    // Soft body contacts keep letters from all settling on the same point.
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
        const a=items[i],b=items[j];if(!a.entered||!b.entered)continue;
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,min=a.radius+b.radius;
        if(d>=min)continue;const nx=d===.001?1:dx/d,ny=d===.001?0:dy/d,push=(min-d)*.5;
        a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
        const speed=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(speed<0){const force=-speed*.58;a.vx-=force*nx;a.vy-=force*ny;b.vx+=force*nx;b.vy+=force*ny;a.spin*=.98;b.spin*=.98;}
      }
      items.forEach(constrain);
    }
  }
  function draw(time){
    frame=0;const elapsed=lastTime?Math.min((time-lastTime)/1000,.04):1/60;lastTime=time;
    if(revealed){const steps=Math.ceil(elapsed/.012);for(let i=0;i<steps;i++)step(elapsed/steps);}
    ctx.clearRect(0,0,width,height);
    for(const p of items){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.drawImage(p.image,-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
    if(revealed&&!document.hidden)frame=requestAnimationFrame(draw);
  }
  function onMotion(event){
    if(!enabled||document.hidden)return;
    const a=event.accelerationIncludingGravity||event.acceleration;
    if(!a||![a.x,a.y,a.z].every(Number.isFinite))return;
    sensorSeen=true;if(!revealed)status.textContent='';
    const current=[a.x,a.y,a.z],now=performance.now();
    if(previous&&now-previous.time<250){
      const delta=current.map((v,i)=>v-previous.values[i]);
      if(Math.hypot(...delta)>11&&now-lastShake>420){lastShake=now;shake(delta[0],delta[1]);}
    }
    previous={values:current,time:now};
  }
  function connect(){window.addEventListener('devicemotion',onMotion,{passive:true});setTimeout(()=>{
    if(!sensorSeen){demo.hidden=false;if(!revealed)status.textContent='흔들기가 감지되지 않으면 아래 버튼을 눌러 주세요.';}
  },6000);}
  start.addEventListener('click',async()=>{
    start.disabled=true;
    try{
      const result=await window.DeviceMotionEvent.requestPermission();
      if(result==='granted'){connect();start.hidden=true;status.textContent='';}
      else{status.textContent='동작 접근이 꺼져 있어요. 아래 버튼으로 체험해 주세요.';demo.hidden=false;start.hidden=true;}
    }catch{status.textContent='흔들기를 연결하지 못했어요. 아래 버튼으로 체험해 주세요.';demo.hidden=false;start.hidden=true;}
    start.disabled=false;
  });
  ready.then(()=>{
    if(!assets.length){status.textContent='글자를 불러오지 못했어요. 새로고침해 주세요.';return;}
    enabled=true;status.textContent='';
    const Motion=window.DeviceMotionEvent;
    if(!Motion){demo.hidden=false;}
    else if(typeof Motion.requestPermission==='function'){start.hidden=false;status.textContent='버튼을 누르고 동작 접근을 허용해 주세요.';}
    else connect();
    if(matchMedia('(pointer: fine)').matches)demo.hidden=false;
  });
  demo.addEventListener('click',()=>shake());
  document.addEventListener('visibilitychange',()=>{previous=null;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();});
  window.addEventListener('resize',resize);resize();
})();
