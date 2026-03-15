# startup-ludo-admin

## Déploiement sur Vercel

1. **Variable d'environnement Firebase Admin**  
   Le fichier de compte de service Firebase n’est pas (et ne doit pas) être poussé sur le dépôt. Sur Vercel, définissez la variable d’environnement :
   - **Nom :** `FIREBASE_SERVICE_ACCOUNT_KEY`
   - **Valeur :** le contenu **complet** du fichier JSON du compte de service (celui dont le nom ressemble à `startup-ludo-new-firebase-adminsdk-….json`), collé comme une seule chaîne JSON.

2. **Autres variables**  
   Si vous utilisez des clés API (ex. `OPENAI_API_KEY`), ajoutez-les aussi dans les paramètres d’environnement du projet Vercel.

3. **Build**  
   Après avoir configuré `FIREBASE_SERVICE_ACCOUNT_KEY`, relancez un déploiement. Le build ne lit plus le fichier JSON au moment du build, uniquement à l’exécution des routes API.
# startup-ludo-admin-github
