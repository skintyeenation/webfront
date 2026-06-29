#!/usr/bin/env python3
"""Generate browser-viewable HTML previews of the ISC funding form PDFs.

Most ISC PAW/DCI forms are dynamic Adobe (XFA/LiveCycle) PDFs that render only a
"Please wait…" stub in any browser viewer. This script extracts the readable text
(headings + field labels) from each XFA form and writes a clean read-only HTML preview
to web/public/docs/forms/view/<key>.html. The original PDFs stay in web/public/docs/forms/
for download (they must be filled in Adobe Acrobat Reader). Normal (non-XFA) PDFs are
skipped — they view fine in-browser as-is.

Run from the repo root:  python3 website/scripts/generate-form-previews.py
"""
import re, zlib, html, glob, os

FORMS_DIR = os.path.join(os.path.dirname(__file__), '..', 'web', 'public', 'docs', 'forms')

DROP_EXACT = {
 'simplex','appdefault','delegate','memory','overwrite','required','presubmit','duplex','print','none',
 'page','pages','designer 6.5','protected','text field','canada wordmark','export data','clear data',
 'view instructions button','instructions','export','clear','add a row','remove this row',
 'remove this budget','add a budget','yyyymmdd','yyyy-mm-dd','submit','reset','version','tab','flate',
 'info source','privacy act','privacy statement','forms services','government of canada','application/pdf',
 'av. j.-c.','ap. j.-c.','total'}
MONTHS = {m.lower() for m in ['January','February','March','April','May','June','July','August','September','October','November','December']}
DAYS = {d.lower() for d in ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']}
PRIVACY = ('privacy','disclosed without your consent','department of','financial administration',
 'info source','privacy commissioner','personal information','authorized by','your consent','c. 29')
FMT_TOKENS = ('MMMM','YYYY','MMM-','-MMM','DD/MM','YY-MM','HH:','h:MM','EEEE','SS A','min ','GyMd','GaMj')

def noise(s):
    sl = s.lower().strip()
    if sl in DROP_EXACT or sl in MONTHS or sl in DAYS: return True
    if any(p in sl for p in PRIVACY): return True
    if any(tok in s for tok in FMT_TOKENS): return True
    if re.match(r'^[A-Z]{2} - ', s): return True
    if re.match(r'^uuid:', sl) or re.match(r'^\d{4}-\d{2}-\d{2}', s) or re.match(r'^[\d.]+$', s): return True
    if re.match(r'^[GyMdkHmsSEDFwWahKzZxaj]{6,}$', s): return True
    if 'logo' in sl or 'adobe' in sl or 'trademark' in sl or 'reader_download' in sl: return True
    if sl.startswith('protected '): return True
    if re.match(r'^[\W_]+$', s): return True
    if ' ' not in s and len(s) <= 12 and s[:1].islower(): return True
    if 'cannot be before' in sl or 'if selected' in sl: return True
    return False

def blob(fn):
    data = open(fn, 'rb').read(); cs = []
    for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', data, re.S):
        try: cs.append(zlib.decompress(m.group(1)))
        except Exception: pass
    return b'\n'.join(cs).decode('utf-8', 'ignore')

def lines(b):
    out = []
    for s in re.findall(r'>([A-Za-z0-9][A-Za-z0-9 ,&/\-\(\):\.\?\'’%]{3,140})<', b):
        s = html.unescape(s).strip()
        if not s or noise(s): continue
        if s in out[-3:]: continue
        out.append(s)
    return out

def is_xfa(d): return (b'/XFA' in d) or (b'NeedsRendering' in d)
def heading(s): return 4 <= len(s) <= 55 and len(s.split()) <= 7 and not s.endswith(('.', '?', ':')) and s[0].isupper()

TMPL = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{t}</title>
<style>body{{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c2b2e;max-width:820px;margin:0 auto;padding:28px 22px 60px}}
h1{{font-size:22px;margin:0 0 4px}}.sub{{color:#5b7075;font-size:13px;margin:0 0 18px}}.note{{background:#f2f7f8;border:1px solid #dfe9ea;border-radius:10px;padding:12px 14px;font-size:13px;color:#4a5e62;margin:0 0 22px}}
h2{{font-size:15px;margin:22px 0 6px;color:#00707e;border-bottom:1px solid #e4ecec;padding-bottom:4px}}ul{{margin:6px 0 0;padding-left:18px}}li{{margin:3px 0}}a{{color:#00707e}}</style></head><body>
<h1>{t}</h1><p class="sub">ISC funding form preview (PAW {n}) — read-only.</p>
<div class="note">Read-only preview of the form’s contents. To fill it out, download the original (a dynamic Adobe form) and open it in the free <a href="https://get.adobe.com/reader/" target="_blank" rel="noopener">Adobe Acrobat Reader</a>.</div>
{b}</body></html>'''

def main():
    os.makedirs(os.path.join(FORMS_DIR, 'view'), exist_ok=True)
    n = 0
    for fn in sorted(glob.glob(os.path.join(FORMS_DIR, 'paw-*.pdf'))):
        d = open(fn, 'rb').read()
        if not is_xfa(d): continue
        key = os.path.basename(fn)[4:-4]
        ls = lines(blob(fn))
        if not ls: continue
        title = next((x for x in ls if re.search(r'Application|Program|Funding|Report|Plan|Proposal|Agreement', x) and 12 < len(x) < 95), max(ls[:8], key=len))
        body = []; ul = False
        for s in ls:
            if s == title: continue
            if heading(s):
                if ul: body.append('</ul>'); ul = False
                body.append(f'<h2>{html.escape(s)}</h2>')
            else:
                if not ul: body.append('<ul>'); ul = True
                body.append(f'<li>{html.escape(s)}</li>')
        if ul: body.append('</ul>')
        open(os.path.join(FORMS_DIR, 'view', f'{key}.html'), 'w').write(
            TMPL.format(t=html.escape(title), n=html.escape(key), b='\n'.join(body)))
        n += 1
    print(f'generated {n} form previews in {os.path.join(FORMS_DIR, "view")}')

if __name__ == '__main__':
    main()
