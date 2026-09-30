import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rememberFilters,hasFilters,viewParams} from '../../web/filters.js';

test('a plain address to Clubs or Joueurs reopens the filters and sort last used, without the page',()=>{
 assert.equal(rememberFilters('#/players?poste=BU&tri=age&ordre=asc&page=3'),'#/players?poste=BU&tri=age&ordre=asc&page=3');
 assert.equal(rememberFilters('#/players'),'#/players?poste=BU&tri=age&ordre=asc');
 // Each screen keeps its own.
 assert.equal(rememberFilters('#/clubs'),'#/clubs');
 rememberFilters('#/clubs?statut=dormant');
 assert.equal(rememberFilters('#/clubs'),'#/clubs?statut=dormant');
 assert.equal(rememberFilters('#/players'),'#/players?poste=BU&tri=age&ordre=asc');
});

test('an empty query, as after a reset, forgets the filters',()=>{
 rememberFilters('#/clubs?recherche=lyon');
 assert.equal(rememberFilters('#/clubs?'),'#/clubs?');
 assert.equal(rememberFilters('#/clubs'),'#/clubs');
});

test('other screens are left as they are',()=>{
 assert.equal(rememberFilters('#/league/16/stats?type=passeurs'),'#/league/16/stats?type=passeurs');
 assert.equal(rememberFilters('#/league/16/stats'),'#/league/16/stats');
 assert.equal(rememberFilters(''),'');
});

test('a new filter and a reset keep the sort and the columns, not the filters nor the page',()=>{
 const params=new URLSearchParams('recherche=mbappe&poste=BU&tri=value&vue=attributs&ordre=asc&page=2');
 assert.equal(viewParams(params).toString(),'tri=value&vue=attributs&ordre=asc');
 assert.equal(hasFilters(params),true);
 assert.equal(hasFilters(new URLSearchParams('tri=value&ordre=asc&vue=attributs&page=2')),false);
});
