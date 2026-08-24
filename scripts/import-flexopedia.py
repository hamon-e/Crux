#!/usr/bin/env python3
"""Importe flexopedia.csv : télécharge les images et génère les seeds TS."""
import csv
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CSV_PATH = 'flexopedia.csv'
IMG_DIR = 'assets/images/mobility'
OUT_IMAGES = 'src/db/mobility-images.ts'
OUT_EXERCISES = 'src/db/mobility-exercises.ts'

MUSCLE_MAP = {
    'quad': 'quads', 'hamstring': 'hamstrings', 'glute': 'glutes',
    'hip flexor': 'quads', 'calf': 'calves', 'adductor': 'glutes',
    'abductor': 'glutes', 'core': 'core', 'ab': 'core', 'oblique': 'core',
    'back': 'back', 'lat': 'back', 'trap': 'traps', 'shoulder': 'shoulders',
    'deltoid': 'shoulders', 'chest': 'chest', 'pec': 'chest',
    'bicep': 'biceps', 'tricep': 'triceps', 'forearm': 'forearms',
    'wrist': 'forearms', 'rotator': 'shoulders',
}


def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'")


def slug(name):
    s = ''.join(c if c.isalnum() else '_' for c in name)
    return re.sub('_+', '_', s).strip('_')


def norm(s):
    return (s.lower().normalize('NFD') if False else s.lower())


def guess_muscle(row):
    fields = [row.get('muscles_strengthened') or '', row.get('muscles_stretched') or '']
    for f in fields:
        for key, muscle in MUSCLE_MAP.items():
            if key in f.lower():
                return muscle
    return 'fullbody'


def download(job):
    url, dest = job
    if os.path.exists(dest):
        return True
    # Version allégée des images Squarespace (750px au lieu de 1500px).
    url = re.sub(r'format=\d+w', 'format=750w', url)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
            f.write(r.read())
        return True
    except Exception as e:
        print('FAIL', url, e)
        return False


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))

    seen, planned = set(), []
    for row in rows:
        name = row['name'].strip()
        if name in seen or not name:
            continue
        seen.add(name)
        url = (row.get('image_url') or '').strip()
        ext = '.png' if '.png' in url.lower() else '.jpg'
        fname = slug(name) + ext
        dest = os.path.join(IMG_DIR, fname)
        if url:
            planned.append((name, fname, dest, row))
        else:
            planned.append((name, fname, None, row))

    ok = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {p[0]: pool.submit(download, (p[3]['image_url'], p[2])) for p in planned if p[2]}
        for i, p in enumerate(planned):
            name, fname, dest, row = p
            has_img = bool(dest) and futures[name].result()
            if dest and not has_img:
                print('FAIL', name)
            if (i + 1) % 25 == 0:
                print(f'{i + 1}/{len(planned)}…')
            ok[name] = has_img

    jobs = [(p[0], p[1]) for p in planned if ok[p[0]]]
    entries = [
        (p[0], p[3].get('difficulty', '').strip(), p[3].get('type', '').strip(), guess_muscle(p[3]))
        for p in planned
    ]
    missing = [p[0] for p in planned if not ok[p[0]]]

    with open(OUT_IMAGES, 'w', encoding='utf-8') as f:
        f.write('// Généré par scripts/import-flexopedia.py — images Flexopedia (Dani Winks Flexibility)\n\n')
        f.write('export const MOBILITY_IMAGES: Record<string, number> = {\n')
        for name, fname in sorted(jobs):
            f.write(f"  '{esc(name)}': require('../../assets/images/mobility/{fname}'),\n")
        f.write('};\n')

    with open(OUT_EXERCISES, 'w', encoding='utf-8') as f:
        f.write('// Généré par scripts/import-flexopedia.py — exercices Flexopedia (mobilité)\n\n')
        f.write('export type MobilityExercise = readonly [string, string, string, string];\n')
        f.write('// Tuple : [nom, difficulté, type, muscle]\n')
        f.write('export const MOBILITY_EXERCISES: readonly MobilityExercise[] = [\n')
        for name, difficulty, type_, muscle in entries:
            f.write(f"  ['{esc(name)}', '{esc(difficulty)}', '{esc(type_)}', '{muscle}'],\n")
        f.write('];\n')

    print(f'importés: {len(entries)} ; images OK: {len(jobs)} ; sans image: {len(missing)}')
    for m in missing:
        print('  sans image:', m)


if __name__ == '__main__':
    main()
