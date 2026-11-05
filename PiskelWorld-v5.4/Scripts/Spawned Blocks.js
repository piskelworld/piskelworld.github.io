// Piskel World — Spawned Blocks
// 25 columns; first 100 rows generated at load, then infinite underground chunks.
// Underground: 1 grass row, 4-6 dirt rows, then stone.
// Combined coal/bronze ore coverage increases from 12% to 30% with depth.
const BLOCK_SIZE = 320;
let COLUMNS = 225; // Expands in 100-column chunks in either direction
let ROWS = 100; // Initial depth; expands in chunks as the player descends
const BASE_SURFACE = 35; // Spawn grass is elevation 0; higher terrain has smaller row values.
const SPAWN_COLUMN = 100;
const MIN_SURFACE = BASE_SURFACE - 25;
const MAX_SURFACE = BASE_SURFACE + 15;
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
// Each biome is 25–40 blocks wide, including across generated chunk boundaries.
const biomeAt = [];
const biomeKinds = ['normal','autumn','snowy'];
let biomeStart=0, lastBiome='';
while(biomeStart<COLUMNS){
  const choices=biomeKinds.filter(kind=>kind!==lastBiome);
  const kind=choices[randInt(0,choices.length-1)];
  const end=Math.min(COLUMNS,biomeStart+randInt(25,40));
  for(let c=biomeStart;c<end;c++)biomeAt[c]=kind;
  lastBiome=kind;biomeStart=end;
}
const blocks = Array.from({length: ROWS}, () => Array(COLUMNS).fill(null));
// Neighbouring surface columns can change by only one block at a time.
const surface = Array(COLUMNS).fill(BASE_SURFACE);
// Start at the spawn column (elevation zero), and extend in both directions.
// Every adjacent column rises or falls by exactly one block; never a flat step.
// Direction persists for a few columns, creating rounded slopes rather than noise.
// Gentle rolling slopes: small steps, brief level sections, rare larger hills.
// Bounds are relative to the spawn surface and prevent runaway elevation.
function makeTerrainStepper(initial, previousDirection=1) {
  let height=initial;
  let direction=previousDirection;
  let target=BASE_SURFACE;
  let untilTarget=0;
  let slopeSteps=0;
  let flatSteps=0;
  return function step(){
    if(untilTarget<=0 || Math.abs(height-target)<=1){
      const large=Math.random()<0.07;
      target=BASE_SURFACE+randInt(large?-11:-6,large?11:6);
      untilTarget=randInt(9,24);
    }
    const desired=target<height?-1:target>height?1:direction;
    // Limit consecutive rises/falls so hills cannot become long 45-degree ramps.
    // Use occasional 1-2 block terraces, and short changes of direction.
    let move=0;
    if(slopeSteps>=3){
      move=0;
    }else if(flatSteps>=2){
      move=desired;
    }else if(Math.random()<0.46){
      move=0;
    }else{
      move=desired;
      if(Math.random()<0.10)move=-desired;
    }
    if(height<=BASE_SURFACE-12)move=Math.max(0,move);
    if(height>=BASE_SURFACE+12)move=Math.min(0,move);
    height=Math.max(BASE_SURFACE-12,Math.min(BASE_SURFACE+12,height+move));
    if(move===0){flatSteps++;slopeSteps=0;}
    else {slopeSteps=move===direction?slopeSteps+1:1;flatSteps=0;direction=move;}
    untilTarget--;
    return height;
  };
}
surface[SPAWN_COLUMN]=BASE_SURFACE;
const rightTerrain=makeTerrainStepper(BASE_SURFACE,1);
const leftTerrain=makeTerrainStepper(BASE_SURFACE,-1);
for(let col=SPAWN_COLUMN+1;col<COLUMNS;col++)surface[col]=rightTerrain();
for(let col=SPAWN_COLUMN-1;col>=0;col--)surface[col]=leftTerrain();
// Keep the dirt/stone boundary irregular too, without random isolated dirt holes.
const dirtDepth = Array(COLUMNS).fill(5);
dirtDepth[0] = randInt(4, 6);
for (let col = 1; col < COLUMNS; col++) {
  dirtDepth[col] = Math.max(4, Math.min(6, dirtDepth[col - 1] + randInt(-1, 1)));
}
for (let col = 0; col < COLUMNS; col++) {
  for (let row = surface[col]; row < ROWS; row++) {
    blocks[row][col] = row === surface[col] ? (biomeAt[col]==='autumn'?'autumnGrass':biomeAt[col]==='snowy'?'snowyGrass':'grass') :
      row <= surface[col] + dirtDepth[col] ? 'dirt' : 'stone';
  }
}
// Scattered organic dirt pockets within underground stone.
// Restrict replacements to stone so caves, ores and surface layers remain intact.
function addDirtPatches(get,set,minRow,maxRow,minCol,maxCol,attempts){
  if(maxRow-minRow<6||maxCol-minCol<4)return;
  for(let i=0;i<attempts;i++){
    let r=randInt(minRow+2,maxRow-2),c=randInt(minCol+2,maxCol-2);
    const steps=randInt(12,24);
    for(let j=0;j<steps;j++){
      const radius=Math.random()<0.42?2:1;
      for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){
        const rr=r+dr,cc=c+dc;
        if(rr>=minRow&&rr<maxRow&&cc>=minCol&&cc<maxCol&&dr*dr+dc*dc<=radius*radius&&get(rr,cc)==='stone')set(rr,cc,'dirt');
      }
      r=Math.max(minRow+2,Math.min(maxRow-3,r+randInt(-1,1)));
      c=Math.max(minCol+2,Math.min(maxCol-3,c+randInt(-1,1)));
    }
  }
}
function placeAutumnPatches(width,biomeAtColumn,surfaceAtColumn,get,set){
  for(let c=2;c<width-2;){
    if(biomeAtColumn(c)!=='autumn'||Math.random()>=0.055){c++;continue;}
    const type=Math.random()<0.5?'pumpkin':'haybale';
    const length=randInt(2,4);
    for(let k=0;k<length&&c+k<width-1;k++){
      const x=c+k,r=surfaceAtColumn(x)-1;
      if(biomeAtColumn(x)==='autumn'&&r>=1&&get(r,x)===null&&get(r-1,x)===null)set(r,x,type);
    }
    c+=length+randInt(2,5);
  }
}
// Natural surface cave entrances: preferentially cut into modest hills.
// Occasional flat-ground openings are rare. Entrances descend into winding,
// widening tunnels with a chance of a side branch. Each is generated once.
// Rare surface cave entrances: spaced 125–150 horizontal columns apart.
// They descend with a curved path and connect to an underground side tunnel.
function carveEntrance(width,x,surfaceAt,get,set,bottom){
  const grass=new Set(['grass','autumnGrass','snowyGrass']);
  const sy=surfaceAt(x);
  if(!grass.has(get(sy,x))||sy+30>=bottom)return false;
  // Prefer to enter from the side of a hill, not drill a vertical hole.
  const leftHeight=surfaceAt(Math.max(2,x-8));
  const rightHeight=surfaceAt(Math.min(width-3,x+8));
  const dir=leftHeight<rightHeight?-1:rightHeight<leftHeight?1:(Math.random()<.5?-1:1);
  let cx=x,cy=sy+0.8;
  function carveDisk(px,py,rx,ry,allowSurface=false){
    for(let xx=Math.max(2,Math.floor(px-rx-1));xx<=Math.min(width-3,Math.ceil(px+rx+1));xx++){
      for(let yy=Math.max(0,Math.floor(py-ry-1));yy<=Math.min(bottom-3,Math.ceil(py+ry+1));yy++){
        if(!allowSurface && yy<=surfaceAt(xx))continue;
        if(allowSurface && yy<surfaceAt(xx)-1)continue;
        const dx=(xx-px)/rx,dy=(yy-py)/ry;
        if(dx*dx+dy*dy<=1.0)set(yy,xx,null);
      }
    }
  }
  // One-to-two-block mouth, then travel mostly sideways through the hill.
  carveDisk(cx,cy,0.75,1.12,true);
  let heading=dir===1?0:Math.PI;
  let vertical=0.20;
  let targetVertical=0.2;
  const length=randInt(45,66);
  for(let step=0;step<length;step++){
    if(step%randInt(9,14)===0 && step>8){
      // Long, gradual sweeps: sideways first, occasionally climb or descend.
      targetVertical=(Math.random()-.5)*0.68;
    }
    vertical+=(targetVertical-vertical)*0.07;
    const slope=step<10?0.28:vertical;
    cx+=dir*0.85;
    cy+=slope*0.65;
    if(cx<5||cx>width-6||cy>bottom-8)break;
    // Keep roof buried under terrain, except for the entrance.
    cy=Math.max(cy,surfaceAt(Math.round(cx))+2.5);
    const widthRadius=step<5?0.86:step<13?1.25:1.65;
    carveDisk(cx,cy,widthRadius,step<5?1.05:1.5);
  }
  // A broad but shallow, organically-shaped hollow inside the hill.
  // It spreads horizontally like a cave room rather than vertically as a shaft.
  const chamberX=cx,chamberY=cy+0.6;
  const roomWidth=randInt(8,13),roomHeight=randInt(3,5);
  for(let dx=-roomWidth;dx<=roomWidth;dx+=0.65){
    const arc=Math.sqrt(Math.max(0,1-(dx/roomWidth)**2));
    const roof=chamberY-roomHeight*arc*0.65;
    const floor=chamberY+roomHeight*arc*0.75;
    for(let yy=Math.floor(roof);yy<=Math.ceil(floor);yy++){
      const xx=Math.round(chamberX+dx);
      if(xx<3||xx>=width-3||yy<=surfaceAt(xx)+2||yy>=bottom-3)continue;
      const jitter=0.22*Math.sin(dx*1.7);
      if(yy>=roof+jitter && yy<=floor+jitter)set(yy,xx,null);
    }
  }
  return true;
}
// Maintain the distance to the next entrance when new columns are generated.
let nextEntranceRight=randInt(125,150);
let nextEntranceLeft=randInt(125,150);
function generateEntranceSpan(width,surfaceAt,get,set,bottom,side) {
  let remaining=side==='left'?nextEntranceLeft:nextEntranceRight;
  const mouths=[];
  // Traverse from the existing world boundary outward.
  for(let distance=0;distance<width;distance++){
    remaining--;
    if(remaining>0)continue;
    const x=side==='left'?width-1-distance:distance;
    if(x>=5&&x<width-5 && carveEntrance(width,x,surfaceAt,get,set,bottom))mouths.push(x);
    remaining=randInt(125,150);
  }
  if(side==='left')nextEntranceLeft=remaining;
  else nextEntranceRight=remaining;
  return mouths;
}

// TERRARIA-STYLE CAVES
// Carve short, branching, wandering tunnels with variable width and occasional
// chambers. Only stone is removed, leaving the surface and dirt untouched.
const surfaceEntrances = []; // Surface cave entrances disabled.
// Seed the left-side spacing independently from the nearest initial entrance.
nextEntranceLeft=surfaceEntrances.length?randInt(125,150):randInt(125,150);
const caveGroups = [];
const inBounds = (r,c) => r>=0 && r<ROWS && c>=0 && c<COLUMNS;
function carveCaveCell(r,c,group) {
  if (!inBounds(r,c) || r < surface[c] + 25 || blocks[r][c] !== 'stone') return;
  blocks[r][c] = null;
  group.add(r*COLUMNS+c);
}
function carveCaveBlob(r,c,radius,group) {
  for (let dr=-Math.ceil(radius);dr<=Math.ceil(radius);dr++)
    for (let dc=-Math.ceil(radius);dc<=Math.ceil(radius);dc++)
      if (dr*dr+dc*dc <= radius*radius + Math.random()*1.3-0.5)
        carveCaveCell(r+dr,c+dc,group);
}
const stoneStart = Math.min(...surface.map((height, col) => height + dirtDepth[col] + 1));
const caveCount = randInt(15,21);
for (let n=0;n<caveCount;n++) {
  let c=randInt(4,COLUMNS-5);
  let r=Math.max(surface[c]+28,randInt(45,ROWS-8));
  r=Math.min(ROWS-8,r);
  let direction=Math.random()<0.5?0:Math.PI;
  const group=new Set();
  const steps=randInt(11,21);
  for (let step=0;step<steps;step++) {
    const radius=Math.random()<0.08?1.8:1.0;
    carveCaveBlob(Math.round(r),Math.round(c),radius,group);
    // Smooth directional drift produces irregular, winding passages.
    direction+=(Math.random()-0.5)*0.85;
    // Curve gently left/right instead of drilling straight down.
    const dx=Math.cos(direction),dy=Math.sin(direction);
    r=Math.max(surface[Math.round(c)]+28,Math.min(ROWS-5,r+dy*0.85));
    c=Math.max(3,Math.min(COLUMNS-4,c+dx*1.2));
  }
  // Occasionally branch away from the main tunnel's endpoint.
  if(Math.random()<.38){
    let branchDirection=direction+(Math.random()<.5?1:-1)*(.8+Math.random()*.65);
    let br=r,bc=c;
    for(let j=0;j<randInt(6,12);j++){
      carveCaveBlob(Math.round(br),Math.round(bc),Math.random()<.07?1.8:1.0,group);
      branchDirection+=(Math.random()-.5)*.65;
      br=Math.max(surface[Math.round(bc)]+28,Math.min(ROWS-4,br+Math.sin(branchDirection)));
      bc=Math.max(3,Math.min(COLUMNS-4,bc+Math.cos(branchDirection)*1.2));
    }
  }
  if(group.size>=5)caveGroups.push(group);
}
// Remove floating stone islands left inside carved caves. Any stone not
// connected orthogonally to the surrounding terrain is cleared to air.
const solidSeen=new Set(), solidQueue=[];
for(let r=0;r<ROWS;r++)for(let c=0;c<COLUMNS;c++){
  if(blocks[r][c]!=='stone')continue;
  if(r===ROWS-1||c===0||c===COLUMNS-1||
     (r>0&&blocks[r-1][c]==='dirt')){
    const key=r*COLUMNS+c;
    if(!solidSeen.has(key)){solidSeen.add(key);solidQueue.push([r,c]);}
  }
}
for(let i=0;i<solidQueue.length;i++){
  const [r,c]=solidQueue[i];
  for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nr=r+dr,nc=c+dc,key=nr*COLUMNS+nc;
    if(inBounds(nr,nc)&&blocks[nr][nc]==='stone'&&!solidSeen.has(key)){
      solidSeen.add(key);solidQueue.push([nr,nc]);
    }
  }
}
for(let r=stoneStart;r<ROWS;r++)for(let c=0;c<COLUMNS;c++){
  if(blocks[r][c]==='stone'&&!solidSeen.has(r*COLUMNS+c))blocks[r][c]=null;
}
// Caves may intersect. Identify the real connected cave components so TNT
// is placed on the actual lowest floor of each connected cave.
const seenCave=new Set(), caveComponents=[];
for(let r=stoneStart;r<ROWS;r++)for(let c=0;c<COLUMNS;c++){
  const key=r*COLUMNS+c;
  if(blocks[r][c]!==null || seenCave.has(key))continue;
  const queue=[[r,c]], component=[];
  seenCave.add(key);
  for(let i=0;i<queue.length;i++){
    const [rr,cc]=queue[i];component.push([rr,cc]);
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nr=rr+dr,nc=cc+dc,k=nr*COLUMNS+nc;
      if(inBounds(nr,nc)&&blocks[nr][nc]===null&&!seenCave.has(k)){
        seenCave.add(k);queue.push([nr,nc]);
      }
    }
  }
  if(component.length>=5)caveComponents.push(component);
}
addDirtPatches((r,c)=>blocks[r][c],(r,c,v)=>{blocks[r][c]=v;},stoneStart+3,ROWS,0,COLUMNS,Math.round(COLUMNS*ROWS/230));
// Ore deposits are richer around caves: increase the depth-dependent rate by 15%
// for stone within one tile of cave air (diagonals included), capped at 50%.
const oreTarget=Array.from({length:ROWS},()=>new Float32Array(COLUMNS));
for(let r=stoneStart;r<ROWS;r++)for(let c=0;c<COLUMNS;c++){
  if(blocks[r][c]!=='stone')continue;
  const depth=(r-stoneStart)/Math.max(1,ROWS-1-stoneStart);
  let rate=0.08+0.08*depth;
  let nearCave=false;
  for(let dr=-1;dr<=1&&!nearCave;dr++)for(let dc=-1;dc<=1;dc++){
    const nr=r+dr,nc=c+dc;
    if(inBounds(nr,nc)&&nr>=stoneStart&&blocks[nr][nc]===null){nearCave=true;break;}
  }
  oreTarget[r][c]=nearCave?Math.min(0.20,rate*1.15):rate;
}
// Grow mixed veins from eligible stone cells. Probability increases with
// depth and around caves; each vein is made of 3-9 adjacent ore blocks.
for(let bandTop=stoneStart;bandTop<ROWS;bandTop+=10){
  const bandBottom=Math.min(ROWS,bandTop+10), candidates=[];
  let expected=0;
  for(let r=bandTop;r<bandBottom;r++)for(let c=0;c<COLUMNS;c++){
    if(blocks[r][c]==='stone'){candidates.push([r,c]);expected+=oreTarget[r][c];}
  }
  const target=Math.round(expected);
  let placed=0, attempts=0;
  while(placed<target&&attempts++<1100){
    // Preferentially start veins next to caves and at deeper depths.
    const seed=candidates[randInt(0,candidates.length-1)];
    if(!seed)break;
    const [sr,sc]=seed;
    if(blocks[sr][sc]!=='stone'||Math.random()>oreTarget[sr][sc]/0.5)continue;
    const vein=[[sr,sc]],used=new Set([sr*COLUMNS+sc]);
    const size=Math.min(randInt(3,9),target-placed);
    while(vein.length<size){
      const options=[];
      for(const [r,c] of vein)for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nr=r+dr,nc=c+dc,k=nr*COLUMNS+nc;
        if(nr>=bandTop&&nr<bandBottom&&nc>=0&&nc<COLUMNS&&
           blocks[nr][nc]==='stone'&&!used.has(k))options.push([nr,nc]);
      }
      if(!options.length)break;
      const next=options[randInt(0,options.length-1)];
      used.add(next[0]*COLUMNS+next[1]);vein.push(next);
    }
    for(const [r,c] of vein)blocks[r][c]=Math.random()<0.5?'coal':'bronze';
    placed+=vein.length;
  }
}
// Each eligible cave has a 20% chance to contain one TNT block.
// Select randomly among air positions on the cave's LOWEST stone floor.
for(const component of caveComponents){
  if(Math.random()>=0.72)continue;
  const floors=component.filter(([r,c])=>r+1<ROWS&&
    ['stone','coal','bronze'].includes(blocks[r+1][c]));
  if(!floors.length)continue;
  const deepest=Math.max(...floors.map(([r])=>r));
  const lowest=floors.filter(([r])=>r===deepest);
  const [r,c]=lowest[randInt(0,lowest.length-1)];
  blocks[r][c]='tnt';
  if(floors.length>12 && Math.random()<0.38){
    const alternatives=floors.filter(([rr,cc])=>Math.abs(rr-r)+Math.abs(cc-c)>8);
    if(alternatives.length){
      const [r2,c2]=alternatives[randInt(0,alternatives.length-1)];
      blocks[r2][c2]='tnt';
    }
  }
}
// Trees: three leaves across, one centred above. 3–4 oak trunk blocks.
// No tree or decoration may overlap a neighbour or cross a biome boundary.
const treeColumns=[];
for(let col=2;col<COLUMNS-2;col++){
  if(Math.random()>0.21)continue;
  if(surfaceEntrances.some(x=>Math.abs(x-col)<5))continue;
  if(treeColumns.some(existing=>Math.abs(existing-col)<5))continue;
  if(biomeAt[col-1]!==biomeAt[col]||biomeAt[col+1]!==biomeAt[col])continue;
  const trunkHeight=randInt(3,4);
  const topRow=surface[col]-trunkHeight-1;
  if(topRow<1)continue;
  if(blocks[topRow][col-1]||blocks[topRow][col+1]||blocks[topRow-1][col])continue;
  let clear=true;
  for(let r=topRow+1;r<surface[col];r++)if(blocks[r][col])clear=false;
  if(!clear)continue;
  const leafType=biomeAt[col]==='autumn'?'autumnLeaf':biomeAt[col]==='snowy'?'snowyLeaf':'leaf';
  for(let r=topRow+1;r<surface[col];r++)blocks[r][col]='oak';
  for(const [r,c] of [[topRow,col-1],[topRow,col],[topRow,col+1],[topRow-1,col]])blocks[r][c]=leafType;
  treeColumns.push(col);
}
// Autumn decorations spawn once during initial generation on empty grass tops.
placeAutumnPatches(COLUMNS,c=>biomeAt[c],c=>surface[c],(r,c)=>blocks[r][c],(r,c,v)=>{blocks[r][c]=v;});
// Freeze the top boundary; the bottom grows automatically in chunks.
// The highest tree leaf is the top edge; the last underground row is the bottom.
const WORLD_TOP_ROW = Math.min(...blocks.flatMap((line,row) => line.some(Boolean) ? [row] : []));
// Lighting is based on Manhattan distance to the nearest AIR cell.
// Original lighting: distance 1 = 0% darkness, 2 = 25%,
// 3 = 50%, 4 = 75%, and 5+ = 100%.
// All surface blocks and above-ground trees/decorations are fully visible.
// The empty sky immediately above the world also counts as air.
// Distances are capped at 10, so deep solid blocks cannot be mined.
const lightDistance = Array.from({length: ROWS}, () => new Uint8Array(COLUMNS).fill(10));
function forEachNeighbour(row, col, fn) {
  if (row > WORLD_TOP_ROW) fn(row - 1, col);
  if (row + 1 < ROWS) fn(row + 1, col);
  if (col > 0) fn(row, col - 1);
  if (col + 1 < COLUMNS) fn(row, col + 1);
}
function initializeLighting() {
  const queue = [];
  for (let row = WORLD_TOP_ROW; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      // Air is distance zero. Top-edge blocks touch the sky (distance one).
      const distance = !blocks[row][col] ? 0 : row === WORLD_TOP_ROW ? 1 : 10;
      lightDistance[row][col] = distance;
      if (distance < 10) queue.push([row,col]);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const [row,col] = queue[head++];
    const next = lightDistance[row][col] + 1;
    if (next >= 10) continue;
    forEachNeighbour(row,col,(r,c) => {
      if (next < lightDistance[r][c]) {
        lightDistance[r][c] = next;
        queue.push([r,c]);
      }
    });
  }
}
// Mining can only introduce more air, so lighting distances can only decrease.
// Update the small affected region rather than recalculating the whole map.
function revealAir(row, col) {
  lightDistance[row][col] = 0;
  const queue = [[row,col]];
  let head = 0;
  while (head < queue.length) {
    const [r,c] = queue[head++];
    const next = lightDistance[r][c] + 1;
    if (next >= 10) continue;
    forEachNeighbour(r,c,(nr,nc) => {
      if (next < lightDistance[nr][nc]) {
        lightDistance[nr][nc] = next;
        queue.push([nr,nc]);
      }
    });
  }
}
initializeLighting();
// INFINITE UNDERGROUND: add small chunks only as the player descends.
// Never build an infinite canvas or regenerate existing mined blocks.
const CHUNK_ROWS = 60;
let extendingWorld = false;
function appendUndergroundChunk() {
  if (extendingWorld) return;
  extendingWorld = true;
  const start = ROWS;
  const end = start + CHUNK_ROWS;
  for (let r=start;r<end;r++) blocks.push(Array(COLUMNS).fill('stone'));
  ROWS = end;
  // Cave frequency remains approximately 5-7 attempts per 100 rows.
  const caves=[];
  for(let n=0;n<randInt(3,5);n++) {
    let r=randInt(start+4,end-5),c=randInt(2,COLUMNS-3);
    let direction=Math.random()<0.5?0:Math.PI;
    const group=new Set();
    for(let step=0,steps=randInt(10,18);step<steps;step++) {
      const radius=Math.random()<0.05?2:1;
      for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){
        const nr=Math.round(r)+dr,nc=Math.round(c)+dc;
        if(nr>=start+2&&nr<end-2&&nc>=1&&nc<COLUMNS-1&&
           dr*dr+dc*dc<=radius*radius+Math.random()*1.3-0.5) {
          blocks[nr][nc]=null;group.add(nr*COLUMNS+nc);
        }
      }
      direction+=(Math.random()-0.5)*0.8;
      r=Math.max(start+3,Math.min(end-4,r+Math.sin(direction)*0.85));
      c=Math.max(2,Math.min(COLUMNS-3,c+Math.cos(direction)*1.2));
    }
    if(group.size>=5)caves.push(group);
  }
  // Clear isolated stone islands in the new chunk; edge-connected stone stays.
  const solidSeen=new Set(),queue=[];
  for(let r=start;r<end;r++)for(let c=0;c<COLUMNS;c++){
    if(blocks[r][c]!=='stone')continue;
    if(r===start||r===end-1||c===0||c===COLUMNS-1){
      const k=r*COLUMNS+c;solidSeen.add(k);queue.push([r,c]);
    }
  }
  for(let i=0;i<queue.length;i++){
    const [r,c]=queue[i];
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nr=r+dr,nc=c+dc,k=nr*COLUMNS+nc;
      if(nr>=start&&nr<end&&nc>=0&&nc<COLUMNS&&blocks[nr][nc]==='stone'&&!solidSeen.has(k)){
        solidSeen.add(k);queue.push([nr,nc]);
      }
    }
  }
  for(let r=start;r<end;r++)for(let c=0;c<COLUMNS;c++){
    if(blocks[r][c]==='stone'&&!solidSeen.has(r*COLUMNS+c))blocks[r][c]=null;
  }
  addDirtPatches((r,c)=>blocks[r][c],(r,c,v)=>{blocks[r][c]=v;},start,end,0,COLUMNS,Math.round(COLUMNS*CHUNK_ROWS/230));
  // Balanced mixed ore veins: 8-16% of stone; 15% bonus near cave air.
  const rates=new Float32Array(CHUNK_ROWS*COLUMNS);
  const candidates=[];let expected=0;
  for(let r=start;r<end;r++)for(let c=0;c<COLUMNS;c++){
    if(blocks[r][c]!=='stone')continue;
    let near=false;
    for(let dr=-1;dr<=1&&!near;dr++)for(let dc=-1;dc<=1;dc++){
      const nr=r+dr,nc=c+dc;
      if(nr>=start&&nr<end&&nc>=0&&nc<COLUMNS&&blocks[nr][nc]===null){near=true;break;}
    }
    const depth=Math.min(1,(r-stoneStart)/90);
    const rate=Math.min(0.20,(0.08+0.08*depth)*(near?1.15:1));
    rates[(r-start)*COLUMNS+c]=rate;expected+=rate;candidates.push([r,c]);
  }
  let placed=0,attempts=0,target=Math.round(expected);
  while(placed<target&&attempts++<3000&&candidates.length){
    const [sr,sc]=candidates[randInt(0,candidates.length-1)];
    if(blocks[sr][sc]!=='stone'||Math.random()>rates[(sr-start)*COLUMNS+sc]/0.20)continue;
    const vein=[[sr,sc]],used=new Set([sr*COLUMNS+sc]);
    const count=Math.min(randInt(3,9),target-placed);
    while(vein.length<count){
      const options=[];
      for(const [r,c] of vein)for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nr=r+dr,nc=c+dc,k=nr*COLUMNS+nc;
        if(nr>=start&&nr<end&&nc>=0&&nc<COLUMNS&&blocks[nr][nc]==='stone'&&!used.has(k))options.push([nr,nc]);
      }
      if(!options.length)break;
      const next=options[randInt(0,options.length-1)];used.add(next[0]*COLUMNS+next[1]);vein.push(next);
    }
    for(const [r,c] of vein)blocks[r][c]=Math.random()<0.5?'coal':'bronze';
    placed+=vein.length;
  }
  // One possible TNT on the lowest floor of each connected cave component.
  const seen=new Set();
  for(let r=start;r<end;r++)for(let c=0;c<COLUMNS;c++){
    const k=r*COLUMNS+c;
    if(blocks[r][c]!==null||seen.has(k))continue;
    const component=[],todo=[[r,c]];seen.add(k);
    for(let i=0;i<todo.length;i++){
      const [rr,cc]=todo[i];component.push([rr,cc]);
      for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nr=rr+dr,nc=cc+dc,key=nr*COLUMNS+nc;
        if(nr>=start&&nr<end&&nc>=0&&nc<COLUMNS&&blocks[nr][nc]===null&&!seen.has(key)){
          seen.add(key);todo.push([nr,nc]);
        }
      }
    }
    if(component.length<5||Math.random()>=0.72)continue;
    const floors=component.filter(([rr,cc])=>rr+1<end&&['stone','coal','bronze'].includes(blocks[rr+1][cc]));
    if(!floors.length)continue;
    const deepest=Math.max(...floors.map(([rr])=>rr));
    const lowest=floors.filter(([rr])=>rr===deepest);
    const [tr,tc]=lowest[randInt(0,lowest.length-1)];blocks[tr][tc]='tnt';
  }
  // Incremental lighting. Seed from new air and the last few old rows,
  // then propagate at most ten tiles. No full-world lighting recalculation.
  for(let r=start;r<end;r++)lightDistance.push(new Uint8Array(COLUMNS).fill(10));
  const lightQueue=[];
  for(let r=start;r<end;r++)for(let c=0;c<COLUMNS;c++){
    if(blocks[r][c]===null){lightDistance[r][c]=0;lightQueue.push([r,c]);}
  }
  for(let r=Math.max(WORLD_TOP_ROW,start-10);r<start;r++)for(let c=0;c<COLUMNS;c++){
    if(lightDistance[r][c]<10)lightQueue.push([r,c]);
  }
  for(let i=0;i<lightQueue.length;i++){
    const [r,c]=lightQueue[i],next=lightDistance[r][c]+1;
    if(next>=10)continue;
    forEachNeighbour(r,c,(nr,nc)=>{
      if(next<lightDistance[nr][nc]){lightDistance[nr][nc]=next;lightQueue.push([nr,nc]);}
    });
  }
  extendingWorld=false;
  resizeWorld();
}
function maybeExtendWorld() {
  const cssTile=scrollArea.clientWidth/25;
  const remaining=(ROWS-WORLD_TOP_ROW)*cssTile-(scrollArea.scrollTop+scrollArea.clientHeight);
  if(remaining<Math.max(15*cssTile,scrollArea.clientHeight))appendUndergroundChunk();
}
// Endless horizontal terrain: append/prepend 100 columns when near an edge.
// Existing terrain and mined blocks are preserved. New columns are created only once.
const HORIZONTAL_CHUNK = 100;
let expandingHorizontal = false;
function generateHorizontalColumns(side) {
  if (expandingHorizontal) return;
  expandingHorizontal = true;
  const n=HORIZONTAL_CHUNK, oldCols=COLUMNS;
  // Build biome runs from the current map edge outward. Finish a partial
  // edge biome before switching, so chunk seams never create tiny biomes.
  const edgeBiome=side==='left'?biomeAt[0]:biomeAt[oldCols-1];
  let edgeLength=0;
  if(side==='left'){
    while(edgeLength<oldCols && biomeAt[edgeLength]===edgeBiome)edgeLength++;
  }else{
    while(edgeLength<oldCols && biomeAt[oldCols-1-edgeLength]===edgeBiome)edgeLength++;
  }
  const outward=[];
  let lastBiome=edgeBiome;
  // Existing run may be a truncated run from the previous chunk.
  if(edgeLength<25){
    const continuation=randInt(25-edgeLength,40-edgeLength);
    for(let i=0;i<continuation && outward.length<n;i++)outward.push(edgeBiome);
  }
  while(outward.length<n){
    const choices=biomeKinds.filter(kind=>kind!==lastBiome);
    const chosen=choices[randInt(0,choices.length-1)];
    const width=randInt(25,40);
    for(let i=0;i<width && outward.length<n;i++)outward.push(chosen);
    lastBiome=chosen;
  }
  const newBiomes=side==='left'?outward.reverse():outward;
  const newSurfaces=[],newDirt=[];
  let lastSurface=side==='left'?surface[0]:surface[oldCols-1];
  let lastDirt=side==='left'?dirtDepth[0]:dirtDepth[oldCols-1];
  const terrainStep=makeTerrainStepper(lastSurface,Math.random()<0.5?-1:1);
  for(let i=0;i<n;i++){
    lastSurface=terrainStep();
    lastDirt=Math.max(4,Math.min(6,lastDirt+randInt(-1,1)));
    newSurfaces.push(lastSurface);newDirt.push(lastDirt);
  }
  if(side==='left'){newSurfaces.reverse();newDirt.reverse();}
  const newBlocks=Array.from({length:ROWS},()=>Array(n).fill(null));
  // Build solid terrain first. Caves are carved as connected, irregular
  // wandering tunnels rather than a repeating sine/cosine pattern.
  for(let c=0;c<n;c++)for(let r=newSurfaces[c];r<ROWS;r++){
    const biome=newBiomes[c];
    newBlocks[r][c]=r===newSurfaces[c]?(biome==='autumn'?'autumnGrass':biome==='snowy'?'snowyGrass':'grass'):
      r<=newSurfaces[c]+newDirt[c]?'dirt':'stone';
  }
  const newMouths=[]; // Surface cave entrances disabled.
  // Vary cave origins, direction, length and width independently per chunk.
  // Leave a few columns at chunk boundaries untouched to avoid cut-off caves.
  const newCaves=[];
  const attempts=Math.max(3,Math.round(n*ROWS/1300));
  for(let k=0;k<attempts;k++){
    let cx=randInt(4,n-5);
    let cy=randInt(Math.min(ROWS-8,newSurfaces[cx]+29),ROWS-7);
    let angle=Math.random()<0.5?0:Math.PI;
    const carved=[];
    for(let step=0,steps=randInt(10,18);step<steps;step++){
      const rad=Math.random()<0.04?2:1;
      const x=Math.round(cx),y=Math.round(cy);
      for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){
        const xx=x+dx,yy=y+dy;
        if(xx<2||xx>=n-2||yy<0||yy>=ROWS-2)continue;
        if(dx*dx+dy*dy>rad*rad+0.2)continue;
        if(yy>=newSurfaces[xx]+25 && newBlocks[yy][xx]==='stone'){
          newBlocks[yy][xx]=null;carved.push([yy,xx]);
        }
      }
      angle+=(Math.random()-.5)*0.85;
      cx=Math.max(3,Math.min(n-4,cx+Math.cos(angle)*1.2));
      cy=Math.max(newSurfaces[Math.round(cx)]+28,Math.min(ROWS-4,cy+Math.sin(angle)*0.85));
    }
    if(carved.length>=5)newCaves.push(carved);
  }
  addDirtPatches((r,c)=>newBlocks[r][c],(r,c,v)=>{newBlocks[r][c]=v;},Math.max(20,Math.min(...newSurfaces)+8),ROWS,0,n,Math.round(n*ROWS/230));
  // Ore distribution is random per stone cell, not periodic.
  for(let c=0;c<n;c++)for(let r=0;r<ROWS;r++){
    if(newBlocks[r][c]!=='stone')continue;
    const depth=Math.min(1,r/120);
    const chance=.08+.08*depth;
    if(Math.random()<chance)newBlocks[r][c]=Math.random()<.5?'coal':'bronze';
  }
  // TNT appears only on real cave floors, never in repeated horizontal stripes.
  for(const cave of newCaves){
    if(Math.random()>=.72)continue;
    const floors=cave.filter(([r,c])=>r+1<ROWS&&['stone','coal','bronze'].includes(newBlocks[r+1][c])&&newBlocks[r][c]===null);
    if(!floors.length)continue;
    const deepest=Math.max(...floors.map(([r])=>r));
    const candidates=floors.filter(([r])=>r===deepest);
    const [r,c]=candidates[randInt(0,candidates.length-1)];
    newBlocks[r][c]='tnt';
  }
  // Trees and autumn decorations, with the same four-leaf shape.
  let lastTree=-10;
  for(let c=2;c<n-2;c++){
    if(c-lastTree<5||Math.random()>.21)continue;
    if(newMouths.some(x=>Math.abs(x-c)<5))continue;
    if(newBiomes[c-1]!==newBiomes[c]||newBiomes[c+1]!==newBiomes[c])continue;
    const height=randInt(3,4), top=newSurfaces[c]-height-1;
    if(top<1)continue;
    for(let r=top+1;r<newSurfaces[c];r++)newBlocks[r][c]='oak';
    const leaf=newBiomes[c]==='autumn'?'autumnLeaf':newBiomes[c]==='snowy'?'snowyLeaf':'leaf';
    for(const [r,x] of [[top,c-1],[top,c],[top,c+1],[top-1,c]])newBlocks[r][x]=leaf;
    lastTree=c;
  }
  placeAutumnPatches(n,c=>newBiomes[c],c=>newSurfaces[c],(r,c)=>newBlocks[r][c],(r,c,v)=>{newBlocks[r][c]=v;});
  if(side==='left'){
    for(let r=0;r<ROWS;r++)blocks[r].unshift(...newBlocks[r]);
    biomeAt.unshift(...newBiomes);surface.unshift(...newSurfaces);dirtDepth.unshift(...newDirt);
  }else{
    for(let r=0;r<ROWS;r++)blocks[r].push(...newBlocks[r]);
    biomeAt.push(...newBiomes);surface.push(...newSurfaces);dirtDepth.push(...newDirt);
  }
  COLUMNS+=n;
  for(let r=0;r<ROWS;r++){
    const extra=new Uint8Array(n).fill(5);
    const old=lightDistance[r],merged=new Uint8Array(COLUMNS).fill(10);
    if(side==='left'){merged.set(extra);merged.set(old,n);}
    else{merged.set(old);merged.set(extra,oldCols);}
    lightDistance[r]=merged;
  }
  // Lighting is recalculated after a new horizontal chunk arrives.
  initializeLighting();
  const cssTile=scrollArea.clientWidth/25;
  const oldX=scrollArea.scrollLeft;
  spacer.style.width=(COLUMNS*cssTile)+'px';
  if(side==='left'){
    scrollArea.scrollLeft=oldX+n*cssTile;
    // The drag controller maintains a separate destination for smooth panning.
    window.dispatchEvent(new CustomEvent('piskel-columns-prepended',{detail:{pixels:n*cssTile}}));
  }
  expandingHorizontal=false;
  requestDraw();
}
function maybeExtendHorizontal(){
  if(expandingHorizontal)return;
  const tile=scrollArea.clientWidth/25;
  if(scrollArea.scrollLeft<tile*18)generateHorizontalColumns('left');
  else if(scrollArea.scrollWidth-scrollArea.clientWidth-scrollArea.scrollLeft<tile*18)generateHorizontalColumns('right');
}
// Fast renderer: keep canvas viewport-sized, not 100 rows tall.
const canvas = document.getElementById('world');
const scrollArea = document.getElementById('worldScroll');
const spacer = document.getElementById('worldHeight');
const context = canvas.getContext('2d', {alpha:false});
const textures = {};
let layout = {tile:1,scale:1,left:0,top:0};
let renderQueued = false;
function drawWorld() {
  renderQueued = false;
  const tile = layout.tile;
  const scrollPixels = (WORLD_TOP_ROW * (layout.tile || 1)) + scrollArea.scrollTop * layout.scale;
  const scrollX=scrollArea.scrollLeft*layout.scale;
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#d4d6d9';
  context.fillRect(0,0,canvas.width,canvas.height);
  const first = Math.max(0,Math.floor(scrollPixels/tile));
  const last = Math.min(ROWS,Math.ceil((scrollPixels+canvas.height)/tile));
  const firstCol=Math.max(0,Math.floor(scrollX/tile));
  const lastCol=Math.min(COLUMNS,Math.ceil((scrollX+canvas.width)/tile)+1);
  for (let row=first;row<last;row++) for(let col=firstCol;col<lastCol;col++) {
    const type=blocks[row][col];
    if (!type) continue;
    const x=Math.round(col*tile-scrollX), y=Math.round(row*tile-scrollPixels);
    if (textures[type]) context.drawImage(textures[type],x,y,tile,tile);
    else {
      context.fillStyle=({grass:'#52743b',dirt:'#775538',oak:'#6d5135',leaf:'#276a26',stone:'#777777',coal:'#555555',bronze:'#665347',tnt:'#d44435',autumnGrass:'#ac6816',autumnLeaf:'#a35b13',snowyGrass:'#e0f1f8',snowyLeaf:'#91b5ca',pumpkin:'#dc7a18',haybale:'#c6a13c'})[type]||'#777777';
      context.fillRect(x,y,tile,tile);
    }
    const aboveGround = row < surface[col];
    const surfaceGrass = row === surface[col] && ['grass','autumnGrass','snowyGrass'].includes(type);
    let darkness = (aboveGround || surfaceGrass) ? 0 : Math.min(4, Math.max(0, lightDistance[row][col] - 1)) * 0.25;
    if(type==='dirt' && row===surface[col]+1) darkness=Math.max(0.25,darkness);
    if (darkness > 0) {
      context.fillStyle = `rgba(0,0,0,${darkness})`;
      context.fillRect(x,y,tile,tile);
    }
  }
}
function requestDraw() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(drawWorld);
}
function resizeWorld() {
  const previousTile = layout.tile/layout.scale;
  const previousScroll = scrollArea.scrollTop;
  const previousScrollX=scrollArea.scrollLeft;
  const width=scrollArea.clientWidth;
  const height=scrollArea.clientHeight;
  const cssTile=width/25;
  // Cap backing pixel ratio to avoid huge canvases on Retina screens.
  const dpr=Math.min(window.devicePixelRatio||1,1.5);
  const pixelTile=Math.max(1,Math.round(cssTile*dpr));
  const backingScale=pixelTile/cssTile;
  canvas.style.width=width+'px';
  canvas.style.height=height+'px';
  canvas.width=Math.max(1,Math.ceil(width*backingScale));
  canvas.height=Math.max(1,Math.ceil(height*backingScale));
  // Canvas already occupies one viewport in the scroll layout. The spacer
  // must only provide the remaining world height, avoiding an extra viewport
  // of empty scrolling below the final block.
  // Only the region from the highest leaf to the bottom row is scrollable.
  // The spacer follows the viewport canvas, so its height is the excess world height.
  spacer.style.height=Math.max(0,(ROWS-WORLD_TOP_ROW)*cssTile-height)+'px';
  spacer.style.width=(COLUMNS*cssTile)+'px';
  layout={tile:pixelTile,scale:backingScale,left:0,top:0};
  scrollArea.scrollTop=previousTile>0?previousScroll/previousTile*cssTile:0;
  scrollArea.scrollLeft=previousTile>0?previousScrollX/previousTile*cssTile:100*cssTile;
  requestDraw();
  maybeExtendWorld();
}
for (const [type,path] of Object.entries({
  grass:'Blocks/Grass Block.png',dirt:'Blocks/Dirt Block.png',
  oak:'Blocks/Oak Block.png',leaf:'Blocks/Leaf Block.png',
  stone:'Blocks/Stone Block.png',coal:'Blocks/Coal Stone Block.png',
  bronze:'Blocks/Bronze Stone Block.png',tnt:'Blocks/TNT Block.png',
  autumnGrass:'Blocks/Autumn Grass Block.png',autumnLeaf:'Blocks/Autumn Leaf Block.png',
  snowyGrass:'Blocks/Snowy Grass Block.png',snowyLeaf:'Blocks/Snowy Leaf Block.png',
  pumpkin:'Blocks/Pumpkin Block.png',haybale:'Blocks/Haybale Block.png'
})) {
  const image=new Image();
  image.onload=()=>{textures[type]=image;requestDraw();};
  image.src=path;
}
window.addEventListener('resize',resizeWorld);
scrollArea.addEventListener('scroll',()=>{requestDraw();maybeExtendWorld();maybeExtendHorizontal();},{passive:true});
// Safari can rubber-band a scrolling element beyond its real limits.
// Cancel wheel input at the boundaries and keep the camera clamped.
scrollArea.addEventListener('wheel', event => {
  const maximum = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
  if ((event.deltaY < 0 && scrollArea.scrollTop <= 0) ||
      (event.deltaY > 0 && scrollArea.scrollTop >= maximum)) {
    event.preventDefault();
    scrollArea.scrollTop = Math.min(maximum, Math.max(0, scrollArea.scrollTop));
    requestDraw();
  }
}, {passive:false});
scrollArea.addEventListener('scroll', () => {
  const maximum = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
  if (scrollArea.scrollTop < 0 || scrollArea.scrollTop > maximum) {
    scrollArea.scrollTop = Math.min(maximum, Math.max(0, scrollArea.scrollTop));
  }
}, {passive:true});
resizeWorld();
// Start near the spawn grass, not at the empty sky above the taller hills.
scrollArea.scrollTop=Math.max(0,(BASE_SURFACE-WORLD_TOP_ROW-7)*(scrollArea.clientWidth/25));
scrollArea.scrollLeft=100*(scrollArea.clientWidth/25);
maybeExtendWorld();
requestDraw();
