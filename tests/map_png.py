# 调试：把 map_dump.js 输出的字符画转成 PNG（仅用标准库）
import sys, zlib, struct
rows = [l for l in sys.stdin.read().split('\n') if l]
S = 4
col = {'.': (70,120,60), '~': (60,120,190), '=': (170,150,100), 'b': (40,90,30), '#': (60,55,50),
       'T': (40,90,255), 'U': (255,60,60), 'C': (255,220,0), 'X': (255,255,255), 'F': (0,255,255)}
h, w = len(rows) * S, len(rows[0]) * S
raw = bytearray()
for r in rows:
    line = bytearray()
    for ch in r:
        line += bytes(col.get(ch, (255,0,255))) * S
    for _ in range(S):
        raw += b'\x00' + line
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 6)) + chunk(b'IEND', b'')
open(sys.argv[1], 'wb').write(png)
