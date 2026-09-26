// Contracts remain weekly in the simulation; the UI shows a monthly average.
const weeksPerYear=52;
const currency=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});

export function roundSalary(value){
 if(!value)return 0;
 const step=10**Math.max(0,Math.floor(Math.log10(Math.abs(value)))-1);
 return Math.round(value/step)*step;
}

export const monthlyAmount=weekly=>roundSalary((weekly??0)*weeksPerYear/12);
export const monthlySalary=weekly=>currency.format(monthlyAmount(weekly));
export const weeklyFromMonthly=monthly=>Math.round(monthly*12/weeksPerYear);

export function salarySearchParams(params){
 const result=new URLSearchParams(params);
 // Keep the user's monthly inputs in the URL/form, convert only the API request.
 for(const [name,round] of [['salaire_min',Math.ceil],['salaire_max',Math.floor]]){
  const value=result.get(name);
  if(value!==null&&value!=='')result.set(name,String(round(Number(value)*12/weeksPerYear)));
 }
 // Niveau is shown on a 1–200 scale in the UI; the API works on the underlying 1–100 rating.
 const niveau=result.get('niveau_min');
 if(niveau!==null&&niveau!=='')result.set('niveau_min',String(Number(niveau)/2));
 // Max value is typed in millions of euros; the API filters on full euros.
 const valeur=result.get('valeur_max');
 if(valeur!==null&&valeur!=='')result.set('valeur_max',String(Math.round(Number(valeur)*1e6)));
 return result;
}
