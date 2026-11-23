from playwright.sync_api import sync_playwright
import base64
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':412,'height':900},device_scale_factor=2)
    ctx.add_init_script("localStorage.setItem('yod_api','http://localhost:8789')")
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto('http://localhost:8789/'); pg.wait_for_timeout(800)
    pg.click('.users button:has-text("Admin")')
    for d in '1986': pg.click(f'.pad button:has-text("{d}")')
    pg.wait_for_timeout(1200)
    if pg.locator('#fsName').count(): pg.fill('#fsName','Praveen'); pg.fill('#fsPin','4321'); pg.click('button:has-text("Save & continue")'); pg.wait_for_timeout(2000)
    pg.evaluate("""(()=>{const g=GC();g.staff=['Anu'];g.recvStaff=['Biju','Anu'];g.qcStaff=['Suresh'];g.markStaff=['Rafi'];g.labelStaff=['Meera'];g.packStaff=['Anu'];g.vendors=[{name:'Thrissur Chains',phone:'9847000099'}];
      return api('grand/cfg',{grand:g}).then(()=>pullAll())})()"""); pg.wait_for_timeout(1200)
    pg.evaluate("window.print=()=>{window._printed=document.getElementById('printArea').innerHTML}")
    o=pg.evaluate("""api('grand/save',{o:{type:'stock',vendor:'Thrissur Chains',vphone:'9847000099',by:'Anu',purity:'22K (916)',lockPur:true,lines:[
      {item:'Chain',model:'Ganguly',wt:8,qty:1,size:'8 pidi'},{item:'Chain',model:'Ganguly',wt:10,qty:2,size:'20 in',sub:1},{item:'Anklet',model:'Sachin',wt:16,qty:2,size:'10.5 in'}]}}).then(d=>{gOrders=[d.o];return d.o.id})""")
    pg.evaluate("openGrand()"); pg.wait_for_timeout(800); pg.evaluate(f"gShow('{o}')"); pg.wait_for_timeout(1500)
    pg.click('#sheet button:has-text("Receive from vendor")'); pg.wait_for_timeout(500)
    r=pg.locator('.gRcv')
    r.nth(0).locator('.field:has(label:has-text("Weight received")) input').fill('8.1'); r.nth(0).locator('.field:has(label:has-text("Weight received")) input').dispatch_event('change'); pg.wait_for_timeout(200)
    r=pg.locator('.gRcv'); q=r.nth(1).locator('.field:has(label:has-text("Qty received")) input'); q.fill('1'); q.dispatch_event('change'); pg.wait_for_timeout(200)
    r=pg.locator('.gRcv'); w=r.nth(1).locator('.field:has(label:has-text("Weight received")) input'); w.fill('10.6'); w.dispatch_event('change'); pg.wait_for_timeout(200)
    pg.locator('.gRcv').nth(2).locator('.chip:has-text("Not received")').click(); pg.wait_for_timeout(200)
    print('disc:', pg.locator('.gRcv').nth(1).locator('.kv').inner_text().replace('\n',' '))
    pg.screenshot(path='/tmp/man/g-recv.png', full_page=True)
    pg.click('#sheet button:has-text("Approve receipt")'); pg.wait_for_timeout(1500)
    st=lambda: pg.evaluate(f"(o=>o.status+' pend '+gPendAll(o)+' stages '+(o.batches||[]).map(b=>b.stage).join(','))(gOrders.find(x=>x.id==='{o}'))")
    print('after receive:', st())
    pg.click('#sheet button:has-text("QC check")'); pg.wait_for_timeout(400)
    pg.locator('#sheet .card').nth(1).locator('.chip:has-text("QC failed")').click(); pg.locator('#sheet .card').nth(1).locator('input').fill('Solder joint weak'); pg.locator('#sheet .card').nth(1).locator('input').dispatch_event('change')
    pg.click('#sheet button:has-text("Save QC")'); pg.wait_for_timeout(1500); print('after QC:', st())
    for btn in ['Laser marking done','Labelling done','Box it with the printed report','Sent to Grand']:
        pg.click(f'#sheet .gBatch button:has-text("{btn}")'); pg.wait_for_timeout(400)
        if btn.startswith('Box'): pg.click('#sheet button:has-text("Print box report")'); pg.wait_for_timeout(300)
        pg.click('#sheet button:has-text("Confirm")'); pg.wait_for_timeout(1300); print(btn, '->', st())
    pg.screenshot(path='/tmp/man/g-work.png', full_page=True)
    # second receipt: rest
    pg.click('#sheet button:has-text("Receive from vendor")'); pg.wait_for_timeout(500)
    n=pg.locator('.gRcv').count(); print('rows pending:', n)
    for i in range(n):
        w=pg.locator('.gRcv').nth(i).locator('.field:has(label:has-text("Weight received")) input'); 
        exp=w.get_attribute('placeholder').split()[-1]; w.fill(exp); w.dispatch_event('change'); pg.wait_for_timeout(200)
    pg.click('#sheet button:has-text("Approve receipt")'); pg.wait_for_timeout(1500); print('receipt 2:', st())
    pg.click('#sheet button:has-text("QC check")'); pg.wait_for_timeout(400); pg.click('#sheet button:has-text("Save QC")'); pg.wait_for_timeout(1500)
    for btn in ['Laser marking done','Labelling done','Box it with the printed report','Sent to Grand']:
        pg.click(f'#sheet .gBatch button:has-text("{btn}")'); pg.wait_for_timeout(400); pg.click('#sheet button:has-text("Confirm")'); pg.wait_for_timeout(1300)
    print('final:', st())
    pg.evaluate(f"gReport('{o}')"); pg.wait_for_timeout(300)
    html=pg.evaluate("window._printed"); open('/tmp/man/g-report.html','w').write('<html><head><meta charset=utf-8><style>'+pg.evaluate("document.querySelector('style').textContent")+' #printArea{display:block}</style></head><body><div id=printArea>'+html+'</div></body></html>')
    pg.evaluate("openGrand()"); pg.wait_for_timeout(1000); pg.screenshot(path='/tmp/man/g-list3.png')
    b.close(); print(errs)
