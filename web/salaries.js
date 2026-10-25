// Contracts remain weekly in the simulation; the UI shows a monthly average.
const weeksPerYear=52;
// An amount is written in €, k€ or M€ (€ below 1 000, k€ below 1 000 000, M€ beyond), to `digits` significant figures, with
// a point as its decimal separator (docs/charte-graphique.md).
const figures=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3});
export function amount(value,digits=2){
 for(const [divisor,unit] of [[1,'€'],[1e3,'k€'],[1e6,'M€']]){
  const rounded=Number(((value??0)/divisor).toPrecision(digits));
  if(Math.abs(rounded)<1000||unit==='M€')return `${figures.format(rounded).replace(',','.')}\u00a0${unit}`;
 }
}

// A wage has two significant figures; a margin under a cap is rounded down (`Math.floor`), so that a wage shown under it fits.
export function roundSalary(value,round=Math.round){
 if(!value)return 0;
 const step=10**Math.max(0,Math.floor(Math.log10(Math.abs(value)))-1);
 return round(value/step)*step;
}

export const monthlyAmount=(weekly,round)=>roundSalary((weekly??0)*weeksPerYear/12,round);
// A wage is always shown per month: no screen says so again.
export const monthlySalary=weekly=>amount(monthlyAmount(weekly));
// What is left under a wage cap, per month and rounded down.
export const monthlyMargin=weekly=>amount(monthlyAmount(weekly,Math.floor));

// A transfer amount (a value, a fee, an asking price, a budget) has two figures, and halves of the second from a first
// figure of 5 (1.1 M€, 4.9 M€, 5.5 M€, 9.5 M€, 10 M€): a step stays between 2 and 10 % of it (docs/charte-graphique.md),
// as the server rounds it (`core.world.market.fee_step`).
export const feeStep=value=>{
 const digits=String(Math.trunc(Math.abs(value))),step=10**Math.max(0,digits.length-2);
 return digits.length>1&&digits[0]>='5'?step*5:step;
};
export function roundFee(value,round=Math.round){
 if(!value)return 0;
 const step=feeStep(value);
 return round(value/step)*step;
}
export const weeklyFromMonthly=monthly=>Math.round(monthly*12/weeksPerYear);
// What a weekly wage costs over a season, to the euro: what a budget is measured against.
export const yearlyAmount=weekly=>(weekly??0)*weeksPerYear;

export function salarySearchParams(params){
 const result=new URLSearchParams(params);
 // Keep the user's monthly inputs in the URL/form, convert only the API request.
 for(const [name,round] of [['salaire_min',Math.ceil],['salaire_max',Math.floor]]){
  const value=result.get(name);
  if(value!==null&&value!=='')result.set(name,String(round(Number(value)*12/weeksPerYear)));
 }
 // A wage demand is a round monthly amount, raised to the next weekly euro: so is its bound, to keep the players asking just that.
 const demand=result.get('pretentions_max');
 if(demand!==null&&demand!=='')result.set('pretentions_max',String(Math.ceil(Number(demand)*12/weeksPerYear)));
 // Niveau and potentiel are shown on a 1–200 scale in the UI; the API works on the underlying 1–100 rating.
 for(const name of ['niveau_min','niveau_max','potentiel_min','potentiel_max']){
  const level=result.get(name);
  if(level!==null&&level!=='')result.set(name,String(Number(level)/2));
 }
 // Values and the max asking price are typed in millions of euros; the API filters on full euros.
 for(const name of ['valeur_min','valeur_max','prix_max']){
  const amount=result.get(name);
  if(amount!==null&&amount!=='')result.set(name,String(Math.round(Number(amount)*1e6)));
 }
 return result;
}
