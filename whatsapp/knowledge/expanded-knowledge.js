const scenarios = [];

function add(intent, keywords, answer) {
  scenarios.push({
    intent,
    keywords,
    answer
  });
}

/*
 * SCHOOL FLOW — BASE DE CONNAISSANCES ÉTENDUE
 * 3 600 entrées générées de manière déterministe.
 *
 * IMPORTANT :
 * Les informations propres à un établissement
 * (prix, adresse, horaires, noms, calendrier, etc.)
 * ne sont jamais inventées ici.
 */

const categories = [
  {
    intent: 'conversation',
    subjects: [
      'bonjour',
      'bonsoir',
      'salut',
      'merci',
      'aide',
      'assistance',
      'question',
      'information',
      'renseignement',
      'contact',
      'service',
      'conversation',
      'message',
      'réponse',
      'bot'
    ],
    answers: [
      'Bonjour cher parent. Bienvenue sur *School Flow*. En quoi puis-je vous aider ?',
      'Bonjour. Je suis l’assistant *School Flow*. Posez-moi votre question et je ferai de mon mieux pour vous orienter.',
      'Avec plaisir. Dites-moi simplement ce que vous souhaitez savoir.',
      'Je suis à votre disposition pour vous orienter concernant les services disponibles sur *School Flow*.'
    ]
  },
  {
    intent: 'parents',
    subjects: [
      'parent',
      'père',
      'mère',
      'papa',
      'maman',
      'tuteur',
      'famille',
      'responsable',
      'enfant',
      'élève',
      'enfant scolaire',
      'suivi enfant',
      'information enfant',
      'suivi parent',
      'espace parent'
    ],
    answers: [
      'Les informations concernant votre enfant dépendent des données enregistrées par son établissement.',
      'Je peux vous orienter concernant le suivi scolaire. Pour une information personnelle sur votre enfant, les données de l’établissement font foi.',
      'Pour toute information spécifique concernant votre enfant, veuillez utiliser les services de communication configurés par l’établissement.'
    ]
  },
  {
    intent: 'students',
    subjects: [
      'élève',
      'élèves',
      'étudiant',
      'étudiants',
      'classe',
      'classe scolaire',
      'niveau',
      'section',
      'inscription élève',
      'dossier élève',
      'matricule',
      'résultat',
      'note',
      'bulletin',
      'discipline'
    ],
    answers: [
      'Les informations scolaires d’un élève dépendent de l’établissement concerné.',
      'Pour consulter une information précise sur un élève, l’établissement doit avoir enregistré cette information dans School Flow.',
      'School Flow peut faciliter le suivi des élèves, des classes et des communications scolaires.'
    ]
  },
  {
    intent: 'inscriptions',
    subjects: [
      'inscription',
      'inscrire',
      'inscrire enfant',
      'admission',
      'admettre',
      'nouvelle inscription',
      'réinscription',
      'dossier inscription',
      'conditions inscription',
      'documents inscription',
      'frais inscription',
      'inscription scolaire',
      'inscription école',
      'place école',
      'demande admission'
    ],
    answers: [
      'Les conditions d’inscription dépendent de l’établissement. School Flow peut faciliter la communication autour des inscriptions.',
      'Pour connaître les documents, conditions et éventuels frais d’inscription, veuillez consulter l’établissement concerné.',
      'Les modalités d’admission sont propres à chaque établissement scolaire.'
    ]
  },
  {
    intent: 'payments',
    subjects: [
      'paiement',
      'payer',
      'paiement scolaire',
      'frais scolaire',
      'frais scolaires',
      'scolarité',
      'écolage',
      'frais',
      'solde',
      'dette scolaire',
      'reçu',
      'reçu paiement',
      'historique paiement',
      'paiement manquant',
      'paiement effectué'
    ],
    answers: [
      'Les montants et modalités de paiement dépendent de l’établissement. School Flow peut faciliter le suivi des paiements.',
      'Pour connaître votre solde ou l’état d’un paiement, utilisez les informations enregistrées par votre établissement.',
      'Un reçu ou un historique de paiement doit être vérifié à partir des données financières de l’établissement concerné.'
    ]
  },
  {
    intent: 'absence_late',
    subjects: [
      'absence',
      'absent',
      'absente',
      'retard',
      'retard scolaire',
      'élève en retard',
      'justifier absence',
      'justification absence',
      'justifier retard',
      'présence',
      'présences',
      'pointage',
      'arrivée',
      'départ',
      'absence enfant'
    ],
    answers: [
      'Les absences et retards sont enregistrés et gérés par l’établissement.',
      'Pour justifier une absence ou un retard, veuillez suivre la procédure communiquée par l’établissement.',
      'School Flow peut faciliter les notifications concernant les absences et les retards.'
    ]
  },
  {
    intent: 'convocations',
    subjects: [
      'convocation',
      'convocations',
      'rendez-vous école',
      'rendez vous école',
      'rendez-vous parent',
      'rencontre parent',
      'rencontre parents',
      'appel école',
      'demande rencontre',
      'direction rencontre',
      'convocation parent',
      'convocation élève',
      'réunion parent',
      'réunion parents',
      'réunion scolaire'
    ],
    answers: [
      'Une convocation doit être vérifiée à partir du message ou des informations transmises par l’établissement.',
      'Pour connaître le motif, la date et l’heure d’une convocation, veuillez consulter la convocation reçue.',
      'School Flow peut faciliter l’envoi des convocations aux parents.'
    ]
  },
  {
    intent: 'announcements',
    subjects: [
      'communiqué',
      'communiqués',
      'annonce',
      'annonces',
      'information école',
      'information établissement',
      'note aux parents',
      'message parents',
      'message scolaire',
      'avis',
      'avis scolaire',
      'publication école',
      'notification école',
      'notification scolaire',
      'actualité école'
    ],
    answers: [
      'Les communiqués officiels dépendent de l’établissement et sont transmis par les canaux configurés.',
      'Pour une information officielle, veuillez vous référer au communiqué envoyé par votre établissement.',
      'School Flow permet aux établissements de transmettre des informations aux parents et aux autres utilisateurs autorisés.'
    ]
  },
  {
    intent: 'teachers_direction',
    subjects: [
      'enseignant',
      'enseignante',
      'professeur',
      'professeur école',
      'enseignant classe',
      'direction',
      'directeur',
      'directrice',
      'secrétariat',
      'secrétaire',
      'préfet',
      'administration',
      'personnel scolaire',
      'responsable école',
      'équipe pédagogique'
    ],
    answers: [
      'Les coordonnées et responsabilités du personnel dépendent de chaque établissement.',
      'Pour contacter un membre de l’administration ou de l’équipe pédagogique, utilisez les coordonnées communiquées par l’établissement.',
      'School Flow facilite la communication entre l’établissement, les parents et les personnes autorisées.'
    ]
  },
  {
    intent: 'whatsapp',
    subjects: [
      'whatsapp',
      'groupe whatsapp',
      'groupes whatsapp',
      'groupe parents',
      'groupe enseignants',
      'groupe parents enseignants',
      'canal whatsapp',
      'lien whatsapp',
      'lien groupe',
      'groupe école',
      'groupe classe',
      'communication whatsapp',
      'message whatsapp',
      'notification whatsapp',
      'recevoir whatsapp'
    ],
    answers: [
      'Les groupes WhatsApp disponibles dépendent de l’établissement et de leur configuration dans School Flow.',
      'Pour obtenir un lien de groupe, demandez le groupe concerné ou utilisez les informations configurées par votre établissement.',
      'School Flow peut faciliter les communications scolaires via WhatsApp.'
    ]
  },
  {
    intent: 'security',
    subjects: [
      'sécurité',
      'confidentialité',
      'données',
      'données personnelles',
      'protection données',
      'vie privée',
      'mot de passe',
      'code',
      'pin',
      'code pin',
      'accès',
      'autorisation',
      'compte sécurisé',
      'compte',
      'protection compte'
    ],
    answers: [
      'Les informations sensibles doivent être protégées et accessibles uniquement aux personnes autorisées.',
      'Ne partagez jamais votre code PIN, votre mot de passe ou un code de sécurité avec une autre personne.',
      'Les accès et opérations sensibles de School Flow sont conçus pour être contrôlés selon les rôles autorisés.'
    ]
  },
  {
    intent: 'school_flow',
    subjects: [
      'school flow',
      'schoolflow',
      'application school flow',
      'plateforme school flow',
      'service school flow',
      'assistant school flow',
      'système school flow',
      'fonctionnement school flow',
      'utiliser school flow',
      'aide school flow',
      'support school flow',
      'contact school flow',
      'assistance school flow',
      'problème school flow',
      'mise à jour school flow'
    ],
    answers: [
      'School Flow est une plateforme destinée à faciliter la communication et la gestion des échanges entre établissements scolaires et leurs utilisateurs.',
      'Je peux vous orienter sur les fonctionnalités générales de School Flow.',
      'Pour une assistance technique, utilisez la commande ou le bouton *Contacter SCHOOL FLOW*.'
    ]
  },
  {
    intent: 'calendar_schedule',
    subjects: [
      'horaire',
      'horaires',
      'emploi du temps',
      'calendrier',
      'date',
      'dates',
      'cours',
      'heure cours',
      'heure école',
      'planning',
      'programme',
      'activité scolaire',
      'calendrier scolaire',
      'planning scolaire',
      'emploi temps'
    ],
    answers: [
      'Les horaires et calendriers sont propres à chaque établissement.',
      'Pour connaître l’horaire exact d’un cours ou d’une activité, veuillez consulter les informations de votre établissement.',
      'School Flow peut faciliter la transmission des calendriers et horaires scolaires.'
    ]
  },
  {
    intent: 'kinshasa_drc',
    subjects: [
      'kinshasa',
      'rdc',
      'république démocratique du congo',
      'congo',
      'congo kinshasa',
      'école en rdc',
      'écoles rdc',
      'scolarité rdc',
      'parent rdc',
      'élève rdc',
      'éducation rdc',
      'éducation kinshasa',
      'système scolaire rdc',
      'système scolaire congo',
      'school kinshasa'
    ],
    answers: [
      'Pour les informations propres à une école de Kinshasa ou de la RDC, il faut se référer à l’établissement concerné et à ses informations officielles.',
      'Les établissements scolaires peuvent avoir des calendriers, frais, horaires et procédures différents.',
      'School Flow peut être utilisé pour faciliter la communication scolaire dans le contexte local.'
    ]
  },
  {
    intent: 'human_support',
    subjects: [
      'agent',
      'agent humain',
      'personne',
      'humain',
      'parler agent',
      'parler humain',
      'assistance humaine',
      'support humain',
      'service client',
      'service assistance',
      'aide humaine',
      'contacter support',
      'contacter school flow',
      'contacter schoolflow',
      'support school flow'
    ],
    answers: [
      'Pour contacter directement SCHOOL FLOW, utilisez le bouton ou la commande *Contacter SCHOOL FLOW*.',
      'Une assistance humaine peut être demandée via les moyens de contact officiels de SCHOOL FLOW.'
    ]
  }
];

/*
 * 15 catégories × 15 sujets × 16 formulations = 3 600 entrées.
 */
const forms = [
  'information sur {x}',
  'question sur {x}',
  'je veux savoir pour {x}',
  'je voudrais savoir pour {x}',
  'pouvez-vous me renseigner sur {x}',
  'aidez-moi concernant {x}',
  'comment fonctionne {x}',
  'comment avoir des informations sur {x}',
  'où trouver des informations sur {x}',
  'je cherche des informations sur {x}',
  'besoin d aide pour {x}',
  'j ai une question concernant {x}',
  'je souhaite comprendre {x}',
  'que faut-il savoir sur {x}',
  'parlez-moi de {x}',
  'est-ce possible pour {x}'
];

for (const category of categories) {
  for (const subject of category.subjects) {
    for (const form of forms) {
      const question = form.replace('{x}', subject);

      const answer =
        category.answers[
          scenarios.length % category.answers.length
        ];

      add(
        category.intent,
        [subject, question],
        answer
      );
    }
  }
}

/*
 * Vérification attendue :
 * 15 catégories × 15 sujets × 16 formulations = 3 600.
 */
module.exports = scenarios;
