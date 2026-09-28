import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundHash,landing,setSteps,resetFlow,markNewsSeen,nextStep} from '../../web/flow.js';

const league={kind:'league',id:16,code:null},cup={kind:'cup',id:-3,code:null},europe={kind:'europe',id:-101,code:'C1'},euro={kind:'international',year:2028};

test('a round opens on the tab of its competition’s page',()=>{
 assert.equal(roundHash(league,'latest'),'#/league/16/latest');
 assert.equal(roundHash(cup,'next'),'#/league/-3/next');
 assert.equal(roundHash(europe,'latest'),'#/europe/C1/latest');
 assert.equal(roundHash(euro,'latest'),'#/international/2028/latest');
});

test('a step lands on the next round when the club’s match awaits its lineup, on the round played otherwise, then Mon club',()=>{
 assert.deepEqual(landing({status:'awaiting_lineup',competition:league}),{hash:'#/league/16/next',steps:[]});
 assert.deepEqual(landing({status:'done',competition:europe}),{hash:'#/europe/C1/latest',steps:['club']});
 // Nothing followed was played (a quiet week, a key date, news to answer): straight to Mon club.
 assert.deepEqual(landing({status:'done',competition:null}),{hash:'#/mon-club',steps:[]});
 // A simulated match shows its report first.
 assert.deepEqual(landing({status:'done',competition:cup},42),{hash:'#/match/42',steps:['#/league/-3/latest','club']});
});

test('Mon club comes after the results only when news arrived since the last visit',()=>{
 resetFlow();
 setSteps(['club']);
 assert.equal(nextStep(5,'#/league/16/latest'),'#/mon-club');  // never visited yet
 assert.equal(nextStep(5,'#/mon-club'),null);  // then it is time to advance
 markNewsSeen(5);
 setSteps(['club']);
 assert.equal(nextStep(5,'#/europe/C1/latest'),null);
 setSteps(['club']);
 assert.equal(nextStep(6,'#/europe/C1/latest'),'#/mon-club');
});

test('the steps due survive browsing elsewhere and skip the page already on screen',()=>{
 resetFlow();
 markNewsSeen(3);
 setSteps(['#/league/-3/latest','club']);
 assert.equal(nextStep(4,'#/players'),'#/league/-3/latest');
 assert.equal(nextStep(4,'#/club/7'),'#/mon-club');
 assert.equal(nextStep(4,'#/mon-club'),null);
 setSteps(['#/league/-3/latest','club']);
 assert.equal(nextStep(3,'#/league/-3/latest'),null);  // results already shown, no news: advance
});
