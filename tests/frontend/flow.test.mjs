import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundHash,landing,setSteps,resetFlow,nextStep,newsStep,messageHash,openingMessage} from '../../web/flow.js';

const league={kind:'league',id:16,code:null},cup={kind:'cup',id:-3,code:null},europe={kind:'europe',id:-101,code:'C1'},euro={kind:'international',year:2028};

test('a round opens on the tab of its competition’s page',()=>{
 assert.equal(roundHash(league,'latest'),'#/league/16/latest');
 assert.equal(roundHash(cup,'next'),'#/league/-3/next');
 assert.equal(roundHash(europe,'latest'),'#/europe/C1/latest');
 assert.equal(roundHash(euro,'latest'),'#/international/2028/latest');
});

test('a step lands on the next round when the club’s match awaits its lineup, on the round played otherwise',()=>{
 assert.deepEqual(landing({status:'awaiting_lineup',competition:league}),{hash:'#/league/16/next',steps:[]});
 assert.deepEqual(landing({status:'done',competition:europe}),{hash:'#/europe/C1/latest',steps:[]});
 // Nothing followed was played (a quiet week, a key date, news to answer): straight to Actualités.
 assert.deepEqual(landing({status:'done',competition:null}),{hash:'#/actualites',steps:[]});
 // A simulated match shows its report first, then its round.
 assert.deepEqual(landing({status:'done',competition:cup},42),{hash:'#/match/42',steps:['#/league/-3/latest']});
});

test('the rounds due survive browsing elsewhere and skip the page already on screen',()=>{
 resetFlow();
 setSteps(['#/league/-3/latest']);
 assert.equal(nextStep('#/players'),'#/league/-3/latest');
 assert.equal(nextStep('#/league/-3/latest'),null);
 setSteps(['#/league/-3/latest']);
 assert.equal(nextStep('#/league/-3/latest'),null);  // already on screen: nothing left to show
});

test('Continuer reads the feed before it advances: the unread messages, then those awaiting an answer',()=>{
 assert.equal(messageHash(7),'#/actualites?msg=7');
 assert.equal(newsStep(null),null);
 assert.equal(newsStep({unread:0,next_unread:null,pending:[]}),null);
 // Unread messages come first, newest first, even while the message on screen awaits its answer.
 assert.deepEqual(newsStep({unread:2,next_unread:5,pending:[6]},6),{message:5});
 // Everything read: it leads to a message awaiting an answer, and waits once that message is on screen.
 assert.deepEqual(newsStep({unread:0,next_unread:null,pending:[6,2]}),{message:6});
 assert.deepEqual(newsStep({unread:0,next_unread:null,pending:[6,2]},4),{message:6});
 assert.deepEqual(newsStep({unread:0,next_unread:null,pending:[6,2]},2),{blocked:true});
 // The first message unread is message 0 as well.
 assert.deepEqual(newsStep({unread:1,next_unread:0,pending:[]}),{message:0});
});

test('Actualités opens on the next message to read, else on one awaiting an answer, else on the latest',()=>{
 assert.equal(openingMessage({unread:1,next_unread:3,pending:[1]},9),3);
 assert.equal(openingMessage({unread:0,next_unread:null,pending:[1]},9),1);
 assert.equal(openingMessage({unread:0,next_unread:null,pending:[]},9),8);
 assert.equal(openingMessage({unread:0,next_unread:null,pending:[]},0),null);
 assert.equal(openingMessage(null,0),null);
});
