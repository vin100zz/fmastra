import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chanceSequences} from '../../web/match-replay.js';
import {matchScreen} from '../../web/match.js';

const event=(kind,possession,extra={})=>({second:possession*60,period:1,kind,team_id:1,possession_id:possession,...extra});

test('only possessions ending in a shot become chances, with their whole build-up',()=>{
 const events=[
  event('possession',1,{zone:1,lane:1}),event('progress',1,{zone:2,lane:1,player_id:7}),
  event('possession',2,{zone:1,lane:0,detail:'counter'}),event('progress',2,{zone:2,lane:0,player_id:8}),event('progress',2,{zone:3,lane:0,player_id:9}),
  event('delivery',2,{player_id:9,detail:'cross'}),event('shot',2,{shot_id:1,player_id:10,detail:'cross'}),event('goal',2,{shot_id:1,player_id:10,secondary_id:9}),
  event('yellow',3,{player_id:4}),event('shot',4,{shot_id:2,player_id:11,detail:'shot',zone:3,lane:1}),event('off_target',4,{shot_id:2}),
  {...event('shot',5,{shot_id:3}),period:3},
 ];
 const chances=chanceSequences(events);
 assert.deepEqual(chances.map(chance=>chance.id),[2,4]);
 const [cross,shot]=chances;
 assert.equal(cross.start.detail,'counter');
 assert.deepEqual(cross.progress.map(item=>item.zone),[2,3]);
 assert.equal(cross.delivery.player_id,9);
 assert.ok(cross.goal);
 // A result stored before the replay trail holds only the shot: it still replays, without a start.
 assert.equal(shot.start,undefined);
 assert.equal(shot.outcome.kind,'off_target');
 assert.ok(!shot.goal);
});

test('a played match page carries the replay card',async()=>{
 const stats={xg:1,shots:2,on_target:1,possession_seconds:2700,corners:0,free_kicks:0,yellows:0,reds:0};
 const lineup=[{id:1,name:'Gardien Un',position:'GB'}];
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:9,home:{id:1,name:'Home'},away:{id:2,name:'Away'},competition:'Ligue',round:1,date:'2026-08-16',score:[1,0],
  result:{status:'played',duration:5600,home_stats:stats,away_stats:stats,home_lineup:lineup,away_lineup:[{id:2,name:'Gardien Deux',position:'GB'}],home_bench:[],away_bench:[],
   events:[event('shot',1,{shot_id:1,player_id:1,player:'Gardien Un',detail:'shot'}),event('goal',1,{shot_id:1,player_id:1})]}})});
 const html=await matchScreen(9);
 // Folded by default: the banner's toggle controls an empty panel, the replay is mounted on first opening.
 const key=html.match(/<button type="button" class="replay-toggle" data-replay-toggle="(\d+)" aria-controls="replay-\1" aria-expanded="false">/)?.[1];
 assert.ok(key);
 assert.match(html,new RegExp(`<section class="card match-replay-card" id="replay-${key}" hidden></section>`));
 assert.doesNotMatch(html,/<match-replay|Occasions reconstituées/);
});
