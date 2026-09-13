// Contracts remain weekly in the simulation; the UI shows a monthly average.
const weeksPerYear=52;
const currency=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});

export function roundSalary(value){
 if(!value)return 0;
 const step=10**Math.max(0,Math.floor(Math.log10(Math.abs(value)))-1);
 return Math.round(value/step)*step;
}

export const monthlySalary=weekly=>currency.format(roundSalary((weekly??0)*weeksPerYear/12));

export function salarySearchParams(params){
 const result=new URLSearchParams(params);
 // Keep the user's monthly inputs in the URL/form, convert only the API request.
 for(const [name,round] of [['salaire_min',Math.ceil],['salaire_max',Math.floor]]){
  const value=result.get(name);
  if(value!==null&&value!=='')result.set(name,String(round(Number(value)*12/weeksPerYear)));
 }
 return result;
}
