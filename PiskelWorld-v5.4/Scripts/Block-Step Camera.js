// Piskel World v3.7: single-finger touch drag pans the world; mouse drag never pans.
// A short stationary tap mines exactly once. Trackpad two-finger scrolling remains supported.
(()=>{
  const area=document.getElementById('worldScroll');
  const canvas=document.getElementById('world');
  const active=new Map();
  const DRAG_THRESHOLD=9;
  const PAN_MULTIPLIER=2.25;
  let primary=null;
  let targetX=area.scrollLeft,targetY=area.scrollTop;
  let last=performance.now();
  const clamp=(v,max)=>Math.max(0,Math.min(max,v));
  const bounds=()=>[Math.max(0,area.scrollWidth-area.clientWidth),Math.max(0,area.scrollHeight-area.clientHeight)];
  const sync=()=>{targetX=area.scrollLeft;targetY=area.scrollTop;};
  const reset=()=>{active.clear();primary=null;window.piskelCameraDragging=false;sync();};
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(e.pointerType!=='touch'&&e.pointerType!=='mouse'&&e.pointerType!=='pen')return;
    active.set(e.pointerId,{startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false});
    if(primary===null)primary=e.pointerId;
    if(active.size>1){for(const p of active.values())p.dragged=true;window.piskelCameraDragging=true;}
    try{canvas.setPointerCapture(e.pointerId)}catch(_){}
    e.preventDefault();
  },{passive:false});
  canvas.addEventListener('pointermove',e=>{
    const p=active.get(e.pointerId);if(!p)return;
    const dx=e.clientX-p.lastX,dy=e.clientY-p.lastY;
    p.lastX=e.clientX;p.lastY=e.clientY;
    if(e.pointerType==='touch'&&Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>DRAG_THRESHOLD)p.dragged=true;
    if(e.pointerId===primary&&p.dragged&&e.pointerType==='touch'){
      window.piskelCameraDragging=true;
      const [mx,my]=bounds();
      area.scrollLeft=clamp(area.scrollLeft-dx*PAN_MULTIPLIER,mx);
      area.scrollTop=clamp(area.scrollTop-dy*PAN_MULTIPLIER,my);
      sync();
    }
    e.preventDefault();
  },{passive:false});
  function release(e){
    const p=active.get(e.pointerId);if(!p)return;
    const wasPrimary=e.pointerId===primary;
    const tapped=wasPrimary&&!p.dragged&&active.size===1&&Math.hypot(e.clientX-p.startX,e.clientY-p.startY)<=DRAG_THRESHOLD&&e.type==='pointerup';
    active.delete(e.pointerId);
    if(wasPrimary){primary=active.size?[...active.keys()][0]:null;const next=active.get(primary);if(next)next.dragged=true;}
    if(!active.size){window.piskelCameraDragging=false;sync();}
    if(tapped)window.dispatchEvent(new CustomEvent('piskel-tap-mine',{detail:{x:e.clientX,y:e.clientY}}));
  }
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  window.addEventListener('blur',reset);
  window.addEventListener('piskel-columns-prepended',e=>{targetX+=e.detail.pixels;});
  // Laptop trackpad: two-finger scroll to pan in any direction; mouse wheel also scrolls.
  area.addEventListener('wheel',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    let dx=e.deltaX,dy=e.deltaY;
    if(e.shiftKey&&Math.abs(dx)<Math.abs(dy)){dx=dy;dy=0;}
    const factor=e.deltaMode===1?16:e.deltaMode===2?area.clientHeight:1;
    const [mx,my]=bounds();
    targetX=clamp(targetX+dx*factor*1.9,mx);
    targetY=clamp(targetY+dy*factor*1.9,my);
  },{capture:true,passive:false});
  function frame(now){
    const dt=Math.min(60,now-last);last=now;
    if(active.size===0){
      const [mx,my]=bounds();targetX=clamp(targetX,mx);targetY=clamp(targetY,my);
      const k=1-Math.exp(-dt*.065);
      const x=area.scrollLeft,y=area.scrollTop;
      area.scrollLeft=Math.abs(targetX-x)<.5?targetX:x+(targetX-x)*k;
      area.scrollTop=Math.abs(targetY-y)<.5?targetY:y+(targetY-y)*k;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
