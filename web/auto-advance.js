// Chain completed commands only; pausing never interrupts a partially simulated day.
// A 'retry' result means the server is still finishing the previous advance's background
// autosave; keep retrying (bounded) instead of treating it as a failure.
const MAX_RETRIES = 30;
export function createAutoAdvance({advance, onChange, delay=800, schedule=setTimeout, cancel=clearTimeout}) {
 let playing=false, timer=null;
 const pause=()=>{
  playing=false;
  if(timer!==null)cancel(timer);
  timer=null;
  onChange();
 };
 const attempt=retries=>{
  timer=schedule(async()=>{
   timer=null;
   if(!playing)return;
   try{
    const result=await advance();
    if(result==='retry'){if(retries<MAX_RETRIES)attempt(retries+1);else pause();}
    else if(result===false)pause();
   }catch{pause();}
  },delay);
 };
 const complete=()=>{
  if(!playing||timer!==null)return;
  attempt(0);
 };
 return {
  get playing(){return playing;},
  start(){if(playing)return;playing=true;onChange();complete();},
  pause,
  complete,
 };
}
