# Carnet d’entraînement

Application mobile de suivi d’entraînement, pensée pour la musculation, la mobilité et l’escalade. Elle fonctionne localement : les séances, routines et progrès sont enregistrés dans une base SQLite sur l’appareil.

## Fonctionnalités

- Créer une séance libre ou la démarrer depuis une routine, avec chronomètre, séries, poids, répétitions, durée et RPE.
- Enregistrer des activités hors musculation (bloc, voie, vélo, course, natation ou randonnée), avec durée, date et notes.
- Gérer des routines et les mettre à jour depuis une séance terminée.
- Consulter l’historique, une heatmap d’activité et le suivi hebdomadaire.
- Suivre les volumes par groupe musculaire, les records personnels et les statistiques globales.
- Parcourir un arbre de compétences pour la force, la mobilité et l’escalade, puis valider les étapes réalisées.
- Importer un historique depuis un export CSV de Strong, avec association des exercices.
- Exporter les données en CSV ou en sauvegarde JSON complète.
- Programmer un rappel quotidien lorsqu’une routine n’a pas été effectuée depuis au moins sept jours.

## Stack technique

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) et React Native
- Expo Router pour la navigation
- `expo-sqlite` pour la persistance locale et les migrations de schéma
- TypeScript, NativeWind et React Native Reanimated

L’application cible iOS, Android et le web. Les notifications locales sont disponibles sur mobile.

## Démarrage

Prérequis : Node.js 22.13 ou plus récent et [pnpm](https://pnpm.io/). Expo SDK 57 est associé à React Native 0.86 et React 19.2.3 ; consulter la [référence SDK 57](https://docs.expo.dev/versions/v57.0.0/) pour les détails de compatibilité.

```bash
pnpm install
pnpm start
```

Puis choisir une cible dans le terminal Expo, ou lancer directement :

```bash
pnpm ios
pnpm android
pnpm web
```

## Commandes utiles

```bash
pnpm lint       # Vérification ESLint
pnpm typecheck  # Vérification TypeScript
pnpm format     # Formatage avec Prettier
```

## Organisation du projet

```text
src/app/         Écrans et navigation Expo Router
src/components/  Composants réutilisables
src/db/          Schéma SQLite, migrations, requêtes et catalogue d’exercices
src/lib/         Import Strong, rappels et logique d’arbre de compétences
src/assets/      Illustrations des compétences
```

## Données et sauvegarde

Les données ne dépendent d’aucun service distant. Utiliser **Plus → Exporter / sauvegarder** pour créer un CSV partageable ou une sauvegarde JSON. L’import disponible dans **Plus → Importer depuis Strong (CSV)** est conçu pour les exports Strong.
