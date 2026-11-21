/* Yamie backup & restore engine (shared by Price Check, Repair Desk and Yamie SOP).
   A backup is one .zip file:
     manifest.json       what is inside (app, date, every record with its file name)
     README.txt          plain-language note
     shared/...          every record of the shared database; photos as real .jpg/.png files
     phone/phone.json    this phone's own data (optional, app-specific)
   The server side answers five calls (admin/owner only):
     list → {keys:[...]}          get {key,off} → {total,b64,meta}
     put {key,part,parts,b64,meta} → {ok}      del {keys:[...]} → {ok}      done → {ok}
   Files are written with "store" (no compression: photos are already compressed);
   restore also reads zips re-saved with deflate where the browser supports it. */
(function (root) {
  'use strict';
  const CHUNK = 2500000;               // bytes per request (base64 stays under the 6 MB function limit)
  const PAR = 4;                       // records fetched / sent at the same time
  const te = new TextEncoder(), td = new TextDecoder();

  // ---------- small helpers ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function b64e(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  function b64d(s) { const b = atob(s || ''), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function concat(list) { if (list.length === 1) return list[0]; let n = 0; list.forEach(x => n += x.length); const o = new Uint8Array(n); let p = 0; list.forEach(x => { o.set(x, p); p += x.length; }); return o; }
  async function pool(items, n, fn) { let i = 0, err = null; const run = async () => { while (!err && i < items.length) { const k = i++; try { await fn(items[k], k); } catch (e) { err = e; } } }; await Promise.all(Array.from({ length: Math.min(n, items.length) }, run)); if (err) throw err; }
  async function retry(fn, n = 3) { for (let a = 0; ; a++) { try { return await fn(); } catch (e) { if (a >= n - 1 || (e && e.noRetry)) throw e; await new Promise(r => setTimeout(r, 800 * (a + 1))); } } }
  const fmtMB = n => n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const stamp = d => { const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
  // a record key as a safe path inside the zip (keeps folders readable)
  const pathOf = k => k.split('/').map(s => encodeURIComponent(s).replace(/%20/g, '+').replace(/\*/g, '%2A') || '_').join('/');

  // What a record is: a photo (raw bytes or a data: URL) or data
  function sniff(u) {
    if (u.length > 3 && u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return { ext: '.jpg', mime: 'image/jpeg' };
    if (u.length > 8 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) return { ext: '.png', mime: 'image/png' };
    if (u.length > 12 && u[0] === 0x52 && u[1] === 0x49 && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return { ext: '.webp', mime: 'image/webp' };
    if (u.length > 6 && u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return { ext: '.gif', mime: 'image/gif' };
    return null;
  }
  const EXT = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  function classify(u) {
    const im = sniff(u);
    if (im) return { kind: 'img', ext: im.ext, enc: 'raw', bytes: u };
    // a photo kept as a data: URL (optionally as a JSON string) → save the picture itself, rebuild the text on restore
    const head = td.decode(u.subarray(0, 64));
    const q = head[0] === '"' ? 1 : 0;
    const m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(head.slice(q));
    if (m && u.length < 40e6) {
      const txt = td.decode(u), body = txt.slice(q + m[0].length, q ? txt.length - 1 : txt.length);
      if (!q || txt[txt.length - 1] === '"') {
        try {
          const bytes = b64d(body);
          if (b64e(bytes) === body) return { kind: 'img', ext: EXT[m[1].toLowerCase()] || '.img', enc: q ? 'dataurl-json' : 'dataurl', prefix: m[0], bytes };
        } catch (e) { }
      }
    }
    let ext = '.bin';
    if (u.length && (u[0] === 0x7B || u[0] === 0x5B || u[0] === 0x22)) { try { JSON.parse(td.decode(u)); ext = '.json'; } catch (e) { } }
    else if (u.length < 4096 && /^[\x09\x0A\x0D\x20-\x7E]*$/.test(td.decode(u))) ext = '.txt';
    return { kind: 'data', ext, enc: 'raw', bytes: u };
  }
  function rebuild(ent, bytes) {
    if (ent.enc === 'dataurl') return te.encode(ent.prefix + b64e(bytes));
    if (ent.enc === 'dataurl-json') return te.encode('"' + ent.prefix + b64e(bytes) + '"');
    return bytes;
  }

  // ---------- zip writer (store) ----------
  function dosTime(d) { return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
  class ZipWriter {
    constructor() { this.blobs = []; this.parts = []; this.held = 0; this.cd = []; this.off = 0; this.n = 0; this.dt = dosTime(new Date()); }
    add(name, data) {
      if (typeof data === 'string') data = te.encode(data);
      const nm = te.encode(name), crc = crc32(data), sz = data.length;
      if (this.off + sz > 0xFFFFFFF0) throw new Error('too_big');
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, this.dt.t, true); h.setUint16(12, this.dt.d, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
      h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, this.dt.t, true); c.setUint16(14, this.dt.d, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
      c.setUint16(28, nm.length, true); c.setUint32(42, this.off, true);
      this.cd.push(new Uint8Array(c.buffer), nm);
      this.parts.push(new Uint8Array(h.buffer), nm, data); this.held += 30 + nm.length + sz;
      this.off += 30 + nm.length + sz; this.n++;
      if (this.held > 8e6) this.flush();   // hand big runs to the browser's blob store (keeps memory low on phones)
    }
    flush() { if (this.parts.length) { this.blobs.push(new Blob(this.parts)); this.parts = []; this.held = 0; } }
    finish() {
      this.flush();
      let cds = 0; this.cd.forEach(x => cds += x.length);
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(8, this.n, true); e.setUint16(10, this.n, true); e.setUint32(12, cds, true); e.setUint32(16, this.off, true);
      if (this.n > 0xFFFF) throw new Error('too_many');
      return new Blob([...this.blobs, ...this.cd, new Uint8Array(e.buffer)], { type: 'application/zip' });
    }
  }

  // ---------- zip reader (random access on a File/Blob) ----------
  async function openZip(file) {
    const tl = Math.min(file.size, 65557), tail = new Uint8Array(await file.slice(file.size - tl).arrayBuffer());
    let p = -1; for (let i = tl - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i + 1] === 0x4B && tail[i + 2] === 5 && tail[i + 3] === 6) { p = i; break; }
    if (p < 0) throw new Error('not_zip');
    const ev = new DataView(tail.buffer, p); const cnt = ev.getUint16(10, true), cds = ev.getUint32(12, true), cdo = ev.getUint32(16, true);
    const cd = new Uint8Array(await file.slice(cdo, cdo + cds).arrayBuffer()), dv = new DataView(cd.buffer);
    const map = new Map(); let o = 0;
    for (let i = 0; i < cnt && o + 46 <= cd.length; i++) {
      if (dv.getUint32(o, true) !== 0x02014b50) throw new Error('bad_zip');
      const method = dv.getUint16(o + 10, true), csz = dv.getUint32(o + 20, true), usz = dv.getUint32(o + 24, true), nl = dv.getUint16(o + 28, true), xl = dv.getUint16(o + 30, true), cl = dv.getUint16(o + 32, true), lo = dv.getUint32(o + 42, true);
      const name = td.decode(cd.subarray(o + 46, o + 46 + nl));
      map.set(name, { method, csz, usz, lo, crc: dv.getUint32(o + 16, true) }); o += 46 + nl + xl + cl;
    }
    return {
      names: [...map.keys()],
      has: n => map.has(n),
      async read(name) {
        const e = map.get(name); if (!e) throw new Error('missing:' + name);
        const lh = new DataView(await file.slice(e.lo, e.lo + 30).arrayBuffer());
        const start = e.lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        let u = new Uint8Array(await file.slice(start, start + e.csz).arrayBuffer());
        if (e.method === 8) {
          if (typeof DecompressionStream === 'undefined') throw new Error('deflate');
          u = new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        } else if (e.method !== 0) throw new Error('method');
        if (crc32(u) !== e.crc) throw new Error('crc:' + name);
        return u;
      },
      async text(name) { return td.decode(await this.read(name)); },
    };
  }

  // ---------- backup ----------
  // o = { app, appId, version, by, call(op,args)→Promise<json>, shared:true|false, skip(key)→bool,
  //       phone: async()→object|null, progress(text, fraction) }
  async function backup(o) {
    const prog = o.progress || (() => { });
    const z = new ZipWriter(), now = new Date();
    const man = { format: 'yamie-backup', v: 1, app: o.app, appId: o.appId, version: o.version || '', created: now.toISOString(), by: o.by || '', shared: [], phone: null, totals: { records: 0, photos: 0, bytes: 0 } };
    if (o.shared !== false && o.call) {
      prog('Listing the shared database…', 0);
      const keys = ((await retry(() => o.call('list', {}))).keys || []).filter(k => !(o.skip && o.skip(k)));
      let done = 0, bytes = 0;
      const ents = new Array(keys.length);
      await pool(keys, PAR, async (key, i) => {
        const chunks = []; let off = 0, total = 0, meta = null, first = true;
        do {
          const r = await retry(() => o.call('get', { key, off }));
          if (r.missing) return;                       // deleted while backing up
          if (first) { meta = r.meta || null; first = false; }
          total = r.total; const u = b64d(r.b64); chunks.push(u); off += u.length;
          if (!u.length && off < total) throw new Error('short_read');
        } while (off < total);
        const data = concat(chunks), c = classify(data);
        const ent = { key, file: 'shared/' + pathOf(key) + c.ext, kind: c.kind, enc: c.enc, size: data.length };
        if (c.prefix) ent.prefix = c.prefix;
        if (meta && Object.keys(meta).length) ent.meta = meta;
        z.add(ent.file, c.bytes); ents[i] = ent;
        bytes += data.length; done++;
        if (c.kind === 'img') man.totals.photos++;
        prog(`Backing up ${done} of ${keys.length} records · ${fmtMB(bytes)}`, done / keys.length * 0.95);
      });
      man.shared = ents.filter(Boolean); man.totals.records = man.shared.length; man.totals.bytes = bytes;
    }
    if (o.phone) {
      prog('Adding this phone’s data…', 0.96);
      const ph = await o.phone();
      if (ph) {
        const s = JSON.stringify(ph); z.add('phone/phone.json', s);
        man.phone = { file: 'phone/phone.json', size: s.length, photos: ph.photoCount || 0 };
        man.totals.photos += ph.photoCount || 0;
      }
    }
    z.add('README.txt', `${o.app} backup\r\nMade ${now.toString()}${o.by ? ' by ' + o.by : ''}.\r\n\r\nRecords from the shared database: ${man.totals.records}\r\nPhotos: ${man.totals.photos}\r\n\r\nTo restore: open ${o.app} → Backup & restore → Restore, and choose this file.\r\nPhotos are in the "shared" folder as normal picture files.\r\nKeep this file private: it holds staff logins (hashed), customers and business data.\r\n`);
    z.add('manifest.json', JSON.stringify(man));
    prog('Making the file…', 0.99);
    const blob = z.finish();
    return { blob, manifest: man, name: `${o.fileBase || o.appId}-backup-${stamp(now)}.zip` };
  }

  // ---------- restore ----------
  async function read(file) {
    const zip = await openZip(file);
    if (!zip.has('manifest.json')) throw new Error('not_backup');
    const man = JSON.parse(await zip.text('manifest.json'));
    if (man.format !== 'yamie-backup') throw new Error('not_backup');
    return { zip, manifest: man };
  }
  // o = { call, progress, replace:true|false, skip(key), sharedOn:true, phoneOn:true, restorePhone(obj) }
  async function restore(o, bk) {
    const prog = o.progress || (() => { }), man = bk.manifest, list = o.sharedOn === false ? [] : man.shared;
    let done = 0, sent = 0;
    if (list.length) {
      if (o.replace) {
        prog('Checking what to remove…', 0);
        const want = new Set(list.map(e => e.key));
        const cur = ((await retry(() => o.call('list', {}))).keys || []).filter(k => !want.has(k) && !(o.skip && o.skip(k)));
        for (let i = 0; i < cur.length; i += 50) { await retry(() => o.call('del', { keys: cur.slice(i, i + 50) })); prog(`Removing records not in the backup · ${Math.min(i + 50, cur.length)} of ${cur.length}`, 0.02); }
      }
      await pool(list, PAR, async (ent) => {
        const data = rebuild(ent, await bk.zip.read(ent.file));
        const parts = Math.max(1, Math.ceil(data.length / CHUNK));
        for (let p = 0; p < parts; p++) {
          const slice = data.subarray(p * CHUNK, (p + 1) * CHUNK);
          await retry(() => o.call('put', { key: ent.key, part: p, parts, b64: b64e(slice), meta: ent.meta || null }));
        }
        done++; sent += data.length;
        prog(`Restoring ${done} of ${list.length} records · ${fmtMB(sent)}`, 0.03 + done / list.length * 0.92);
      });
      prog('Telling every phone to reload…', 0.96);
      await retry(() => o.call('done', {}));
    }
    if (o.phoneOn !== false && man.phone && o.restorePhone) {
      prog('Restoring this phone’s data…', 0.98);
      await o.restorePhone(JSON.parse(await bk.zip.text(man.phone.file)));
    }
    prog('Done', 1);
    return { records: done, bytes: sent };
  }

  // Save the file: Android app bridge (chunked, any size) or a normal download
  async function save(blob, name, native) {
    if (native && native.fileBegin) {
      const id = native.fileBegin(name, 'application/zip');
      if (id) {
        const step = 1536 * 1024;
        for (let p = 0; p < blob.size; p += step) {
          const ok = native.fileAppend(id, b64e(new Uint8Array(await blob.slice(p, p + step).arrayBuffer())));
          if (ok === false) throw new Error('save_failed');
        }
        native.fileEnd(id);
        return 'native';
      }
    }
    if (native && native.saveFile) {
      if (blob.size > 40e6) { const e = new Error('app_update'); e.noRetry = true; throw e; }
      native.saveFile(name, 'application/zip', b64e(new Uint8Array(await blob.arrayBuffer())));
      return 'native';
    }
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 120000);
    return 'download';
  }

  function errText(e) {
    const m = String((e && e.message) || e || '');
    if (/not_zip|bad_zip|not_backup/.test(m)) return 'This is not a backup file from the app.';
    if (/crc|missing:/.test(m)) return 'The backup file is damaged or incomplete.';
    if (/deflate|method/.test(m)) return 'This zip was re-packed in a way the app cannot read. Use the original backup file.';
    if (/app_update/.test(m)) return 'This backup is too big for this version of the app. Update the app, or use the web version.';
    if (/too_big|too_many/.test(m)) return 'The data is too big for one backup file.';
    if (/Failed to fetch|NetworkError|network|load failed/i.test(m)) return 'No internet connection. Try again.';
    return m || 'Something went wrong.';
  }

  root.YBK = { backup, read, restore, save, errText, fmtMB, b64e, b64d, openZip, ZipWriter, crc32, classify, CHUNK };
})(typeof window !== 'undefined' ? window : globalThis);
