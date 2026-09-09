/**
 * Migration des cartes sponsor ENCASTREES vers le modele CAMPAGNES.
 *
 * Ancien circuit : les cartes vivent dans `editions/{id}.sponsor.opportunities`
 * et `.fundings`, tirees directement par le jeu (EventManager, source 1).
 * Nouveau circuit : une carte est une campagne, projetee dans `sponsorFeed`.
 *
 * Deux traitements distincts, decides avec l'utilisateur :
 *   - agriculture : 4 cartes de TEST, aucun compte annonceur « Yeah »
 *                   -> supprimees, sponsoring desactive ;
 *   - healthtech  : 4 cartes ADEPME reelles -> 4 campagnes actives, aux
 *                   conditions EXISTANTES (15 F/vue, objectif 1000) pour ne
 *                   rien changer a ce qui a ete vendu.
 *
 * SIMULATION par defaut. `--apply` pour ecrire.
 */
const admin = require('firebase-admin');
const fs = require('fs');

const APPLIQUER = process.argv.includes('--apply');
const RACINE = '/Users/macbookair/Desktop/projets/concree/new/startup-ludo-admin-github';

const f = fs.readdirSync(RACINE).find((x) => x.startsWith('startup-ludo-new-firebase-adminsdk'));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(`${RACINE}/${f}`, 'utf8'))) });
const db = admin.firestore();

/** Compte annonceur ADEPME (verifie : role sponsor, perimetre healthtech). */
const UID_ADEPME = 'Pz3lU2uwBAZ68dNSud7aUBjAoxh1';
const EMAIL_ADEPME = 'adepme@concree.com';

/** `funding` -> carte financement ; sinon opportunite. */
function kindCampagne(source) {
  return source === 'fundings' ? 'financement' : 'opportunite';
}

async function main() {
  const maintenant = Date.now();
  const plan = { supprimees: [], campagnes: [], editionsDesactivees: [], editionsNettoyees: [] };

  // ── agriculture : cartes de test ──
  const agri = await db.collection('editions').doc('agriculture').get();
  const spAgri = agri.data()?.sponsor;
  if (spAgri) {
    const n = [...(spAgri.opportunities ?? []), ...(spAgri.fundings ?? [])].filter((c) => c.text?.trim()).length;
    plan.supprimees.push(`agriculture : ${n} carte(s) de test supprimee(s), sponsoring desactive`);
    if (APPLIQUER) {
      await agri.ref.update({
        'sponsor.opportunities': [],
        'sponsor.fundings': [],
        'sponsor.enabled': false,
      });
    }
    plan.editionsDesactivees.push('agriculture');
  }

  // ── healthtech : cartes ADEPME -> campagnes ──
  const hs = await db.collection('editions').doc('healthtech').get();
  const sp = hs.data()?.sponsor;
  if (sp) {
    const perView = typeof sp.pricePerView === 'number' ? sp.pricePerView : 15;
    const viewsGoal = typeof sp.viewsGoal === 'number' ? sp.viewsGoal : 1000;

    for (const source of ['opportunities', 'fundings']) {
      for (const carte of sp[source] ?? []) {
        if (!carte.text?.trim()) continue;
        // L'id de campagne DERIVE de l'id de carte : rejouer le script ne
        // creera pas de doublon, et la trace vers l'origine reste lisible.
        const id = `mig_${carte.id}`;
        const campagne = {
          ownerUid: UID_ADEPME,
          ownerEmail: EMAIL_ADEPME,
          format: 'card',
          status: 'active',
          card: {
            kind: kindCampagne(source),
            rectoText: carte.text,
            tokens: typeof carte.tokens === 'number' ? carte.tokens : (source === 'fundings' ? 4 : 2),
            structure: sp.name || 'ADEPME',
            logoUrl: carte.logoUrl || sp.logoUrl || '',
            // `libelle` et non `label`, et `type` obligatoire : c'est la forme
            // que `projeterCarteFeed()` lit. Un CTA mal nomme aurait fait
            // disparaitre silencieusement le lien de la carte.
            cta: carte.linkUrl
              ? { type: 'site', url: carte.linkUrl, libelle: 'En savoir plus' }
              : undefined,
          },
          targeting: { sectors: [], regions: [] },
          viewsGoal,
          budgetCapFcfa: 0,
          // Grille FIGEE aux conditions deja en vigueur : la migration ne doit
          // pas renegocier ce qui a ete vendu. `perClick: 0` parce que
          // l'ancien circuit ne facturait pas le clic — l'introduire ici
          // ferait payer a ADEPME plus qu'aujourd'hui a trafic egal.
          pricing: { perView, perClick: 0, grid: 'standard' },
          period: { startAt: null, endAt: null },
          consentAt: maintenant,
          submittedAt: maintenant,
          review: { reviewedAt: maintenant },
          migreDepuis: { editionId: 'healthtech', carteId: carte.id, source },
          createdAt: maintenant,
          updatedAt: maintenant,
        };
        plan.campagnes.push(`${id} | ${kindCampagne(source)} | ${carte.text.slice(0, 45)} | ${perView} F/vue`);
        if (APPLIQUER) await db.collection('campaigns').doc(id).set(campagne);
      }
    }

    // Les cartes encastrees sont videes : le feed prend le relais. L'habillage
    // (visuel, logo, popup) RESTE actif — seules les cartes changent de circuit.
    plan.editionsNettoyees.push('healthtech : cartes videes, habillage conserve');
    if (APPLIQUER) {
      await hs.ref.update({ 'sponsor.opportunities': [], 'sponsor.fundings': [] });
    }
  }

  console.log(APPLIQUER ? '=== APPLIQUE ===' : '=== SIMULATION (aucune ecriture) ===');
  console.log('\n-- Supprime --');
  plan.supprimees.forEach((x) => console.log('  ', x));
  console.log('\n-- Campagnes creees --');
  plan.campagnes.forEach((x) => console.log('  ', x));
  console.log('\n-- Editions --');
  [...plan.editionsDesactivees.map((e) => e + ' : sponsoring desactive'), ...plan.editionsNettoyees]
    .forEach((x) => console.log('  ', x));
  console.log(`\nTotal : ${plan.campagnes.length} campagne(s), ${plan.supprimees.length} nettoyage(s).`);
  process.exit(0);
}

main().catch((e) => { console.error('ERREUR:', e.message); process.exit(1); });
