// Seed data from the 17-Nov-2026 sheets (FLOOR DISPLAY COUNTERS + STOCK COUNT).
const T = ['Ring','Stud','Bracelet','Bangle','Necklace','Chain','Pendant','Set','Nosepin'];
const L = (arr) => { const o = {}; arr.forEach((n, i) => { if (n) o[T[i]] = n; }); return o; };

const counters = [
  ['Cash side · Counter 1', 'Tray 1 · Diamond', '', 'Diamond', [2,3,3,4,1,1,3,0,0]],
  ['Cash side · Counter 1', 'Tray 2 · 9K', '9K', 'Gold', [8,4,2,2,2,4,0,0,0]],
  ['Cash side · Counter 1', 'Tray 3', '', 'Gold', [2,4,0,0,2,0,4,0,0]],
  ['Cash side · Mid / Counter 2', 'Mid tray', '', 'Gold', [5,1,4,1,2,2,0,0,0]],
  ['Cash side · Counter 3', 'Tray 1', '', 'Gold', [0,0,0,17,0,0,0,0,0]],
  ['Cash side · Counter 3', 'Tray 2', '', 'Gold', [0,0,0,0,8,10,0,0,0]],
  ['Cash side · Counter 3', 'Tray 3', '', 'Gold', [6,15,0,0,0,0,0,0,0]],
  ['Locker side', 'Tray 1 · Bracelet', '', 'Gold', [0,0,21,0,0,0,0,0,0]],
  ['Locker side', 'Tray 2 · Gents', '', 'Gents', [2,0,1,4,0,5,1,0,2]],
  ['Locker side', 'Tray 3 · PND/SET', '', 'Gold', [0,0,0,0,0,0,6,4,0]],
  ['Platinum counter', 'Floor counter', 'PT950', 'Platinum', [34,3,6,0,0,1,7,0,1]],
  ['Platinum counter', 'Wall shelf', 'PT950', 'Platinum', [6,4,0,0,0,14,1,0,0]],
  ['CVD counter', 'Lab-grown', '', 'Lab-grown', [6,4,2,2,0,0,3,0,0]],
  ['CVD counter', 'Kids', '', 'Kids', [4,3,4,9,8,1,1,0,0]],
  ['Green shelf', 'Green shelf', '', 'Gold', [2,1,0,10,5,0,0,0,0]],
  ['Back shelf main', 'Main left', '', 'Gold', [0,10,0,0,15,0,0,0,0]],
  ['Back shelf main', 'Main mid', '', 'Gold', [2,2,0,4,4,1,0,0,0]],
  ['Back shelf main', 'Main right', '', 'Gold', [0,10,0,0,15,0,0,0,0]],
];

// [group, name, itemType, insert, qty, purity, category]
const trays = [
  ['Finger rings','Black Tray (old)','Ring',20,6,'',''],
  ['Finger rings','Brown Tray','Ring',12,13,'',''],
  ['Finger rings','Beige 14K','Ring',12,2,'14K',''],
  ['Finger rings','Brown Large','Ring',30,5,'',''],
  ['Finger rings','HUID Buffer','Ring',25,1,'',''],
  ['Finger rings','Sales return','Ring',3,1,'',''],
  ['Finger rings','SR','Ring',3,1,'',''],
  ['Earrings','Black Tray','Stud',20,6,'',''],
  ['Earrings','Brown Large','Stud',24,6,'',''],
  ['Earrings','Brown Small','Stud',12,12,'',''],
  ['Earrings','Kids Tray','Stud',12,4,'','Kids'],
  ['Earrings','Maroon 22K','Stud',12,3,'22K',''],
  ['Earrings','Beige 14K','Stud',12,2,'14K',''],
  ['Earrings','Blue Tray 9K','Stud',12,1,'9K',''],
  ['Earrings','CTRAY','Stud',10,1,'',''],
  ['Earrings','CTRAY-Ring','Stud',5,1,'',''],
  ['Earrings','HUID Buffer','Stud',12,1,'',''],
  ['Earrings','Beige (PND/STD)','Stud',7,1,'',''],
  ['Earrings','Red Folder','Stud',16,3,'',''],
  ['Earrings','Sales return','Stud',5,1,'',''],
  ['Earrings','Blue Folder 18K','Stud',16,1,'18K',''],
  ['Pendants','Black Tray','Pendant',20,3,'',''],
  ['Pendants','Black Tray 9K','Pendant',20,1,'9K',''],
  ['Pendants','Beige (PND/STD)','Pendant',7,1,'',''],
  ['Pendants','Brown Tray','Pendant',15,2,'',''],
  ['Pendants','Brown Tray (S)','Pendant',12,8,'',''],
  ['Pendants','Beige 14K','Pendant',12,1,'14K',''],
  ['Pendants','Kids (Pink)','Pendant',12,2,'','Kids'],
  ['Pendants','Brown Tray (XL)','Pendant',30,4,'',''],
  ['Pendants','Sales return','Pendant',1,1,'',''],
  ['Pendants','9KT Blue Tray','Pendant',12,2,'9K',''],
  ['Pendants','Grand','Pendant',25,1,'',''],
  ['Jewellery set','Tray','Set',8,3,'',''],
  ['Jewellery set','HUID Buffer','Set',2,1,'',''],
  ['Bracelets','Black Box (3 trays)','Bracelet',24,3,'',''],
  ['Bracelets','Brown Tray','Bracelet',10,4,'',''],
  ['Bracelets','HUID Buffer','Bracelet',5,1,'',''],
  ['Bracelets','Sales return','Bracelet',1,1,'',''],
  ['Bracelets','Grand','Bracelet',8,1,'',''],
  ['Bracelets','Blue 9K Tray','Bracelet',6,2,'9K',''],
  ['Bracelets','GJP','Bracelet',1,1,'',''],
  ['Necklace','Black Tray A','Necklace',6,2,'',''],
  ['Necklace','Black Tray B','Necklace',10,1,'',''],
  ['Necklace','Black Tray C','Necklace',20,1,'',''],
  ['Necklace','Brown Tray','Necklace',8,9,'',''],
  ['Necklace','Kids Pink Tray','Necklace',8,1,'','Kids'],
  ['Necklace','HUID Buffer','Necklace',5,1,'',''],
  ['Necklace','Grand stock','Necklace',13,1,'',''],
  ['Bangles','Black Tray','Bangle',12,4,'',''],
  ['Bangles','HUID Buffer','Bangle',9,1,'',''],
  ['Bangles','GJP','Bangle',1,1,'',''],
  ['Bangles','9K Blue Tray','Bangle',6,2,'9K',''],
  ['Bangles','18K Brown Tray','Bangle',6,3,'18K',''],
  ['Chain','Black Tray A','Chain',20,5,'',''],
  ['Chain','Black Tray B','Chain',10,8,'',''],
  ['Chain','Black Tray C','Chain',12,1,'',''],
  ['Chain','DIA Pend Tray','Chain',6,1,'',''],
  ['Chain','HUID Buffer','Chain',11,1,'',''],
  ['Chain','SR','Chain',2,1,'',''],
  ['Nosepin','CTRAY (11 trays)','Nosepin',24,11,'',''],
  ['Nosepin','CTRAY','Nosepin',5,1,'',''],
  ['Nosepin','Black','Nosepin',34,1,'',''],
  ['Nosepin','Buffer','Nosepin',11,1,'',''],
  ['Gold coin','Stock','Coin',6,1,'',''],
  ['Gold coin','HUID Buffer','Coin',1,1,'',''],
  ['Diamond','Blue - Earring (4)','Stud',12,4,'','Diamond'],
  ['Diamond','Blue - Earring','Stud',6,1,'','Diamond'],
  ['Diamond','Blue - Ering','Stud',12,5,'','Diamond'],
  ['Diamond','Blue - Pendant','Pendant',12,5,'','Diamond'],
  ['Diamond','Blue - PND/CHN','Pendant',6,1,'','Diamond'],
  ['Diamond','Blue - NLC','Necklace',8,1,'','Diamond'],
  ['Diamond','Blue - NSP (3)','Nosepin',32,3,'','Diamond'],
  ['Diamond','Blue - NSP','Nosepin',24,1,'','Diamond'],
  ['Diamond','9KT NSP','Nosepin',13,1,'9K','Diamond'],
  ['Diamond','SR','Mixed',4,1,'','Diamond'],
  ['Diamond','GJP','Mixed',1,1,'','Diamond'],
];

// [boxNo, name, purity, category, lines]
const boxes = [
  ['1','9KT Box-1','9K','Gold',{Ring:82,Stud:13,Necklace:24,Bangle:6,Chain:7}],
  ['2','14KT Box-2','14K','Gold',{Ring:35,Pendant:19,Bangle:17,Chain:9}],
  ['3','Buffer Box-3','','Gold',{Pendant:21}],
  ['7','18K Box-7','18K','Gold',{Bangle:27}],
  ['8','NCL Box-8','','Gold',{Necklace:25}],
  ['10','9KT Box-10','9K','Gold',{Pendant:7}],
  ['RE','Ring / ER Box','','Gold',{Ring:38,Stud:9}],
  ['FINE','14K Fine Box','14K','Gold',{Ring:34,Stud:37,Pendant:15,Bracelet:13,Necklace:8}],
  ['14K','14K Box','14K','Gold',{Stud:12}],
  ['585','14K/585 Box','14K','Gold',{Bracelet:1,Necklace:14}],
  ['MIX','Mixed Box','','Gold',{Set:4,Bracelet:16,Chain:20}],
  ['RED','Red Box','','Gold',{Ring:30}],
  ['DBUF','Diamond Buffer Box','','Diamond',{Mixed:44}],
  ['DBLK','Diamond Black Box','','Diamond',{Mixed:64}],
  ['DNSP','Diamond Black Box NSP','','Diamond',{Nosepin:25}],
];

export function buildSeed() {
  const locs = []; const opening = {}; let n = 0;
  const id = (p) => p + String(++n).padStart(3, '0');
  counters.forEach(([g, name, pur, cat, arr]) => {
    const i = id('C'); locs.push({ id: i, sec: 'counter', group: g, name, purity: pur, cat, itemType: '', images: [], active: true, order: n });
    opening[i] = { lines: L(arr), wt: 0 };
  });
  trays.forEach(([g, name, t, ins, q, pur, cat]) => {
    const i = id('T'); locs.push({ id: i, sec: 'tray', group: g, name, purity: pur, cat: cat || 'Gold', itemType: t, insert: ins, qty: q, images: [], active: true, order: n });
    opening[i] = { lines: { [t]: ins * q }, wt: 0 };
  });
  boxes.forEach(([no, name, pur, cat, lines]) => {
    const i = id('B'); locs.push({ id: i, sec: 'box', group: cat === 'Diamond' ? 'Diamond boxes' : 'Gold boxes', name, boxNo: no, purity: pur, cat, itemType: '', mode: 'both', images: [], active: true, order: n });
    opening[i] = { lines: { ...lines }, wt: 0 };
  });
  return { locs, opening };
}
