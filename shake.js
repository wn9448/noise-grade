(() => {
  'use strict';
  const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d');
  const intro=document.querySelector('#intro'),start=document.querySelector('#start'),demo=document.querySelector('#demo'),status=document.querySelector('#status');
  if(!window.Matter||!window.NOISE_SHAPES){status.textContent='화면을 불러오지 못했어요. 새로고침해 주세요.';return;}
  const {Engine,Bodies,Body,Composite,Vertices}=Matter;
  const engine=Engine.create({positionIterations:10,velocityIterations:8,enableSleeping:false});
  engine.gravity.scale=.00036;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const random=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sparse=Math.random()<.15;
  let width=innerWidth,height=innerHeight,items=[],assets=[],walls=[],revealed=false,enabled=false;
  let frame=0,lastTime=0,accumulator=0,previous=null,motionSeen=false,tiltSeen=false,connected=false;
  let targetGravity={x:0,y:1},gravity={x:0,y:1},inertia={x:0,y:0},lastMotion=-Infinity,filter=null;
  let demoUntil=0,demoCount=0,lastKick=-Infinity;
  const ready=Promise.all(Array.from({length:11},(_,id)=>new Promise(resolve=>{
    const image=new Image();image.onload=()=>resolve({image,id});image.onerror=()=>resolve(null);image.src=`shake-assets/Im${id}.png`;
  }))).then(images=>{assets=images.filter(Boolean);});
  function screenVector(x,y){
    const angle=((window.screen?.orientation?.angle ?? window.orientation ?? 0)*Math.PI)/180;
    return {x:x*Math.cos(angle)+y*Math.sin(angle),y:-x*Math.sin(angle)+y*Math.cos(angle)};
  }
  function setWalls(){
    for(const wall of walls)Composite.remove(engine.world,wall);
    const side={isStatic:true,friction:.16,restitution:.12,collisionFilter:{category:1,mask:0xFFFFFFFF,group:0}};
    walls=[Bodies.rectangle(-50,height/2-3000,100,height+6200,side),Bodies.rectangle(width+50,height/2-3000,100,height+6200,side),Bodies.rectangle(width/2,height+50,width+200,100,side),Bodies.rectangle(width/2,-50,width+200,100,{...side,collisionFilter:{category:2,mask:0xFFFFFFFF,group:0}})];
    Composite.add(engine.world,walls);
  }
  function resize(){
    const oldW=width,oldH=height;width=innerWidth;height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    if(items.length){
      // Uniformly scale the whole arrangement so resizing cannot squeeze bodies together.
      const scale=Math.min(width/oldW,height/oldH);
      for(const p of items){const position={x:p.body.position.x*scale+(width-oldW*scale)/2,y:p.body.position.y*scale+(height-oldH*scale)/2};Body.scale(p.body,scale,scale);Body.setPosition(p.body,position);p.w*=scale;p.h*=scale;p.offset.x*=scale;p.offset.y*=scale;}
    }
    setWalls();wake();
  }
  function pack(list){
    let x=6,y=6,row=0;
    for(const p of list){if(x+p.w>width-6){x=6;y+=row+7;row=0;}p.x=x+p.w/2;p.y=y+p.h/2;x+=p.w+7;row=Math.max(row,p.h);}
    return y+row+6;
  }
  function createBody(p){
    const options={friction:.19,frictionStatic:.26,frictionAir:.006,restitution:.12,density:.0015,slop:.035};
    const parts=window.NOISE_SHAPES[p.id].map(shape=>{
      const vertices=shape.map(([x,y])=>({x:x*p.w,y:y*p.h}));
      const center=Vertices.centre(vertices);
      return Bodies.fromVertices(center.x,center.y,[vertices],options,false,0,0,0);
    });
    const body=Body.create({...options,parts,collisionFilter:{category:1,mask:1,group:0}});
    p.offset={x:-body.position.x,y:-body.position.y};
    Body.setPosition(body,{x:p.x,y:p.y});
    Body.setVelocity(body,{x:random(-.25,.25),y:random(.4,1.2)});
    Body.setAngularVelocity(body,random(-.007,.007));
    p.body=body;p.entered=false;return body;
  }
  function reveal(){
    if(revealed||!enabled||!assets.length)return;
    revealed=true;intro.hidden=true;
    const count=Math.floor(sparse?random(5,9):random(25,39));
    items=Array.from({length:count},(_,i)=>{
      const asset=assets[Math.floor(random(0,assets.length))];
      const factor=i%3===0?random(1.25,1.6):i%3===1?random(.45,.65):random(.8,1.05);
      const w=Math.min(width*.30,150)*factor;return {...asset,w,h:w*asset.image.height/asset.image.width};
    });
    // Reproduce the former size baseline, then double its largest glyph.
    let total=pack(items),fill=sparse?.32:.92;
    const grow=Math.min(1.7,Math.sqrt(height*fill/total));
    items.forEach(p=>{p.w=Math.min(width*.43,p.w*grow);p.h=p.w*p.image.height/p.image.width;});
    total=pack(items);while(total>height*fill){items.forEach(p=>{p.w*=.97;p.h*=.97;});total=pack(items);}
    const largest=items.reduce((a,b)=>a.w>b.w?a:b);
    largest.w=Math.min(largest.w*2,width*.80,height*.62);
    largest.h=largest.w*largest.image.height/largest.image.width;
    function silhouetteArea(p){
      return window.NOISE_SHAPES[p.id].reduce((sum,polygon)=>sum+Math.abs(polygon.reduce((area,v,i)=>{
        const next=polygon[(i+1)%polygon.length];return area+v[0]*next[1]-next[0]*v[1];
      },0))/2,0)*p.w*p.h;
    }
    if(!sparse){
      // Budget actual solid glyph area, rather than transparent rectangular
      // shelves: normal visits form a tall, full pile after settling.
      const target=width*height*random(.51,.56),remaining=items.filter(p=>p!==largest);
      const scale=Math.sqrt(Math.max(1,target-silhouetteArea(largest))/remaining.reduce((n,p)=>n+silhouetteArea(p),0));
      remaining.forEach(p=>{p.w=Math.min(p.w*scale,largest.w*.79,width*.44);p.h=p.w*p.image.height/p.image.width;});
    }
    total=pack(items);
    items.forEach(p=>{p.y-=total+20;});
    Composite.add(engine.world,items.map(createBody));wake();
  }
  function keepInside(p){
    const b=p.body;
    if(!p.entered&&b.bounds.min.y>=1){p.entered=true;b.collisionFilter.mask=3;}
    // Safety guard against rare high-speed wall tunneling. Ordinary wall contact
    // is resolved by the physics engine, using the glyph's actual silhouette.
    let dx=0,dy=0;
    if(b.bounds.min.x<-.5)dx=-b.bounds.min.x;else if(b.bounds.max.x>width+.5)dx=width-b.bounds.max.x;
    if(b.bounds.max.y>height+.5)dy=height-b.bounds.max.y;
    if(p.entered&&b.bounds.min.y<-.5)dy=-b.bounds.min.y;
    if(dx||dy){Body.translate(b,{x:dx,y:dy});Body.setVelocity(b,{x:dx?-b.velocity.x*.12:b.velocity.x,y:dy?-b.velocity.y*.12:b.velocity.y});}
  }
  function step(ms,now=performance.now()){
    const dropping=items.some(p=>!p.entered);
    const target=dropping?{x:0,y:1}:targetGravity;
    const blend=1-Math.exp(-ms/110);
    gravity.x+=(target.x-gravity.x)*blend;gravity.y+=(target.y-gravity.y)*blend;
    engine.gravity.x=gravity.x;engine.gravity.y=gravity.y;
    if(now>demoUntil&&demoUntil){demoUntil=0;targetGravity={x:0,y:1};}
    if(now-lastMotion>110){inertia.x*=.82;inertia.y*=.82;}
    for(const p of items){
      if(p.entered){const strength=reduced?.35:1;Body.applyForce(p.body,p.body.position,{x:p.body.mass*inertia.x*.00032*strength,y:p.body.mass*inertia.y*.00032*strength});}
      const speed=Math.hypot(p.body.velocity.x,p.body.velocity.y);
      if(speed>25)Body.setVelocity(p.body,{x:p.body.velocity.x*25/speed,y:p.body.velocity.y*25/speed});
    }
    Engine.update(engine,ms);items.forEach(keepInside);
  }
  function draw(time){
    frame=0;const elapsed=lastTime?Math.min(time-lastTime,50):16.667;lastTime=time;
    if(revealed){accumulator+=elapsed;while(accumulator>=8.333){step(8.333,time);accumulator-=8.333;}}
    ctx.clearRect(0,0,width,height);
    for(const p of items){ctx.save();ctx.translate(p.body.position.x,p.body.position.y);ctx.rotate(p.body.angle);ctx.drawImage(p.image,p.offset.x,p.offset.y,p.w,p.h);ctx.restore();}
    if(revealed&&!document.hidden)frame=requestAnimationFrame(draw);
  }
  function wake(){if(!frame&&!document.hidden){lastTime=0;accumulator=0;frame=requestAnimationFrame(draw);}}
  function onOrientation(e){
    if(document.hidden||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
    tiltSeen=true;const beta=e.beta*Math.PI/180,gamma=e.gamma*Math.PI/180;
    // Project world gravity onto the screen, including landscape orientation.
    targetGravity=screenVector(Math.sin(gamma)*Math.cos(beta),Math.sin(beta));
  }
  function onMotion(e){
    if(!enabled||document.hidden)return;
    const a=e.accelerationIncludingGravity;
    if(!a||![a.x,a.y,a.z].every(Number.isFinite))return;
    motionSeen=true;if(!revealed)status.textContent='';
    const now=performance.now(),current=[a.x,a.y,a.z];
    if(previous&&now-previous.time<250&&Math.hypot(...current.map((v,i)=>v-previous.values[i]))>8&&!revealed)reveal();
    previous={values:current,time:now};
    filter=filter?filter.map((v,i)=>v*.92+current[i]*.08):current.slice();
    const linear=e.acceleration;
    const highpass=[a.x-filter[0],a.y-filter[1]];
    const validLinear=linear&&[linear.x,linear.y].every(Number.isFinite);
    // Some phones report zero linear acceleration despite changing raw data.
    const values=validLinear&&(Math.hypot(linear.x,linear.y)>.2||Math.hypot(...highpass)<2)?[linear.x,linear.y]:highpass;
    // Inertial force opposes the phone's acceleration; no automatic upward kick.
    const force=screenVector(-values[0],values[1]);
    inertia.x=inertia.x*.2+clamp(force.x,-24,24)*.8;inertia.y=inertia.y*.2+clamp(force.y,-24,24)*.8;
    // Preserve a short directional kick even when opposite sensor samples
    // arrive between rendering frames. Never inject an artificial upward force.
    if(revealed&&Math.hypot(force.x,force.y)>3&&now-lastKick>90){
      lastKick=now;const gain=reduced?.22:.8;
      for(const p of items){if(!p.entered)continue;
        Body.setVelocity(p.body,{x:clamp(p.body.velocity.x+clamp(force.x,-14,14)*gain,-25,25),y:clamp(p.body.velocity.y+clamp(force.y,-14,14)*gain,-25,25)});
      }
    }
    if(!tiltSeen)targetGravity=screenVector(-filter[0]/9.81,filter[1]/9.81);
    lastMotion=now;
  }
  function connect(motion=true,orientation=true){
    if(connected)return;connected=true;
    if(motion)window.addEventListener('devicemotion',onMotion,{passive:true});
    if(orientation)window.addEventListener('deviceorientation',onOrientation,{passive:true});
    setTimeout(()=>{if(!motionSeen){demo.hidden=false;if(!revealed)status.textContent='흔들기가 감지되지 않으면 아래 버튼을 눌러 주세요.';}},6000);
  }
  function permission(Type){return typeof Type?.requestPermission==='function'?Type.requestPermission():Promise.resolve(Type?'granted':'unavailable');}
  start.addEventListener('click',async()=>{
    start.disabled=true;
    try{
      // Both requests begin inside the tap gesture, as required on iOS.
      const results=await Promise.allSettled([permission(window.DeviceMotionEvent),permission(window.DeviceOrientationEvent)]);
      const allowed=results.map(r=>r.status==='fulfilled'&&r.value==='granted');
      connect(...allowed);start.hidden=true;status.textContent=allowed[0]?'':'동작 접근이 꺼져 있어요. 아래 버튼으로 체험해 주세요.';
      if(!allowed[0])demo.hidden=false;
    }catch{start.hidden=true;demo.hidden=false;status.textContent='아래 버튼으로 체험해 주세요.';}
    start.disabled=false;
  });
  ready.then(()=>{
    if(!assets.length){status.textContent='글자를 불러오지 못했어요. 새로고침해 주세요.';return;}
    enabled=true;status.textContent='';
    if(typeof window.DeviceMotionEvent?.requestPermission==='function'||typeof window.DeviceOrientationEvent?.requestPermission==='function'){
      start.hidden=false;status.textContent='';
    }else connect(!!window.DeviceMotionEvent,!!window.DeviceOrientationEvent);
    if(!window.DeviceMotionEvent||matchMedia('(pointer: fine)').matches)demo.hidden=false;
  });
  demo.addEventListener('click',()=>{
    if(!revealed){reveal();return;}
    demoCount++;targetGravity={x:demoCount%2?.85:-.85,y:.4};demoUntil=performance.now()+1600;
  });
  document.addEventListener('visibilitychange',()=>{previous=null;filter=null;inertia={x:0,y:0};if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();});
  window.addEventListener('resize',resize);resize();
})();
