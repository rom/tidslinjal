# Manuel d'utilisation de Tidslinjal

**Version 4.0.0**

---

## Table des matières

1. [Aperçu](#1-aperçu)
2. [Premiers pas](#2-premiers-pas)
3. [L'interface](#3-linterface)
4. [Navigation dans la chronologie](#4-navigation-dans-la-chronologie)
5. [Événements](#5-événements)
6. [Flux de statut des événements](#6-flux-de-statut-des-événements)
7. [Commentaires](#7-commentaires)
8. [Couches](#8-couches)
9. [Alarmes et notifications](#9-alarmes-et-notifications)
10. [Exercice et temps synthétique](#10-exercice-et-temps-synthétique)
11. [Phases d'exercice](#11-phases-dexercice)
12. [Verrouillage de créneaux](#12-verrouillage-de-créneaux)
13. [Rôles et permissions](#13-rôles-et-permissions)
14. [Paramètres](#14-paramètres)
15. [Export et rapports](#15-export-et-rapports)
16. [Vue Admin](#16-vue-admin)
17. [Raccourcis clavier et souris](#17-raccourcis-clavier-et-souris)
18. [Dépannage](#18-dépannage)

---

## 1. Aperçu

**Tidslinjal** (« chronologie » en suédois) est un outil de chronologie opérationnelle collaborative en ligne, conçu pour les équipes géographiquement dispersées. Il offre une chronologie visuelle partagée des événements pour la planification opérationnelle, la coordination et la conscience situationnelle — avec un support pour les exercices militaires et d'urgence avec temps synthétique.

Fonctionnalités clés :
- Chronologie partagée multi-utilisateurs avec contrôle d'accès basé sur les rôles
- Gestion du cycle de vie des événements avec flux d'approbation
- Couches nommées pour séparer les flux d'activités
- Support d'exercice avec STARTEX/ENDEX et temps synthétique « Jour N / T+H »
- Notifications d'alarme en temps réel via Server-Sent Events
- Export en ICS, JSON et CSV

---

## 2. Premiers pas

### Connexion

Naviguez vers `http://<serveur>:<port>` (par défaut : `http://localhost:8080`).

```
┌─────────────────────────────────┐
│          TIDSLINJAL             │
│                                 │
│  Utilisateur : [admin         ] │
│  Mot de passe : [••••••••••••••]│
│                                 │
│         [ Se connecter ]        │
└─────────────────────────────────┘
```

Identifiants par défaut : `admin` / `admin`

> **Note de sécurité :** Changez le mot de passe administrateur immédiatement après la première connexion en utilisant le bouton 🔑 en haut à droite de l'en-tête.

### Auto-inscription

Si l'administrateur a activé l'auto-inscription, un lien **« Pas encore de compte ? S'inscrire »** apparaît sur la page de connexion. Il existe quatre modes d'inscription :

| Mode | Description |
|---|---|
| **Ouvert** | Tout le monde peut s'inscrire ; le compte est immédiatement actif |
| **Validé** | Tout le monde peut s'inscrire ; l'administrateur doit approuver le compte avant la connexion |
| **Invitation générique** | L'inscription requiert un code d'invitation partagé fourni par l'administrateur |
| **Invitation personnelle** | L'inscription requiert un code à usage unique généré par l'administrateur pour chaque utilisateur |

### Réinitialisation du mot de passe

Si vous avez enregistré une adresse courriel sur votre profil :

1. Cliquez sur **Mot de passe oublié ?** sur la page de connexion
2. Saisissez votre nom d'utilisateur ou votre adresse courriel
3. Un jeton de réinitialisation est généré (affiché à l'écran si aucun serveur de messagerie n'est configuré)
4. Cliquez sur **Réinitialiser le mot de passe**, collez le jeton et choisissez un nouveau mot de passe

### Changer votre mot de passe

Cliquez sur le bouton **🔑** dans l'en-tête. Saisissez votre mot de passe actuel, puis votre nouveau mot de passe deux fois.

---

## 3. L'interface

```
┌──────────────────────────────────────────────────────────────────────┐
│ Tids│linjal  [‹] [Auj.] [›] [⏱]  Afficher: [Sem.▼]  Rés.: [Heure▼]│
│             [🔍 Rechercher…] [🗂 Couches] [⬇ Exporter] [📄 Rapport]  │
│                          [👤 Nom  rôle] [?][🔑][☰] [Déconnexion]    │
├────────────────────────────────────────────────────┬─────────────────┤
│                                                    │  PANNEAU        │
│                  GRILLE CHRONOLOGIQUE              │                 │
│  Heure│  Lun 01  │  Mar 02  │  Mer 03  │  ...     │  [Légende]      │
│ ──────┼──────────┼──────────┼──────────┤          │  [Alarmes]      │
│ 08:00 │          │ ▓▓▓▓▓▓▓▓ │          │          │  [Couches]      │
│ 09:00 │          │ Briefing │          │          │  [Paramètres]   │
│ 10:00 │ ████████ │          │          │          │                 │
│       │ Stand-up │          │          │          │                 │
│ 11:00 │          │          │ ████████ │          │                 │
│       │          │          │ ENDEX    │          │                 │
└────────────────────────────────────────────────────┴─────────────────┘
```

**En-tête** — navigation, sélection de vue, recherche et contrôles utilisateur.

**Grille chronologique** — jours de gauche à droite, heure de haut en bas. Les événements apparaissent comme des blocs colorés.

**Panneau latéral** — onglets Légende, Alarmes, Couches, Utilisateurs (admin), Groupes (admin), Journal (Chef d'équipe+), Phases (Chef d'équipe+), Paramètres. Basculer avec le bouton ☰.

---

## 4. Navigation dans la chronologie

### Navigation par date

| Contrôle | Action |
|---|---|
| Boutons **‹** / **›** | Reculer / avancer d'un intervalle d'affichage |
| Bouton **Aujourd'hui** | Aller à aujourd'hui |
| Bouton **⏱** | Faire défiler la grille jusqu'à l'heure actuelle |

### Intervalle d'affichage

Utilisez le menu déroulant **Afficher** dans la barre d'outils :

```
Afficher: [Jour ▼]
           Jour
           2 Jours
           3 Jours
           4 Jours
         ▶ Semaine
           Mois
           2 Mois
           3 Mois
```

### Résolution (taille des créneaux)

Utilisez le menu déroulant **Résolution** :

```
Résolution: [Heure ▼]
             10 min
             15 min
           ▶ Heure
             Jour
```

### Zoom

**Glisser pour zoomer** — cliquez et faites glisser vers le haut/bas sur la colonne de temps (bord gauche) pour augmenter ou diminuer la hauteur des créneaux. Glissez vers le **haut** pour zoomer, vers le **bas** pour dézoomer.

**Double-cliquez** sur la colonne de temps pour réinitialiser le zoom à 1×.

Clavier : **+** / **-** pour zoomer par incréments.

### Panoramique horizontal

Cliquez avec le bouton du milieu et faites glisser sur la chronologie pour vous déplacer à gauche/droite.

---

## 5. Événements

### Créer un événement

Cliquez sur une cellule vide dans la grille ou cliquez sur **+ Ajouter événement** dans l'en-tête.

```
┌─────────────────────── Ajouter un événement ─────────────────────────┐
│ Titre *  [                                                        ]   │
│                                                                       │
│ Type     [Activité         ▼]   Couleur  [■]                         │
│                                                                       │
│ Début *  [2025-06-01T10:00]    Fin    [2025-06-01T11:00]             │
│                                                                       │
│ Couche   [Chronologie princ.▼]  Statut [Planifié         ▼]          │
│                                                                       │
│ Description                                                           │
│ [                                                                 ]   │
│                                                                       │
│ Participant  [—  ▼]   ☐ Journée entière (pas d'heure spécifique)     │
│                                                                       │
│ ☐ Récurrent    Motif [Hebdomadaire ▼]                                 │
│ Fin de récurrence [            ]                                      │
│                                                                       │
│ Pièce jointe 📎 [Choisir un fichier]                                  │
│                                                                       │
│              [Annuler]   [Enregistrer]                                │
└───────────────────────────────────────────────────────────────────────┘
```

### Types d'événements

Chaque type d'événement possède un bloc coloré et une icône affichée à **gauche** du titre.

| Icône | Type | Couleur | Notes |
|---|---|---|---|
| — | **Événement** | Bleu | Occurrence générale |
| ⚡ | **Instant** | Orange | Point unique dans le temps — pas de durée. Rendu comme un marqueur ◆. |
| 🤝 | **Réunion** | Gris | Réunion planifiée |
| 🏢 | **Réunion physique** | Orange brûlé | Réunion en personne sur un lieu précis |
| ⚖️ | **Décision** | Vert | Point de décision |
| ⏰ | **Échéance** | Rouge | Date limite ferme |
| — | **Activité** | Vert | Bloc de travail |
| 🔄 | **Récurrent** | Violet | Modèle pour activités répétées |
| 📊 | **Rapport** | Bleu-vert | Rapport ou briefing |
| 📌 | **Tâche assignée** | Orange | Tâche attribuée à une personne ou une équipe |
| 🧍 | **Réunion debout** | Cyan | Courte réunion quotidienne debout |

L'icône ↻ (à gauche du titre) indique que l'événement fait partie d'une **série récurrente**. Les types personnalisés peuvent avoir leur propre icône emoji définie via **Paramètres → Types d'événements → Modifier**.

Activez/désactivez toutes les icônes globalement dans **Paramètres → Icônes d'événements**.

Des types personnalisés peuvent être ajoutés par les utilisateurs Lecture/Écriture+ depuis le panneau Paramètres.

### Événements instantanés

Lorsque **Instant** est sélectionné comme type :
- Le champ **Fin** est masqué (pas de durée)
- L'événement s'affiche comme un marqueur vertical étroit avec un ◆ losange en haut
- Il ne peut pas être défini comme récurrent

### Événements toute la journée

Cochez **Journée entière (pas d'heure spécifique)** pour un événement qui s'étend sur toute la journée :
- Les champs heure de début/fin sont masqués
- L'événement apparaît dans la zone grisée hors des heures de journée
- La récurrence n'est pas disponible pour les événements toute la journée

### Participant

Le champ **Participant** indique si l'activité implique des parties internes ou externes :

| Valeur | Badge | Couleur |
|---|---|---|
| — | aucun | — |
| **Interne** | `INTERN` | Bleu-vert |
| **Externe** | `EXTERN` | Rouge |

### Événements récurrents

Cochez **Récurrent**, puis choisissez un motif :

| Motif | Intervalle |
|---|---|
| Toutes les 30 min | 30 minutes |
| Toutes les heures | 1 heure |
| Toutes les 2 / 3 / 4 heures | 2 / 3 / 4 heures |
| Quotidien | 1 jour |
| Hebdomadaire | 7 jours |
| Mensuel | ~1 mois |
| Trimestriel | ~3 mois |

### Modifier et supprimer des événements

Cliquez sur un bloc d'événement pour ouvrir la vue détaillée. Cliquez sur **Modifier** pour changer. Cliquez sur **Supprimer** (visible pour le créateur et les admins) pour supprimer.

---

## 6. Flux de statut des événements

Chaque événement porte un statut qui progresse à travers un cycle de vie :

```
planifié ──► actif ──► répondu ──► terminé ──► soumis
                                                  │
                                       ┌──────────┤
                                       ▼          ▼
                                   vérifié     rejeté
                                                  │
                                          (motif requis)
```

`annulé` est disponible à n'importe quel stade.

### Transitions

| De → Vers | Qui peut agir |
|---|---|
| N'importe lequel → n'importe lequel (sauf vérifier/rejeter) | Créateur, Chef d'équipe+ |
| répondu | Rapporteur, Créateur, Chef d'équipe+ |
| soumis → vérifié | Chef d'équipe+ (enregistre qui et quand) |
| soumis → rejeté | Chef d'équipe+ (motif de rejet requis) |

### Rôle Rapporteur

Les utilisateurs avec le rôle **Rapporteur** peuvent :
- Publier des commentaires sur les événements
- Définir le statut à `répondu` ou `terminé` (nécessite l'approbation du Chef d'équipe)

---

## 7. Commentaires

Cliquez sur un bloc d'événement pour ouvrir la vue détaillée. Faites défiler jusqu'aux **Commentaires**.

- Tout utilisateur authentifié peut lire les commentaires
- Les utilisateurs Lecture/Écriture+ peuvent publier des commentaires
- Les rapporteurs peuvent publier des commentaires ; les commentaires modifiant le statut nécessitent une approbation
- Les Chefs d'équipe+ peuvent approuver ou supprimer les commentaires en attente

---

## 8. Couches

Les couches sont des superpositions nommées sur la chronologie principale. Elles permettent à différentes équipes de maintenir des pistes d'événements séparées tout en partageant une vue commune.

### Créer une couche

1. Ouvrez l'onglet **Couches** dans le panneau latéral ou cliquez sur **🗂 Couches** dans la barre d'outils
2. Cliquez sur **+ Nouvelle couche**
3. Définissez le nom, la couleur, la description, la visibilité et les permissions

```
┌──────── Nouvelle couche ────────┐
│ Nom *    [Équipe Cyber        ]  │
│ Couleur  [■ #9B59B6            ]  │
│ Description [                  ]│
│                                  │
│ Visibilité  [Groupes       ▼]    │
│ Permission  [Lecture/Écriture▼]  │
│ Groupes     ☐ Alpha  ☐ Bravo    │
│                                  │
│         [Annuler]  [Enregistrer] │
└──────────────────────────────────┘
```

### Visibilité

| Réglage | Qui peut voir la couche |
|---|---|
| **Privé** | Propriétaire uniquement |
| **Groupes** | Propriétaire + membres des groupes sélectionnés |
| **Public** | Tous les utilisateurs authentifiés |

### Basculer les couches

Cliquez sur **🗂 Couches** dans la barre d'outils pour ouvrir le menu de basculement rapide. Plusieurs couches peuvent être actives simultanément — cochez les cases pour les couches que vous souhaitez voir.

---

## 9. Alarmes et notifications

### Définir une alarme

1. Cliquez sur un bloc d'événement pour ouvrir la vue détaillée
2. Cliquez sur **🔔 Alarme**
3. Choisissez le délai de préavis (à l'heure, 5/10/15/30 min, ou 1 heure avant)

### Notifications d'alarme

Lorsqu'une alarme se déclenche, une barre de notification apparaît en haut de l'écran :

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🔔 Alarme — "Briefing ENDEX" dans 15 minutes (10:45)                    │
│                  [Ignorer]  [📋 Afficher événement]  [ACK]              │
└─────────────────────────────────────────────────────────────────────────┘
```

| Bouton | Action |
|---|---|
| **Ignorer** | Ferme la notification pour cette session ; l'alarme reste active |
| **📋 Afficher événement** | Ouvre le panneau de détails de l'événement directement depuis la notification |
| **ACK** | Acquitte définitivement l'alarme |

Les alarmes non acquittées s'intensifient — elles deviennent orange, puis clignotent en rouge toutes les 60 secondes.

### Journal d'audit des alarmes

Chaque acquittement d'alarme est automatiquement enregistré dans le **journal d'audit** avec :

- **Qui** a acquitté l'alarme (nom d'affichage de l'utilisateur)
- **Quand** l'acquittement a eu lieu (horodatage UTC)
- **Adresse IP** depuis laquelle l'acquittement a été effectué

Les Chefs d'équipe et rôles supérieurs peuvent consulter ces entrées dans l'onglet **Journal** du panneau latéral. Exemple d'entrée :

```
[2025-06-03 10:32:15] alice  acknowledged  alarm  #42
  → Alarm acknowledged: "Briefing ENDEX" (event: 2025-06-03 11:00 UTC,
    lead time: 15 min) from IP 192.168.1.42
```

### Notifications webhook

Configurez une URL webhook dans **Paramètres** pour recevoir aussi des notifications d'alarme via HTTP POST vers Mattermost, Slack ou n'importe quel endpoint HTTP.

---

## 10. Exercice et temps synthétique

Pour les exercices d'entraînement, Tidslinjal prend en charge un mode « temps synthétique » qui remplace les dates calendaires réelles par des étiquettes jour/heure d'exercice.

### Configuration (Admin uniquement)

1. Ouvrez l'onglet **Paramètres** dans le panneau latéral
2. Faites défiler jusqu'aux **Paramètres d'exercice**
3. Renseignez :
   - **Nom de l'exercice** — affiché comme badge dans l'en-tête
   - **STARTEX** — la date et heure réelles correspondant à « Jour 1 T+0 »
   - **ENDEX** — la date et heure réelles pour la fin de l'exercice
4. Cochez **Activer l'affichage de temps synthétique**
5. Cliquez sur **Enregistrer**

### Activer le temps synthétique

Le bouton **🕐 T+** apparaît dans la barre d'outils une fois le mode exercice configuré. Cliquez pour basculer entre l'affichage réel et synthétique.

### Gel de la chronologie

Dans le panneau **Paramètres**, utilisez **Geler/Mettre en pause** pour arrêter l'horloge synthétique à un moment précis. Cliquez sur **Reprendre** pour dégeler.

---

## 11. Phases d'exercice

Les Chefs d'équipe et rôles supérieurs peuvent définir des blocs nommés et colorés qui recouvrent toute la chronologie pour indiquer les phases d'exercice.

1. Ouvrez l'onglet **Phases** dans le panneau latéral
2. Cliquez sur **+ Nouvelle phase**
3. Définissez le nom, la couleur, l'heure de début, l'heure de fin et l'ordre d'affichage (0–9)

Les phases apparaissent comme des bandes de couleur translucides en haut de la grille chronologique.

---

## 12. Verrouillage de créneaux

Les admins et les utilisateurs avec le drapeau `peut_verrouiller` peuvent verrouiller des plages horaires pour empêcher la création d'événements.

1. Cliquez sur **🔒 Verrouiller** dans l'en-tête (visible pour admin/peut_verrouiller)
2. Définissez l'heure de début, l'heure de fin et la raison

Les créneaux verrouillés apparaissent avec un motif hachuré rouge. Les événements ne peuvent pas être créés dans les créneaux verrouillés.

---

## 13. Rôles et permissions

| Rôle | Abréviation | Capacités |
|---|---|---|
| **Observateur** | `observer` | Accès en lecture seule à la chronologie et aux événements — ne peut pas modifier, commenter ou verrouiller |
| **Lecture** | `read` | Voir la chronologie, les événements, les couches ; définir des alarmes personnelles |
| **Rapporteur** | `reporter` | + Publier des commentaires ; définir répondu/terminé (avec approbation) |
| **Lecture/Écriture** | `readwrite` | + Créer/modifier ses propres événements ; créer des types d'événements et des couches |
| **Chef d'équipe** | `teamlead` | + Créer des groupes ; vérifier/rejeter les événements soumis ; voir le journal d'audit ; gérer les phases |
| **Chef des opérations** | `oplead` | + Créer/modifier/supprimer des événements sur la chronologie principale |
| **Officier d'état-major adjoint** | `staffofficer` | Mêmes droits que le chef des opérations — désignation alternative pour le personnel d'état-major |
| **Officier d'état-major** | `staffofficer_full` | Identique à l'officier adjoint, mais nécessite au moins une désignation J (J1–J9) |
| **Admin** | `admin` | Accès complet — gérer tous les utilisateurs, rôles, verrous, paramètres d'activité, inscription |

Le drapeau `peut_verrouiller` peut être accordé à n'importe quel utilisateur quel que soit son rôle.

### Désignations J (rôle Officier d'état-major)

**L'officier d'état-major** (`staffofficer_full`) nécessite au moins une désignation J de l'OTAN. Les désignations identifient la branche d'état-major :

| Code | Branche |
|---|---|
| J1 | Personnel |
| J2 | Renseignement |
| J3 | Opérations |
| J4 | Logistique |
| J5 | Plans |
| J6 | Communications |
| J7 | Formation |
| J8 | Finance |
| J9 | Coopération civilo-militaire |

---

## 14. Paramètres

Ouvrez l'onglet **Paramètres** dans le panneau latéral pour configurer vos préférences.

### Thème et affichage

| Réglage | Options |
|---|---|
| **Thème** | Sombre / Clair |
| **Taille d'affichage** | Petit / Normal / Grand / Énorme |
| **Langue** | 🇬🇧 English / 🇸🇪 Svenska / 🇫🇷 Français |
| **Format date/heure** | ISO 8601 (2025-12-31) / UK (31/12/2025) / FR (31.12.2025) / SV (2025-12-31) |

La langue peut aussi être changée instantanément avec les boutons de drapeaux (🇬🇧 🇸🇪 🇫🇷) dans la barre d'outils.

### Format date/heure et heures de journée

La section **Format date/heure** regroupe à la fois la sélection du format et la configuration des heures de journée :

| Réglage | Description |
|---|---|
| **Format de date** | ISO 8601 / UK / FR / SV |
| **Début du jour** | Première heure de la journée de travail |
| **Fin du jour** | Dernière heure de la journée de travail |

Les créneaux en dehors des heures de journée apparaissent grisés/rayés.

### Vue par défaut

Cliquez sur un des boutons d'intervalle (Jour / 2 Jours / 3 Jours / 4 Jours / Semaine) pour définir votre préférence par défaut.

### Visibilité des types d'événements

Activez/désactivez les types d'événements individuels. Les types masqués sont estompés dans la chronologie. Des types personnalisés peuvent être créés avec le bouton **+ Nouveau type** (Lecture/Écriture+).

### Ligne de temps actuel (rouge)

| Réglage | Description |
|---|---|
| Afficher / Masquer | Basculer la ligne rouge |
| Couleur | Couleur de la ligne (rouge par défaut) |
| Largeur | Épaisseur de la ligne en pixels |
| Style | Solide / Pointillé / Tirets |
| Étiquette H+N | Afficher l'étiquette heure d'exercice sur la ligne |

### Icônes d'événements

Activez **Icônes d'événements** pour afficher les icônes emoji à gauche du titre dans chaque bloc d'événement et dans la légende. Désactivez pour une présentation épurée sans icônes.

Les types d'événements système ont des icônes prédéfinies (🤝 ⚖️ ⏰ 🧍 📊 ⚡ 🔄 🏢 📌). Pour les types personnalisés, choisissez une icône via **Paramètres → Types d'événements → Modifier** et utilisez le sélecteur d'emoji.

### Horloges multi-fuseaux horaires

Ajoutez des horloges supplémentaires pour suivre plusieurs fuseaux horaires simultanément :

1. Cliquez sur le bouton **+** à gauche de l'horloge principale dans l'en-tête
2. Saisissez un libellé descriptif (p. ex. « Bruxelles », « Quartier général »)
3. Sélectionnez le fuseau horaire IANA depuis la liste déroulante
4. Cliquez sur **Ajouter**

Chaque horloge supplémentaire affiche :
- Le libellé descriptif
- L'heure en temps réel dans ce fuseau
- L'abréviation du fuseau horaire (p. ex. CET, EST)
- Un bouton **×** pour la supprimer

Les préférences d'horloge sont enregistrées par utilisateur et restaurées à chaque connexion.

### Webhook / Notifications

Saisissez une URL webhook pour recevoir des notifications d'alarme en tant que requêtes HTTP POST :
- **Mattermost** — payload `{"text": "..."}`
- **Slack** — payload `{"text": "..."}`
- **Générique** — payload JSON d'alarme complet

Cliquez sur **Tester** pour envoyer une notification test.

---

## 15. Export et rapports

### Export

Cliquez sur **⬇ Exporter** dans la barre d'outils pour ouvrir le modal d'export :

| Format | Contenu |
|---|---|
| **ICS** | Événements dans la vue actuelle en iCalendar ; à importer dans toute application calendrier |
| **JSON** | Export complet du système (tous les événements, utilisateurs, groupes, couches, paramètres) — admin uniquement |
| **CSV** | Événements dans la vue actuelle en feuille de calcul séparée par virgules |

### Rapports

Cliquez sur **📄 Rapport** pour ouvrir le générateur de rapports :

| Type de rapport | Description |
|---|---|
| **Compte-rendu après action (AAR)** | Résumé des événements groupés par statut |
| **Instantané de chronologie** | Liste chronologique de tous les événements dans la plage |
| **Activité par couche** | Événements décomposés par couche |

Choisissez **HTML** pour visualiser dans le navigateur, ou **Impression/PDF** pour imprimer ou enregistrer en PDF.

---

## 16. Vue Admin

Naviguez vers `/admin-view` (nécessite le rôle **Admin**) pour un tableau de bord d'administration dédié.

---

## 17. Raccourcis clavier et souris

### Souris

| Action | Résultat |
|---|---|
| Cliquer sur un créneau vide | Ouvrir Ajouter un événement à cette heure |
| Cliquer sur un bloc d'événement | Ouvrir les détails de l'événement |
| Glisser un bloc d'événement | Replanifier vers le créneau cible |
| Glisser la colonne de temps | Zoomer la hauteur des créneaux (haut = zoom avant) |
| Double-cliquer la colonne de temps | Réinitialiser le zoom à 1× |
| Glisser avec le bouton milieu | Panoramique horizontal |

### Clavier

| Touche | Action |
|---|---|
| `←` / `→` | Naviguer en arrière / avant d'un intervalle |
| `T` | Aller à aujourd'hui |
| `N` | Faire défiler jusqu'à l'heure actuelle |
| `E` | Ouvrir le dialogue Ajouter un événement |
| `?` ou `H` | Ouvrir l'aide intégrée |
| `Échap` | Fermer le modal actuel |
| `+` / `-` | Zoomer la hauteur des créneaux |
| `F` | Geler / reprendre le temps synthétique |

---

## 18. Dépannage

### Impossible de se connecter
- Vérifiez le nom d'utilisateur et le mot de passe (par défaut : `admin` / `admin`)
- Assurez-vous que le serveur fonctionne : `./tidslinjal --port 8080`
- Vérifiez le journal du serveur pour les erreurs

### Les événements n'apparaissent pas
- Vérifiez l'intervalle de dates **Afficher** — vous visualisez peut-être un intervalle qui n'inclut pas vos événements
- Vérifiez les filtres de **Couches** — cliquez 🗂 et assurez-vous que les bonnes couches sont actives
- Vérifiez la **Visibilité des types d'événements** dans les Paramètres — les types masqués n'apparaîtront pas

### L'alarme ne se déclenche pas
- SSE nécessite une connexion navigateur persistante — assurez-vous que la page est ouverte
- Vérifiez que les notifications du navigateur sont autorisées pour le site
- Vérifiez le délai de préavis de l'alarme : à 0 min, l'alarme se déclenche exactement à l'heure de début de l'événement

### Le basculement de couche ne fonctionne pas
- Cliquez sur **🗂 Couches** dans la barre d'outils
- Sélectionnez **Chronologie principale** pour afficher toutes les couches
- Ou sélectionnez des couches individuelles pour filtrer

### L'export produit un fichier vide
- Assurez-vous qu'il y a des événements dans l'intervalle d'affichage actuel
- Ajustez l'intervalle **Afficher** pour inclure les événements souhaités

### Le répertoire de données n'est pas accessible en écriture
- Assurez-vous que le répertoire `data/` existe et est accessible en écriture par le processus serveur
- Utilisez `--data /chemin/vers/répertoire/accessible` ou définissez la variable d'environnement `DATA_DIR`

---

*Tidslinjal v4.0.0 — Chronologie opérationnelle collaborative*
