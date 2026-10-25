/* Yamie Price Check — reads jewellery tag text (from OCR) into fields. */
(function(root){
  if(!root.YAMIE_CATEGORIES)root.YAMIE_CATEGORIES={STD:'Stud',FRG:'Ring',NLC:'Necklace',PND:'Pendant',BGL:'Bangle',BRC:'Bracelet',NSP:'Nosepin',DIA:'Diamond',LDJ:'CVD',FIN:'Findings',CHN:'Chain',RST:'Jewelry set',MMP:'Platinum'};
  // OCR often swaps letters and digits inside numbers
  function fixDigits(s){return s.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/[Ss]/g,'5').replace(/B/g,'8').replace(/,/g,'.')}
  const NUM='([0-9OoIlSB]{1,4}[.,][0-9OoIlSB]{1,4}|[0-9]{1,4})';
  function toNum(s){if(s==null)return null;const v=parseFloat(fixDigits(String(s)));return isNaN(v)?null:v}
  function find(text,re){const m=text.match(re);return m||null}

  function parseTag(raw){
    const out={sku:null,item:null,purity:null,gw:null,nw:null,sw:null,swUnit:'ct',stoneVal:null,mk:null,mkType:'pct',tagPrice:null,huid:null,huids:[],found:[]};
    if(!raw)return out;
    let t=String(raw).replace(/\r/g,'').replace(/[“”"]/g,'').replace(/[ \t]+/g,' ');
    const U=t.toUpperCase();

    // Purity
    const P=[
      [/\b(22\s?K(T|ARAT)?|916|22\s?CT)\b/,'22k'],[/\b(18\s?K(T|ARAT)?|750|18\s?CT)\b/,'18k'],
      [/\b(14\s?K(T|ARAT)?|585|14\s?CT)\b/,'14k'],[/\b(9\s?K(T|ARAT)?|375|9\s?CT)\b/,'9k'],
      [/\b(PT\s?-?950|PT\s?-?900|PLAT(INUM)?|950\s?PT)\b/,'platinum'],[/\b(925|SILVER|SLV|STERLING)\b/,'silver']];
    for(const [re,v] of P){if(re.test(U)){out.purity=v;out.found.push('purity');break}}

    // Labelled weights
    const gwM=find(U,new RegExp('\\b(?:G\\.?\\s?W(?:T|GT)?|GR(?:OSS)?\\.?\\s?W(?:T|GT|EIGHT)?|GROSS|G\\.WT|GWT)\\.?\\s*[:=\\-]?\\s*'+NUM));
    if(gwM){out.gw=toNum(gwM[1]);out.found.push('gross')}
    const nwM=find(U,new RegExp('\\b(?:N\\.?\\s?W(?:T|GT)?|NET\\.?\\s?W(?:T|GT|EIGHT)?|NET|N\\.WT|NWT)\\.?\\s*[:=\\-]?\\s*'+NUM));
    if(nwM){out.nw=toNum(nwM[1]);out.found.push('net')}

    // Diamond / stone weight
    const swM=find(U,new RegExp('\\b(?:DIA(?:MOND)?\\.?\\s?(?:W(?:T|GT)?)?|D\\.?\\s?W(?:T|GT)|DWT|ST(?:ONE)?\\.?\\s?W(?:T|GT)?|STN|CTS?\\.?\\s?W(?:T)?)\\.?\\s*[:=\\-]?\\s*'+NUM+'\\s*(CTS?|CARAT|G(?:MS?|RAMS?)?)?\\b'));
    if(swM){out.sw=toNum(swM[1]);if(swM[2]&&/^G/.test(swM[2]))out.swUnit='g';out.found.push('stone')}
    else{const ct=find(U,new RegExp(NUM+'\\s*(?:CTS?|CARAT)\\b'));if(ct&&!/K/.test(ct[0])){out.sw=toNum(ct[1]);out.found.push('stone')}}

    // Stone value in rupees
    const svM=find(U,/\b(?:DIA(?:MOND)?|ST(?:ONE)?|STN)\.?\s?(?:VALUE|VAL|AMT|AMOUNT|RS|PRICE)\.?\s*[:=\-]?\s*(?:RS\.?|₹|INR)?\s*([0-9][0-9,]{2,})/);
    if(svM){out.stoneVal=toNum(svM[1].replace(/,/g,''));out.found.push('stone value')}

    // Making / VA
    const mkM=find(U,/\b(?:MC|M\.C|VA|V\.A|MAKING|MKG|MAK|WASTAGE|WST|LABOU?R)\.?\s*(?:CHARGES?|CHG)?\.?\s*[:=\-]?\s*(?:RS\.?|₹)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(%|\/\s?G(?:M|RAM)?|PER\s?G(?:M|RAM)?|PG)?/);
    if(mkM){
      out.mk=toNum(mkM[1]);
      if(mkM[2]&&mkM[2]!=='%')out.mkType='pg';
      else if(!mkM[2]&&out.mk>100)out.mkType=out.mk>3000?'flat':'pg';
      out.found.push('making');
    }

    // Printed price
    const prM=find(U,/\b(?:MRP|PRICE|TOTAL|AMT|AMOUNT|RS|INR)\.?\s*[:=\-]?\s*(?:RS\.?|₹|INR)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{4,7})(?:\.[0-9]{1,2})?\b/)||find(U,/₹\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{4,7})/);
    if(prM){const v=toNum(prM[1].replace(/,/g,''));if(v&&v>=500){out.tagPrice=v;out.found.push('price')}}

    // HUIDs: every 6-character letter+digit code after a HUID label (a tag can carry several)
    out.huids=[];
    const hre=/\bH\.?U\.?I\.?D\s*(?:NO\.?|#)?\s*[:=\-]?\s*([A-Z0-9 ,\/]{6,80})/g;let h;
    while((h=hre.exec(U))){
      for(const tk of h[1].trim().split(/[\s,\/]+/)){
        if(/^[A-Z0-9]{6}$/.test(tk)&&/[A-Z]/.test(tk)&&/[0-9]/.test(tk)){if(!out.huids.includes(tk))out.huids.push(tk)}
        else if(tk.length)break;
      }
    }
    if(out.huids.length){out.huid=out.huids[0];out.found.push('HUID')}

    // SKU: letters followed by digits, e.g. STD1543, NLC-532, DIA 1164
    const skuRe=/\b([A-Z]{2,4})\s?-?\s?([0-9]{3,5})\b/g;let s;
    while((s=skuRe.exec(U))){
      const pre=s[1];if(['HUID','RS','INR','MRP','PT','NET','GWT','NWT','SWT','SPR','FPR','MP','MCT','SA','DWT','KT','CT','CTS','GM','GMS'].includes(pre))continue;
      if(out.huids.some(x=>(pre+s[2]).includes(x)||x.includes(pre)))continue;
      out.sku=pre+s[2];out.found.push('SKU');break;
    }

    // ---- Yamie / Grand Jewellers tag codes (take priority over generic labels) ----
    const V='\\s*[:=\\-.]?\\s*(?:RS\\.?|₹)?\\s*([0-9OoIlSB]{1,6}(?:[.,][0-9OoIlSB]{1,4})?)';
    const code=k=>{const m=U.match(new RegExp('\\b'+k+V));return m?toNum(m[1]):null};
    const gwt=code('GWT'),nwt=code('NWT'),swt=code('SWT'),mp=code('MP'),fpr=code('FPR');
    const spr=code('SPR')!=null?code('SPR'):code('S\\.?A');
    // MCT / CT = making per piece. A "CT" right after a number is a carat unit, not this label.
    let mct=null;
    {const re=new RegExp('\\b(MCT|M\\.C\\.T|CT)'+V,'g');let m;
     while((m=re.exec(U))){const prev=(U.slice(0,m.index).trimEnd().match(/([0-9OoIlSB]+(?:[.,][0-9OoIlSB]+)?)$/)||[])[1];if(m[1]==='CT'&&prev!=null&&(/[.,]/.test(prev)||toNum(prev)<20))continue;mct=toNum(m[2]);break}}
    if(gwt!=null){out.gw=gwt;if(!out.found.includes('gross'))out.found.push('gross')}
    if(nwt!=null){out.nw=nwt;if(!out.found.includes('net'))out.found.push('net')}
    if(swt!=null){out.sw=swt;if(!out.found.includes('stone'))out.found.push('stone')}
    if(spr!=null){out.stoneVal=spr;if(!out.found.includes('stone value'))out.found.push('stone value')}
    if(fpr!=null||mct!=null||mp!=null){
      if(fpr!=null){out.mk=fpr;out.mkType=fpr>100?(fpr>3000?'flat':'pg'):'pct'}
      else if(mct!=null){out.mk=mct;out.mkType='flat';out.perPiece=true}
      else {out.mk=mp;out.mkType=mp>100?(mp>3000?'flat':'pg'):'pct'}
      out.mpBefore=mp;out.makingFinal=fpr!=null||mct!=null;
      if(!out.found.includes('making'))out.found.push('making');
    }
    // Category from the SKU prefix
    const CAT=root.YAMIE_CATEGORIES;
    const keys=Object.keys(CAT).filter(k=>/^[A-Z]{2,5}$/.test(k)).sort((a,b)=>b.length-a.length);
    const catM=keys.length?U.match(new RegExp('\\b('+keys.join('|')+')\\s?-?\\s?([0-9]{2,6})\\b')):null;
    if(catM){out.sku=catM[1]+catM[2];out.item=CAT[catM[1]];if(!out.found.includes('SKU'))out.found.push('SKU')}
    if(out.tagPrice!=null&&(out.tagPrice===spr||out.tagPrice===fpr||out.tagPrice===mp||out.tagPrice===mct)){out.tagPrice=null;out.found=out.found.filter(f=>f!=='price')}
    // Sanity: a SKU number is never a weight
    if(out.sw!=null&&out.sw>100)out.sw=null;
    if(out.gw!=null&&out.gw>1000)out.gw=null;
    if(out.nw!=null&&out.nw>1000)out.nw=null;

    // Unlabelled weights: decimals with 2–3 places that we haven't used
    if(out.gw==null||out.nw==null){
      const used=[out.gw,out.nw,out.sw].filter(v=>v!=null);
      const ds=(fixDigits(U.replace(/[0-9]{1,3}(,[0-9]{2,3})+/g,' ')).match(/\b[0-9]{1,3}\.[0-9]{2,3}\b/g)||[]).map(Number).filter(v=>v>0&&v<500&&!used.includes(v));
      if(out.nw==null&&out.gw!=null){const c=ds.filter(v=>v<=out.gw).sort((a,b)=>b-a)[0];if(c!=null){out.nw=c;out.found.push('net?')}}
      else if(out.gw==null&&out.nw!=null){const c=ds.filter(v=>v>=out.nw).sort((a,b)=>a-b)[0];if(c!=null){out.gw=c;out.found.push('gross?')}}
      else if(out.gw==null&&out.nw==null&&ds.length){
        const s2=[...new Set(ds)].sort((a,b)=>b-a);
        out.gw=s2[0];if(s2[1]!=null)out.nw=s2[1];out.found.push('weights?');
      }
    }
    // Only the four gold purities are sold
    if(out.purity&&!['22k','18k','14k','9k','platinum','silver'].includes(out.purity)){out.purity=null;out.found=out.found.filter(f=>f!=='purity')}
    return out;
  }
  root.parseTag=parseTag;
  if(typeof module!=='undefined')module.exports={parseTag,CATEGORIES:root.YAMIE_CATEGORIES};
})(typeof window!=='undefined'?window:globalThis);
