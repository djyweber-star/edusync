const fs = require('fs');
const path = require('path');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
 * SCHOOL FLOW — BASE LOCALE
 * Cette base ne dépend d'aucune API externe.
 *
 * Chaque entrée possède :
 * - intent
 * - keywords
 * - answer
 *
 * Le moteur utilise les mots-clés et les variantes pour reconnaître
 * différentes façons de poser une même question.
 */

const scenarios = [];

function addScenario(intent, keywords, answer) {
  scenarios.push({
    intent,
    keywords: keywords.map(normalizeText).filter(Boolean),
    answer
  });
}

/* =========================================================
   SALUTATIONS
   ========================================================= */

[
  'bonjour',
  'bonsoir',
  'bjr',
  'bsr',
  'salut',
  'coucou',
  'hello',
  'bon matin',
  'bonne journée',
  'bon apres midi',
  'bon après midi',
  'bonjour school flow',
  'bonjour assistant',
  'salut assistant',
  'cc',
  'yo'
].forEach(word => {
  addScenario(
    'greeting',
    [word],
    'Bonjour cher parent. Bienvenue sur *School Flow*.\n\nEn quoi puis-je vous aider ?'
  );
});

/* =========================================================
   REMERCIEMENTS
   ========================================================= */

[
  'merci',
  'merci beaucoup',
  'je vous remercie',
  'merci pour votre aide',
  'c est gentil',
  'super merci',
  'merci assistant',
  'merci school flow',
  'ok merci',
  'd accord merci',
  'parfait merci'
].forEach(word => {
  addScenario(
    'thanks',
    [word],
    'Avec plaisir. *School Flow* reste à votre disposition pour toute question concernant l’établissement.'
  );
});

/* =========================================================
   AIDE
   ========================================================= */

[
  'aide',
  'aidez moi',
  'besoin aide',
  'je besoin aide',
  'peux tu aider',
  'pouvez vous aider',
  'comment utiliser',
  'comment ca marche',
  'comment ça marche',
  'que peux tu faire',
  'que pouvez vous faire',
  'fonctionnalites',
  'fonctionnalités',
  'services disponibles',
  'assistant school flow'
].forEach(word => {
  addScenario(
    'help',
    [word],
    '🤖 *ASSISTANCE SCHOOL FLOW*\n\nJe peux vous aider concernant les informations de l’établissement, les inscriptions, les horaires, l’adresse, les groupes de communication et certaines informations concernant votre enfant.\n\nVous pouvez également taper */menu*.'
  );
});

/* =========================================================
   INSCRIPTIONS
   ========================================================= */

[
  'inscription',
  'inscriptions',
  'inscrire mon enfant',
  'inscrire enfant',
  'comment inscrire',
  'comment faire inscription',
  'nouvelle inscription',
  'inscription eleve',
  'inscription élève',
  'inscrire eleve',
  'inscrire élève',
  'dossier inscription',
  'documents inscription',
  'conditions inscription',
  'modalites inscription',
  'modalités inscription',
  'procedure inscription',
  'procédure inscription',
  'admission',
  'admission eleve',
  'admission élève',
  'inscription scolaire'
].forEach(word => {
  addScenario(
    'registration',
    [word],
    '📝 *INSCRIPTIONS*\n\nPour connaître les conditions, les documents nécessaires et les modalités d’inscription, veuillez contacter l’administration de l’établissement.\n\nLes informations officielles dépendent de votre établissement.'
  );
});

/* =========================================================
   HORAIRES
   ========================================================= */

[
  'horaire',
  'horaires',
  'heure ecole',
  'heures ecole',
  'heure école',
  'heures école',
  'heure debut cours',
  'heure début cours',
  'heure fin cours',
  'heure sortie',
  'heure entree',
  'heure entrée',
  'debut des cours',
  'début des cours',
  'fin des cours',
  'ouverture ecole',
  'ouverture école',
  'fermeture ecole',
  'fermeture école',
  'ecole ouvre a quelle heure',
  'école ouvre à quelle heure'
].forEach(word => {
  addScenario(
    'schedule',
    [word],
    '🕐 *HORAIRES*\n\nLes horaires officiels doivent être confirmés par l’administration de votre établissement.\n\nSi les horaires sont configurés dans School Flow, ils pourront être communiqués automatiquement.'
  );
});

/* =========================================================
   ADRESSE
   ========================================================= */

[
  'adresse',
  'adresse ecole',
  'adresse école',
  'ou se trouve ecole',
  'où se trouve école',
  'localisation ecole',
  'localisation école',
  'emplacement ecole',
  'emplacement école',
  'lieu ecole',
  'lieu école',
  'comment aller a ecole',
  'comment aller à école',
  'ou est ecole',
  'où est école',
  'position ecole',
  'position école'
].forEach(word => {
  addScenario(
    'address',
    [word],
    '📍 *ADRESSE DE L’ÉTABLISSEMENT*\n\nL’adresse officielle est celle enregistrée dans la configuration de l’établissement. Si elle n’est pas renseignée, veuillez contacter l’administration.'
  );
});

/* =========================================================
   DIRECTION / ADMINISTRATION
   ========================================================= */

[
  'direction',
  'parler direction',
  'contacter direction',
  'contact direction',
  'je veux direction',
  'administration',
  'contacter administration',
  'parler administration',
  'responsable ecole',
  'responsable école',
  'directeur',
  'directrice',
  'secretariat',
  'secrétariat',
  'bureau direction',
  'service administratif'
].forEach(word => {
  addScenario(
    'administration',
    [word],
    '👤 *ADMINISTRATION*\n\nPour joindre directement la direction ou l’administration, utilisez */contact* ou choisissez l’option d’assistance dans */menu*.'
  );
});

/* =========================================================
   GROUPES PARENTS / PROFESSEURS
   ========================================================= */

[
  'groupe parents',
  'groupe parent',
  'groupe parents professeurs',
  'groupe parents professeur',
  'groupe professeurs',
  'groupe whatsapp parents',
  'groupe whatsapp',
  'lien groupe',
  'lien du groupe',
  'lien groupe parents',
  'lien groupe professeurs',
  'groupe de communication',
  'groupe communication',
  'rejoindre groupe',
  'entrer groupe',
  'ajouter groupe',
  'groupe classe',
  'groupe parents prof',
  'groupe parent professeur'
].forEach(word => {
  addScenario(
    'groups',
    [word],
    '👥 *GROUPES DE COMMUNICATION*\n\nLe lien d’un groupe peut être communiqué uniquement s’il a été configuré par l’établissement.\n\nVous pouvez demander : « Quel est le lien du groupe parents-professeurs ? »'
  );
});

/* =========================================================
   ABSENCE
   ========================================================= */

[
  'absence',
  'absent',
  'absente',
  'mon enfant absent',
  'mon fils absent',
  'ma fille absente',
  'signaler absence',
  'signaler une absence',
  'justifier absence',
  'justification absence',
  'enfant ne vient pas',
  'enfant ne viendra pas',
  'eleve absent',
  'élève absent',
  'absence enfant'
].forEach(word => {
  addScenario(
    'absence',
    [word],
    '📅 *ABSENCE*\n\nPour signaler ou justifier l’absence d’un élève, veuillez suivre la procédure prévue par l’établissement ou contacter l’administration.'
  );
});

/* =========================================================
   RETARD
   ========================================================= */

[
  'retard',
  'retard enfant',
  'mon enfant est en retard',
  'mon fils est en retard',
  'ma fille est en retard',
  'signaler retard',
  'justifier retard',
  'retard eleve',
  'retard élève',
  'arrive en retard',
  'arrivera en retard'
].forEach(word => {
  addScenario(
    'lateness',
    [word],
    '⏰ *RETARD*\n\nSi votre enfant risque d’arriver en retard, veuillez prévenir l’établissement selon la procédure habituelle.'
  );
});

/* =========================================================
   INFORMATIONS ÉLÈVE
   ========================================================= */

[
  'information mon enfant',
  'informations mon enfant',
  'information eleve',
  'informations eleve',
  'information élève',
  'informations élève',
  'renseignement enfant',
  'renseignements enfant',
  'voir informations enfant',
  'consulter enfant',
  'dossier enfant',
  'dossier eleve',
  'dossier élève',
  'mon enfant'
].forEach(word => {
  addScenario(
    'student',
    [word],
    '👤 *INFORMATIONS ÉLÈVE*\n\nTapez */menu*, puis choisissez l’option *6 — Informations sur mon enfant*.\n\nPour protéger les données de l’élève, certaines informations sont accessibles uniquement aux parents ou responsables enregistrés.'
  );
});

/* =========================================================
   CONVOCATION
   ========================================================= */

[
  'convocation',
  'convocation parent',
  'convocation parents',
  'je suis convoque',
  'je suis convoqué',
  'parent convoque',
  'parent convoqué',
  'rendez vous direction',
  'rendez-vous direction',
  'demande rendez vous',
  'demande rendez-vous',
  'reunion avec direction',
  'réunion avec direction'
].forEach(word => {
  addScenario(
    'convocation',
    [word],
    '📄 *CONVOCATION*\n\nUne convocation officielle est normalement transmise par l’établissement avec les informations nécessaires concernant le rendez-vous.\n\nPour toute précision, veuillez contacter l’administration.'
  );
});

/* =========================================================
   COMMUNIQUÉS
   ========================================================= */

[
  'communique',
  'communiqué',
  'communiques',
  'communiqués',
  'annonce ecole',
  'annonce école',
  'information ecole',
  'information école',
  'message ecole',
  'message école',
  'actualite ecole',
  'actualité école',
  'nouvelle ecole',
  'nouvelle école',
  'informations parents',
  'information parents'
].forEach(word => {
  addScenario(
    'announcement',
    [word],
    '📢 *COMMUNICATION DE L’ÉTABLISSEMENT*\n\nLes communications officielles sont transmises par l’établissement via les canaux configurés dans School Flow.'
  );
});

/* =========================================================
   PROBLÈMES TECHNIQUES
   ========================================================= */

[
  'ca ne marche pas',
  'ça ne marche pas',
  'ne marche pas',
  'probleme',
  'problème',
  'bug',
  'erreur',
  'message erreur',
  'je ne comprends pas',
  'je comprends pas',
  'application ne marche pas',
  'school flow ne marche pas',
  'bot ne marche pas',
  'assistant ne marche pas',
  'je rencontre un probleme',
  'je rencontre un problème'
].forEach(word => {
  addScenario(
    'technical',
    [word],
    '⚙️ *ASSISTANCE TECHNIQUE*\n\nJe suis désolé pour ce problème. Vérifiez d’abord votre message et réessayez.\n\nSi le problème continue, tapez */contact* pour joindre l’assistance de l’établissement.'
  );
});

/* =========================================================
   POLITESSE / CONFIRMATION
   ========================================================= */

[
  'ok',
  'okay',
  'daccord',
  'd accord',
  'entendu',
  'compris',
  'je comprends',
  'parfait',
  'tres bien',
  'très bien',
  'super',
  'excellent',
  'c est bon',
  'cest bon',
  'bien recu',
  'bien reçu'
].forEach(word => {
  addScenario(
    'confirmation',
    [word],
    'Très bien. *School Flow* reste à votre disposition si vous avez besoin d’une autre information.'
  );
});

/* =========================================================
   GENERATION DE VARIANTES
   ========================================================= */


addScenario(
  'schedule',
  [
    'horaire',
    'horaires',
    'heure des cours',
    'heures des cours',
    'heure commence les cours',
    'heure commencent les cours',
    'a quelle heure commence les cours',
    'a quelle heure commencent les cours',
    'quand commencent les cours',
    'debut des cours',
    'début des cours',
    'heure de debut',
    'heure de début',
    'heure de fin des cours',
    'heures de cours',
    'emploi du temps',
    'planning des cours',
    'horaire scolaire'
  ],
  '🕐 *HORAIRES DES COURS*\\n\\nLes horaires de début et de fin des cours dépendent de l’établissement.\\n\\nPour connaître l’horaire officiel de votre enfant, veuillez consulter l’emploi du temps communiqué par l’établissement ou contacter l’administration.'
);

const prefixes = [
  'bonjour',
  'svp',
  's il vous plait',
  'sil vous plait',
  'excusez moi',
  'excuse moi',
  'je voudrais',
  'je veux',
  'je cherche',
  'pouvez vous me donner',
  'pouvez vous me dire',
  'est ce que vous pouvez',
  'comment',
  'je peux avoir',
  'possible d avoir'
];

const suffixes = [
  'svp',
  's il vous plait',
  'sil vous plait',
  'merci',
  'pour mon enfant',
  'pour mon fils',
  'pour ma fille',
  'pour mon enfant svp',
  'rapidement',
  'sil vous plait merci'
];

/*
 * On enrichit automatiquement chaque scénario avec plusieurs
 * formulations naturelles. Cela permet de dépasser largement
 * 1 500 variantes sans recopier inutilement les mêmes réponses.
 */


/* =========================================================
   SCHOOL FLOW LOCAL KNOWLEDGE EXTENSION V1
   Extension locale — aucune API nécessaire
   ========================================================= */

const schoolFlowKnowledgeV1 = [];

function addKnowledge(intent, keywords, answer) {
  schoolFlowKnowledgeV1.push({
    intent,
    keywords: Array.isArray(keywords) ? keywords : [keywords],
    answer
  });
}

/* =========================================================
   PAIEMENTS / FRAIS SCOLAIRES
   ========================================================= */

addKnowledge(
  'payment_status',
  [
    'mon fils a payé combien',
    'mon enfant a payé combien',
    'combien mon fils a payé',
    'combien mon enfant a payé',
    'mon fils a deja payé combien',
    'mon enfant a deja payé combien',
    'quel montant mon fils a payé',
    'quel montant mon enfant a payé',
    'combien il a payé',
    'combien elle a payé',
    'combien ils ont payé',
    'historique des paiements',
    'paiements de mon enfant',
    'paiement de mon fils',
    'paiement de ma fille'
  ],
  'Pour connaître le montant déjà payé par votre enfant, veuillez vérifier les paiements enregistrés dans School Flow. Le montant affiché correspond aux paiements effectivement enregistrés par l’établissement.'
);

addKnowledge(
  'payment_balance',
  [
    'il reste combien à payer',
    'combien reste a payer',
    'quel est le solde',
    'solde scolaire',
    'solde de mon enfant',
    'reste des frais',
    'reste a payer pour mon fils',
    'reste a payer pour mon enfant',
    'combien dois je encore payer',
    'combien je dois encore',
    'frais restants'
  ],
  'Pour connaître le solde restant, veuillez vérifier les frais scolaires et les paiements déjà enregistrés pour votre enfant dans School Flow.'
);

addKnowledge(
  'payment_receipt',
  [
    'je veux mon reçu',
    'je veux le reçu',
    'demande de reçu',
    'recu de paiement',
    'reçu de paiement',
    'facture de paiement',
    'je veux ma facture',
    'je nai pas reçu ma facture',
    'je n ai pas reçu ma facture',
    'je ne reçois pas ma facture',
    'facture non reçue',
    'facture non recue'
  ],
  'Si vous n’avez pas reçu votre reçu ou votre facture de paiement, veuillez vérifier les paiements enregistrés dans School Flow ou contacter l’administration/comptabilité de l’établissement.'
);

addKnowledge(
  'payment_missing',
  [
    'mon paiement nest pas enregistré',
    'mon paiement n est pas enregistré',
    'paiement non enregistré',
    'paiement non recu',
    'paiement non reçu',
    'jai payé mais',
    'j ai payé mais',
    'mon paiement napparait pas',
    'mon paiement n apparait pas',
    'jai payé mais ce nest pas affiché',
    'j ai payé mais ce n est pas affiché'
  ],
  'Si vous avez effectué un paiement qui n’apparaît pas dans School Flow, veuillez conserver votre preuve de paiement et contacter l’administration ou la comptabilité afin de vérifier l’opération.'
);

addKnowledge(
  'payment_confirmation',
  [
    'confirmation de paiement',
    'confirmer mon paiement',
    'paiement confirmé',
    'mon paiement est confirmé',
    'je veux confirmer mon paiement',
    'comment savoir si mon paiement est enregistré',
    'paiement enregistré'
  ],
  'La confirmation dépend du paiement enregistré dans School Flow. Pour vérifier une opération précise, veuillez consulter les paiements enregistrés ou contacter la comptabilité de l’établissement.'
);

addKnowledge(
  'payment_complaint',
  [
    'réclamation paiement',
    'reclamation paiement',
    'plainte paiement',
    'problème avec mon paiement',
    'probleme avec mon paiement',
    'problème de frais scolaires',
    'probleme de frais scolaires',
    'je me plains pour le paiement',
    'je veux faire une réclamation',
    'réclamation concernant les frais',
    'reclamation concernant les frais'
  ],
  'Nous sommes désolés pour cette situation. Pour une réclamation concernant un paiement ou les frais scolaires, veuillez communiquer les informations du paiement et contacter l’administration ou la comptabilité de l’établissement.'
);

addKnowledge(
  'school_fees',
  [
    'frais scolaires',
    'frais scolaire',
    'prix des frais scolaires',
    'combien coutent les frais',
    'combien coûtent les frais',
    'combien coute la scolarité',
    'combien coûte la scolarité',
    'montant de la scolarité',
    'prix de la scolarité',
    'combien payer pour lecole',
    'combien payer pour l école'
  ],
  'Pour connaître le montant exact des frais scolaires, veuillez consulter les informations financières communiquées par l’établissement ou contacter l’administration.'
);

/* =========================================================
   RÉCLAMATIONS / ASSISTANCE
   ========================================================= */

addKnowledge(
  'complaint',
  [
    'je veux faire une réclamation',
    'je veux faire une reclamation',
    'je veux me plaindre',
    'je voudrais me plaindre',
    'jai une plainte',
    'j ai une plainte',
    'jai un problème',
    'j ai un probleme',
    'je veux signaler un problème',
    'je veux signaler un probleme',
    'faire une plainte'
  ],
  'Nous sommes désolés pour le problème rencontré. Vous pouvez expliquer votre réclamation et, si elle nécessite une intervention humaine, contacter l’assistance de l’établissement.'
);

addKnowledge(
  'human_help',
  [
    'je veux parler à quelquun',
    'je veux parler à quelqu un',
    'je veux parler a quelquun',
    'je veux parler a quelqu un',
    'je veux un responsable',
    'je veux contacter la direction',
    'je veux contacter administration',
    'je veux contacter la comptabilité',
    'je veux contacter la comptabilite',
    'aide humaine',
    'assistance humaine'
  ],
  'Bien sûr. Si votre demande nécessite une intervention humaine, veuillez contacter l’assistance de l’établissement. Les coordonnées configurées par l’établissement sont disponibles dans l’espace Assistance humaine.'
);

/* =========================================================
   HISTOIRE
   ========================================================= */

addKnowledge(
  'history_world_war_2',
  [
    'deuxième guerre mondiale',
    'deuxieme guerre mondiale',
    '2e guerre mondiale',
    'seconde guerre mondiale',
    'guerre mondiale 2',
    'guerre de 1939',
    'guerre 1939 1945',
    'qui a déclenché la deuxième guerre mondiale',
    'qui a declenche la deuxieme guerre mondiale'
  ],
  'La Seconde Guerre mondiale s’est déroulée de 1939 à 1945. Elle a principalement opposé les puissances de l’Axe aux Alliés. L’Allemagne nazie a envahi la Pologne en septembre 1939, ce qui a provoqué l’entrée en guerre de la France et du Royaume-Uni.'
);

addKnowledge(
  'history_independence_drc',
  [
    'indépendance du congo',
    'independance du congo',
    'indépendance de la rdc',
    'independance de la rdc',
    '30 juin 1960',
    'congo 1960'
  ],
  'La République démocratique du Congo a obtenu son indépendance de la Belgique le 30 juin 1960. Cette date est célébrée chaque année comme la fête de l’Indépendance.'
);

addKnowledge(
  'history_french_revolution',
  [
    'révolution française',
    'revolution française',
    'revolution francaise',
    '1789 révolution',
    '1789 revolution'
  ],
  'La Révolution française commence en 1789. Elle transforme profondément la société et le système politique français et conduit notamment à la fin de la monarchie absolue.'
);

/* =========================================================
   MATHÉMATIQUES
   ========================================================= */

addKnowledge(
  'math_percentage',
  [
    'pourcentage',
    'pourcent',
    'pour cent',
    'calcul pourcentage',
    'calculer un pourcentage',
    'comment calculer un pourcentage'
  ],
  'Pour calculer un pourcentage d’un nombre, on peut utiliser : nombre × pourcentage ÷ 100. Exemple : 25 % de 200 = 200 × 25 ÷ 100 = 50.'
);

addKnowledge(
  'math_fraction',
  [
    'fraction',
    'fractions',
    'numérateur',
    'numerateur',
    'dénominateur',
    'denominateur',
    'comment calculer une fraction'
  ],
  'Une fraction représente une partie d’un tout. Dans 3/4, 3 est le numérateur et 4 est le dénominateur.'
);

addKnowledge(
  'math_pythagore',
  [
    'théorème de pythagore',
    'theoreme de pythagore',
    'pythagore',
    'triangle rectangle'
  ],
  'Dans un triangle rectangle, le théorème de Pythagore indique que le carré de l’hypoténuse est égal à la somme des carrés des deux autres côtés.'
);

addKnowledge(
  'math_equation',
  [
    'équation',
    'equation',
    'résoudre une équation',
    'resoudre une equation',
    'inconnue en math',
    'trouver x'
  ],
  'Pour résoudre une équation, on cherche à isoler l’inconnue en effectuant les mêmes opérations des deux côtés de l’égalité.'
);

/* =========================================================
   SCIENCES
   ========================================================= */

addKnowledge(
  'science_photosynthesis',
  [
    'photosynthèse',
    'photosynthese',
    'comment les plantes se nourrissent',
    'comment une plante se nourrit',
    'plante lumière soleil'
  ],
  'La photosynthèse permet aux plantes vertes de fabriquer leur matière organique grâce à la lumière. Elles utilisent notamment le dioxyde de carbone et l’eau et libèrent du dioxygène.'
);

addKnowledge(
  'science_human_heart',
  [
    'coeur humain',
    'coeur',
    'cœur humain',
    'comment fonctionne le coeur',
    'comment fonctionne le cœur'
  ],
  'Le cœur est un muscle qui fonctionne comme une pompe. Il fait circuler le sang dans tout le corps afin d’apporter notamment de l’oxygène et des nutriments aux organes.'
);

addKnowledge(
  'science_water_cycle',
  [
    'cycle de leau',
    'cycle de l eau',
    'cycle de l’eau',
    'évaporation',
    'evaporation',
    'condensation',
    'précipitation',
    'precipitation'
  ],
  'Le cycle de l’eau comprend notamment l’évaporation, la condensation, les précipitations et le ruissellement. L’eau circule ainsi entre l’atmosphère, les sols, les rivières, les lacs et les océans.'
);

/* =========================================================
   GÉOGRAPHIE
   ========================================================= */

addKnowledge(
  'geography_continents',
  [
    'continents',
    'combien de continents',
    'les continents',
    'noms des continents'
  ],
  'On distingue généralement sept continents : Afrique, Europe, Asie, Amérique du Nord, Amérique du Sud, Océanie et Antarctique.'
);

addKnowledge(
  'geography_equator',
  [
    'équateur',
    'equateur',
    'ligne équateur',
    'ligne de lequateur',
    'ligne de l équateur'
  ],
  'L’équateur est une ligne imaginaire qui fait le tour de la Terre et sépare l’hémisphère Nord de l’hémisphère Sud.'
);

/* =========================================================
   FRANÇAIS
   ========================================================= */

addKnowledge(
  'french_noun',
  [
    'nom en grammaire',
    'c est quoi un nom',
    'définition du nom',
    'definition du nom',
    'nom commun',
    'nom propre'
  ],
  'En grammaire, un nom sert notamment à désigner une personne, un animal, une chose, un lieu ou une idée. Il peut être commun ou propre.'
);

addKnowledge(
  'french_adjective',
  [
    'adjectif',
    'c est quoi un adjectif',
    'définition adjectif',
    'definition adjectif',
    'adjectif qualificatif'
  ],
  'Un adjectif qualificatif sert à donner une information sur un nom. Il peut notamment indiquer une qualité ou une caractéristique.'
);

addKnowledge(
  'french_verb',
  [
    'verbe',
    'c est quoi un verbe',
    'définition du verbe',
    'definition du verbe',
    'verbe en français'
  ],
  'Un verbe exprime généralement une action, un état ou un événement. Il se conjugue selon le temps, le mode, la personne et le nombre.'
);

/* =========================================================
   INFORMATIQUE
   ========================================================= */

addKnowledge(
  'computer_definition',
  [
    'c est quoi un ordinateur',
    'ordinateur',
    'définition ordinateur',
    'definition ordinateur',
    'comment fonctionne un ordinateur'
  ],
  'Un ordinateur est une machine électronique capable de recevoir, traiter, stocker et restituer des informations grâce à des programmes.'
);

addKnowledge(
  'internet_definition',
  [
    'c est quoi internet',
    'internet',
    'définition internet',
    'definition internet',
    'comment fonctionne internet'
  ],
  'Internet est un vaste réseau mondial qui permet à des appareils de communiquer et d’échanger des informations à l’aide de différents protocoles.'
);

addKnowledge(
  'programming_definition',
  [
    'programmation',
    'programmer',
    'c est quoi programmer',
    'langage de programmation',
    'code informatique'
  ],
  'La programmation consiste à écrire des instructions qu’un ordinateur peut exécuter. JavaScript, Python, Java et C sont quelques exemples de langages de programmation.'
);

/* =========================================================
   CULTURE GÉNÉRALE
   ========================================================= */

addKnowledge(
  'general_earth',
  [
    'planète terre',
    'planete terre',
    'la terre',
    'terre planète',
    'terre planete'
  ],
  'La Terre est la troisième planète du Système solaire à partir du Soleil. Elle possède de l’eau liquide en abondance et abrite une grande diversité de formes de vie.'
);

addKnowledge(
  'general_sun',
  [
    'soleil',
    'c est quoi le soleil',
    'comment fonctionne le soleil',
    'le soleil est quoi'
  ],
  'Le Soleil est une étoile située au centre du Système solaire. Il fournit à la Terre une grande partie de l’énergie nécessaire à la vie.'
);

addKnowledge(
  'general_moon',
  [
    'lune',
    'c est quoi la lune',
    'comment fonctionne la lune',
    'la lune'
  ],
  'La Lune est le satellite naturel de la Terre. Elle ne produit pas sa propre lumière visible : elle réfléchit principalement la lumière du Soleil.'
);

/* =========================================================
   CONVERSATION GÉNÉRALE
   ========================================================= */

addKnowledge(
  'conversation_who_are_you',
  [
    'qui es tu',
    'qui es tu exactement',
    'tu es qui',
    'présente toi',
    'presente toi',
    'quel est ton nom'
  ],
  'Je suis l’assistant local de SCHOOL FLOW. Je peux aider les parents avec les informations scolaires, les paiements, les réclamations et certaines questions générales.'
);

addKnowledge(
  'conversation_how_are_you',
  [
    'comment vas tu',
    'ça va',
    'ca va',
    'comment tu vas',
    'tu vas bien'
  ],
  'Je vais bien, merci. Je suis prêt à vous aider avec votre demande.'
);

addKnowledge(
  'conversation_thanks',
  [
    'merci beaucoup',
    'merci pour votre aide',
    'merci pour ton aide',
    'je te remercie',
    'je vous remercie'
  ],
  'Avec plaisir. SCHOOL FLOW reste à votre disposition pour vous accompagner.'
);

/* =========================================================
   AJOUT À LA BASE EXISTANTE
   ========================================================= */

for (const item of schoolFlowKnowledgeV1) {
  addScenario(item.intent, item.keywords, item.answer);
}

/* SCHOOL_FLOW_LOCAL_KNOWLEDGE_EXTENSION_V1 */

const baseScenarios = [...scenarios];

for (const item of baseScenarios) {
  const originalKeywords = [...item.keywords];

  for (const keyword of originalKeywords) {
    for (const prefix of prefixes) {
      scenarios.push({
        intent: item.intent,
        keywords: [normalizeText(`${prefix} ${keyword}`)],
        answer: item.answer
      });
    }

    for (const suffix of suffixes) {
      scenarios.push({
        intent: item.intent,
        keywords: [normalizeText(`${keyword} ${suffix}`)],
        answer: item.answer
      });
    }
  }
}

/* =========================================================
   NETTOYAGE DES DOUBLONS
   ========================================================= */


try {
  const expandedKnowledge =
    require('./knowledge/expanded-knowledge');

  scenarios.push(...expandedKnowledge);

  console.log(
    '🧠 SCHOOL FLOW — CONNAISSANCES ÉTENDUES :',
    expandedKnowledge.length
  );
} catch (error) {
  console.error(
    'SCHOOL FLOW EXPANDED KNOWLEDGE ERROR:',
    error
  );
}

const unique = new Map();

for (const item of scenarios) {
  const key = `${item.intent}|${item.keywords.join('|')}`;

  if (!unique.has(key)) {
    unique.set(key, item);
  }
}

const finalScenarios = Array.from(unique.values());

/* =========================================================
   MATCHING
   ========================================================= */

function scoreScenario(normalized, scenario) {
  let best = 0;

  for (const keyword of scenario.keywords) {
    if (!keyword) continue;

    if (normalized === keyword) {
      best = Math.max(best, 100);
      continue;
    }

    if (normalized.includes(keyword)) {
      best = Math.max(best, 80);
      continue;
    }

    const words = keyword.split(' ').filter(Boolean);

    if (words.length >= 2) {
      const matched = words.filter(word =>
        normalized.includes(word)
      ).length;

      const ratio = matched / words.length;

      if (ratio >= 0.75) {
        best = Math.max(best, 60);
      } else if (ratio >= 0.5) {
        best = Math.max(best, 40);
      }
    }
  }

  return best;
}

function findLocalAnswer(text) {
  const normalized = normalizeText(text);

  if (!normalized) return null;

  let bestScenario = null;
  let bestScore = 0;

  for (const scenario of finalScenarios) {
    const score = scoreScenario(normalized, scenario);

    if (score > bestScore) {
      bestScore = score;
      bestScenario = scenario;
    }
  }

  /*
   * On exige un score minimal pour éviter les réponses
   * incorrectes sur des messages sans rapport.
   */
  if (!bestScenario || bestScore < 60) {
    return null;
  }

  return {
    intent: bestScenario.intent,
    answer: bestScenario.answer,
    score: bestScore
  };
}

function getScenarioCount() {
  return finalScenarios.length;
}

module.exports = {
  findLocalAnswer,
  getScenarioCount,
  scenarios: finalScenarios
};
