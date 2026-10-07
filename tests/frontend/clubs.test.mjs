import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubsScreen} from '../../web/screens.js';
import {setNations} from '../../web/ui.js';

const leagues=[{id:32,name:'Serie A',nation:'ITA',kind:'league',level:1},{id:17,name:'Ligue 2',nation:'FRA',kind:'league',level:2},{id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1},{id:-3,name:'Coupe de France',nation:'FRA',kind:'cup',level:0},{id:-9,name:'Ligue des champions',nation:'EUR',kind:'europe',level:0}];
const club={id:1,name:'Juventus',nation_code:'ITA',competition:'Serie A',reputation:80,training_facilities:18,youth_recruitment:null,squad_size:30,top_rating:70,top_potential:75,formation:'4-4-2'};

async function render(query,items=[club]){
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>({items,total:items.length,page:1,page_size:30,nations:['ARG','BRA','FRA','ITA','USA']})};};
 try{return {html:await clubsScreen(new URLSearchParams(query),leagues),asked};}finally{globalThis.fetch=previous;}
}

test('the country filter lists the playable countries first, then the others by name',async()=>{
 setNations({ARG:{name:'Argentine'},BRA:{name:'Brésil'},FRA:{name:'France'},ITA:{name:'Italie'},USA:{name:'États-Unis'}});
 const {html}=await render('pays=BRA');
 const select=html.match(/<select name="pays".*?<\/select>/s)[0];
 assert.deepEqual([...select.matchAll(/<option value="(\w*)"/g)].map(match=>match[1]),['','FRA','ITA','ARG','BRA','USA']);
 assert.match(select,/Italie<\/option><hr><option value="ARG"/);
 assert.match(select,/<option value="BRA" selected>Brésil/);
});

test('every column of the club list sorts, names and ranks first ascending',async()=>{
 const {html}=await render('tri=pays');
 // Each header also names its column, which sets its width whatever rows a sort brings.
 const headers=[...html.matchAll(/<th class="(\w+)-column"><button data-first="(\w+)"[^>]*data-sort="(\w+)"/g)].map(([,column,first,key])=>{assert.equal(column,key);return [key,first];});
 assert.deepEqual(headers,[['nom','asc'],['pays','asc'],['championnat','asc'],['classement','asc'],['forme','desc'],['reputation','desc'],['entrainement','desc'],['recrutement','desc'],['effectif','desc'],['age','desc'],['niveau','desc'],['potentiel','desc'],['valeur','desc'],['budget','desc'],['masse_salariale','desc']]);
 assert.match(html,/data-order="asc" data-sort="pays">PAYS</);
 // The row number has no sort; a short heading spells its column out in a tooltip.
 assert.match(html,/<th class="rang-column">#<\/th>/);
 assert.match(html,/data-sort="masse_salariale"><span title="Masse salariale par mois, et la part du plafond utilisée">MASSE SAL\.<\/span>/);
});

test('the title and the filters stand on one line: playable countries as chips, the league in a list, the status as a switch',async()=>{
 setNations({ARG:{name:'Argentine'},BRA:{name:'Brésil'},FRA:{name:'France',flag:'fr'},ITA:{name:'Italie',flag:'it'},USA:{name:'États-Unis'}});
 const {html,asked}=await render('pays=ITA&statut=actif&competition=32&page=2&sel=9');
 assert.match(html,/^<form class="toolbar" data-filter><h1>Clubs<\/h1><input name="recherche" type="search"/);
 assert.deepEqual([...html.matchAll(/<a class="chip nation-chip( on)?" href="([^"]*)"/g)].map(match=>[match[1]??'',match[2].replaceAll('&amp;','&')]),
  [['','#/clubs?pays=FRA&statut=actif&competition=32'],[' on','#/clubs?statut=actif&competition=32']]);
 // Leagues only, each country's from its top division down, in the order of the menu.
 assert.match(html,/<select name="competition" aria-label="Championnat" class="on"><option value="">Championnat<\/option><option value="16" >Ligue 1<\/option><option value="17" >Ligue 2<\/option><option value="32" selected>Serie A<\/option><\/select>/);
 assert.match(html,/<a class="active" href="#\/clubs\?pays=ITA&amp;statut=actif&amp;competition=32" aria-current="true">Actifs<\/a>/);
 assert.match(html,/<input type="hidden" name="statut" value="actif">/);
 // The row picked for the preview is not asked of the server, and without a window the server keeps its page size.
 assert.equal(asked.length,1);assert.match(asked[0],/page=2/);assert.doesNotMatch(asked[0],/sel=|taille/);
 assert.doesNotMatch(html,/data-select|class="side"/);
});

test('a club row tells its rank and form, its squad and its money',async()=>{
 const rows=[{...club,standing:{rank:1,movement:'champion',form:'VVNDV',points:80},average_age:27.4,squad_value:5.2e8,available_budget:9.1e7,wage_bill:1900000,wage_cap:2000000},
  {...club,id:2,name:'Dormant',competition:null,standing:null,average_age:null,squad_value:0,available_budget:0,wage_bill:0,wage_cap:0}];
 const {html}=await render('',rows);
 const cells=[...html.matchAll(/<tr class="">(.*?)<\/tr>/g)].map(row=>[...row[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1]));
 assert.equal(cells.length,2);
 const [first,second]=cells;
 assert.equal(first[0],'<span class="num">1</span>');
 assert.match(first[4],/<span class="strong">1er<\/span> <span class="movement-icon promotion" title="Champion">★<\/span>/);
 assert.match(first[5],/<span class="form"><i class="V">V<\/i><i class="V">V<\/i><i class="N">N<\/i>/);
 assert.match(first[6],/<i style="width:80%"><\/i><\/i><b>80<\/b>/);
 assert.match(first[7],/title="Entraînement sur 20">18</);assert.equal(first[8],'—');
 assert.equal(first[10],'<span class="num">27.4</span>');
 assert.match(first[13],/520\sM€/);assert.match(first[14],/91\sM€/);
 // The wage bill reads by the month; its bar fills with the share of the cap and turns red from 95 %.
 assert.match(first[15],/<i class="mini-bar full" aria-hidden="true"><i style="width:95%"><\/i><\/i><b>8\.2\sM€<\/b>/);
 assert.match(second[3],/Marché extérieur/);assert.deepEqual([second[4],second[5]],['—','—']);
 assert.equal(second[10],'<span class="num">—</span>');assert.equal(second[13],'<span class="num">—</span>');assert.equal(second[15],'<span class="num">—</span>');
 assert.doesNotMatch(html,/NaN|undefined|null/);
});
