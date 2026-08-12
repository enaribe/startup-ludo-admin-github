/**
 * Enregistre le hook de résolution `loader.mjs` auprès du chargeur de modules.
 *
 * Passer par `--import` et `register()` plutôt que par `--loader` : ce dernier
 * est déprécié depuis Node 20 et émet un avertissement à chaque exécution.
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./loader.mjs', pathToFileURL(import.meta.filename));
