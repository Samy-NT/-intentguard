import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Mail, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Documentation",
  description: "Encyclopedie Aurels de A a Z: concepts, API, SDK, dashboard, mandats, audit et integrations.",
};

type Article = {
  letter: string;
  id: string;
  title: string;
  summary: string;
  body: string[];
  links?: Array<{ label: string; href: string }>;
  code?: string;
};

const articles: Article[] = [
  {
    letter: "A",
    id: "actions-autonomes",
    title: "Actions autonomes",
    summary: "Ce qu'Aurels protege: les moments ou un agent IA s'apprete a agir dans le monde reel.",
    body: [
      "Une action autonome est une operation declenchee par un agent: envoyer un email, payer une facture, modifier un CRM, lire une base interne ou appeler un outil sensible.",
      "Aurels se place juste avant l'execution. L'agent peut raisonner librement, mais l'action finale passe par une verification d'intention.",
    ],
    links: [{ label: "Voir les cas d'usage", href: "/use-cases" }],
  },
  {
    letter: "B",
    id: "benchmark",
    title: "Benchmark public",
    summary: "Un banc d'essai reproductible pour comparer les defenses contre les actions dangereuses.",
    body: [
      "Le benchmark mesure si un systeme laisse passer des attaques d'injection, bloque des actions legitimes ou produit une decision difficile a auditer.",
      "Il sert de preuve technique sans promesse marketing inverifiable: les scenarios sont consultables et executables localement.",
    ],
    links: [{ label: "Ouvrir le benchmark", href: "/benchmark" }],
  },
  {
    letter: "C",
    id: "cles-api",
    title: "Cles API",
    summary: "Les cles identifient le workspace et autorisent les appels a la verification.",
    body: [
      "Chaque appel machine-to-machine vers Aurels doit fournir une cle via l'en-tete x-api-key. Le dashboard permet de creer et revoquer les cles de workspace.",
      "Les humains peuvent se connecter au dashboard par magic link Supabase Auth quand leur compte est relie au workspace dans workspace_members. Un admin peut provisionner ces acces depuis /dashboard/members ou via POST /api/v1/workspace/members.",
      "En production, une cle doit rester cote serveur. Ne l'expose jamais dans un navigateur, une app mobile publique ou un repository.",
    ],
    links: [
      { label: "Se connecter", href: "/auth/login" },
      { label: "API keys", href: "/dashboard/api-keys" },
    ],
  },
  {
    letter: "D",
    id: "decisions",
    title: "Decisions",
    summary: "Aurels renvoie toujours une reponse simple: allow, flag ou block.",
    body: [
      "allow signifie que l'action respecte les regles connues. flag signifie qu'une revue humaine est recommandee. block signifie que l'action ne doit pas etre executee.",
      "La decision inclut aussi une raison, un score de risque, la couche qui a declenche le verdict et une trace d'audit signee quand l'action est persistee.",
    ],
    code: `{
  "decision": "flag",
  "reason": "Recipient is outside the mandate recipient list",
  "risk_score": 95,
  "triggered_rule": "mandate_recipient"
}`,
  },
  {
    letter: "E",
    id: "evaluation",
    title: "Evaluation d'intention",
    summary: "Le coeur du produit: verifier que l'action demandee correspond bien a l'intention autorisee.",
    body: [
      "L'evaluation combine des regles deterministes, des limites de velocite, des politiques de workspace, des mandats signes et des signaux semantiques.",
      "Le but n'est pas de juger toute la conversation de l'agent. Le but est de prendre une decision fiable au moment exact ou une action sensible va partir.",
    ],
    links: [{ label: "Reference API", href: "/api-reference" }],
  },
  {
    letter: "F",
    id: "flag",
    title: "Flag",
    summary: "Le mode intermediaire pour ne pas tout bloquer quand une validation humaine suffit.",
    body: [
      "flag est utile pour les actions inhabituelles, les montants proches d'une limite ou les recipients qui meritent une verification.",
      "Une equipe peut router ces cas vers une file de revue, un webhook, un SIEM ou un process interne.",
    ],
    links: [{ label: "Reviews", href: "/dashboard/reviews" }],
  },
  {
    letter: "G",
    id: "getting-started",
    title: "Getting started",
    summary: "Le chemin le plus court pour proteger une premiere action.",
    body: [
      "Cree une cle, installe le SDK, decris l'action que ton agent veut executer, puis respecte la decision renvoyee par Aurels.",
      "Pour un test local, commence avec un paiement fictif ou une action email. Ensuite seulement, branche Aurels a un outil de production.",
    ],
    links: [
      { label: "Login", href: "/auth/login" },
      { label: "Startup page", href: "/startup" },
    ],
    code: `import { createIntentGuardClient } from "intentguard/sdk";

const aurels = createIntentGuardClient({
  apiKey: process.env.AURELS_API_KEY!,
  baseUrl: "https://aurels.dev",
});

const decision = await aurels.verify({
  intent_id: "act_001",
  agent_id: "agent_finance",
  amount: 250,
  currency: "USD",
  recipient: "billing@stripe.com",
  metadata: { category: "saas" },
});`,
  },
  {
    letter: "H",
    id: "human-in-the-loop",
    title: "Human in the loop",
    summary: "Aurels garde l'humain dans la boucle quand le risque depasse ce qui est acceptable.",
    body: [
      "Toutes les actions ne doivent pas etre automatisees a 100%. Le bon compromis est souvent: allow pour le banal, flag pour l'ambigu, block pour le dangereux.",
      "Cette logique permet a une startup de garder de la vitesse sans donner un pouvoir illimite a ses agents.",
    ],
  },
  {
    letter: "I",
    id: "integrations",
    title: "Integrations",
    summary: "Aurels peut s'inserer dans plusieurs stacks d'agents et de workflows.",
    body: [
      "Le repository inclut des integrations et guides pour OpenAI Agents, LangGraph, CrewAI, Claude Code, MCP, Hermes et OpenClaw.",
      "L'integration ideale est celle qui enveloppe l'appel outil sensible: paiement, email, CRM, base interne, commande shell ou acces document.",
    ],
    links: [{ label: "Plugins et integrations", href: "/plugins" }],
  },
  {
    letter: "J",
    id: "json-api",
    title: "JSON API",
    summary: "L'API Aurels est volontairement simple: une requete JSON, une decision JSON.",
    body: [
      "L'endpoint principal accepte une description structuree de l'action: montant, devise, destinataire, agent, contexte et metadata.",
      "Utilise des champs stables et explicites. Plus l'intention est precise, plus la decision est facile a auditer.",
    ],
    links: [{ label: "API reference", href: "/api-reference" }],
    code: `curl -X POST "https://aurels.dev/api/v1/verify" \\
  -H "content-type: application/json" \\
  -H "x-api-key: $AURELS_API_KEY" \\
  -d '{
    "intent_id": "pay_001",
    "agent_id": "agent_finance",
    "amount": 250,
    "currency": "USD",
    "recipient": "billing@stripe.com"
  }'`,
  },
  {
    letter: "K",
    id: "kill-switch",
    title: "Kill switch",
    summary: "Le block est le frein d'urgence pour les actions qui ne doivent pas partir.",
    body: [
      "Quand Aurels renvoie block, l'application appelante doit stopper l'action et enregistrer la raison.",
      "Un block peut venir d'une signature invalide, d'un mandat expire, d'un montant trop eleve, d'une destination interdite ou d'une contradiction avec les limites du workspace.",
    ],
  },
  {
    letter: "L",
    id: "limites",
    title: "Limites",
    summary: "Les limites transforment une mission vague en cadre operationnel.",
    body: [
      "Une limite peut etre un plafond de montant, une devise, une liste de recipients, un type d'action, une fenetre de temps ou une categorie autorisee.",
      "Les limites sont le langage le plus important d'Aurels: elles disent a l'agent ce qu'il peut faire sans demander a nouveau.",
    ],
    links: [{ label: "Settings", href: "/dashboard/settings" }],
  },
  {
    letter: "M",
    id: "mandats",
    title: "Mandats signes",
    summary: "Un mandat definit ce qu'un agent peut faire, pour qui, combien, jusqu'a quand.",
    body: [
      "Un mandat signe est une permission verifiable. Il contient un scope, une expiration, des contraintes et une signature HMAC.",
      "Si l'action sort du mandat, Aurels bloque ou signale selon la politique. C'est le mecanisme cle pour deleguer sans perdre le controle.",
    ],
    links: [{ label: "Mandates", href: "/dashboard/mandates" }],
  },
  {
    letter: "N",
    id: "notifications",
    title: "Notifications",
    summary: "Les evenements importants peuvent partir vers les outils de ton equipe.",
    body: [
      "Aurels peut notifier les escalades, exports d'audit et evenements de workspace via webhooks.",
      "Les payloads doivent etre verifies cote recepteur avec la signature fournie, surtout si l'evenement declenche une action interne.",
    ],
    links: [{ label: "Support", href: "/support" }],
  },
  {
    letter: "O",
    id: "observabilite",
    title: "Observabilite",
    summary: "Chaque decision utile doit pouvoir etre relue, expliquee et rattachee a une action.",
    body: [
      "L'observabilite couvre les logs, les scores, les raisons de decision, les signatures, les webhooks et les exports.",
      "Elle permet de comprendre pourquoi un agent a ete bloque sans relire toute son execution.",
    ],
    links: [{ label: "Audit trail", href: "/dashboard/audit" }],
  },
  {
    letter: "P",
    id: "policies",
    title: "Policies",
    summary: "Les policies sont les regles de securite appliquees a un workspace.",
    body: [
      "Une policy exprime ce que l'organisation accepte: seuils, recipients, categories, fail mode semantique, webhooks et limites d'exposition.",
      "Commence strict sur les actions a fort impact, puis assouplis seulement quand les traces montrent que le workflow est stable.",
    ],
    links: [{ label: "Security", href: "/security" }],
  },
  {
    letter: "Q",
    id: "quickstart",
    title: "Quickstart",
    summary: "Une integration minimale tient en trois etapes.",
    body: [
      "1. Recupere une cle. 2. Appelle /api/v1/verify avant l'outil sensible. 3. Execute uniquement si la decision est allow.",
      "Pour flag, cree une revue humaine. Pour block, stoppe l'action et montre la raison dans tes logs internes.",
    ],
    code: `if (decision.decision === "allow") {
  await runSensitiveTool();
} else {
  await createReviewOrStop(decision);
}`,
  },
  {
    letter: "R",
    id: "readiness",
    title: "Readiness",
    summary: "La readiness indique si le workspace est pret pour un usage plus serieux.",
    body: [
      "Aurels peut verifier des signaux de preparation: configuration des secrets, webhooks, audit, politiques et integrations.",
      "C'est une checklist produit: elle reduit les angles morts avant de brancher un agent sur des donnees ou des actions reelles.",
    ],
    links: [{ label: "Dashboard", href: "/dashboard" }],
  },
  {
    letter: "S",
    id: "sdk",
    title: "SDK",
    summary: "Le SDK evite de reecrire l'appel HTTP, la normalisation et les erreurs a la main.",
    body: [
      "Utilise le SDK cote serveur pour decrire l'intention et recevoir une decision typee.",
      "Les adapters permettent d'encapsuler des outils d'agent afin que le check Aurels devienne une etape naturelle du workflow.",
    ],
    links: [{ label: "API reference", href: "/api-reference" }],
  },
  {
    letter: "T",
    id: "traces-audit",
    title: "Traces d'audit",
    summary: "Une trace d'audit repond a une question simple: qui a voulu faire quoi, quand, et pourquoi c'etait autorise ou refuse.",
    body: [
      "Les traces d'audit doivent etre suffisamment detaillees pour une revue interne, mais jamais contenir plus de donnees sensibles que necessaire.",
      "Les signatures rendent la trace verifiable apres export ou incident.",
    ],
    links: [{ label: "Audit verification", href: "/dashboard/audit" }],
  },
  {
    letter: "U",
    id: "use-cases",
    title: "Use cases",
    summary: "Les meilleurs premiers cas sont les actions frequentes, repetables et sensibles.",
    body: [
      "Exemples: paiements SaaS, support client, CRM et sales ops, acces aux documents internes, outils dev, exports et commandes de back-office.",
      "Aurels est moins utile pour une simple question-reponse. Il devient critique quand l'agent peut agir.",
    ],
    links: [{ label: "Explorer les use cases", href: "/use-cases" }],
  },
  {
    letter: "V",
    id: "verification",
    title: "Verification",
    summary: "La verification doit etre appelee avant l'action, pas apres.",
    body: [
      "Verifier apres coup transforme Aurels en simple outil de reporting. Verifier avant l'action en fait un pare-feu.",
      "Le bon point d'integration est donc l'adapter, le tool wrapper, le middleware ou l'orchestrateur qui controle l'appel final.",
    ],
    links: [{ label: "Endpoint verify", href: "/api-reference" }],
  },
  {
    letter: "W",
    id: "webhooks",
    title: "Webhooks",
    summary: "Les webhooks relient Aurels a ton stack operationnel.",
    body: [
      "Ils peuvent alimenter Slack, un SIEM, un outil de support, une file de revue ou un pipeline d'audit.",
      "Chaque webhook doit etre signe et verifie. Un webhook non verifie devient lui-meme une surface d'attaque.",
    ],
    links: [{ label: "Settings webhooks", href: "/dashboard/settings" }],
  },
  {
    letter: "X",
    id: "x-api-key",
    title: "x-api-key",
    summary: "L'en-tete d'authentification principal pour les appels machine-to-machine.",
    body: [
      "Le header x-api-key doit etre envoye par ton backend a chaque verification.",
      "Si la cle est absente, invalide ou revoquee, l'appel doit echouer et l'action protegee ne doit pas partir.",
    ],
    code: `fetch("https://aurels.dev/api/v1/verify", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.AURELS_API_KEY!,
  },
  body: JSON.stringify(intent),
});`,
  },
  {
    letter: "Y",
    id: "yield-control",
    title: "Yield control",
    summary: "Un agent utile sait rendre le controle quand une action devient ambigue.",
    body: [
      "La securite des agents ne consiste pas seulement a dire non. Elle consiste a rendre le controle au bon moment.",
      "Aurels formalise ce passage de relais avec flag, les revues humaines et les raisons lisibles.",
    ],
  },
  {
    letter: "Z",
    id: "zero-trust-agents",
    title: "Zero-trust agents",
    summary: "Le principe fondateur: ne jamais supposer qu'un agent agit toujours dans le bon contexte.",
    body: [
      "Un agent peut etre brillant et quand meme suivre une mauvaise instruction cachee dans un email, une page web ou un document.",
      "Aurels applique une logique zero-trust aux actions: chaque action sensible doit prouver qu'elle respecte le cadre avant d'etre executee.",
    ],
    links: [
      { label: "Security model", href: "/security" },
      { label: "Demander un acces", href: "mailto:aurels.dev@gmail.com?subject=Aurels docs access" },
    ],
  },
];

const featuredLinks = [
  { label: "Quickstart", href: "#quickstart" },
  { label: "API", href: "/api-reference" },
  { label: "Benchmark", href: "/benchmark" },
  { label: "Security", href: "/security" },
  { label: "Startup", href: "/startup" },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#fafaf9] text-stone-950">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border border-stone-300 bg-white">
              <Image src="/logo.png" alt="Aurels" width={28} height={28} className="h-7 w-7" />
            </span>
            <span className="font-mono text-sm font-black uppercase tracking-[0.22em]">Aurels Docs</span>
          </Link>
          <nav className="hidden items-center gap-5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500 lg:flex">
            {featuredLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-stone-950">
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            href="mailto:aurels.dev@gmail.com?subject=Aurels documentation"
            className="inline-flex items-center gap-2 border border-stone-950 bg-stone-950 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-stone-700"
          >
            Contact
            <Mail className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 border border-stone-300 bg-stone-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
              <BookOpen className="h-3.5 w-3.5" />
              Encyclopedie A-Z
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-normal text-stone-950 md:text-7xl">
              Aurels de A a Z.
            </h1>
          </div>
          <div className="max-w-2xl self-end">
            <p className="text-xl leading-8 text-stone-700">
              Une documentation encyclopedique pour comprendre, integrer et operer Aurels: le pare-feu
              d&apos;intention qui verifie les actions sensibles des agents IA avant execution.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Link href="#getting-started" className="border border-stone-300 bg-stone-50 p-4 text-sm font-semibold transition-colors hover:border-stone-950 hover:bg-white">
                Commencer
              </Link>
              <Link href="#mandats" className="border border-stone-300 bg-stone-50 p-4 text-sm font-semibold transition-colors hover:border-stone-950 hover:bg-white">
                Mandats signes
              </Link>
              <Link href="#zero-trust-agents" className="border border-stone-300 bg-stone-50 p-4 text-sm font-semibold transition-colors hover:border-stone-950 hover:bg-white">
                Zero-trust
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 md:px-8 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-auto">
          <div className="border border-stone-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-stone-950">
              <ShieldCheck className="h-4 w-4" />
              Articles
            </div>
            <nav className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`#${article.id}`}
                  className="group flex items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-stone-50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-stone-300 bg-stone-50 font-mono text-[10px] font-black text-stone-500 group-hover:border-stone-950 group-hover:text-stone-950">
                    {article.letter}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-stone-600 group-hover:text-stone-950">
                    {article.title}
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <section className="grid gap-5">
          {articles.map((article) => (
            <article
              key={article.id}
              id={article.id}
              className="scroll-mt-24 border border-stone-200 bg-white p-6 md:p-8"
            >
              <div className="grid gap-6 lg:grid-cols-[5rem_1fr]">
                <div className="font-mono text-6xl font-black leading-none text-stone-200">{article.letter}</div>
                <div>
                  <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
                    Article {article.letter}
                  </div>
                  <h2 className="text-3xl font-black tracking-normal text-stone-950">{article.title}</h2>
                  <p className="mt-3 text-lg leading-7 text-stone-700">{article.summary}</p>
                  <div className="mt-6 space-y-4 text-base leading-7 text-stone-700">
                    {article.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  {article.code && (
                    <pre className="mt-6 overflow-auto border border-stone-200 bg-stone-950 p-4 text-sm leading-6 text-stone-100">
                      <code>{article.code}</code>
                    </pre>
                  )}
                  {article.links && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      {article.links.map((link) => (
                        <Link
                          key={`${article.id}-${link.href}`}
                          href={link.href}
                          className="inline-flex items-center gap-2 border border-stone-300 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600 transition-colors hover:border-stone-950 hover:text-stone-950"
                        >
                          {link.label}
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
