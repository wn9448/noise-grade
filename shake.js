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
  // Density is chosen once per page visit; shaking never changes this set.
  const densityBand=Math.floor(Math.random()*3);
  function overlaps(p,x=p.x,y=p.y,angle=p.angle){
    const box=bounds({...p,angle});
    return items.some(q=>{
      if(q===p)return false;const other=bounds(q);
      return Math.abs(x-q.x)<box.x+other.x+2-.001 && Math.abs(y-q.y)<box.y+other.y+2-.001;
    });
  }
  function pack(list,maxWidth){
    let x=4,y=4,rowHeight=0;
    for(const p of list){
      if(x+p.w>maxWidth-4){x=4;y+=rowHeight+4;rowHeight=0;}
      p.x=x+p.w/2;p.y=y+p.h/2;x+=p.w+4;rowHeight=Math.max(rowHeight,p.h);
    }
    return y+rowHeight+4;
  }
  function fit(list,targetHeight){
    let total=pack(list,width);
    while(total>targetHeight){list.forEach(p=>{p.w*=.97;p.h*=.97;});total=pack(list,width);}
    return total;
  }
  function resize(){
    width=innerWidth;height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    if(items.length){
      items.forEach(p=>{p.angle=0;p.w=Math.min(p.w,width*.42);p.h=p.w*p.image.height/p.image.width;});
      const total=fit(items,height-12);
      items.forEach(p=>{p.y+=height-total-4;p.entered=true;p.vx=0;p.vy=0;p.spin=0;});
    }
    wake();
  }
  function wake(){if(!frame&&!document.hidden){lastTime=0;frame=requestAnimationFrame(draw);}}
  function reveal(){
    if(revealed||!assets.length)return;
    revealed=true;intro.hidden=true;
    const ranges=[[5,9],[13,21],[28,40]], range=ranges[densityBand];
    const count=Math.floor(random(range[0],range[1]+1));
    const fill=[random(.24,.36),random(.50,.65),random(.86,.96)][densityBand];
    // Alternating large and small artwork makes the size contrast unmistakable.
    items=Array.from({length:count},(_,i)=>{
      const image=assets[Math.floor(random(0,assets.length))];
      const factor=i%3===0?random(1.25,1.6):i%3===1?random(.45,.65):random(.8,1.05);
      const w=Math.min(width*.30,150)*factor;
      return {image,w,h:w*image.height/image.width,x:0,y:0,vx:0,vy:0,angle:0,spin:0,entered:false};
    });
    // A shelf layout guarantees the randomly chosen set can fit in this frame.
    items.sort((a,b)=>b.h-a.h);
    const natural=pack(items,width),grow=Math.min(1.7,Math.sqrt(height*fill/natural));
    items.forEach(p=>{p.w=Math.min(width*.43,p.w*grow);p.h=p.w*p.image.height/p.image.width;});
    const total=fit(items,height*fill);
    items.forEach(p=>{p.y+=reduced?height-total-4:-total-20;p.entered=reduced;});
    wake();
  }
  function shake(dx=0,dy=0){
    if(!enabled||!assets.length)return;
    if(!revealed){reveal();return;}
    if(items.some(p=>!p.entered))return;
    items.forEach(p=>{
      const strength=reduced?.28:1;
      p.vx=clamp(p.vx+(dx*17+random(-250,250))*strength,-850,850);
      p.vy=clamp(p.vy+(dy*12-random(300,600))*strength,-950,850);
      p.spin=clamp(p.spin+random(-3,3)*strength,-5,5);
    });wake();
  }
  function moveAxis(p,axis,delta){
    if(!delta)return;
    const b=bounds(p),horizontal=axis==='x',extent=horizontal?b.x:b.y;
    let next=p[axis]+delta,contact=null;
    const limit=horizontal?width:height;
    if(horizontal||p.entered)next=Math.max(extent+2,next);
    next=Math.min(limit-extent-2,next);
    // Sweep full sprite bounds, including transparent margins. This is stricter
    // than silhouette collision and guarantees no visible lettering overlaps.
    for(const q of items){
      if(q===p)continue;const qb=bounds(q);
      const cross=horizontal?'y':'x',crossExtent=horizontal?b.y:b.x,qCross=horizontal?qb.y:qb.x;
      if(Math.abs(p[cross]-q[cross])>=crossExtent+qCross+2-.001)continue;
      const otherExtent=horizontal?qb.x:qb.y;
      if(delta>0 && q[axis]>=p[axis]){
        const stop=q[axis]-otherExtent-extent-2;
        if(next>stop){next=Math.max(p[axis],stop);contact=q;}
      }else if(delta<0 && q[axis]<=p[axis]){
        const stop=q[axis]+otherExtent+extent+2;
        if(next<stop){next=Math.min(p[axis],stop);contact=q;}
      }
    }
    const hit=Math.abs(next-(p[axis]+delta))>.001;
    p[axis]=next;
    if(hit){const velocity=horizontal?'vx':'vy';if(contact)contact[velocity]+=p[velocity]*.12;
      p[velocity]*=-.18;if(Math.abs(p[velocity])<25)p[velocity]=0;p.spin*=.8;}
  }
  function step(dt){
    const landed=items.every(p=>p.entered);
    // Bottom bodies move first so an entire stack can settle together.
    const ordered=[...items].sort((a,b)=>b.y-a.y);
    for(const p of ordered){
      p.vy=clamp(p.vy+900*dt,-950,950);p.vx*=Math.pow(.99,dt*60);
      moveAxis(p,'x',p.vx*dt);moveAxis(p,'y',p.vy*dt);
      const b=bounds(p);if(!p.entered&&p.y>=b.y+2)p.entered=true;
      if(landed&&p.spin){
        const angle=p.angle+p.spin*dt,box=bounds({...p,angle});
        if(p.x-box.x>=2&&p.x+box.x<=width-2&&p.y-box.y>=2&&p.y+box.y<=height-2&&!overlaps(p,p.x,p.y,angle))p.angle=angle;
        else p.spin*=-.35;
        p.spin*=Math.pow(.995,dt*60);
      }
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
