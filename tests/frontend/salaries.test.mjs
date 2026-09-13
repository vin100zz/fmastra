import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundSalary,monthlySalary,salarySearchParams} from '../../web/salaries.js';

test('salary rounding follows the requested two-significant-digit examples',()=>{
 for(const [value,expected] of [[92854,93000],[257628,260000],[1314589,1300000],[0,0],[7,7],[99999,100000]]){
  assert.equal(roundSalary(value),expected);
 }
});

test('monthly salary uses 52 weeks per year and full euro amounts',()=>{
 const digits=value=>monthlySalary(value).replace(/\D/g,'');
 assert.equal(digits(12000),'52000');
 assert.equal(digits(300000),'1300000');
 assert.equal(digits(0),'0');
 assert.equal(digits(null),'0');
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
