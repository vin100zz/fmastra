import {api,date,heading,card,table,pager,playerLink,clubLink,money,playerTable} from './ui.js';
import {seasonNavigation} from './club-history.js';

export async function worldHistoryScreen(section,params){
 const type=['transfer','retirement','academy'].includes(section)?section:'transfer';
 const request=new URLSearchParams(params);request.set('type',type);
 const data=await api(`/monde/transferts?${request}`);
 const labels={transfer:'Transferts',retirement:'Retraites',academy:'Promotions des centres'};
 const nav=`<nav class="tabs" aria-label="Types de mouvements">${Object.entries(labels).map(([key,label])=>`<a class="${key===type?'active':''}" href="#/transfers/${key}?saison=${data.season}">${label}</a>`).join('')}</nav>`;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les motifs de départ et promotions antérieurs au ${date(data.history_since)} peuvent manquer dans cette ancienne sauvegarde.</div>`:'';
 const academy=type==='academy'?playerTable({...data,items:data.items.map(row=>({...row.details,promotion_date:row.date,academy_club:row.target}))},true,data.sort,data.order,{academy:true}):null;
 const columns=type==='transfer'?[['date','DATE'],['name','JOUEUR'],['source','PROVENANCE'],['target','DESTINATION'],['fee','MONTANT / MOTIF']]:[['date','DATE'],['name','JOUEUR'],['source','DERNIER CLUB']];
 const headers=columns.map(([key,label])=>`<button data-sort="${key}">${label} ${key===data.sort?(data.order==='desc'?'↓':'↑'):''}</button>`);
 const rows=data.items.map(row=>[date(row.date),playerLink(row.player_id,row.player),...(type==='transfer'?[clubLink(row.source),clubLink(row.target),row.kind==='release'?'Fin de contrat':row.kind==='departure_unknown'?'Motif non archivé':row.fee?money(row.fee):'Libre (0 €)']:[clubLink(type==='academy'?row.target:row.source)])]);
 return heading('LE MARCHÉ MONDIAL','Historique des mouvements','Tous les clubs, actifs et dormants, saison par saison.')+nav+seasonNavigation(data)+partial+(type==='academy'?'<p class="muted">Informations à la promotion lorsqu’elles sont archivées ; sinon, données actuelles du joueur. Le potentiel est une estimation.</p>':'')+card(`${labels[type]} · ${data.total}`,academy??(table(headers,rows)+pager(data)));
}
