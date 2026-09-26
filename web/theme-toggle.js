// Dark or light theme: applied before the first paint (a classic script in <head>), remembered between visits.
(function(){
 const KEY='touchline-theme',root=document.documentElement;
 const read=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
 const apply=theme=>{
  root.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#ffffff':'#0a0d11');
  const button=document.querySelector('#theme-toggle');
  if(button){const label=theme==='light'?'Passer au thème sombre':'Passer au thème clair';button.setAttribute('aria-label',label);button.title=label;}
 };
 apply(read()==='light'?'light':'dark');
 document.addEventListener('DOMContentLoaded',()=>{
  apply(root.dataset.theme);
  document.querySelector('#theme-toggle')?.addEventListener('click',()=>{
   const next=root.dataset.theme==='light'?'dark':'light';
   apply(next);
   try{localStorage.setItem(KEY,next);}catch{}
  });
 });
})();
