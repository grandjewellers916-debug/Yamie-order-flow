# First admin login: type the new name and PIN key by key (regression for the reset bug).
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 412, 'height': 900}, has_touch=True, is_mobile=True)
    ctx.add_init_script("localStorage.setItem('yod_api','http://localhost:8789')")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8789/'); pg.wait_for_timeout(800)
    pg.click('.users button:has-text("Admin")')
    for d in '1986': pg.click(f'.pad button:has-text("{d}")')
    pg.wait_for_selector('#fsPin', timeout=5000)
    pg.click('#fsName'); pg.keyboard.type('Praveen', delay=40)
    pg.click('#fsPin'); pg.keyboard.type('4321', delay=60)
    assert pg.locator('#fsPin').count() == 1, 'setup form was replaced while typing'
    print('pin field value:', pg.input_value('#fsPin'))
    pg.click('button:has-text("Save & continue")'); pg.wait_for_timeout(1500)
    print('app visible:', pg.is_visible('#app'), '| user:', pg.inner_text('#meBtn'))
    pg.click('#meBtn'); pg.wait_for_timeout(300); pg.click('button:has-text("Log out")'); pg.wait_for_timeout(800)
    pg.click('.users button:has-text("Praveen")')
    for d in '4321': pg.keyboard.press(d)
    pg.wait_for_timeout(1500)
    print('re-login with new PIN by keyboard:', pg.is_visible('#app'))
    print('errors:', errs or 'none'); b.close()
