import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GRAVITY,ballAt,dip,lofted,path,rolled} from '../../web/replay-physics.js';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} is not ${expected}`);
const speed=ball=>Math.hypot(ball.vx,ball.vy);

test('a pass along the grass reaches its man on time, slowing but still running',()=>{
 const from={x:10,y:20},to={x:30,y:20};
 const {velocity,duration}=rolled(from,to,1300);
 assert.equal(duration,1300);
 const segments=path(from,velocity,5000),start=ballAt(segments,5000),end=ballAt(segments,6300);
 near(end.x,30,1e-9);near(end.y,20,1e-9);near(end.z,0);
 assert.ok(speed(end)>0&&speed(end)<speed(start));
 // Left alone it rolls on, then stops for good.
 const rest=ballAt(segments,60000);
 assert.ok(rest.x>30);near(speed(rest),0);
});

test('a ball asked to roll slower than it can stops on its spot, a little earlier',()=>{
 const from={x:0,y:0},to={x:2,y:0};
 const {velocity,duration}=rolled(from,to,5000);
 assert.ok(duration<5000);
 const end=ballAt(path(from,velocity,0),duration);
 near(end.x,2,1e-6);near(speed(end),0,1e-9);
});

test('a lofted ball comes down on its spot at the height asked for, curled off its line on the way',()=>{
 const from={x:20,y:10,z:0},to={x:50,y:10};
 const {velocity,options}=lofted(from,to,1800,1.35,{bend:2});
 const segments=path(from,velocity,0,options),end=ballAt(segments,1800),middle=ballAt(segments,900);
 near(end.x,50,1e-6);near(end.y,10,1e-6);near(end.z,1.35,1e-6);
 near(Math.abs(middle.y-10),2,1e-6);
 // Over the lines: it climbs well above anyone's head.
 assert.ok(middle.z>3);
});

test('a dropped ball bounces lower each time, then rolls and comes to rest',()=>{
 const segments=path({x:0,y:0,z:3},{x:.004,y:0,z:0},0);
 const flights=segments.filter(segment=>segment.kind==='air');
 assert.ok(flights.length>=2);
 const peaks=flights.slice(1).map(segment=>segment.v.z**2/(2*segment.g));
 for(let index=1;index<peaks.length;index++)assert.ok(peaks[index]<peaks[index-1]);
 assert.deepEqual(segments.slice(-2).map(segment=>segment.kind),['roll','rest']);
});

test('a free kick dips enough to clear the wall and still come down under the bar',()=>{
 const from={x:80,y:34,z:0},to={x:105,y:34};
 const gravity=dip(from,to,1050,1.8,9.15,2.45);
 assert.ok(gravity>GRAVITY);
 const {velocity,options}=lofted(from,to,1050,1.8,{gravity});
 const segments=path(from,velocity,0,options);
 near(ballAt(segments,1050*9.15/25).z,2.45,1e-6);
 near(ballAt(segments,1050).z,1.8,1e-6);
});
