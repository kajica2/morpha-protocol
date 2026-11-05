// MORPHA gallery: a local, microphone-free interpretation of the reference
// glyph assets and the protocol's continuity, overlap and silence principles.
// No telemetry, network submission or WebGL dependency.
const canvas = document.querySelector('#glyph-field');
const context = canvas.getContext('2d', { alpha: false });
const status = document.querySelector('#gallery-status');
const familySelect = document.querySelector('#family');
const energyInput = document.querySelector('#energy');
const energyOutput = document.querySelector('#energy-value');
const silenceInput = document.querySelector('#silence');
const pauseButton = document.querySelector('#pause-motion');
const resetButton = document.querySelector('#reset-motion');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const COUNT = 192;
const TAU = Math.PI * 2;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = t => { const x = clamp(t); return x * x * (3 - 2 * x); };
const mix = (a,b,t) => a + (b-a)*t;

let glyphs = [], active = true, frame = 0, elapsed = 0, last = 0, dpr = 1;
let width = 700, height = 420, error = null;
let selected = 'flow';
const synthetic = [
  { key: 'flow', title: 'Flow', glyph: 'circle.svg', hue: 164, speed: .30 },
  { key: 'anchor', title: 'Anchor', glyph: 'square.svg', hue: 264, speed: .17 },
  { key: 'fracture', title: 'Fracture', glyph: 'diamond.svg', hue: 35, speed: .41 },
  { key: 'void', title: 'Void', glyph: 'circle.svg', hue: 211, speed: .10 },
  { key: 'echo', title: 'Echo', glyph: 'diamond.svg', hue: 289, speed: .23 },
];

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(200, rect.width || 700);
  height = Math.max(180, rect.height || 420);
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width*dpr);
  canvas.height = Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);
}

function samplePath(source, count=COUNT) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',source);
  svg.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  svg.appendChild(path);
  document.body.appendChild(svg);
  try {
    const len = path.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) throw new Error('Invalid glyph path');
    const points = Array.from({length:count},(_,i)=>path.getPointAtLength(len*i/count));
    const minX=Math.min(...points.map(p=>p.x)), maxX=Math.max(...points.map(p=>p.x));
    const minY=Math.min(...points.map(p=>p.y)), maxY=Math.max(...points.map(p=>p.y));
    const size=Math.max(maxX-minX,maxY-minY,1), cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    return points.map(p=>({x:(p.x-cx)/size,y:-(p.y-cy)/size}));
  } finally { svg.remove(); }
}

function makeLayers(paths) {
  const flows = synthetic.map((s,i)=>({
    ...s, points: paths[s.glyph], to: paths[synthetic[(i+1)%synthetic.length].glyph],
  }));
  if (!flows.every(g=>Array.isArray(g.points)&&g.points.length===COUNT)) throw new Error('Missing glyph points');
  return flows;
}

function drawLayer(layer, phase, pressure, absence, secondary=false) {
  const silent=absence ? 1 : 0;
  // Silence makes the glyph persist and slows its motion; it is not zero energy.
  const slow = silent ? .18 : 1;
  const motion = ease((Math.sin(phase*layer.speed*slow + (secondary ? 1.3 : 0)) + 1)*.5);
  const scale = Math.min(width,height)*(.54 + (secondary ? .12 : 0));
  const cx=width*.5,cy=height*.49;
  context.beginPath();
  for(let i=0;i<COUNT;i++){
    const a=layer.points[i], b=layer.to[i];
    const resistance = layer.key === 'anchor' ? .30 : layer.key === 'fracture' ? .9 : .6;
    const warp = (1-silent)*pressure*resistance;
    const shift = Math.sin(phase*.73 + i*.105 + (secondary ? .5 : 0)) * warp * .08;
    const x=cx+scale*(mix(a.x,b.x,motion)+shift);
    const y=cy+scale*(mix(a.y,b.y,motion)+Math.cos(phase*.44+i*.05)*warp*.04);
    if(!i)context.moveTo(x,y);else context.lineTo(x,y);
  }
  context.closePath();
  context.lineWidth=secondary ? 1.1 : 2;
  context.strokeStyle=secondary ? 'rgba(177,157,255,.40)' : 'rgba(114,241,210,.92)';
  context.shadowBlur=secondary ? 22 : 25;
  context.shadowColor=secondary ? '#a99aff' : '#60dcca';
  context.stroke();
  context.shadowBlur=0;
  if(!secondary){
    context.fillStyle = 'rgba(66,203,189,.045)';
    context.fill();
  }
}

function render() {
  if(!context)return;
  context.fillStyle='#080d17';
  context.fillRect(0,0,width,height);
  context.strokeStyle='rgba(255,255,255,.055)';
  for(let x=width/8;x<width;x+=width/8){context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();}
  for(let y=height/6;y<height;y+=height/6){context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke();}
  if(!glyphs.length)return;
  const layer = glyphs.find(g=>g.key===selected) || glyphs[0];
  const second = glyphs[(glyphs.indexOf(layer)+2)%glyphs.length];
  const pressure=Number(energyInput.value)/100;
  drawLayer(second, elapsed+1.8,pressure, silenceInput.checked,true);
  drawLayer(layer,elapsed,pressure,silenceInput.checked,false);
  status.textContent = `${layer.title} family · ${silenceInput.checked?'Silence extends persistence':'Energy biases motion'} · Two overlapping glyphs`;
}

function tick(now) {
  frame=requestAnimationFrame(tick);
  const delta=last ? Math.min((now-last)/1000,.05) : 0;
  last=now;
  if(active && !reduceMotion.matches) elapsed+=delta;
  render();
}
function updatePlayback(){
  const playing=active&&!reduceMotion.matches;
  pauseButton.textContent=active?'Pause motion':'Resume motion';
  pauseButton.setAttribute('aria-pressed',String(!active));
  status.textContent=playing?'Glyph motion active':'Glyph motion paused';
}
familySelect.addEventListener('change',()=>{selected=familySelect.value;render();});
energyInput.addEventListener('input',()=>{energyOutput.value=energyInput.value+'%';render();});
silenceInput.addEventListener('change',render);
pauseButton.addEventListener('click',()=>{active=!active;updatePlayback();render();});
resetButton.addEventListener('click',()=>{elapsed=0;active=false;updatePlayback();render();});
reduceMotion.addEventListener?.('change',()=>{updatePlayback();render();});
window.addEventListener('resize',()=>{resize();render();});
async function init(){
  if(!context){status.textContent='Canvas is unavailable in this browser.';return;}
  resize();
  try{
    // Relative to /advantages/ so root hosting and Pages subpaths both work.
    const response=await fetch('../data/processed-glyphs.json');
    if(!response.ok)throw new Error(`Glyph data HTTP ${response.status}`);
    glyphs=makeLayers(Object.fromEntries(
      Object.entries(await response.json()).map(([name,path])=>[name,samplePath(path)])
    ));
    updatePlayback();
    frame=requestAnimationFrame(tick);
  }catch(e){
    error=e;
    status.textContent='Glyph preview unavailable. Try the live ritual instead.';
    console.error('MORPHA gallery load error',error);
    render();
  }
}
init();
