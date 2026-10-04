#!/usr/bin/env python3
"""Jana Logo.html (data URI) daripada fail PNG logo.

Guna:  python3 tools/make_logo_html.py logo.png
Cadangan: PNG lut sinar, lebar ~240px. Logo UTM ASCEND 2030 yang disertakan direka untuk latar merah (#90020b),
jadi sidebar meletakkannya pada panel berwarna itu. Jika logo anda berlatar lut sinar lain, ubah warna
`.brandlogo` dalam Styles.html.
"""
import base64, sys, pathlib

if len(sys.argv) != 2:
    sys.exit(__doc__)
data = pathlib.Path(sys.argv[1]).read_bytes()
if data[:8] != b'\x89PNG\r\n\x1a\n':
    sys.exit('Fail mesti PNG.')
b64 = base64.b64encode(data).decode()
out = pathlib.Path(__file__).resolve().parent.parent / 'Logo.html'
out.write_text('<script>window.UTM_LOGO = "data:image/png;base64,%s";</script>\n' % b64)
print('Ditulis %s (%d KB)' % (out, len(b64) // 1024))
