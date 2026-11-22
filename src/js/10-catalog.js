// ======================================================================
// Catalogue: popular products per category, item-specific details, stones,
// shapes and styles with picture cards (line drawings, no outside images).
// ======================================================================
const PRODUCTS = {
  Ring: ['Solitaire ring', 'Engagement ring', 'Band', 'Eternity band', 'Half-eternity band', 'Cocktail ring', 'Three-stone ring', 'Halo ring', 'Couple bands', "Men's ring", 'Stackable ring', 'Navaratna ring'],
  Earrings: ['Studs', 'Solitaire studs', 'Hoops', 'Huggies', 'Drops', 'Jhumkas', 'Chandbalis', 'Ear cuffs', 'Sui-dhaga', 'Climbers', 'Cluster studs'],
  Pendant: ['Solitaire pendant', 'Heart pendant', 'Initial pendant', 'Religious pendant', 'Cluster pendant', 'Halo pendant', 'Name pendant', 'Pendant with chain'],
  Necklace: ['Choker', 'Princess necklace', 'Tennis necklace', 'Layered necklace', 'Temple necklace', 'Long haram', 'Lariat', 'Collar necklace'],
  Chain: ['Box chain', 'Rope chain', 'Curb chain', 'Cable chain', 'Singapore chain', 'Figaro chain', 'Snake chain', 'Ball chain'],
  Bangle: ['Kada', 'Thin bangle', 'Openable bangle', 'Diamond bangle', 'Kerala bangle', 'Pair of bangles'],
  Bracelet: ['Tennis bracelet', 'Chain bracelet', 'Charm bracelet', 'Cuff bracelet', "Men's bracelet", 'Flexible bracelet', 'Mangalsutra bracelet'],
  'Nose pin': ['Stud nose pin', 'Screw nose pin', 'Nath', 'Ring nose pin', 'Solitaire nose pin'],
  Mangalsutra: ['Short mangalsutra', 'Long mangalsutra', 'Diamond mangalsutra', 'Pendant mangalsutra'],
  Set: ['Necklace set', 'Pendant set', 'Bridal set', 'Earring & pendant set'],
  Anklet: ['Chain anklet', 'Payal', 'Charm anklet'],
  Other: [],
};
const CATS2 = Object.keys(PRODUCTS);

// ---------------- small SVG kit ----------------
const W_ = '#78213f', G_ = '#b0852f';
const svg = (inner, vb = '0 0 64 64') => `<svg viewBox="${vb}" width="56" height="56" fill="none" stroke="${W_}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const gemTop = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill || '#fff'}"/><path d="M${cx - r * .55} ${cy}L${cx} ${cy - r * .55}L${cx + r * .55} ${cy}L${cx} ${cy + r * .55}Z" stroke-width="1.2"/>`;
const band = '<ellipse cx="32" cy="42" rx="17" ry="12"/><ellipse cx="32" cy="42" rx="12.5" ry="8"/>';

const SHAPES = {
  Round: '<circle cx="32" cy="32" r="20"/><path d="M32 12v40M12 32h40M18 18l28 28M46 18L18 46" stroke-width="1"/><circle cx="32" cy="32" r="10" stroke-width="1.2"/>',
  Princess: '<rect x="13" y="13" width="38" height="38"/><path d="M13 13l38 38M51 13L13 51" stroke-width="1"/><rect x="22" y="22" width="20" height="20" stroke-width="1.2"/>',
  Oval: '<ellipse cx="32" cy="32" rx="15" ry="22"/><ellipse cx="32" cy="32" rx="7" ry="11" stroke-width="1.2"/><path d="M32 10v44M17 32h30" stroke-width="1"/>',
  Pear: '<path d="M32 9C22 24 16 32 16 40a16 16 0 0032 0c0-8-6-16-16-31z"/><path d="M32 22v34M24 40h16" stroke-width="1"/>',
  Marquise: '<path d="M32 8C46 20 46 44 32 56 18 44 18 20 32 8z"/><path d="M32 8v48M23 32h18" stroke-width="1"/>',
  Emerald: '<path d="M21 10h22l8 8v28l-8 8H21l-8-8V18z"/><rect x="21" y="18" width="22" height="28" stroke-width="1.2"/>',
  Cushion: '<rect x="13" y="13" width="38" height="38" rx="11"/><rect x="22" y="22" width="20" height="20" rx="5" stroke-width="1.2"/><path d="M15 15l7 7M49 15l-7 7M15 49l7-7M49 49l-7-7" stroke-width="1"/>',
  Heart: '<path d="M32 54L12 32a11 11 0 0120-14 11 11 0 0120 14z"/><path d="M32 18v36" stroke-width="1"/>',
  Radiant: '<path d="M20 11h24l6 6v30l-6 6H20l-6-6V17z"/><path d="M14 17l36 30M50 17L14 47" stroke-width="1"/>',
  Asscher: '<path d="M22 12h20l10 10v20L42 52H22L12 42V22z"/><path d="M26 20h12l6 6v12l-6 6H26l-6-6V26z" stroke-width="1.2"/>',
  Baguette: '<rect x="22" y="8" width="20" height="48"/><rect x="27" y="14" width="10" height="36" stroke-width="1.2"/>',
  Trillion: '<path d="M32 10l22 40H10z"/><path d="M32 22l12 22H20z" stroke-width="1.2"/>',
};
const RING_SETTINGS = {
  'Prong / solitaire': band + gemTop(32, 20, 9) + '<path d="M25 24l-3 9M39 24l3 9M28 27l-1 5M36 27l1 5"/>',
  Bezel: band + '<circle cx="32" cy="22" r="11" stroke-width="3"/>' + gemTop(32, 22, 7),
  Halo: band + '<circle cx="32" cy="21" r="12" stroke-dasharray="2 3"/>' + gemTop(32, 21, 7),
  'Pavé': '<ellipse cx="32" cy="38" rx="20" ry="14"/><ellipse cx="32" cy="38" rx="14" ry="9"/>' + [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${16 + i * 5.3}" cy="${29 - Math.sin(i / 6 * Math.PI) * 4}" r="1.8" fill="${G_}" stroke="none"/>`).join(''),
  Channel: '<ellipse cx="32" cy="38" rx="20" ry="14"/><ellipse cx="32" cy="38" rx="14" ry="9"/><path d="M14 30c6-6 30-6 36 0" stroke-width="5" stroke="#f4e3ea"/>' + [0, 1, 2, 3, 4].map((i) => `<rect x="${19 + i * 5.5}" y="${25 - (i === 2 ? 1 : 0)}" width="4" height="4" fill="${G_}" stroke="none"/>`).join(''),
  'Three-stone': band + gemTop(32, 20, 7.5) + gemTop(19, 25, 5) + gemTop(45, 25, 5),
  Cluster: band + [[32, 19], [24, 22], [40, 22], [28, 13], [36, 13], [32, 26]].map(([x, y]) => gemTop(x, y, 4.2)).join(''),
  Tension: '<path d="M18 46a16 12 0 0028 0" /><path d="M18 46c-6-10 2-22 8-24M46 46c6-10-2-22-8-24"/>' + gemTop(32, 22, 6),
  'Bypass': '<path d="M14 40c0-14 18-20 22-8M50 40c0-14-18-20-22-8" stroke-width="3"/><path d="M14 40c2 10 34 10 36 0"/>' + gemTop(30, 26, 5),
};
const SHANK_STYLES = {
  Plain: '<ellipse cx="32" cy="32" rx="22" ry="16"/><ellipse cx="32" cy="32" rx="17" ry="11"/>',
  'Split shank': '<ellipse cx="32" cy="34" rx="22" ry="16"/><ellipse cx="32" cy="34" rx="17" ry="11"/><path d="M14 26c4-6 8-8 12-9M50 26c-4-6-8-8-12-9M12 30c4-8 10-10 14-11M52 30c-4-8-10-10-14-11"/>',
  Twisted: '<ellipse cx="32" cy="32" rx="22" ry="16"/><path d="M12 32c4-6 8 6 12 0s8 6 12 0 8 6 12 0 4 4 6 2" stroke-width="1.6"/>',
  Cathedral: '<ellipse cx="32" cy="38" rx="20" ry="13"/><path d="M14 30c6 0 12-8 14-16M50 30c-6 0-12-8-14-16"/>' + gemTop(32, 14, 6),
  Tapered: '<path d="M10 34c0-10 10-16 22-16s22 6 22 16-10 16-22 16S10 44 10 34z" stroke-width="1.2"/><path d="M22 20c3 2 17 2 20 0M18 44c4 3 24 3 28 0" stroke-width="3"/>',
  'Knife-edge': '<ellipse cx="32" cy="32" rx="22" ry="16"/><path d="M10 32h44" stroke-width="1"/><path d="M32 16v32" stroke-width="1"/>',
  'Pavé shank': '<ellipse cx="32" cy="34" rx="22" ry="16"/><ellipse cx="32" cy="34" rx="17" ry="11"/>' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${13 + i * 5.4}" cy="${27 - Math.sin(i / 7 * Math.PI) * 6}" r="1.5" fill="${G_}" stroke="none"/>`).join(''),
  'Comfort fit': '<ellipse cx="32" cy="32" rx="22" ry="16" stroke-width="4"/>',
};
const EAR_TYPES = {
  Stud: gemTop(32, 26, 10) + '<path d="M32 36v14"/>',
  Hoop: '<circle cx="32" cy="34" r="17" stroke-width="3"/><path d="M32 12v6"/>',
  Huggie: '<circle cx="32" cy="32" r="11" stroke-width="5"/>',
  Drop: '<circle cx="32" cy="14" r="4"/><path d="M32 18v10"/><path d="M32 28c-6 8-8 13-8 17a8 8 0 0016 0c0-4-2-9-8-17z"/>',
  Jhumka: '<circle cx="32" cy="12" r="5"/><path d="M32 17v6M18 40c2-12 26-12 28 0z"/><path d="M20 44v4M26 44v5M32 44v5M38 44v5M44 44v4" stroke-width="1.6"/>',
  Chandbali: '<circle cx="32" cy="12" r="4"/><path d="M14 26c4 22 32 22 36 0-6 8-30 8-36 0z"/><path d="M20 46v3M32 50v3M44 46v3" stroke-width="1.6"/>',
  'Ear cuff': '<path d="M22 14c18-6 28 10 20 30-4 8-12 10-18 6" stroke-width="3"/>',
  'Sui-dhaga': gemTop(32, 12, 5) + '<path d="M32 17v32" stroke-dasharray="2 2"/><circle cx="32" cy="52" r="3"/>',
  Climber: [10, 20, 30, 40].map((y, i) => gemTop(24 + i * 4, y + 6, 4.5)).join(''),
};
const EAR_BACKS = {
  'South Bombay screw': '<path d="M32 8v40" stroke-width="3"/><path d="M27 18l10 3M27 24l10 3M27 30l10 3M27 36l10 3" stroke-width="1.4"/><circle cx="32" cy="50" r="8"/><circle cx="32" cy="50" r="3"/>',
  'Push-back (butterfly)': '<path d="M32 8v34" stroke-width="3"/><path d="M32 44c-14-12-20 4-12 8 4 2 8-2 12-8zM32 44c14-12 20 4 12 8-4 2-8-2-12-8z"/>',
  'Screw-back': '<path d="M32 8v34" stroke-width="3"/><path d="M28 22h8M28 27h8M28 32h8" stroke-width="1.2"/><rect x="24" y="40" width="16" height="10" rx="4"/>',
  'Lever-back': '<path d="M28 10c-8 6-8 24 4 30"/><path d="M36 10c10 8 10 26-4 30" stroke-width="3"/><circle cx="32" cy="48" r="6"/>',
  'French hook': '<path d="M24 22c0-12 18-12 18 0v24c0 6-10 6-10 0"/>' + gemTop(32, 52, 4),
  'Clip-on': '<rect x="20" y="14" width="24" height="10" rx="5"/><path d="M24 24c0 12 16 12 16 0"/><circle cx="32" cy="44" r="6"/>',
  Hinged: '<circle cx="32" cy="34" r="15" stroke-width="3"/><path d="M32 19v-8" stroke-width="2"/><circle cx="32" cy="19" r="2.5" fill="' + G_ + '"/>',
};
const DEF_GEMS = [
  ['Ruby', '#b3122e'], ['Emerald', '#1f8a4c'], ['Blue sapphire', '#1f4fa8'], ['Yellow sapphire', '#e8b61c'], ['Pink sapphire', '#e56aa1'],
  ['Tanzanite', '#5a4bb5'], ['Amethyst', '#8a4fbf'], ['Citrine', '#e59b1c'], ['Garnet', '#7c1424'], ['Peridot', '#8db82c'],
  ['Blue topaz', '#5cb6e6'], ['Aquamarine', '#8fd3e8'], ['Morganite', '#f2b3a6'], ['Opal', '#cfe7ee'], ['Pearl', '#f3eee4'],
  ['Coral', '#ef6b4a'], ["Cat's eye", '#b9a64d'], ['Hessonite', '#c4621f'], ['Onyx', '#222222'], ['Diamond', '#eef3f7'],
].map(([name, color]) => ({ name, color }));
function gemSvg(color) {
  return svg(`<circle cx="32" cy="32" r="21" fill="${color}" stroke="${W_}" stroke-width="1.4"/><path d="M32 11l9 12 12 9-12 9-9 12-9-12-12-9 12-9z" stroke="#ffffffaa" stroke-width="1.2"/><circle cx="32" cy="32" r="8" stroke="#ffffff99" stroke-width="1.2"/><path d="M22 19l4 5" stroke="#fff" stroke-width="2.4"/>`);
}
const STONE_TYPES = [['diamond', 'Natural diamond', 'ct'], ['labgrown', 'Lab-grown diamond', 'ct'], ['precious', 'Precious / colour stone', 'ct'], ['synthetic', 'Synthetic / CZ', 'pc']];
const stoneUnitDefault = (t) => (STONE_TYPES.find((x) => x[0] === t) || [0, 0, 'ct'])[2];
const UNIT_LABEL = { ct: 'per carat', pc: 'per piece', g: 'per gram' };

// Category drawings (fallback until real photos are added in Settings)
const CAT_SVG = {
  Ring: band + gemTop(32, 20, 8),
  Earrings: gemTop(20, 22, 7) + gemTop(44, 22, 7) + '<path d="M20 29c-3 8-3 14 0 18M44 29c3 8 3 14 0 18"/>',
  Pendant: '<path d="M14 8c4 14 32 14 36 0" stroke-width="1.6"/><path d="M32 20v4"/><path d="M32 54L20 40a8 8 0 0112-10 8 8 0 0112 10z"/>',
  Necklace: '<path d="M10 10c2 30 42 30 44 0"/>' + [0, 1, 2, 3, 4].map((i) => gemTop(18 + i * 7, 34 + (i === 2 ? 4 : i % 2 ? 3 : 0), 3)).join(''),
  Chain: [0, 1, 2, 3].map((i) => `<ellipse cx="${14 + i * 12}" cy="32" rx="8" ry="5" transform="rotate(${i % 2 ? 30 : -30} ${14 + i * 12} 32)"/>`).join(''),
  Bangle: '<ellipse cx="32" cy="32" rx="22" ry="20" stroke-width="5"/>',
  Bracelet: '<ellipse cx="32" cy="34" rx="22" ry="12"/>' + [0, 1, 2, 3, 4, 5].map((i) => gemTop(14 + i * 7, 24 + Math.abs(2.5 - i) * 1.5, 2.6)).join(''),
  'Nose pin': gemTop(26, 24, 8) + '<path d="M26 32v18h10"/>',
  Mangalsutra: '<path d="M10 8c2 26 42 26 44 0" stroke-dasharray="2 3"/>' + gemTop(32, 40, 6),
  Set: '<path d="M8 8c2 22 30 22 32 0"/>' + gemTop(24, 28, 4) + gemTop(48, 36, 5) + gemTop(48, 52, 4),
  Anklet: '<path d="M8 40c8-10 40-10 48 0" stroke-dasharray="3 3"/>' + [0, 1, 2].map((i) => `<circle cx="${20 + i * 12}" cy="${44}" r="2.5"/>`).join(''),
  Other: gemTop(32, 32, 14),
};
const FINISH_SVG = {
  'High polish': '<ellipse cx="32" cy="32" rx="22" ry="16"/><path d="M18 24c4-4 10-6 16-6" stroke="#fff" stroke-width="3"/><path d="M18 24c4-4 10-6 16-6" stroke-width="1"/>',
  Matte: '<ellipse cx="32" cy="32" rx="22" ry="16" fill="#efe4e8"/>',
  Satin: '<ellipse cx="32" cy="32" rx="22" ry="16"/><path d="M14 28h36M12 32h40M14 36h36" stroke-width="1"/>',
  Hammered: '<ellipse cx="32" cy="32" rx="22" ry="16"/>' + [[22, 28], [32, 25], [42, 28], [26, 36], [38, 36]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" stroke-width="1"/>`).join(''),
  Milgrain: '<ellipse cx="32" cy="32" rx="22" ry="16"/><ellipse cx="32" cy="32" rx="19" ry="13" stroke-dasharray="1 2.5" stroke-width="2.4"/>',
  Brushed: '<ellipse cx="32" cy="32" rx="22" ry="16"/><path d="M16 26l6 12M24 22l6 18M32 20l6 20M40 22l6 16" stroke-width="1"/>',
  Rhodium: '<ellipse cx="32" cy="32" rx="22" ry="16" fill="#e6e8ea"/>',
};

// Customisable picture lists. Each entry {name, img?} — img is a real photo ('img:key'); without one a drawing is used.
const LISTS = {
  cat: { title: 'Categories', draw: CAT_SVG, def: () => Object.keys(PRODUCTS) },
  prod: { title: 'Item types', perCat: true, def: (c) => PRODUCTS[c] || [] },
  setting: { title: 'Setting styles', draw: RING_SETTINGS, def: () => Object.keys(RING_SETTINGS) },
  shank: { title: 'Shank styles', draw: SHANK_STYLES, def: () => Object.keys(SHANK_STYLES) },
  finish: { title: 'Finish styles', draw: FINISH_SVG, def: () => Object.keys(FINISH_SVG) },
  earType: { title: 'Earring types', draw: EAR_TYPES, def: () => Object.keys(EAR_TYPES) },
  back: { title: 'Earring screws / backs', draw: EAR_BACKS, def: () => Object.keys(EAR_BACKS) },
  gems: { title: 'Stones', gem: true, def: () => DEF_GEMS.map((g) => g.name) },
  shapes: { title: 'Stone shapes', draw: SHAPES, def: () => Object.keys(SHAPES) },
};
const listKey = (k, cat) => (k === 'prod' ? 'prod:' + (cat || 'Other') : k);
function listItems(k, cat) {
  const L = S.lists || {}, key = listKey(k, cat);
  if (Array.isArray(L[key])) return L[key];
  if (k === 'gems' && S.gems && S.gems.length) return S.gems;
  const d = LISTS[k].def(cat);
  return d.map((n) => (k === 'gems' ? Object.assign({}, DEF_GEMS.find((g) => g.name === n)) : { name: n }));
}
const gems = () => listItems('gems');
/** The picture for a list entry: real photo, else drawing, else stone colour, else category drawing. */
function picHtml(k, entry, cat) {
  if (!entry) return svg('<circle cx="32" cy="32" r="14" stroke-dasharray="3 3"/>');
  if (entry.img) return `<img src="${esc(imgUrl(entry.img))}" alt="" loading="lazy">`;
  if (k === 'gems') return gemSvg(entry.color || (DEF_GEMS.find((g) => g.name === entry.name) || {}).color || '#bbbbbb');
  const d = LISTS[k].draw;
  if (d && d[entry.name]) return svg(d[entry.name]);
  if (k === 'prod' && CAT_SVG[cat]) return svg(CAT_SVG[cat]);
  return svg(gemTop(32, 32, 14));
}
const findEntry = (k, name, cat) => listItems(k, cat).find((e) => e.name === name) || (name ? { name } : null);

/** A dropdown that opens a pop-up of large picture cards. onPick = handler expression from pk(). */
function picField(label, k, value, onPick, cat, opts = {}) {
  const e = findEntry(k, value, cat);
  return `<div class="field"><label>${label}</label><button type="button" class="picDrop" onclick="openPicker('${k}',${esc(JSON.stringify(cat || ''))},${esc(JSON.stringify(label))},${esc(JSON.stringify(onPick))},${esc(JSON.stringify(value || ''))},${opts.clear ? 1 : 0})">
    <span class="pdImg">${value ? picHtml(k, e, cat) : ''}</span><span class="pdTxt">${value ? esc(value) : '<span class="hint" style="margin:0">Choose…</span>'}</span><span>▾</span></button></div>`;
}
function openPicker(k, cat, label, onPick, cur0, canClear) {
  const items = listItems(k, cat);
  window._pickFn = onPick;
  openSheet(`<h2>${esc(label.replace(/^\d+\.\s*/, ''))}</h2><p class="sub">Tap a card to choose it · ⤢ shows the picture large.${can('settings') ? ' Edit this list in More → Picture lists.' : ''}</p>
    <div class="bigPics">${items.map((e) => `<div class="bigPic ${e.name === cur0 ? 'on' : ''}"><button type="button" class="bpSel" onclick='closeSheet();(${onPick})(${esc(JSON.stringify(e.name))})'>${picHtml(k, e, cat)}<span>${esc(e.name)}</span></button>
      ${e.img ? `<button type="button" class="bpZoom" onclick="zoomImg('${esc(imgUrl(e.img))}',${esc(JSON.stringify(e.name))})">⤢</button>` : ''}</div>`).join('') || '<p class="hint">This list is empty — add items in More → Picture lists.</p>'}</div>
    ${canClear && cur0 ? `<button class="btn secondary block" style="margin-top:12px" onclick='closeSheet();(${onPick})("")'>Clear</button>` : ''}`);
}
function zoomImg(src, name) {
  let z = $('zoom');
  if (!z) { z = document.createElement('div'); z.id = 'zoom'; z.className = 'zoom'; z.onclick = () => z.classList.remove('on'); document.body.appendChild(z); }
  z.innerHTML = `<img src="${esc(src)}" alt=""><div>${esc(name || '')} · tap to close</div>`;
  z.classList.add('on');
}

// Item-specific details by category (kept in item.spec). 'list' fields use the customisable picture lists.
const SPEC = {
  Ring: [['shankW', 'Shank width (mm)', 'num'], ['depth', 'Shank depth / thickness (mm)', 'num'], ['setting', 'Setting style', 'list', 'setting'], ['shank', 'Shank style', 'list', 'shank'], ['finish', 'Finish style', 'list', 'finish']],
  Earrings: [['earType', 'Type', 'list', 'earType'], ['back', 'Screw / back', 'list', 'back'], ['finish', 'Finish style', 'list', 'finish'], ['pair', 'Pair or single', 'chips', ['Pair', 'Single']], ['dropLen', 'Drop length (mm)', 'num']],
  'Nose pin': [['back', 'Screw / back', 'chips', ['Screw', 'Push pin', 'L-shape', 'Ring']], ['finish', 'Finish style', 'list', 'finish']],
  Pendant: [['bail', 'Bail', 'chips', ['Fixed bail', 'Hidden bail', 'Hinged bail', 'Enhancer bail']], ['chain', 'With chain', 'chips', ['No chain', '16 in', '18 in', '20 in', '22 in']], ['finish', 'Finish style', 'list', 'finish']],
  Chain: [['thick', 'Thickness (mm)', 'num'], ['clasp', 'Clasp', 'chips', ['Lobster', 'Spring ring', 'S-hook', 'Box clasp']], ['finish', 'Finish style', 'list', 'finish']],
  Necklace: [['clasp', 'Clasp', 'chips', ['Lobster', 'Hook', 'Box clasp', 'Dori (thread)']], ['adj', 'Adjustable length', 'chips', ['Yes', 'No']], ['finish', 'Finish style', 'list', 'finish']],
  Bangle: [['bwidth', 'Width (mm)', 'num'], ['open', 'Opening', 'chips', ['Closed', 'Openable (screw)', 'Hinged']], ['pcs', 'Pieces', 'chips', ['1', '2', '4', '6']], ['finish', 'Finish style', 'list', 'finish']],
  Bracelet: [['bwidth', 'Width (mm)', 'num'], ['clasp', 'Clasp', 'chips', ['Box clasp', 'Lobster', 'Hidden', 'Openable']], ['finish', 'Finish style', 'list', 'finish']],
  Mangalsutra: [['beads', 'Black beads', 'chips', ['Single line', 'Double line', 'Gold-capped']]],
};
const specText = (it) => {
  const s = it.spec || {}, list = SPEC[it.cat] || [];
  return list.filter(([k]) => s[k]).map(([k, l]) => `${l.replace(/ \(mm\)/, '')}: ${s[k]}${/\(mm\)/.test(l) ? ' mm' : ''}`).join(' · ');
};

// ---------------- making charge helper ----------------
// Rules: {vendor, cat, purity, min, max, mode, mk, mkPg, note}; blank vendor/cat/purity = any.
function mkMatches(it) {
  const w = num(it.wt);
  return (S.mkRules || []).map((r, i) => Object.assign({ i }, r)).filter((r) =>
    (!r.vendor || r.vendor === it.vendor) && (!r.cat || r.cat === it.cat) && (!r.purity || r.purity === it.purity) &&
    (!num(r.min) || w >= num(r.min)) && (!num(r.max) || w <= num(r.max)))
    .sort((a, b) => ['vendor', 'cat', 'purity'].filter((k) => b[k]).length - ['vendor', 'cat', 'purity'].filter((k) => a[k]).length || (num(a.max || 1e9) - num(a.min)) - (num(b.max || 1e9) - num(b.min)));
}
const mkText = (r) => (r.mode === 'pct' ? `${r.mk}% VA` : r.mode === 'pg' ? `₹${r.mkPg}/g` : r.mode === 'combo' ? `₹${r.mkPg}/g + ${r.mk}%` : `₹${r.mk} flat`);
const mkWhen = (r) => [r.vendor || 'Any vendor', r.cat || 'any item', r.purity ? purShort(r.purity) : 'any purity', (num(r.min) || num(r.max)) ? `${num(r.min) || 0}–${num(r.max) || '∞'} g` : 'any weight'].join(' · ');
function applyMkRule(it, r) { it.mkMode = r.mode; if (r.mode === 'pct' || r.mode === 'combo' || r.mode === 'flat') it.mk = r.mk; if (r.mode === 'pg' || r.mode === 'combo') it.mkPg = r.mkPg; it.mkRule = mkWhen(r); }
/** Default making from the best rule, unless staff changed it by hand. */
function autoMaking(it) { if (it.mkManual) return; const r = mkMatches(it)[0]; if (r) applyMkRule(it, r); }
function showMkHelper(i) {
  const it = wiz.o.items[i], m = mkMatches(it), all = S.mkRules || [];
  openSheet(`<h2>Making charge helper</h2><p class="sub">${esc([it.vendor || 'No vendor yet', it.cat, purShort(it.purity), g3(it.wt)].filter(Boolean).join(' · '))}</p>
    ${m.length ? m.map((r) => `<div class="pcRes"><div style="flex:1"><b>${esc(mkText(r))}</b><br><small class="hint" style="margin:0">${esc(mkWhen(r))}${r.note ? ' · ' + esc(r.note) : ''}</small></div><button class="btn small" onclick="useMk(${i},${r.i})">Use</button></div>`).join('')
      : `<div class="warnBox">No rule matches this vendor, item, purity and weight.${all.length ? '' : ' No rules set yet.'}</div>`}
    ${all.length > m.length ? `<details class="sec"><summary>All rules (${all.length})</summary><div class="in">${all.map((r, k) => `<div class="pay"><div><b>${esc(mkText(r))}</b><small>${esc(mkWhen(r))}</small></div><button class="btn small soft" onclick="useMk(${i},${k})">Use</button></div>`).join('')}</div></details>` : ''}
    ${can('rates') ? '<button class="btn secondary block" style="margin-top:10px" onclick="closeSheet();openSub(\'mk\')">Edit rules</button>' : ''}`);
}
function useMk(i, k) { const it = wiz.o.items[i]; applyMkRule(it, S.mkRules[k]); it.mkManual = true; keepDraft(); closeSheet(); wizPrice(); }

// ---------------- karat-wise weight pop-up ----------------
function karatWeights(wt, purity) {
  const ref = S.karatRef || {}, src = num(ref[rateKey(purity)]);
  return GOLD.map((p) => ({ p, w: p === purity || !src ? num(wt) : Math.round(num(wt) * num(ref[rateKey(p)]) / src * 1000) / 1000, cur: p === purity }));
}
function showKaratWeights(i, field) {
  const it = wiz.o.items[i], w = num(it[field]);
  if (!(w > 0)) return toast('Enter the weight first');
  if (!GOLD.includes(it.purity)) return toast('Karat-wise weights are for gold');
  const rows = karatWeights(w, it.purity);
  openSheet(`<h2>${field === 'gwt' ? 'Gross' : 'Net'} weight in each karat</h2><p class="sub">Same design, scaled by the karat reference weights in Settings${S.karatRef22Weighed ? '' : ' (22K is an estimate)'}.${field === 'gwt' ? ' Stone weight is assumed to stay the same.' : ''}</p>
    ${rows.map((r) => `<div class="kv ${r.cur ? 'tot' : ''}"><span>${purLabel(r.p)}</span><span>${g3(r.w)}</span></div>`).join('')}
    <p class="hint">Tap a karat to switch this item to it (weights change too).</p>
    <div class="choiceRow">${rows.filter((r) => !r.cur).map((r) => `<button class="chip" onclick="switchKarat(${i},'${r.p}')">Use ${purShort(r.p)}</button>`).join('')}</div>`);
}
function switchKarat(i, p) {
  const it = wiz.o.items[i];
  const conv = (w) => (num(w) > 0 ? karatWeights(w, it.purity).find((r) => r.p === p).w : w);
  const stoneG = Math.max(0, num(it.gwt) - num(it.wt));
  it.wt = conv(it.wt);
  if (num(it.gwt) > 0) it.gwt = Math.round((num(it.wt) + stoneG) * 1000) / 1000;
  it.purity = p; keepDraft(); closeSheet(); wizItems();
}
