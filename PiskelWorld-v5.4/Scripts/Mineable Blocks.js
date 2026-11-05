// Piskel World — Mineable Blocks
// Auto-clicker protection: process at most one successful mine per 65 ms.
// A block is mineable only if any of its eight neighbours is air (or the sky above the world).
const MINING_INTERVAL_MS = 65;
function touchesAir(row, col) {
  // All eight neighbours count, including the four diagonal corners.
  // The sky above the fixed world top is also empty space.
  if (row === WORLD_TOP_ROW) return true;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r < WORLD_TOP_ROW) return true;
      if (r >= ROWS || c < 0 || c >= COLUMNS) continue;
      if (blocks[r][c] === null) return true;
    }
  }
  return false;
}
let lastSuccessfulMine = -Infinity;
function mineAtPosition(clientX,clientY) {
  const now=performance.now();
  if(now-lastSuccessfulMine<MINING_INTERVAL_MS)return;
  const rect=canvas.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0)return;
  const x=(clientX-rect.left)*canvas.width/rect.width;
  const y=(clientY-rect.top)*canvas.height/rect.height+
    WORLD_TOP_ROW*layout.tile+scrollArea.scrollTop*layout.scale;
  const col=Math.floor((x-layout.left+scrollArea.scrollLeft*layout.scale)/layout.tile);
  const row=Math.floor((y-layout.top)/layout.tile);
  if(row<0||row>=ROWS||col<0||col>=COLUMNS)return;
  const type=blocks[row][col];
  if(!type||!touchesAir(row,col)||lightDistance[row][col]>=9)return;
  lastSuccessfulMine=now;
  blocks[row][col]=null;
  revealAir(row,col);
  requestDraw();
  playBlockSound(type);
  if(type==='tnt')explodeTNT(row,col);
}
// Mining is tap-only. A press that becomes a drag never mines.
// The camera handler emits this event only for a completed stationary tap.
window.addEventListener('piskel-tap-mine', event => {
  const {x,y}=event.detail;
  mineAtPosition(x,y);
});

// TNT shockwave: Manhattan distance 1 immediately, then 2 and 3 at
// 125ms intervals. Corner-only cells are excluded from each wave.
// Explosions can break dark/buried blocks and trigger neighbouring TNT.
// The queue and active-wave cap prevent autoclicker-triggered timer floods.
const activeExplosions = new Set();
const MAX_EXPLOSIONS = 12;
function explodeTNT(row,col) {
  const id=row*COLUMNS+col;
  if(activeExplosions.has(id)||activeExplosions.size>=MAX_EXPLOSIONS)return;
  activeExplosions.add(id);
  let wave=1;
  const advance=()=>{
    const nextTNT=[];
    let destroyedOrdinary = 0;
    for(let dr=-wave;dr<=wave;dr++){
      const dc=wave-Math.abs(dr);
      const offsets=dc===0?[[dr,0]]:[[dr,dc],[dr,-dc]];
      for(const [rr,cc] of offsets){
        const r=row+rr,c=col+cc;
        if(r<0||r>=ROWS||c<0||c>=COLUMNS)continue;
        const type=blocks[r][c];
        if(!type)continue;
        blocks[r][c]=null;
        revealAir(r,c);
        if(type==='tnt')nextTNT.push([r,c]);
        else destroyedOrdinary++;
      }
    }
    requestDraw();
    // Every wave has a distinct block-breaking sound, with up to three
    // overlapping samples rather than one per tile (prevents audio lag).
    // The first sample fires immediately; the others are lightly staggered.
    const samples=Math.min(3,destroyedOrdinary);
    for(let i=0;i<samples;i++){
      if(i===0)playBlockSound('stone');
      else setTimeout(()=>playBlockSound('stone'),i*22);
    }
    for(const [r,c] of nextTNT){
      playBlockSound('tnt');
      explodeTNT(r,c);
    }
    if(wave<3){wave++;setTimeout(advance,125);}
    else activeExplosions.delete(id);
  };
  advance();
}
