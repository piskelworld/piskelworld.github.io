// Background music: 2-second fade-in and fade-out, looping indefinitely.
// Safari and mobile browsers require a user gesture before audio playback.
(()=>{
  const audio=new Audio('Sounds/Background%20Music/Early%20Morning.mp3');
  audio.preload='auto';
  audio.load();
  audio.loop=false;
  audio.volume=0;
  const fade=2;
  const volume=0.32;
  let started=false, frame=0;
  function tick(){
    if(audio.paused){frame=0;return;}
    const t=audio.currentTime||0;
    const remaining=Number.isFinite(audio.duration)?Math.max(0,audio.duration-t):fade;
    audio.volume=volume*Math.max(0,Math.min(1,t/fade,remaining/fade));
    frame=requestAnimationFrame(tick);
  }
  function start(){
    if(started)return;
    const promise=audio.play();
    if(promise&&promise.then)promise.then(()=>{
      started=true;
      document.removeEventListener('pointerdown',start);
      document.removeEventListener('keydown',start);
      cancelAnimationFrame(frame);tick();
    }).catch(()=>{});
  }
  audio.addEventListener('ended',()=>{
    audio.currentTime=0;
    audio.play().then(()=>{cancelAnimationFrame(frame);tick();}).catch(()=>{started=false;});
  });
  // Try immediately; browsers that allow autoplay will start on load.
  start();
  document.addEventListener('pointerdown',start);
  document.addEventListener('keydown',start);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){audio.pause();cancelAnimationFrame(frame);}
    else if(started){audio.play().then(()=>{cancelAnimationFrame(frame);tick();}).catch(()=>{});}
  });
})();
