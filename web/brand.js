// Shop branding. One codebase, one brand per install:
//  - Android: each app flavor ships brand-id.js setting window.BRAND_ID before this file.
//  - Web: picked by the site's host name (grand-price-check.netlify.app → grand), or ?brand=grand once (remembered).
(function(root){
  const BRANDS={
    yamie:{
      id:'yamie',name:'Yamie',full:'Yamie Fine Jewellery',app:'Yamie Price Check',short:'Price Check',
      site:'https://yamie-price-check.netlify.app',
      manifest:'manifest.webmanifest',icon:'icons/icon-192.png',touch:'icons/icon-180.png',
      theme:'#8F171B',
      light:{'--maroon':'#8F171B','--band':'#6E1115','--gold':'#B8862B'},
      dark:{'--maroon':'#D0575B','--band':'#4A0D10','--gold':'#D9A94E'},
      tableName:'Yamie',
      categories:{STD:'Stud',FRG:'Ring',NLC:'Necklace',PND:'Pendant',BGL:'Bangle',BRC:'Bracelet',NSP:'Nosepin',DIA:'Diamond',LDJ:'CVD',FIN:'Findings',CHN:'Chain',RST:'Jewelry set',MMP:'Platinum'},
      table:'yamie'
    },
    grand:{
      id:'grand',name:'Grand',full:'Grand Jewellers',app:'Grand Price Check',short:'Grand Price',
      site:'https://grand-price-check.netlify.app',
      manifest:'manifest-grand.webmanifest',icon:'icons/grand-192.png',touch:'icons/grand-180.png',
      theme:'#8C0D24',
      light:{'--maroon':'#C41230','--band':'#8C0D24','--gold':'#B08A4E','--bg':'#FBF8F2','--sunk':'#F1EAE0','--fg':'#17130F'},
      dark:{'--maroon':'#E2475F','--band':'#5C0817','--gold':'#D9C39A'},
      tableName:'starting',
      categories:{CHN:'Chain',FRG:'Ring',BGL:'Bangle',BRC:'Bracelet',PND:'Pendant',NLC:'Necklace',RST:'Jewellery set',STD:'Stud',NSP:'Nosepin',DIA:'Diamond',LDJ:'CVD',FIN:'Findings',MMP:'Platinum'},
      table:'empty'
    }
  };
  let id=root.BRAND_ID;
  if(!id){
    try{const q=new URLSearchParams(location.search).get('brand');if(q&&BRANDS[q]){localStorage.setItem('ypc_brand',q);id=q}}catch(e){}
    if(!id&&/^grand/i.test(location.hostname))id='grand';
    if(!id){try{id=localStorage.getItem('ypc_brand')}catch(e){}}
  }
  const B=BRANDS[id]||BRANDS.yamie;
  root.BRAND=B;root.BRANDS=BRANDS;
  root.YAMIE_CATEGORIES=Object.assign({},B.categories);
  if(typeof document==='undefined')return;
  // Head: title, theme colour, manifest and icons
  document.title=B.app;
  const set=(sel,attr,val)=>{const el=document.querySelector(sel);if(el)el.setAttribute(attr,val)};
  set('meta[name=theme-color]','content',B.theme);
  set('link[rel=manifest]','href',B.manifest);
  set('link[rel=icon]','href',B.icon);
  set('link[rel=apple-touch-icon]','href',B.touch);
  set('meta[name=apple-mobile-web-app-title]','content',B.short);
  // Colours: override the default tokens (light, system dark, forced dark)
  const v=o=>Object.entries(o).map(([k,x])=>`${k}:${x}`).join(';');
  const css=`:root{${v(B.light)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${v(Object.assign({'--bg':'#171112','--sunk':'#2B2021','--fg':'#F2E8E2'},B.dark))}}}:root[data-theme="dark"]{${v(Object.assign({'--bg':'#171112','--sunk':'#2B2021','--fg':'#F2E8E2'},B.dark))}}`;
  const st=document.createElement('style');st.id='brandCss';st.textContent=css;document.head.appendChild(st);
  document.documentElement.dataset.brand=B.id;
})(typeof window!=='undefined'?window:globalThis);
