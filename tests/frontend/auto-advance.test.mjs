import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAutoAdvance} from '../../web/auto-advance.js';

function harness(advance=async()=>true){
 const tasks=new Map();let next=0;
 const player=createAutoAdvance({advance,onChange(){},schedule(fn){tasks.set(++next,fn);return next;},cancel(id){tasks.delete(id);}});
 const tick=async()=>{const [id,fn]=tasks.entries().next().value;tasks.delete(id);await fn();};
 return {player,tasks,tick};
}

test('waits for completion before advancing again, even after repeated clicks',async()=>{
 let calls=0;const {player,tasks,tick}=harness(async()=>{calls++;return true;});
 player.start();player.start();assert.equal(tasks.size,1);
 await tick();assert.equal(calls,1);assert.equal(tasks.size,0);
 player.complete();player.complete();assert.equal(tasks.size,1);
 await tick();assert.equal(calls,2);
});

test('pause cancels a queued day',async()=>{
 const {player,tasks}=harness();player.start();player.pause();
 assert.equal(player.playing,false);assert.equal(tasks.size,0);
 player.complete();assert.equal(tasks.size,0);
});

test('pause during a request prevents the next day when that job completes',async()=>{
 let resolve;const {player,tasks,tick}=harness(()=>new Promise(done=>{resolve=done;}));
 player.start();const pending=tick();player.pause();resolve(true);await pending;
 player.complete();assert.equal(player.playing,false);assert.equal(tasks.size,0);
 player.start();assert.equal(tasks.size,1);
});

test('failed or rejected requests stop automatic advancement',async()=>{
 for(const advance of [async()=>false,async()=>{throw new Error('Network unavailable');}]){
  const {player,tasks,tick}=harness(advance);player.start();await tick();
  assert.equal(player.playing,false);player.complete();assert.equal(tasks.size,0);
 }
});
