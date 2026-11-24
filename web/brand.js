// Shop branding. One codebase, one brand per install:
//  - Android: each app flavor ships brand-id.js setting window.BRAND_ID before this file.
//  - Web: picked by the site's host name (grand-price-check.netlify.app → grand), or ?brand=grand once (remembered).
(function(root){
  const BRANDS={
    yamie:{
      id:'yamie',name:'Yamie',full:'Yamie Fine Jewellery',wm:'YAMIE',wsub:'FINE JEWELLERY',app:'Yamie Price Check',short:'Price Check',
      site:'https://yamie-price-check.netlify.app',
      orderDesk:'https://yamie-order-desk.netlify.app',
      manifest:'manifest.webmanifest',icon:'icons/icon-192.png',touch:'icons/icon-180.png',
      theme:'#491525',
      logoHeader:'brand/yamie/header-w.png',logoLogin:'brand/yamie/logo-cream.png',mark:'brand/yamie/mark-w.png',tagline:'Legacy 1986',erp:'Yamie ERP',
      address:['YAMIE FINE JEWELLERY','63/322 Aa, Level G','Grand Business Center','K K Road, Kadavanthra','Kochi, Kerala - 682020','Contact: +91 8714122750','Website: www.yamie.in','GSTIN 32AACFY4685K1ZR'],
      // Quote image and WhatsApp text: firm name, then the address in 2 lines
      addr2:['63/322 Aa, Level G, Grand Business Center, K K Road, Kadavanthra, Kochi, Kerala - 682020','Contact: +91 8714122750 · www.yamie.in · GSTIN 32AACFY4685K1ZR'],
      logoHeaderColor:'brand/yamie/header-red.png',markColor:'brand/yamie/mark-red.png',appIcon:'brand/yamie/app-icon.png',
      // Yamie primary palette (Nov 2026): Signature Burgundy, Rose Gold, Signature Nude, Cashmere Silk, Porcelain Ivory; SF Pro
      light:{'--maroon':'#702438','--band':'#491525','--gold':'#C99583','--acc':'#C99583','--acc-ink':'#491525',
        '--bg':'#FAF7F3','--surface':'#FFFFFF','--sunk':'#F2E4DB','--fg':'#1D1D1F','--muted':'#795B4D','--line':'#EADCD2',
        '--nude':'#D6B29E','--cashmere':'#F2E4DB',
        '--grad':'linear-gradient(135deg,#491525,#702438,#A65369)','--grad-hd':'linear-gradient(110deg,#491525 0%,#702438 58%,#A65369 100%)',
        '--grad-top':'linear-gradient(100deg,#3B101E 0%,#5A1B2D 45%,#702438 100%)','--grad-scan':'linear-gradient(100deg,#5A1B2D,#702438 60%,#8E3A52)',
        '--grad-fin':'linear-gradient(100deg,#491525,#702438 60%,#A65369)','--scan-or':'#702438','--tint':'#F2E4DB',
        '--grad-login':'radial-gradient(120% 70% at 85% 0%,#A65369 0%,transparent 55%),linear-gradient(170deg,#702438 0%,#491525 55%,#3A1020 100%)',
        '--body':'-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,system-ui,sans-serif',
        '--display':'-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,system-ui,sans-serif'},
      dark:{'--maroon':'#D98CA0','--band':'#3A1020','--gold':'#D6B29E','--acc':'#D6B29E','--acc-ink':'#2A0E18','--muted':'#BFA79B',
        '--grad':'linear-gradient(135deg,#3A1020,#702438,#A65369)','--grad-hd':'linear-gradient(110deg,#3A1020 0%,#5A1C2D 60%,#7E3A4D 100%)'},
      tableName:'Yamie',
      categories:{BGL:'Bangle',BRC:'Bracelet',CHN:'Chain',RST:'Designer Set',DIA:'Diamond Ornament',FIN:'Hooks & Findings',NLC:'Necklace',NSP:'Nosepins (18K)',FRG:'Ring',STD:'Stud',PND:'Pendant',LDJ:'CVD',MMP:'Platinum',EXT:'Loose Findings'},
      table:'yamie',
      rates:['22k','18k','14k','9k']
    },
    grand:{
      id:'grand',name:'Grand',full:'Grand Jewellers',erp:'Acme',wm:'GRAND',wsub:'JEWELLERS',app:'Grand Price Check',short:'Grand Price',
      site:'https://grand-price-check.netlify.app',
      manifest:'manifest-grand.webmanifest',icon:'icons/grand-192.png',appIcon:'icons/grand-192.png',touch:'icons/grand-180.png',
      theme:'#8C0D24',
      light:{'--maroon':'#C41230','--band':'#8C0D24','--gold':'#B08A4E','--bg':'#FBF8F2','--sunk':'#F1EAE0','--fg':'#17130F'},
      dark:{'--maroon':'#E2475F','--band':'#5C0817','--gold':'#D9C39A'},
      tableName:'starting',
      categories:{BGL:'Bangle',BRS:'Birthstone Ring',BCL:'Bracelet',CHN:'Chain',DSS:'Designer Set',DIA:'Diamond Ornament',ACC:'Hooks & Findings',LKT:'Locket',JWL:'Navaratna Ring',NCL:'Necklace',NSP:'Nosepin',RNG:'Ring',STD:'Stud',TLY:'Thali',EXT:'Loose Findings'},
      table:'empty',
      rates:['22k','18k','14k','9k']   // purities shown by default (admins can change in Admin settings → Rates shown)
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
  if(B.mark)document.documentElement.style.setProperty('--mark',`url("${B.mark}")`);
})(typeof window!=='undefined'?window:globalThis);
