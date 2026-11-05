// Piskel World — Block Sounds
// Preload two default and four grass sounds. Each mining event creates a
// separate Web Audio source so sounds can overlap without cutting off.
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const blockAudioContext = AudioContextClass ? new AudioContextClass() : null;
const soundFiles = {
  grass: [1,2,3,4].map(i => `Sounds/Grass%20Sounds/Grass%20Block%20Mine%20${i}.mp3`),
  dirt: [1,2].map(i => `Sounds/Default%20Sounds/Default%20Block%20Mine%20${i}.mp3`),
  leaf: [1,2,3,4].map(i => `Sounds/Leaf%20Sounds/Leaf%20Block%20Mine%20${i}.mp3`),
  tnt: [1,2,3,4].map(i => `Sounds/TNT%20Sounds/Tnt%20Block%20Mine%20${i}.mp3`)
};
const soundBuffers = { grass: [], dirt: [], leaf: [], tnt: [] };
const pendingLoads = [];
if (blockAudioContext) {
  for (const [type, paths] of Object.entries(soundFiles)) {
    paths.forEach((path, index) => {
      pendingLoads.push(fetch(path).then(response => {
        if (!response.ok) throw new Error(`${response.status} ${path}`);
        return response.arrayBuffer();
      }).then(data => blockAudioContext.decodeAudioData(data)).then(buffer => {
        soundBuffers[type][index] = buffer;
      }).catch(error => console.warn('Sound preload failed:', path, error)));
    });
  }
}
// Avoid unbounded simultaneous sound sources during repeated mining.
let activeMiningSounds = 0;
const MAX_SIMULTANEOUS_SOUNDS = 12;
function playBlockSound(type) {
  if (activeMiningSounds >= MAX_SIMULTANEOUS_SOUNDS && type !== 'tnt') return;
  // Oak and stone blocks use default mining sounds; leaves have their own.
  if (type === 'autumnGrass' || type === 'snowyGrass') type = 'grass';
  if (type === 'autumnLeaf' || type === 'snowyLeaf') type = 'leaf';
  if (type !== 'grass' && type !== 'leaf' && type !== 'tnt') type = 'dirt';
  const paths = soundFiles[type];
  if (!paths) return;
  if (blockAudioContext) {
    // Resume immediately during the mining gesture for Safari.
    if (blockAudioContext.state !== 'running') blockAudioContext.resume().catch(() => {});
    const available = soundBuffers[type].filter(Boolean);
    if (available.length) {
      const source = blockAudioContext.createBufferSource();
      const gain = blockAudioContext.createGain();
      source.buffer = available[Math.floor(Math.random() * available.length)];
      gain.gain.value = type === 'tnt' ? 1.0 : 0.9;
      source.connect(gain);
      gain.connect(blockAudioContext.destination);
      activeMiningSounds++;
      source.onended = () => {
        activeMiningSounds = Math.max(0, activeMiningSounds - 1);
        source.disconnect(); gain.disconnect();
      };
      try { source.start(); } catch (error) {
        activeMiningSounds = Math.max(0, activeMiningSounds - 1);
        source.disconnect(); gain.disconnect();
      }
      return;
    }
  }
  // Fallback while files load or if Web Audio isn't available.
  // Never reuse the same HTMLAudioElement, so existing sounds keep playing.
  const audio = new Audio(paths[Math.floor(Math.random() * paths.length)]);
  audio.volume = type === 'tnt' ? 1.0 : 0.9;
  activeMiningSounds++;
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    activeMiningSounds = Math.max(0, activeMiningSounds - 1);
  };
  audio.addEventListener('ended', cleanup, {once:true});
  audio.addEventListener('error', cleanup, {once:true});
  audio.play().catch(cleanup);
}
