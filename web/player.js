import {monthlySalary} from './salaries.js';
import {api,escape as e,number as n,money,attributeScore,level,levelBadge,scoreBadge,scoreHue,date,season,clubLink,kitDot,nationFlag,position,initials,empty,card,fact,table,nationBadges} from './ui.js';

const ATTRIBUTES={passe:'Passe',technique:'Technique',finition:'Finition',tacle:'Tacle',jeu_tete:'Jeu de tête',vision:'Vision',placement:'Placement',sang_froid:'Sang-froid',vitesse:'Vitesse',endurance:'Endurance',reflexes:'Réflexes',sorties:'Sorties',relance:'Relance'};
// Position of each role on the pitch, in % of its width and height: goalkeeper at the bottom, striker at the top, as in match line-ups.
const PITCH={GB:[50,91],DC:[50,76],DL:[15,70],DR:[85,70],MDC:[50,60],MC:[50,47],MOC:[50,34],AILG:[15,22],AILD:[85,22],BU:[50,9]};

// Only the roles the player can actually fill are drawn; without any, there is no pitch at all.
const MIN_RATING=10;

export function positionPitch(ratings, main) {
 const roles=Object.entries(PITCH).filter(([role])=>ratings[role]>=MIN_RATING);
 if(!roles.length)return '';
 return `<div class="pitch ratings" role="group" aria-label="Aptitudes par poste">${roles.map(([role,[x,y]])=>`<span class="pitch-player ${role===main?'main':''}" style="left:${x}%;top:${y}%"><span class="shirt graded" style="--hue:${scoreHue(ratings[role])}" title="${role} : ${ratings[role]} / 20">${ratings[role]}</span><small>${role}</small></span>`).join('')}</div><p class="pitch-legend">Le contour indique le poste principal.</p>`;
}

// `points` run from the oldest season to the latest, each with the club played for (if known); ratings are stored out of 100 and shown out of 200.
// Text and dots are HTML so they keep the size of the rest of the interface; only the gridlines and the curve are stretched SVG.
export function levelChart(points) {
 const values=points.map(point=>level(point.rating));
 const low=Math.min(...values),high=Math.max(...values);
 const step=[5,10,20,25,50].find(size=>(high-low)/size<=5)??50;
 const min=Math.floor(low/step)*step;
 let max=Math.ceil(high/step)*step;if(max===min)max+=step;
 const across=index=>(index*100/(points.length-1)).toFixed(2);
 const down=value=>((max-value)*100/(max-min)).toFixed(2);
 const ticks=[];for(let value=min;value<=max;value+=step)ticks.push(value);
 const every=Math.ceil(points.length/6);
 const lines=`<svg class="plot-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${ticks.map(value=>`<line class="grid-line" x1="0" x2="100" y1="${down(value)}" y2="${down(value)}" vector-effect="non-scaling-stroke"/>`).join('')}<polyline class="curve" points="${values.map((value,index)=>`${across(index)},${down(value)}`).join(' ')}" vector-effect="non-scaling-stroke"/></svg>`;
 const axis=ticks.map(value=>`<span class="y-tick" style="top:${down(value)}%">${value}</span>`).join('');
 const marks=points.map((point,index)=>{
  const at=`left:${across(index)}%;top:${down(values[index])}%`,edge=index===0?'first':index===points.length-1?'last':'';
  const label=`${season(point.season)}${point.club?` · ${point.club.name}`:''} · niveau ${values[index]}`;
  return `<span class="chart-point" style="${at}" title="${e(label)}">${kitDot(point.club)||'<i class="kit-dot neutral" aria-hidden="true"></i>'}</span>${edge?`<span class="point-value ${edge}" style="${at}">${values[index]}</span>`:''}${index%every===0?`<span class="x-tick" style="left:${across(index)}%">${point.season}</span>`:''}`;
 }).join('');
 return `<div class="level-chart" role="img" aria-label="Évolution annuelle du niveau, sur 200"><div class="plot">${lines}${axis}${marks}</div></div>`;
}

function header(player) {
 const identity=`<div class="identity"><div class="avatar">${initials(player.name)}</div><div><span class="eyebrow">${player.retired?'CARRIÈRE ARCHIVÉE':nationBadges(player.nationalities,{full:true})}</span><h1>${e(player.name)}</h1><p>${player.retired?'Retraité':`${position(player.position)}<span class="secondary-positions" title="Postes secondaires">${player.secondary_positions.map(position).join('')}</span> ${player.age} ans · ${clubLink(player.club)}`}</p></div></div>`;
 if(player.retired)return `<div class="page-heading player-heading">${identity}</div>`;
 const facts=[['Né le',date(player.born)],['Salaire mensuel',player.contract_end?monthlySalary(player.wage):'—'],['Fin du contrat',date(player.contract_end)],['Valeur de marché',money(player.value)]];
 return `<div class="page-heading player-heading">${identity}<dl class="player-facts">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></div>`;
}

function profile(player, chart, career) {
 const levels=`<div class="level-summary"><span>Niv. ${levelBadge(player.rating,'Niveau actuel sur 200')}</span><span>Pot. ${levelBadge(player.potential,'Potentiel sur 200')}</span></div>`;
 const attributes=card('Attributs',`<div class="card-body"><div class="attributes-grid">${Object.entries(player.attributes).map(([key,value])=>`<div class="attribute"><span>${ATTRIBUTES[key]}</span>${scoreBadge(attributeScore(value))}</div>`).join('')}</div></div>`,levels);
 const pitch=positionPitch(player.position_ratings||{},player.position);
 const positions=pitch?card('Aptitudes par poste',pitch):'';
 const state=card('État du joueur',`<div class="card-body">${fact('Condition',`${Math.round(player.fitness*100)}%`)}<div class="meter"><span style="width:${player.fitness*100}%"></span></div>${fact('Forme',n(player.form))}${fact('Moral',`${Math.round(player.morale*100)}%`)}${fact('Blessure',player.injured_until?`<span class="danger">Retour le ${date(player.injured_until)}</span>`:'Disponible')}${player.discipline.map(item=>fact(item.competition,`${item.yellows} CJ · ${item.suspended_matches} match(s) de suspension`)).join('')}</div>`);
 // Without any pitch to show, the state takes its place in the top row and the career stands alone below.
 return `<div class="grid thirds">${attributes}${positions||state}${chart}</div>${positions?`<div class="grid state-career">${state}${career}</div>`:career}`;
}

export async function playerScreen(id) {
 const [player,history]=await Promise.all([api(`/joueurs/${id}`),api(`/joueurs/${id}/historique`)]);
 // The latest club of each season: career rows are listed newest first.
 const clubs=new Map();for(const row of history.career.items)if(!clubs.has(row.season))clubs.set(row.season,row.club);
 const points=[...history.trajectory.items].reverse().map(point=>({...point,club:clubs.get(point.season)}));
 const chart=card('Évolution du niveau',points.length>1?`<div class="card-body fill">${levelChart(points)}</div>`:empty('La courbe se complète au bilan de chaque saison.'),'<span class="muted">Niveau sur 200</span>');
 const totals=history.career.totals;
 const footer=['Total','',totals.fee?money(totals.fee):'—','',`${n(totals.matches)}`,`${n(totals.goals)}`,`${n(totals.assists)}`,totals.average?n(totals.average):'—'];
 const career=card('La carrière',table(['SAISON','CLUB','TRANSFERT','COMPÉTITION','MATCHS','BUTS','PASSES','NOTE'],history.career.items.map(row=>[season(row.season),clubLink(row.club),row.fee?money(row.fee):'—',`<span class="competition">${nationFlag(row.competition_nation)}${e(row.competition||'Marché extérieur')}</span>`,row.matches,row.goals,row.assists,row.average?n(row.average):'—']),footer));
 return header(player)+(player.retired?chart+career:profile(player,chart,career));
}
