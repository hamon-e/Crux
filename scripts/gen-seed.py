#!/usr/bin/env python3
"""Génère le seed depuis free-exercise-db et télécharge les images."""
import json, os, subprocess, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
IMG_DIR = 'assets/images/exercises'
MUSCLE_MAP = {
    'chest': 'chest', 'lats': 'back', 'middle back': 'back', 'lower back': 'back',
    'traps': 'traps', 'neck': 'traps', 'shoulders': 'shoulders',
    'biceps': 'biceps', 'triceps': 'triceps', 'forearms': 'forearms',
    'abs': 'core', 'abdominals': 'core', 'quads': 'quads', 'quadriceps': 'quads',
    'hamstrings': 'hamstrings', 'glutes': 'glutes', 'calves': 'calves',
    'abductors': 'glutes', 'adductors': 'glutes',
}
EQUIP_MAP = {
    'barbell': 'barbell', 'dumbbell': 'dumbbell', 'machine': 'machine',
    'cable': 'cable', 'body only': 'bodyweight', 'none': 'bodyweight',
    'kettlebells': 'kettlebell', 'bands': 'band', 'e-z curl bar': 'barbell',
    'medicine ball': 'other', 'exercise ball': 'other', 'foam roll': 'other',
    'other': 'other',
}

def esc(s):
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('"', '\\"')

def slug(name):
    return ''.join(c if c.isalnum() else '_' for c in name).strip('_')

def download(entry):
    img_path, dest = entry
    if os.path.exists(dest):
        return True
    url = BASE + img_path
    try:
        urllib.request.urlretrieve(url, dest)
        return True
    except Exception as e:
        print('FAIL', img_path, e)
        return False

def main():
    db = json.load(open('/tmp/fedb.json'))
    os.makedirs(IMG_DIR, exist_ok=True)

    jobs, entries, no_img = [], [], []
    for e in db:
        name = e['name']
        muscle = next((MUSCLE_MAP[m] for m in e.get('primaryMuscles', []) if m in MUSCLE_MAP), 'fullbody')
        equip = EQUIP_MAP.get(e.get('equipment') or 'other', 'other')
        img_file = None
        if e['images']:
            img_file = f'{slug(e["id"])}.jpg'
            jobs.append((e['images'][0], os.path.join(IMG_DIR, img_file)))
        else:
            no_img.append(name)
        entries.append({'name': name, 'muscle': muscle, 'equipment': equip, 'img': img_file})

    print(f'{len(jobs)} images à télécharger…')
    with ThreadPoolExecutor(max_workers=16) as ex:
        results = list(ex.map(download, jobs))
    failed = [j for j, ok in zip(jobs, results) if not ok]
    for _, dest in failed:
        os.path.exists(dest) and os.remove(dest)
    if failed:
        print(f'OK: {sum(results)}/{len(jobs)}, échecs: {len(failed)}')
    else:
        print('toutes les images déjà présentes')

    # Redimensionne pour limiter la taille du bundle
    for _, dest in jobs:
        if os.path.exists(dest):
            subprocess.run(['sips', '-Z', '480', dest], capture_output=True)

    # Génère le fichier de mapping d'images
    lines = ["// Généré par scripts/gen-seed.py — images de free-exercise-db (domaine public)",
             "", "export const EXERCISE_IMAGES: Record<string, number> = {"]
    used = set()
    for en in entries:
        if en['img'] and os.path.exists(os.path.join(IMG_DIR, en['img'])):
            key = esc(en['name'])
            if key in used:
                continue
            used.add(key)
            lines.append(f"  '{key}': require('../../assets/images/exercises/{en['img']}'),")
    lines.append('};\n')
    open('src/db/exercise-images.ts', 'w').write('\n'.join(lines))

    # Génère le nouveau seed
    sl = ['import type { Muscle, Equipment } from "./types";', '',
          '// Généré par scripts/gen-seed.py depuis yuhonas/free-exercise-db (Unlicense)',
          'export type SeedExercise = readonly [string, Muscle, Equipment];', '',
          'export const SEED_EXERCISES: readonly SeedExercise[] = [']
    for en in entries:
        n = en['name'].replace('\\', '\\\\').replace("'", "\\'")
        sl.append(f"  ['{n}', '{en['muscle']}', '{en['equipment']}'],")
    sl.append('];')
    open('src/db/seed-exercises.ts', 'w').write('\n'.join(sl) + '\n')

    print(f'exercices: {len(entries)}, sans image: {len(no_img)}')

if __name__ == '__main__':
    main()
