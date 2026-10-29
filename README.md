> **Dépôt archivé — ne plus déployer depuis ici.**
>
> Depuis le 29/10/2026, le back-office vit dans le dépôt `startupludoweb`
> (Bitbucket : `abdoul-sy/startupludoweb`), à l'intérieur du route group
> `src/app/(admin)/`. Les deux sites sont fusionnés : `startupludo.io/login`
> et `startupludo.io/admin` servent le back-office, et `admin.startupludo.io`
> redirige en 301 vers `startupludo.io/login`.
>
> Le workflow de déploiement a été retiré de ce dépôt : il envoyait le code
> vers `/srv/startupludo/admin` sur le VPS, chemin qui n'est plus servi par
> nginx. Un déploiement depuis ici remettrait en ligne l'ancien back-office
> Next 15 et n'aurait aucun effet visible, ou écraserait du travail.
>
> Ce dépôt est conservé pour l'historique uniquement.

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
