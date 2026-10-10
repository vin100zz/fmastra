import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listHref,positionChips,nationChips,choiceLinks,toggleLink,rangeMenu,choiceSelect,sidePanel,fittedRows,wideScreen} from '../../web/listing.js';
import {headPager,mainNation,setNations} from '../../web/ui.js';

const params=query=>new URLSearchParams(query);
// The addresses are written into attributes, escaped.
const hrefs=html=>[...html.matchAll(/href="([^"]*)"/g)].map(match=>match[1].replaceAll('&amp;','&'));

test('a filter link keeps the other filters and the view, and goes back to the first page without the picked row',()=>{
 assert.equal(listHref('#/players',params('poste=BU&tri=age&page=3&sel=12'),{age_max:23}),'#/players?poste=BU&amp;tri=age&amp;age_max=23');
 // An empty value takes the filter off; the query stays, even empty, so that the remembered filters are not restored.
 assert.equal(listHref('#/clubs',params('pays=FRA'),{pays:''}),'#/clubs?');
});

test('each position chip adds its position to the list or takes it off, in the order of the pitch',()=>{
 const html=positionChips('#/players',params('poste=MC,BU&tri=age'));
 assert.deepEqual([...html.matchAll(/<a class="chip (\w+)( on)?"/g)].map(match=>match[1]),['gk','def','def','def','mid','mid','mid','att','att','att']);
 assert.deepEqual([...html.matchAll(/class="chip \w+ on"[^>]*>(\w+)</g)].map(match=>match[1]),['MC','BU']);
 const links=Object.fromEntries([...html.matchAll(/href="([^"]*)"[^>]*>(\w+)</g)].map(match=>[match[2],decodeURIComponent(match[1].replaceAll('&amp;','&'))]));
 assert.equal(links.DC,'#/players?poste=DC,MC,BU&tri=age');
 assert.equal(links.MC,'#/players?poste=BU&tri=age');
 // The form carries the positions through a change of another filter.
 assert.match(html,/<input type="hidden" name="poste" value="MC,BU">/);
 assert.doesNotMatch(positionChips('#/players',params('')),/type="hidden"/);
});

test('a nation chip sets its country and the chosen one takes it off',()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ITA:{name:'Italie',display_code:'ITA',flag:'it'}});
 const html=nationChips('#/clubs',params('pays=ITA&statut=actif'),['FRA','ITA'],false);
 assert.deepEqual(hrefs(html),['#/clubs?pays=FRA&statut=actif','#/clubs?statut=actif']);
 assert.match(html,/class="chip nation-chip on"[^>]*aria-current="true"><span class="nation" title="Italie">/);
 assert.doesNotMatch(html,/type="hidden"/);
});

test('a choice among a few marks the current one, the first one standing for none',()=>{
 const html=choiceLinks('#/clubs',params('statut=dormant'),'statut',[['','Tous'],['actif','Actifs'],['dormant','Dormants']],'Statut');
 assert.deepEqual(hrefs(html),['#/clubs?','#/clubs?statut=actif','#/clubs?statut=dormant']);
 assert.match(html,/<a class="active" href="#\/clubs\?statut=dormant" aria-current="true">Dormants<\/a>/);
 assert.match(html,/<input type="hidden" name="statut" value="dormant">/);
 assert.match(choiceLinks('#/clubs',params(''),'statut',[['','Tous'],['actif','Actifs']],'Statut'),/<a class="active" href="#\/clubs\?" aria-current="true">Tous</);
 const toggle=toggleLink('#/transfers/transfer',params('club=7'),'club',7,'Mon club');
 assert.match(toggle,/class="chip toggle on" href="#\/transfers\/transfer\?"/);
 assert.match(toggleLink('#/transfers/transfer',params(''),'club',7,'Mon club'),/class="chip toggle" href="#\/transfers\/transfer\?club=7"/);
});

test('a range folded in a menu reads its bounds on its button, with a cross taking them off',()=>{
 const fields=[['age_min','min','min="0" max="100"'],['age_max','max','min="0" max="100"']];
 const presets=[['≤ 23',{age_max:23}],['24–28',{age_min:24,age_max:28}]];
 const closed=rangeMenu('#/players',params('poste=BU'),'Âge',fields,{presets});
 assert.match(closed,/<details class="filter-menu"><summary>Âge<\/summary>/);
 assert.match(closed,/<label>Min\. <input name="age_min" type="number" min="0" max="100" value=""><\/label><label>Max\. <input name="age_max" type="number" min="0" max="100" value=""><\/label>/);
 assert.deepEqual(hrefs(closed),['#/players?poste=BU&age_max=23','#/players?poste=BU&age_min=24&age_max=28']);
 const reading=(query,unit='')=>rangeMenu('#/players',params(query),'Âge',fields,{unit,presets}).match(/<b>([^<]*)<\/b>/)[1];
 assert.equal(reading('age_max=23'),'≤ 23');assert.equal(reading('age_min=18'),'≥ 18');assert.equal(reading('age_min=24&age_max=28'),'24–28');
 const set=rangeMenu('#/players',params('age_min=24&age_max=28&poste=BU'),'Âge',fields,{presets});
 assert.match(set,/<details class="filter-menu on">/);
 assert.match(set,/<a class="clear" href="#\/players\?poste=BU" aria-label="Retirer le filtre Âge"/);
 assert.match(set,/<a class="on" href="[^"]*">24–28<\/a>/);assert.match(set,/<a class="" href="#\/players\?age_max=23&amp;poste=BU">≤ 23<\/a>/);
 // One bound, a unit and what the field is typed in.
 const fee=rangeMenu('#/players',params('prix_max=50'),'Prix min.',[['prix_max','max','min="0" step="any"']],{unit:'M€',hint:'M€'});
 assert.match(fee,/<summary>Prix min\. <b>≤ 50 M€<\/b>/);assert.match(fee,/<label>Max\. \(M€\) <input name="prix_max"/);
});

test('a list of the form is marked when it filters',()=>{
 assert.match(choiceSelect(params('contrat=libre'),'contrat','Contrat',[['libre','Agents libres'],['sous_contrat','Sous contrat']]),/<select name="contrat" aria-label="Contrat" class="on"><option value="">Contrat<\/option><option value="libre" selected>Agents libres<\/option>/);
 assert.doesNotMatch(choiceSelect(params(''),'contrat','Contrat',[['libre','Agents libres']]),/class="on"|selected/);
});

test('outside a browser a list keeps the server’s page size and has no side panel',()=>{
 assert.equal(fittedRows('players',155),null);
 assert.equal(wideScreen(),false);
 assert.equal(sidePanel('player','<p></p>'),'<aside class="side" data-preview="player"><div class="side-inner"><p></p></div></aside>');
 assert.doesNotMatch(sidePanel('','x'),/data-preview/);
});

test('the pages of a list step from the head of its card, and a single page shows none',()=>{
 const html=headPager({page:2,page_size:35,total:59});
 assert.match(html,/<span>36–59 sur 59<\/span>/);
 assert.match(html,/data-page="1" aria-label="Page précédente" >/);assert.match(html,/data-page="3" aria-label="Page suivante" disabled>/);
 assert.match(headPager({page:1,page_size:35,total:59}),/data-page="0" aria-label="Page précédente" disabled>/);
 assert.equal(headPager({page:1,page_size:35,total:35}),'');
});

test('a list names the main nation alone: his selection, else his first nationality',()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'},MAR:{name:'Maroc',display_code:'MAR',flag:'ma'}});
 assert.match(mainNation({nationalities:['FRA','ESP','MAR']}),/^<span class="nation" title="France"><img class="flag" src="\/flags\/fr\.svg"[^>]*>FRA<\/span>$/);
 assert.match(mainNation({nationalities:['FRA','ESP','MAR'],national_team:'MAR'}),/^<span class="nation" title="Maroc"><img class="flag" src="\/flags\/ma\.svg"[^>]*>MAR<\/span>$/);
 assert.equal(mainNation({nationalities:[]}),'—');
});
