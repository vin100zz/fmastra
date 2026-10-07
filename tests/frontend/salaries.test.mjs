import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundSalary,monthlySalary,amount,salarySearchParams} from '../../web/salaries.js';

test('salary rounding follows the requested two-significant-digit examples',()=>{
 for(const [value,expected] of [[92854,93000],[257628,260000],[1314589,1300000],[0,0],[7,7],[99999,100000]]){
  assert.equal(roundSalary(value),expected);
 }
});

test('monthly salary uses 52 weeks per year and is written in €, k€ or M€, with a point',()=>{
 const written=value=>monthlySalary(value).replace(/\s/g,' ');
 assert.equal(written(12000),'52 k€');
 assert.equal(written(300000),'1.3 M€');
 assert.equal(written(150),'650 €');
 assert.equal(written(0),'0 €');
 assert.equal(written(null),'0 €');
 // An amount just under a thousand of its unit moves up to the next one rather than reading "1 000 k€".
 assert.equal(amount(999600).replace(/\s/g,' '),'1 M€');
 assert.equal(amount(1234567,3).replace(/\s/g,' '),'1.23 M€');
 assert.equal(amount(2.4e9).replace(/\s/g,' '),'2 400 M€');
});

test('monthly filter bounds select exact eligible weekly wages without changing the form',()=>{
 const input=new URLSearchParams('salaire_min=93000&salaire_max=260000&poste=BU');
 const result=salarySearchParams(input);
 assert.equal(result.get('salaire_min'),'21462');
 assert.equal(result.get('salaire_max'),'60000');
 assert.equal(result.get('poste'),'BU');
 assert.equal(input.get('salaire_min'),'93000');
 for(const weekly of [21461,21462,60000,60001]){
  assert.equal(weekly>=Number(result.get('salaire_min'))&&weekly<=Number(result.get('salaire_max')),weekly*52/12>=93000&&weekly*52/12<=260000);
 }
 assert.equal(salarySearchParams(new URLSearchParams()).has('salaire_max'),false);
 assert.equal(salarySearchParams(new URLSearchParams('salaire_max=0')).get('salaire_max'),'0');
});

test('max value is typed in millions of euros',()=>{
 for(const [input,expected] of [['25','25000000'],['0.4','400000'],['0.29','290000'],['0','0']]){
  assert.equal(salarySearchParams(new URLSearchParams(`valeur_max=${input}`)).get('valeur_max'),expected);
 }
 assert.equal(salarySearchParams(new URLSearchParams()).has('valeur_max'),false);
 assert.equal(salarySearchParams(new URLSearchParams('prix_max=12.5')).get('prix_max'),'12500000');
 assert.equal(salarySearchParams(new URLSearchParams()).has('prix_max'),false);
});

test('a bound on wage demands keeps the players asking exactly that monthly amount',()=>{
 // A demand of 93 000 €/month is quoted 21 462 €/week, the next weekly euro above it.
 assert.equal(salarySearchParams(new URLSearchParams('pretentions_max=93000')).get('pretentions_max'),'21462');
 assert.equal(salarySearchParams(new URLSearchParams('pretentions_max=260000')).get('pretentions_max'),'60000');
 assert.equal(salarySearchParams(new URLSearchParams()).has('pretentions_max'),false);
});

test('minimum levels are typed on the 1–200 scale',()=>{
 const result=salarySearchParams(new URLSearchParams('niveau_min=140&potentiel_min=161'));
 assert.equal(result.get('niveau_min'),'70');assert.equal(result.get('potentiel_min'),'80.5');
});
