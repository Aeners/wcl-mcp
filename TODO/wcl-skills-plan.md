# Plan d'action — Skills Claude pour WoW (MCP Warcraft Logs)

## Contexte

- MCP WCL forké sur mon compte GitHub perso, cloné dans
  `/Users/arnaud.lecomte/Documents/dev/perso/gh-perso/wcl-mcp`.
- Le MCP utilise l'auth OAuth **`client_credentials`** → token applicatif, **pas**
  lié à mon compte utilisateur WCL. Impossible de lister "mes persos" via l'API :
  il faut connaître name/realm/region à l'avance.
- D'où le fichier statique `src/data/characters.json` (source de vérité,
  versionnée) avec un booléen `mine` pour distinguer mes persos d'éventuels autres.

## Mes personnages (rappel rapide)

| Perso | Realm | Classe |
|---|---|---|
| Aeners | Archimonde (EU) | Hunter |
| Aenoce | Archimonde (EU) | Monk |
| **Boulgourvil** | Archimonde (EU) | **Druid** (mon druide) |
| Hyota | Medivh (EU) | Warrior |
| Prepacode | Archimonde (EU) | Warlock |
| Rigged | Archimonde (EU) | Priest |
| Sreneasse | Archimonde (EU) | Mage |
| Æners | Archimonde (EU) | Paladin |
| Étau | Archimonde (EU) | Shaman |

## Règle transverse à TOUS les skills : maîtrise du rate-limit

L'API WCL v2 est **à points** (~3600 pts/h en client_credentials), pas au nombre
d'appels. Ce qui coûte, c'est le **volume de données ramené**.

- ✅ Toujours cibler `fight_id` + `source_name` + `event_type` sur `get_fight_events`.
- ✅ S'appuyer sur le cache LRU cache-first du client (données immuables → re-analyse gratuite).
- ❌ Jamais de `get_fight_events` non filtré.
- ❌ Éviter `get_character_casts` avec `limit_reports` élevé (scanne N rapports = N requêtes).
- ⚠️ Le client gère le 429 (retry + backoff) mais **ne compte pas les points** →
  la maîtrise du budget est comportementale, à inscrire dans chaque skill.
- ⚠️ `get_fight_events` n'expose **pas** de fenêtre temporelle (start/end) : pour
  "un passage précis du boss", on ramène tout le pull puis on découpe à l'analyse.
  OK pour du M+ court, plus lourd sur un boss de raid long.

## Skill prioritaire #1 : Comparaison de rotation vs top parse

**Besoin réel** : voir comment un top druide équilibre (à ma difficulté) joue sa
séquence de sorts sur un boss précis, et comparer à la mienne. (Reproduit en
automatique ce que je faisais à la main via export CSV → ChatGPT.)

**Workflow (4 appels, peu coûteux si précis) :**
1. Résoudre mon perso → `characters.json` (gratuit). "mon druide" = Boulgourvil.
2. `get_recent_reports` → récupérer `report_code` + `fight_id` du bon donjon/boss.
3. `get_encounter_rankings` sur l'encounter → trouver un top parse (report + fight) à ma difficulté.
4. `get_fight_events` (event_type=casts, source_name) ×2 (moi + la référence).
5. (bonus) `get_buff_uptime` pour croiser uptime Eclipse / dots / CDs.
6. Analyse : diff des séquences de sorts + timings.

**À trancher au démarrage du skill** : demander à chaque fois (perso / donjon /
boss / difficulté) OU déduire un max du contexte (dernier log, boss récent) et ne
demander que ce qui manque. → Décision reportée à la création du skill.

## Autres skills envisagés (même plomberie : perso → report/fight → events filtrés)

| Skill | Tools | Intérêt |
|---|---|---|
| Post-mortem de mort | get_character_deaths + events(damage-taken) | "pourquoi je suis mort sur ce pull" |
| Bilan de raid soir | get_recent_reports + get_fight_summary | résumé auto (kills, DPS, morts) |
| Suivi de progression | get_encounter_rankings dans le temps | évolution de mes percentiles par boss |
| Audit uptime/buffs | get_buff_uptime | fenêtres Eclipse, dots, CDs gaspillés |
| Comparaison comp/gear | get_combatant_info | talents/stats d'un top druide |

## État de la config (à finir)

Fait :
- `characters.json` créé dans le fork, supprimé de l'ancien repo.
- `.mcp.json` ajouté au `.gitignore` du fork (protège les secrets).

À faire manuellement (bloqué côté Claude : secrets) — via préfixe `!` :
```
! cp /Users/arnaud.lecomte/Documents/dev/perso/wcl-mcp/.env /Users/arnaud.lecomte/Documents/dev/perso/gh-perso/wcl-mcp/.env
! sed 's#perso/wcl-mcp/dist#perso/gh-perso/wcl-mcp/dist#' /Users/arnaud.lecomte/Documents/dev/perso/wcl-mcp/.mcp.json > /Users/arnaud.lecomte/Documents/dev/perso/gh-perso/wcl-mcp/.mcp.json
```
Puis :
- `npm run build` dans le fork (pour inclure `characters.json` dans `dist/data/`).
- Rouvrir Claude Code **depuis le dossier du fork** (c'est le `.mcp.json` du
  répertoire courant qui est chargé → bascule effective).
- (Optionnel) supprimer l'ancien `.mcp.json` pour éviter la confusion.

## Prochaine étape

Créer le **skill #1 (comparaison de rotation)** ensemble, en repartant de ce plan.
