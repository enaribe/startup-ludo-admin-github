/**
 * Corpus de référence du contrôle thématique.
 *
 * POURQUOI UN FICHIER À PART — ces textes sont la JUSTIFICATION des deux listes
 * de racines et du seuil d'acceptation. Ils ne sont pas des exemples
 * décoratifs : chaque ajout à une liste doit être confronté à `HORS_SUJET` (pour
 * ne pas créer de faux positif), et chaque retrait à `DOMAINE` (pour ne pas
 * perdre une détection). Les séparer du fichier de tests rend cette
 * confrontation réutilisable par plusieurs suites.
 *
 * Les extraits font quatre à six phrases, soit BEAUCOUP moins qu'un vrai
 * polycopié. C'est voulu : si le contrôle tranche correctement sur si peu de
 * matière, il tranchera a fortiori sur un cours complet.
 */

/**
 * Cours du DOMAINE — doivent être acceptés sans appel IA.
 *
 * Volontairement étalés sur tout le périmètre du produit, et pas seulement sur
 * l'entrepreneuriat au sens strict : la comptabilité, la fiscalité, les
 * ressources humaines et la logistique sont ce que les enseignants déposent
 * réellement, et aucun de ces cours n'emploie forcément le mot
 * « entrepreneuriat ».
 */
export const DOMAINE = {
  'business model':
    "Le business model canvas comporte neuf blocs dont la proposition de valeur et le " +
    "segment de clientèle. L'étude de marché précède le plan d'affaires. L'entrepreneur " +
    'évalue son seuil de rentabilité et son besoin en fonds de roulement. Le financement ' +
    'mobilise fonds propres, crédit bancaire et microfinance.',
  'gestion commerciale':
    'La facturation suit la livraison. La marge commerciale est la différence entre le ' +
    "prix de vente et le coût d'achat. La comptabilité enregistre chaque opération et la " +
    'trésorerie se suit au jour le jour. Le fournisseur accorde parfois un délai de ' +
    "paiement. La clientèle fidèle génère un chiffre d'affaires récurrent.",
  'marketing digital':
    'Le positionnement précède le mix marketing. Les quatre P sont le produit, le prix, ' +
    'la place et la promotion. La notoriété de la marque se mesure par des enquêtes. Le ' +
    "taux de conversion mesure l'efficacité d'une campagne. Le panier moyen progresse " +
    'avec la fidélisation. La prospection alimente la force de vente.',
  'ressources humaines':
    "Le recrutement commence par la fiche de poste. L'entretien d'embauche évalue les " +
    'candidats. Le contrat de travail fixe la rémunération. Le bulletin de paie détaille ' +
    'les cotisations sociales. La formation continue développe les compétences. La masse ' +
    "salariale pèse sur le compte d'exploitation.",
  'comptabilité générale':
    "Le bilan présente l'actif immobilisé et l'actif circulant face aux capitaux propres. " +
    "Le compte de résultat distingue les charges et les produits. L'amortissement répartit " +
    'le coût d’une immobilisation. La TVA collectée se déduit de la TVA déductible. Le ' +
    'grand livre reprend chaque écriture comptable. Le rapprochement bancaire vérifie la ' +
    'trésorerie.',
  'droit des affaires':
    'La SARL limite la responsabilité des associés à leurs apports. Les statuts fixent ' +
    "l'objet social et le capital social. L'immatriculation au registre du commerce " +
    'confère la personnalité morale. La société anonyme convient aux projets de grande ' +
    "taille. L'entreprise individuelle n'a pas de patrimoine distinct.",
  'microfinance rurale':
    "L'institution de microfinance octroie des petits crédits aux producteurs. La caution " +
    'solidaire remplace la garantie bancaire. Le taux de remboursement dépasse souvent ' +
    '95 %. Les groupements d’épargne mutualisent le risque. L’éducation financière ' +
    'accompagne le décaissement. L’échéance de prêt suit le calendrier agricole.',
  'logistique et achats':
    'La gestion des stocks évite la rupture de stock et le surstockage. Le juste-à-temps ' +
    'réduit les immobilisations. Le fournisseur est sélectionné sur le prix, la qualité ' +
    "et le délai. Le bon de commande précède la livraison. L'approvisionnement suit la " +
    'capacité de production. Le cahier des charges encadre la sous-traitance.',
  'économie sociale et solidaire':
    'La coopérative appartient à ses membres selon le principe une personne une voix. La ' +
    "mutuelle redistribue ses excédents. L'entreprise sociale poursuit une finalité " +
    "d'intérêt général. L'impact social se mesure par des indicateurs partagés. Les " +
    'groupements féminins structurent l’économie sociale locale.',
  'innovation et produit':
    'Le prototype valide les hypothèses techniques. Le produit minimum viable teste ' +
    "l'appétence du marché. L'étude de faisabilité précède l'investissement. Le dépôt de " +
    'brevet protège la propriété intellectuelle. L’itération produit s’appuie sur les ' +
    "tests utilisateur. L'incubateur héberge les porteurs de projet.",
  'pitch et levée de fonds':
    "L'elevator pitch tient en trente secondes. Le deck de présentation compte dix " +
    'diapositives. La valorisation pre-money détermine la dilution. Le term sheet précède ' +
    "le pacte d'actionnaires. La due diligence vérifie les affirmations du fondateur. Les " +
    'business angels investissent avant le capital-risque.',
  'fiscalité de l’entreprise':
    "L'impôt sur les sociétés frappe le bénéfice imposable. La patente est due par tout " +
    "commerçant. L'acompte provisionnel anticipe la liquidation annuelle. Le régime du " +
    'forfait simplifie les obligations déclaratives. La retenue à la source concerne ' +
    'certains paiements. Le redressement fiscal peut porter sur trois exercices ' +
    'comptables.',
};

/**
 * Cours HORS-SUJET — doivent être refusés sans appel IA.
 *
 * Chaque discipline enseignée au secondaire est représentée, y compris celles
 * qui PARLENT d'argent, de production ou d'organisation sans relever du
 * produit : l'énoncé de mathématiques sur un prix, l'histoire industrielle,
 * l'éducation civique sur l'impôt. Ce sont ces textes-là qui démasquent une
 * racine trop large.
 */
export const HORS_SUJET = {
  'SVT — cellule et génétique':
    'La photosynthèse permet aux plantes chlorophylliennes de produire de la matière ' +
    'organique. Les chloroplastes contiennent la chlorophylle. La respiration cellulaire ' +
    "libère l'énergie du glucose dans les mitochondries. L'ADN porte l'information " +
    'génétique. La mitose assure la division cellulaire. Le phénotype résulte du génotype ' +
    'et du milieu.',
  'SVT — écologie':
    "L'écosystème associe biotope et biocénose. La chaîne alimentaire transfère l'énergie " +
    'entre les niveaux trophiques. La biodiversité se mesure par la richesse spécifique. ' +
    'La pollution des sols appauvrit les rendements. Le recyclage réduit l’empreinte ' +
    'écologique. Les énergies renouvelables remplacent les fossiles.',
  'physique — mécanique et électricité':
    'La force de gravitation est proportionnelle au produit des masses. L’énergie ' +
    'cinétique dépend du carré de la vitesse. Le circuit en série additionne les ' +
    'résistances. La réfraction dévie le rayon lumineux. La poussée d’Archimède équilibre ' +
    'le poids. La période d’un pendule dépend de sa longueur.',
  'chimie':
    "La mole correspond au nombre d'Avogadro de particules. Une réaction acido-basique " +
    "transfère un proton. L'équation doit être équilibrée en masse et en charge. La " +
    'solubilité varie avec la température. L’oxydoréduction échange des électrons. Le pH ' +
    'mesure l’acidité d’une solution.',
  'mathématiques — avec des prix':
    'Un commerçant vend 3 kg de riz pour 2400 francs : calculer le prix de 7 kg. Un ' +
    "capital de 100 000 francs est placé au taux annuel de 6 % : calculer la valeur " +
    "acquise après cinq ans. Résoudre l'équation 3x + 5 = 20. Le théorème de Thalès " +
    "permet de calculer une longueur. Calculer l'aire d'un triangle.",
  'français — grammaire et argumentation':
    "Le complément d'objet direct répond à la question qui ou quoi. L'accord du participe " +
    'passé avec l’auxiliaire être se fait avec le sujet. La thèse énonce la position ' +
    'défendue. Le connecteur logique articule le raisonnement. La concession reconnaît la ' +
    'force de l’opinion adverse. La métaphore est une figure d’analogie.',
  'philosophie':
    'La liberté se distingue du libre arbitre. Kant distingue l’impératif catégorique de ' +
    "l'impératif hypothétique. Le cogito cartésien fonde la certitude sur le doute " +
    "méthodique. L'existence précède l'essence chez Sartre. Le relativisme culturel " +
    'conteste l’universalisme.',
  'histoire — révolution industrielle':
    'L’invention de la machine à vapeur transforme le textile. Les manufactures ' +
    'remplacent le travail à domicile. L’exode rural peuple les villes. Les conditions de ' +
    'travail des ouvriers suscitent les premières lois sociales. Le chemin de fer réduit ' +
    'les distances. La conférence de Berlin organise le partage de l’Afrique.',
  'géographie physique':
    "Le relief résulte de l'érosion et de la tectonique. Le climat tropical humide connaît " +
    'deux saisons. Le bassin versant collecte les eaux de ruissellement. La mousson ' +
    'apporte des précipitations saisonnières. Les conteneurs standardisent le transport ' +
    'maritime. Les flux migratoires suivent les écarts de développement.',
  'éducation civique':
    'La citoyenneté implique des droits et des devoirs. Le vote est un droit fondamental. ' +
    "L'impôt finance les services publics. La constitution organise la séparation des " +
    "pouvoirs. L'état civil enregistre les naissances. La laïcité garantit la neutralité " +
    'de l’État.',
  'informatique — algorithmique et bases de données':
    'Une boucle for itère sur une séquence. Les tableaux sont indexés à partir de zéro. La ' +
    'récursivité consiste pour une fonction à s’appeler elle-même. La clé primaire ' +
    'identifie chaque enregistrement. La jointure relie deux tables. Une transaction ' +
    'garantit l’atomicité.',
  'agriculture — technique culturale':
    'Le labour retourne la couche arable. La rotation des cultures préserve la fertilité. ' +
    'L’engrais azoté favorise la croissance végétative. L’irrigation goutte-à-goutte ' +
    'économise l’eau. Les semences améliorées résistent à la sécheresse. Le rendement se ' +
    'mesure en tonnes par hectare.',
  'cuisine et nutrition':
    'La mise en place précède le service. Le fond de sauce mijote plusieurs heures. ' +
    'L’hygiène impose la chaîne du froid. Les glucides fournissent l’énergie immédiate. ' +
    'Les protéines assurent la construction tissulaire. Les carences en fer provoquent ' +
    'l’anémie.',
  'EPS':
    'L’échauffement prévient les blessures musculaires. Le relais 4x100 mètres exige une ' +
    'transmission précise du témoin. Les étirements se pratiquent à froid ou à chaud. Le ' +
    'saut en longueur comporte quatre phases. La fréquence cardiaque maximale décroît avec ' +
    'l’âge. L’endurance se développe en aérobie.',
  'administratif — règlement intérieur':
    'Les élèves entrent dans l’établissement à 7h30. Le port de l’uniforme est ' +
    'obligatoire. Tout retard doit être justifié auprès du surveillant général. L’usage du ' +
    'téléphone est interdit en classe. Le conseil de discipline statue sur les sanctions. ' +
    'L’emploi du temps est affiché en salle des professeurs.',
};

/**
 * Cours LIMITROPHES — ne doivent être ni acceptés ni refusés localement.
 *
 * C'est la raison d'être de la liste de voisinage. Chacun de ces cours peut
 * porter un volet entrepreneurial réel, mais aucun n'emploie assez de
 * vocabulaire métier pour en être sûr sans lire le sens. Les refuser serait le
 * faux positif le plus coûteux du module ; les accepter laisserait passer de
 * l'économie macro sans rapport avec le produit. Seul le classifieur peut
 * trancher.
 */
export const LIMITROPHES = {
  'économie générale':
    'Le produit intérieur brut mesure la valeur ajoutée produite sur un territoire. ' +
    "L'inflation est la hausse générale des prix. La politique monétaire est conduite par " +
    'la banque centrale. Le chômage structurel se distingue du conjoncturel. La balance ' +
    'commerciale compare exportations et importations.',
  'droit du travail':
    'Le contrat à durée indéterminée est la forme normale de la relation de travail. La ' +
    'période d’essai se calcule en jours calendaires. Le salarié bénéficie d’un congé ' +
    'annuel payé. La rupture conventionnelle suppose un accord des deux parties. Le ' +
    'syndicat représente les travailleurs.',
  'éducation financière des ménages':
    'Le budget familial distingue les dépenses contraintes des dépenses de loisir. ' +
    'L’épargne de précaution couvre trois mois de revenu. Le crédit à la consommation ' +
    'coûte plus cher qu’un paiement comptant. Le mobile money facilite le transfert ' +
    'd’argent. L’assurance protège contre les aléas.',
  'gestion de projet associatif':
    'Le projet se découpe en activités planifiées. Le bailleur exige un rapport d’activité ' +
    'semestriel. La coopération entre acteurs locaux démultiplie l’effet. Les dépenses ' +
    'respectent le budget approuvé. Les femmes rurales sont les premières concernées.',
  'développement local et filières':
    'La transformation agroalimentaire allonge la durée de conservation. Les éleveurs se ' +
    'regroupent pour négocier le prix de vente. L’accès au marché conditionne le revenu ' +
    'des producteurs. La commercialisation collective réduit les coûts. Le commerce de ' +
    'proximité maintient l’emploi.',
  'économie du développement':
    'Le microcrédit a été pensé comme un outil de lutte contre la pauvreté. Les transferts ' +
    'des migrants dépassent l’aide publique. L’investissement en capital humain accroît la ' +
    'productivité à long terme. L’épargne intérieure finance mal la croissance.',
};
