import {escape as e,date,clubLink} from './ui.js';

// A tie is one match, or both legs of a two-legged round (the return leg points at the first through first_leg_id).
function ties(matches){
 const list=matches.filter(match=>match.first_leg_id==null).sort((a,b)=>a.id-b.id).map(match=>({clubs:[match.home,match.away],legs:[match]}));
 matches.filter(match=>match.first_leg_id!=null).forEach(match=>list.find(tie=>tie.legs[0].id===match.first_leg_id)?.legs.push(match));
 list.forEach(tie=>tie.winner=tie.legs.at(-1).winner_id??null);
 return list;
}

// Each drawn round is ordered after the next one, so that a tie sits beside the tie its winner went on to play.
// A `single` round (the European play-offs) feeds one side of each tie in the next round, the other side coming straight from the league phase.
function order(columns,stages,last){
 for(let index=last-1;index>=0;index--){
  const pool=[...columns[index]];
  const take=club=>{const found=pool.findIndex(tie=>tie.winner!=null&&tie.winner===club?.id);return found<0?null:pool.splice(found,1)[0];};
  const feeders=columns[index+1].flatMap(tie=>{const found=tie?tie.clubs.map(take):[null,null];return stages[index].single?[found.find(Boolean)||null]:found;});
  columns[index]=feeders.map(tie=>tie||pool.shift()||null).concat(pool);
 }
}

// The whole box opens the match (the return leg once played, as it carries the aggregate); a club's name opens the club, and in a
// two-legged tie each score opens its own leg.
function tieBox(tie){
 if(!tie)return '<div class="bracket-tie empty"></div>';
 const legs=tie.legs,twoLegs=legs.length>1,shootout=legs.some(leg=>leg.penalties);
 const main=legs.findLast(leg=>leg.score)||legs[0];
 const goals=(leg,club,values)=>values?values[leg.home?.id===club?.id?0:1]:null;
 const row=club=>{
  const scores=legs.map(leg=>twoLegs?`<a class="bracket-score" href="#/match/${leg.id}">${goals(leg,club,leg.score)??'–'}</a>`:`<span class="bracket-score">${goals(leg,club,leg.score)??'–'}</span>`);
  if(shootout){const leg=legs.find(item=>item.penalties);scores.push(`<span class="bracket-pens" title="Tirs au but">(${goals(leg,club,leg.penalties)})</span>`);}
  const state=tie.winner==null?'':tie.winner===club?.id?' winner':' beaten';
  return `<div class="bracket-team${state}"><span class="bracket-club">${clubLink(club)}</span>${scores.join('')}</div>`;
 };
 return `<div class="bracket-tie"><a class="bracket-match" href="#/match/${main.id}" aria-label="Voir le match"></a>${tie.clubs.map(row).join('')}</div>`;
}

// `stages` run from the first knockout round to the final: {label, date, matches, single}. Rounds not yet drawn show empty boxes;
// they are joined to the previous round only when the draw is `fixed` (the pairings are known in advance).
// With `sides`, the first half of each round runs left to right and the second half right to left, both ending at the final
// in the middle, so a cup of many ties keeps its height to half; a draw with a `single` round (the play-offs) stays one-sided.
export function bracket(stages,{fixed=false,sides=false}={}){
 const sizes=[];
 for(let index=stages.length-1;index>=0;index--)sizes[index]=index===stages.length-1?1:stages[index].single?sizes[index+1]:2*sizes[index+1];
 const columns=stages.map(stage=>ties(stage.matches));
 const last=columns.findLastIndex(column=>column.length);
 order(columns,stages,last);
 columns.forEach((column,index)=>{while(column.length<sizes[index])column.push(null);});
 const linked=index=>index<stages.length-1&&(fixed||index<last);
 const round=(index,list,extra='')=>{
  const stage=stages[index];
  const slots=list.map(tie=>`<div class="bracket-slot">${tieBox(tie)}</div>`);
  const paired=linked(index)&&!stage.single&&slots.length>1?Array.from({length:Math.ceil(slots.length/2)},(_,pair)=>`<div class="bracket-pair">${slots.slice(2*pair,2*pair+2).join('')}</div>`):slots;
  const classes=['bracket-round',linked(index)?'linked':'',index>0&&linked(index-1)?'fed':'',columns[index].some(tie=>tie?.legs.length>1)?'legs':'',extra].filter(Boolean).join(' ');
  return `<div class="${classes}"><div class="bracket-head"><strong>${e(stage.label)}</strong><span>${stage.date?date(stage.date):''}</span></div><div class="bracket-slots">${paired.join('')}</div></div>`;
 };
 if(sides&&stages.length>1&&!stages.some(stage=>stage.single)){
  const final=stages.length-1,half=(index,side)=>{const size=columns[index].length/2;return side?columns[index].slice(size):columns[index].slice(0,size);};
  const before=Array.from({length:final},(_,index)=>round(index,half(index,0)));
  const after=Array.from({length:final},(_,index)=>round(index,half(index,1),'mirror')).reverse();
  return `<section class="card"><div class="bracket sided">${before.join('')}${round(final,columns[final],'final')}${after.join('')}</div></section>`;
 }
 return `<section class="card"><div class="bracket">${stages.map((stage,index)=>round(index,columns[index])).join('')}</div></section>`;
}
