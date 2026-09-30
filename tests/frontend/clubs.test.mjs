import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubsScreen} from '../../web/screens.js';
import {setNations} from '../../web/ui.js';

const leagues=[{id:32,name:'Serie A',nation:'ITA',kind:'league',level:1},{id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1},{id:-3,name:'Coupe de France',nation:'FRA',kind:'cup',level:0},{id:-9,name:'Ligue des champions',nation:'EUR',kind:'europe',level:0}];
const club={id:1,name:'Juventus',nation_code:'ITA',competition:'Serie A',reputation:80,training_facilities:18,youth_recruitment:null,squad_size:30,top_rating:70,top_potential:75,formation:'4-4-2'};

async function render(query){
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({items:[club],total:1,page:1,page_size:30,nations:['ARG','BRA','FRA','ITA','USA']})});
 try{return await clubsScreen(new URLSearchParams(query),leagues);}finally{globalThis.fetch=previous;}
}

test('the country filter lists the playable countries first, then the others by name',async()=>{
 setNations({ARG:{name:'Argentine'},BRA:{name:'Brésil'},FRA:{name:'France'},ITA:{name:'Italie'},USA:{name:'États-Unis'}});
 const html=await render('pays=BRA');
 const select=html.match(/<select name="pays".*?<\/select>/s)[0];
 assert.deepEqual([...select.matchAll(/<option value="(\w*)"/g)].map(match=>match[1]),['','FRA','ITA','ARG','BRA','USA']);
 assert.match(select,/Italie<\/option><hr><option value="ARG"/);
 assert.match(select,/<option value="BRA" selected>Brésil/);
});

test('every column of the club list sorts, text columns first ascending',async()=>{
 const html=await render('tri=pays');
 // Each header also names its column, which sets its width whatever rows a sort brings.
 const headers=[...html.matchAll(/<th class="(\w+)-column"><button data-first="(\w+)"[^>]*data-sort="(\w+)"/g)].map(([,column,first,key])=>{assert.equal(column,key);return [key,first];});
 assert.deepEqual(headers,[['nom','asc'],['pays','asc'],['championnat','asc'],['reputation','desc'],['entrainement','desc'],['recrutement','desc'],['effectif','desc'],['niveau','desc'],['potentiel','desc'],['formation','asc']]);
 assert.match(html,/data-order="asc" data-sort="pays">PAYS</);
});
