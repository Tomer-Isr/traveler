"""Небо для шаттла: звёзды до 6-й величины, линии и названия 88 созвездий -> web/data/sky.json.

Источник — d3-celestial (Olaf Frohn, BSD-3; звёзды из каталога HYG). Запуск: python tools/build_sky.py
Формат: stars = [ra°, dec°, mag, B-V, ...] плоско; lines = {id: [[ra, dec, ra, dec, ...], ...]};
names = {id: [ru, en, he, ra°, dec°]} (точка подписи).
"""
import json, pathlib, urllib.request

BASE = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'web' / 'data' / 'sky.json'


def get(name):
    with urllib.request.urlopen(BASE + name) as r:
        return json.load(r)


def ra(x):  # d3-celestial keeps RA as longitude −180…180
    return round(x % 360, 3)


stars = []
for f in get('stars.6.json')['features']:
    lon, lat = f['geometry']['coordinates']
    p = f['properties']
    try: bv = round(float(p.get('bv') or 0.6), 2)
    except ValueError: bv = 0.6
    stars += [ra(lon), round(lat, 3), round(p['mag'], 2), bv]
lines = {}
for f in get('constellations.lines.json')['features']:
    lines[f['id']] = [[v for pt in seg for v in (ra(pt[0]), round(pt[1], 3))] for seg in f['geometry']['coordinates']]
names = {}
for f in get('constellations.json')['features']:
    p = f['properties']; lon, lat = f['geometry']['coordinates']
    names[f['id']] = [p.get('ru') or p['name'], p['name'], p.get('he') or p['name'], ra(lon), round(lat, 2)]
OUT.write_text(json.dumps({'src': 'd3-celestial (BSD-3), HYG', 'stars': stars, 'lines': lines, 'names': names}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(OUT, OUT.stat().st_size // 1024, 'KB,', len(stars) // 4, 'stars,', len(lines), 'constellations')
