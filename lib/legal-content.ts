export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const legalSections: LegalSection[] = [
  {
    title: "Éditeur du site",
    paragraphs: [
      "Le site internet https://www.aurels.dev/ est édité dans le cadre du projet Aurel, société en cours de constitution.",
      "À la date de publication des présentes mentions légales, Aurel n'est pas encore immatriculée au registre du commerce et des sociétés.",
      "Le responsable de la publication du site est : Adam Guérin, cofondateur d'Aurel.",
      "E-mail : aurels.dev@gmail.com",
    ],
  },
  {
    title: "Activité",
    paragraphs: [
      "Aurel développe une solution logicielle B2B de sécurité destinée aux agents d'intelligence artificielle autonomes.",
      "Le service fournit notamment une API de vérification d'intention permettant d'analyser une action proposée par un agent IA avant son exécution.",
      "La solution peut notamment être utilisée pour vérifier des actions automatisées à conséquences élevées, notamment des opérations financières, des opérations de procurement ou des actions effectuées auprès de services tiers.",
    ],
  },
  {
    title: "Hébergeur",
    paragraphs: ["Le site est hébergé par :", "Vercel Inc.", "340 S Lemon Ave #4133", "Walnut, CA 91789", "États-Unis"],
  },
  {
    title: "Services proposés",
    paragraphs: ["Le site propose notamment :"],
    bullets: [
      "une démonstration interactive accessible sans inscription ;",
      "un système de connexion utilisateur permettant aux utilisateurs autorisés d'accéder à l'API ;",
      "un moyen de contacter Aurel afin de demander un accès à l'API ou de discuter d'un déploiement professionnel ou d'entreprise.",
    ],
  },
  {
    title: "Propriété intellectuelle",
    paragraphs: [
      "Certaines fonctionnalités peuvent être soumises à des conditions contractuelles, techniques ou commerciales spécifiques.",
      "L'ensemble du site, de sa structure, de ses textes, interfaces, éléments graphiques, logos, logiciels, API, documentation et autres éléments qui le composent est protégé par les dispositions applicables en matière de propriété intellectuelle.",
      "Sauf indication contraire, ces éléments sont la propriété d'Aurel ou sont utilisés avec l'autorisation de leurs titulaires.",
      "Toute reproduction, représentation, modification, adaptation, distribution ou exploitation, totale ou partielle, de ces éléments sans autorisation préalable est interdite, sauf dans les limites prévues par la loi.",
    ],
  },
  {
    title: "Responsabilité",
    paragraphs: [
      "Aurel s'efforce d'assurer l'exactitude et la mise à jour des informations publiées sur le site. Toutefois, Aurel ne garantit pas que les informations disponibles soient exhaustives, exemptes d'erreurs ou accessibles de manière permanente.",
      "Les fonctionnalités, démonstrations et services proposés peuvent être modifiés, suspendus ou interrompus à tout moment.",
      "Les résultats fournis par le système de vérification d'Aurel constituent une aide automatisée à l'évaluation d'actions proposées par des agents IA. Ils ne constituent pas une garantie qu'une action est licite, sûre, appropriée ou exempte de risque.",
      "Les conditions de responsabilité applicables aux clients professionnels peuvent également être précisées dans les documents contractuels conclus avec Aurel.",
    ],
  },
  {
    title: "Liens et données personnelles",
    paragraphs: [
      "Le site peut contenir des liens vers des sites ou services exploités par des tiers. Aurel n'exerce aucun contrôle sur ces sites et ne saurait être responsable de leur contenu, de leur disponibilité ou de leurs pratiques en matière de protection des données.",
      "Aurel traite certaines données à caractère personnel dans le cadre du fonctionnement du site, de la gestion des comptes utilisateurs, des demandes de contact et de la fourniture de ses services. Les modalités de traitement sont détaillées dans la Politique de confidentialité.",
    ],
  },
  {
    title: "Cookies",
    paragraphs: [
      "Le site peut utiliser des cookies ou technologies similaires nécessaires à son fonctionnement, notamment pour l'authentification, la sécurité et le maintien des sessions.",
      "Lorsque des cookies ou traceurs nécessitant le consentement de l'utilisateur sont utilisés, Aurel recueille ce consentement conformément à la réglementation applicable.",
    ],
  },
  {
    title: "Droit applicable et contact",
    paragraphs: ["Les présentes mentions légales sont soumises au droit français.", "Contact : aurels.dev@gmail.com"],
  },
];

export const privacySections: LegalSection[] = [
  { title: "1. Responsable de traitement", paragraphs: ["La présente Politique de confidentialité explique comment Aurel (« Aurel », « nous » ou « notre ») traite les données à caractère personnel dans le cadre du site https://www.aurels.dev/ et de ses services associés.", "Aurel accorde une importance particulière à la protection des données personnelles et applique le Règlement (UE) 2016/679 du 27 avril 2016 (« RGPD »), ainsi que les dispositions françaises applicables en matière de protection des données.", "Cette politique distingue les traitements pour lesquels Aurel agit en qualité de responsable de traitement de ceux pour lesquels Aurel agit en qualité de sous-traitant pour le compte de ses clients professionnels.", "Dans l'attente de l'immatriculation : Samy Nettour et Adam Guérin, cofondateurs d'Aurel. E-mail : aurels.dev@gmail.com. Aurel mettra à jour la présente politique dès l'immatriculation de la société."] },
  { title: "2. Données concernées", paragraphs: ["Selon votre utilisation du Site et des services, Aurel peut traiter notamment les catégories de données suivantes.", "Données d'identification et de compte : adresse e-mail, identifiants de compte, informations relatives à l'authentification, droits et habilitations, informations techniques liées à l'utilisation du compte, journaux de connexion et de sécurité. Les mots de passe sont destinés à être stockés sous une forme sécurisée ne permettant pas leur lecture en clair par Aurel.", "Données communiquées lors d'une prise de contact : nom et prénom, adresse e-mail, fonction ou entreprise, contenu du message et toute information volontairement communiquée. Nous vous invitons à ne pas transmettre par e-mail des données sensibles ou des informations confidentielles inutiles.", "Données techniques : adresse IP, date et heure de connexion, navigateur et système d'exploitation, informations relatives à l'appareil, journaux techniques et de sécurité, événements liés à l'utilisation du service.", "Données transmises à l'API : identifiants d'agents, identifiants d'actions ou de requêtes, instructions, contexte ou trace d'exécution, montant et devise, destinataire, type d'action, métadonnées, politiques du client et résultats de contrôles. Ces données peuvent présenter une forte sensibilité professionnelle ou commerciale. Les clients doivent éviter de transmettre des données dont le traitement n'est pas nécessaire."] },
  { title: "3. Utilisation de la démonstration publique", paragraphs: ["Le Site propose une démonstration interactive accessible sans inscription. Elle peut permettre de soumettre des exemples d'actions afin d'observer les mécanismes de vérification.", "Les utilisateurs sont invités à ne pas saisir de données personnelles réelles, données confidentielles, secrets commerciaux, coordonnées bancaires ou autres informations inutiles. Les exemples saisis peuvent être traités techniquement afin de produire le résultat demandé, assurer la sécurité du service et détecter les abus."] },
  { title: "4. Finalités et bases légales", paragraphs: ["Aurel traite les données personnelles pour fournir et gérer les comptes et l'API (exécution du contrat ou mesures précontractuelles), sécuriser le Site et le service (intérêt légitime), répondre aux demandes de contact (mesures précontractuelles ou intérêt légitime), gérer la relation commerciale (contrat ou intérêt légitime), respecter les obligations légales (obligation légale), prévenir les abus, fraudes et incidents (intérêt légitime), et améliorer le service (intérêt légitime ou consentement lorsqu'il est légalement requis).", "Lorsque le traitement repose sur l'intérêt légitime, Aurel veille à ce que cet intérêt ne porte pas une atteinte disproportionnée aux droits et libertés des personnes concernées."] },
  { title: "5. Rôle d'Aurel pour les données transmises par les clients", paragraphs: ["Lorsqu'un client professionnel utilise l'API pour vérifier les actions de ses agents IA, le client détermine généralement les finalités et les moyens essentiels du traitement. Le client agit généralement en qualité de responsable de traitement ou de sous-traitant, et Aurel agit généralement en qualité de sous-traitant.", "Aurel traite les données uniquement pour fournir, sécuriser et maintenir le service, conformément aux instructions documentées et aux stipulations contractuelles. Les clients doivent disposer d'une base légale appropriée et fournir les informations requises par le RGPD. Lorsque nécessaire, les parties concluent un accord de traitement des données (DPA) précisant notamment les obligations, mesures de sécurité, sous-traitants, transferts et modalités de suppression ou restitution."] },
  { title: "6. Audit trail et journaux de décision", paragraphs: ["Chaque décision de vérification peut générer un enregistrement d'audit signé ou protégé cryptographiquement, contenant notamment identifiant de décision, agent, horodatage, résultat, score ou éléments de décision, version de politique, environnement, empreintes cryptographiques et identifiants techniques.", "L'audit trail est principalement une donnée professionnelle et de sécurité, mais peut indirectement contenir des données personnelles. Durée prévue : 12 mois à compter de la création, sauf obligation légale plus longue, nécessité probatoire, durée contractuelle différente ou conservation temporaire dans les sauvegardes et systèmes de continuité."] },
  { title: "7. Sous-traitant technique : Anthropic", paragraphs: ["Pour sa fonctionnalité d'analyse sémantique, Aurel utilise temporairement l'API Claude d'Anthropic, notamment le modèle Claude Sonnet 4.6. Certaines données nécessaires à l'analyse peuvent être transmises à Anthropic : instructions, contexte d'agent, action envisagée et, lorsque le client les inclut, informations de transaction ou de destinataire.", "Anthropic intervient comme sous-traitant ultérieur lorsque Aurel agit elle-même comme sous-traitant. Anthropic indique que son DPA commercial intègre des clauses contractuelles types européennes et que l'API commerciale supprime habituellement les entrées et sorties sous 30 jours, sous réserve de ses politiques, contrats ou d'un dispositif Zero Data Retention.", "La localisation dépend de l'architecture et de la configuration utilisées ; Aurel ne présente pas Claude comme garantissant une localisation exclusivement européenne. Pour les transferts hors EEE soumis au RGPD, Aurel met en œuvre un mécanisme approprié, notamment décision d'adéquation ou clauses contractuelles types, complétées si nécessaire par des mesures supplémentaires."] },
  { title: "8. Hébergeur : Vercel", paragraphs: ["Le Site et certaines composantes techniques sont hébergés ou exécutés au moyen des infrastructures de Vercel Inc. Vercel indique que ses infrastructures peuvent impliquer des traitements aux États-Unis et dans d'autres pays, avec des mécanismes de transfert internationaux comprenant notamment les clauses contractuelles types de l'Union européenne lorsqu'elles sont nécessaires. Les traitements sont encadrés par les conditions et, lorsqu'applicable, l'accord de traitement des données de Vercel."] },
  { title: "9. Autres destinataires", paragraphs: ["Les données peuvent être accessibles, dans la mesure strictement nécessaire, par les personnes habilitées chez Aurel, les prestataires techniques, les sous-traitants ultérieurs, les conseils professionnels lorsque nécessaire et les autorités administratives ou judiciaires lorsque la loi l'exige. Aurel ne vend pas les données personnelles de ses utilisateurs à des tiers."] },
  { title: "10. Transferts internationaux", paragraphs: ["Certains prestataires peuvent être établis ou traiter des données hors EEE. Lorsque ces transferts impliquent des données soumises au RGPD, Aurel veille à les encadrer par une décision d'adéquation, les clauses contractuelles types ou tout autre mécanisme légalement reconnu. Aurel prend également en considération les mesures supplémentaires nécessaires à un niveau de protection substantiellement équivalent."] },
  { title: "11. Durées de conservation", paragraphs: ["Aurel ne conserve les données que pendant la durée nécessaire. À titre indicatif : données de compte pendant l'existence du compte puis suppression ou archivage nécessaire ; prospects et demandes pendant le traitement puis une durée proportionnée ; données contractuelles et comptables selon les obligations légales ; journaux de sécurité pendant la durée nécessaire ; audit trails 12 mois par défaut ; données transmises à Anthropic selon le service effectivement utilisé et ses conditions commerciales et DPA.", "Lorsque cela est possible et pertinent, les données peuvent être anonymisées à des fins statistiques ou d'amélioration."] },
  { title: "12. Sécurité", paragraphs: ["Aurel met en œuvre des mesures techniques et organisationnelles appropriées : chiffrement des communications, contrôle des accès, authentification, journalisation, séparation des environnements, gestion des secrets et clés, limitation des accès, sauvegardes, continuité et surveillance des événements de sécurité.", "Compte tenu de la nature du service, Aurel accorde une attention particulière à la confidentialité des instructions, transactions, politiques internes et décisions d'agents IA. Aucune mesure ne pouvant garantir une sécurité absolue, Aurel ne peut garantir l'absence totale de risque."] },
  { title: "13. Droits des personnes", paragraphs: ["Conformément au RGPD, les personnes concernées peuvent disposer des droits d'accès, rectification, effacement, limitation, opposition, portabilité lorsque applicable et retrait du consentement lorsqu'il constitue la base du traitement.", "Pour exercer vos droits concernant les traitements dont Aurel est responsable : aurels.dev@gmail.com. Aurel peut demander les informations raisonnablement nécessaires à la vérification de l'identité. Lorsque Aurel agit comme sous-traitant, les demandes doivent en principe être adressées au client responsable de traitement ; Aurel l'assiste lorsque le RGPD le requiert. Une réclamation peut également être introduite auprès de la CNIL."] },
  { title: "14. Décisions automatisées et profilage", paragraphs: ["Aurel analyse et vérifie les actions proposées par des agents IA avant exécution. Les résultats peuvent être allow, flag ou block. Le service n'a pas pour finalité de prendre, pour le compte d'Aurel, des décisions produisant des effets juridiques ou affectant significativement des personnes physiques. Lorsqu'un client utilise Aurel pour une décision concernant une personne physique, il lui appartient de déterminer les obligations applicables, notamment au regard des articles 22 et suivants du RGPD."] },
  { title: "15. Données sensibles", paragraphs: ["Aurel demande de ne pas transmettre de catégories particulières de données au sens de l'article 9 du RGPD ni de données relatives aux condamnations pénales et infractions, sauf nécessité expresse, autorisation légale et encadrement contractuel. Pour les données commerciales ou financières sensibles, seuls les éléments nécessaires au service doivent être transmis."] },
  { title: "16. Mineurs", paragraphs: ["Le Site et les services sont destinés principalement à des utilisateurs professionnels et ne sont pas destinés aux mineurs. Aurel ne cherche pas à collecter volontairement des données personnelles concernant des mineurs."] },
  { title: "17. Cookies et technologies similaires", paragraphs: ["Aurel peut utiliser des cookies nécessaires pour maintenir une session authentifiée, sécuriser les comptes, assurer le fonctionnement technique et mémoriser des préférences nécessaires. Lorsque des cookies non strictement nécessaires sont utilisés, Aurel fournit une information spécifique et recueille le consentement lorsque requis. La liste effective doit rester à jour selon la configuration technique du Site."] },
  { title: "18. Liens vers des services tiers", paragraphs: ["Le Site peut contenir des liens vers des sites ou services tiers. Aurel n'est pas responsable de leurs pratiques de confidentialité ; nous vous invitons à consulter leurs propres politiques avant de leur communiquer des données."] },
  { title: "19. Modification de la présente politique", paragraphs: ["Aurel peut modifier la présente Politique afin de tenir compte de l'évolution de ses services, pratiques ou de la réglementation. La version publiée sur le Site est la version en vigueur. En cas de modification substantielle, Aurel pourra mettre en place des modalités d'information complémentaires lorsque la réglementation l'exige."] },
  { title: "20. Contact", paragraphs: ["Pour toute question relative à cette Politique ou au traitement de vos données personnelles : Aurel — aurels.dev@gmail.com"] },
];
