// Chain completed commands only; pausing never interrupts a partially simulated day.
export function createAutoAdvance({advance, onChange, delay=800, schedule=setTimeout, cancel=clearTimeout}) {
 let playing=false, timer=null;
 const pause=()=>{
  playing=false;
  if(timer!==null)cancel(timer);
  timer=null;
  onChange();
 };
 const complete=()=>{
  if(!playing||timer!==null)return;
  timer=schedule(async()=>{
   timer=null;
   if(!playing)return;
   try{if(await advance()===false)pause();}catch{pause();}
  },delay);
 };
 return {
  get playing(){return playing;},
  start(){if(playing)return;playing=true;onChange();complete();},
  pause,
  complete,
 };
}
