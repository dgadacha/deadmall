# DEAD MALL — Claude context

FPS horde-survival solo, esthétique **PS2 horror** (vertex jitter léger 256×192, flat shading, low-poly low-texture, ambiance sombre type Silent Hill 2 / RE Outbreak, fog dramatique violet-bleu, torche du joueur comme source principale d'éclairage). Le user (Dylan) est
**francophone — réponds en français sauf demande contraire**.

Pitch : *2004. Centre commercial. Épidémie. Tu es l'agent de sécurité. Les
sorties sont condamnées. Les secours ne viendront pas. Survis le plus longtemps
possible.* Vagues infinies, boucle kill→argent→achats d'armes/munitions/zones,
événements (Blackout, Lockdown, Blood Hour…).

---

## Comment lancer

```sh
cd ~/Documents/dead-mall
python3 -m http.server 8000     # ou n'importe quel port
# puis ouvrir http://localhost:8000 dans Chrome
```

**Important** : *pointer-lock* (capture de la souris) ne fonctionne qu'en
http/https, pas en `file://`. Double-cliquer `index.html` = rien ne marchera.

Aucun build, aucun `npm install`. Three.js (r154) est chargé depuis jsDelivr
via importmap dans `index.html`. Modifier un module → recharger l'onglet, point.

## Stack

- **Three.js r154** via CDN jsDelivr (pinned, voir « r154 sur pinné » ci-dessous)
- **Vanilla JS** modules ES (`<script type="module">`)
- **importmap** pour résoudre `three` et `three/addons/`
- **WebAudio** synthèse procédurale (aucun asset audio)
- **CanvasTexture** procédurales (aucun asset image)

## Architecture

```
dead-mall/
├── index.html           # DOM lean : canvas, overlays, écrans, importmap
├── style.css            # tout le visuel HUD/écrans + vignette des bords
├── CLAUDE.md            # ce fichier
└── src/
    ├── main.js          # init + boucle de jeu + game state transitions
    ├── config.js        # constantes (ARENA, EYE, WEAPONS, FOG, SPAWN, …)
    ├── state.js         # état mutable partagé : player, wave, game, ammo, owned
    ├── renderer.js      # scene/camera/renderer + maybeResize + applyLowPoly
    ├── world.js         # map + lumières + bornes d'achat + événement Blackout
    ├── player.js        # PointerLockControls + WASD + collision + camera shake
    ├── weapons.js       # viewmodel + tir hitscan + recharge + torche
    ├── enemies.js       # zombies + vagues + cadavres qui tombent
    ├── effects.js       # particules + tracers + flaques de sang
    ├── audio.js         # drone ambiant + SFX + heartbeat + grognements
    └── hud.js           # DOM (HUD, écrans menu/pause/over, prompts, vignette)
```

Hiérarchie d'imports (pas de cycles) :
```
config ─┐
state ──┼── hud ─────┐
audio ──┘            │
renderer ── world ──┴── player ── enemies ──┐
                                            ├── weapons
                                  effects ──┘
                                                main (orchestre tout)
```

## Conventions

- **Modules ES** purs, imports relatifs `'./xxx.js'`. Pas de bundler.
- **État partagé** via objets mutables exportés depuis `state.js` (`player`,
  `wave`, `game`, `ammo`, `owned`). Les modules importent et mutent. Convient
  pour un jeu, pas pour une SPA.
- **Pas de classes** sauf quand Three l'impose. Fonctions + closures.
- **Pas de TypeScript**. Pas de tests automatisés (c'est un proto).
- **Commits** : messages courts en français, présent narratif. Préfixe optionnel
  type `feat:`, `fix:`, `refactor:`. Pas d'emoji (sauf demande user).
- **Constantes magiques** : extraire dans `config.js` si réutilisées, sinon
  inline avec un nom parlant.
- **Pas de README.md** sauf demande explicite. Ce CLAUDE.md fait office de doc.

## Choix techniques notables

### Style PS2 horror (Silent Hill 2 / RE Outbreak vibe)

DA verrouillée : **rétro PS2 horror low-poly**. Le sweet spot pour un FPS
horror Three.js dev solo — masque les limites techniques en les transformant
en signature visuelle. Inspirations : Silent Hill 2-3, Resident Evil Outbreak,
Cry of Fear, Faith series.

Stack technique :

1. **Vertex jitter PS2** (`renderer.js::applyPS2Jitter`) — la position projetée
   `gl_Position.xy` est quantizée sur une grille 256×192 *par face* (via
   `onBeforeCompile` qui injecte du GLSL dans tous les vertex shaders lit).
   Reproduit le sub-pixel imprécis du GTE PSX/PS2. Niveau 256×192 = subtil,
   le wobble est perceptible en mouvement mais pas agressif comme PS1
   (qui était à 96×72). Appliqué **partout sauf les MeshBasicMaterial**
   (sang, yeux émissifs, muzzle flash, tracers — sinon les particules sautent).

2. **Flat shading** (`material.flatShading = true`) — normales par face,
   ombrage uniforme par triangle. Donne l'aspect facetté typique PS2.

3. **`applyLowPoly(material)`** : helper qui combine flatShading + jitter sur
   tout material lit (Lambert / Standard). Les MeshBasicMaterial sont retournés
   tels quels.

4. **Tone mapping** : `THREE.NoToneMapping` — pas de courbe ACES cinéma. Les
   couleurs sont directes.

5. **Pas de shadow map** : `renderer.shadowMap.enabled = false`. Les jeux PS2
   utilisaient des ombres pré-calculées ou des decals simples. Vraies shadows
   = anachronique + coûteuses.

6. **Pas de postprocessing bloom** : le `composer` reste en place (RenderPass
   + OutputPass uniquement) pour faciliter l'ajout d'un grain CRT ou d'un
   color grading subtil plus tard.

7. **Lumière horror** :
   - AmbientLight : `0x5a5a6a × 0.18` (très sombre)
   - DirectionalLight (moon) : `0x6068a0 × 0.15` (bleu froid, faible)
   - Ambient par zone : 0.18-0.32 selon la zone
   - Torche du joueur : SpotLight `2.2 × 26m × Math.PI/5` — c'est la **vraie**
     source d'éclairage local

8. **Fog dramatique** : `FOG_NEAR=6, FOG_FAR=32, FOG_COLOR=0x0a0a14`
   (violet-bleu très sombre, type Silent Hill 2 nighttime). Pendant le
   Blackout, `scene.fog.far` tombe à 16 et l'ambient à 0.06.

Pour pousser encore plus le look PS2 plus tard (si Dylan le demande) :
- Baisser la résolution interne via un `PIXEL_HEIGHT=540` dans `maybeResize`
  et ajouter `image-rendering: pixelated` sur le canvas
- Renforcer la grille de jitter à 192×144
- Ajouter un grain CRT en postprocessing (custom ShaderPass)
- Ajouter des sprites animés pour le sang (affine UV "swimming" effect)

### Brouillard horror court

`FOG_NEAR=6, FOG_FAR=32, FOG_COLOR=0x0a0a14` — fog dramatique violet-bleu
qui mange la profondeur dès 6m. Reproduit l'effet "draw distance limitée"
PS2 + ambiance Silent Hill. Pendant le Blackout, `scene.fog.far` tombe à
16 pour resserrer encore plus la visibilité.

### Audio 100% procédural (WebAudio)

`audio.js` ne charge **aucun asset**. Tout est généré en live :
- **Drone ambiant** : `sawtooth 41Hz` + `sine 55Hz`, lowpass 320Hz, LFO 0.11Hz
  modulant le gain. Démarré au premier `controls.lock()`.
- **SFX** : combinaisons `oscillator + noise + filter`. `pistol`, `shotgun`,
  `hit`, `zdeath`, `hurt`, `reload`, `buy`, `nope`, `wave`, `blackout`,
  `heart`, `distantGrunt`.
- **Heartbeat** : déclenché par `main.js::updateAmbient` dès `player.hp < 60`,
  tempo proportionnel à HP (0.4s à HP=0, 1.1s à HP=60).
- **Grognements lointains** : toutes les 5-14s, ambiance constante de menace.

Avantage : zéro asset, fichier auto-contenu. Inconvénient : feeling un peu
synthétique. Pour passer en samples : remplacer les fonctions de `audio.js`
par des `AudioBuffer` chargés via `fetch`.

### Pointer-lock = vrai geste utilisateur

`controls.lock()` ne peut être déclenché que sur un `click` réel — un
`.click()` programmatique est refusé par le navigateur. Conséquence : **on ne
peut pas tester le gameplay via automation**. La vérification visuelle se
fait au menu + en masquant temporairement les overlays via DOM pour révéler le
canvas WebGL derrière. Le gameplay (mouvement, tir, IA, vagues) demande un test
manuel.

### r154 sur pinné

Three est pinné en **0.154.0** dans l'importmap, pas la dernière version. Raison :
depuis **r155**, `useLegacyLights` est passé à `false` par défaut → l'échelle
d'éclairage des PointLight/SpotLight a changé (modèle physique candela, decay
inverse-carré). Toute la map a été tunée à l'ancienne échelle. r154 = dernière
version avant la bascule = mes intensités d'éclairage marchent direct.

À partir de **r155**, lire/écrire `useLegacyLights` émet un warning à chaque
frame → spam continu de la console. r154 est silencieux.

Si on veut passer en r155+ un jour : retirer `useLegacyLights = true` (qu'on
n'utilise déjà pas), et **multiplier les intensités de PointLight/SpotLight
par ~10-15** pour compenser le passage en candela. AmbientLight et
DirectionalLight sont peu affectés.

### Camera shake via CSS

Le shake n'est pas appliqué sur la 3D (qui se battrait avec PointerLockControls
gérant `camera.quaternion`). À la place, on `transform: translate(x,y)` le
canvas via CSS, ce qui shake le rendu final. Le canvas est étendu de 12px de
chaque côté (`inset:-12px`, `width:calc(100% + 24px)`) pour éviter les bords
noirs pendant le shake. Coût : ~zéro, simple, n'interfère avec rien.

### Tout en localStorage, rien en backend

Aucun serveur, aucune persistance. Highscore éphémère par session. Si Dylan
veut un highscore persistant : `localStorage` suffit, pas besoin de backend.

## Gameplay / équilibrage actuel

- **Spawn** : `SPAWN = (0, 1.7, 14)` devant la fontaine centrale, dégagé.
- **Vie** : 100 HP. Dégâts zombie au contact = `9 + wave.num*0.6`, cooldown 1s.
- **Économie** : kill body = $10, headshot = $15, bonus fin de vague =
  `50 + wave.num*10`.
- **Vagues** : `4 + wave*3` zombies, cap 22 actifs simultanés, HP zombie
  `100 + wave*16`, vitesse `min(1.5 + wave*0.09, 3.4) × random(0.85, 1.15)`.
- **Pistolet** : 34 dmg, mag 12, réserve ∞, recharge 1.1s, fireDelay 0.16s.
- **Fusil à pompe** ($750) : 22 dmg × 8 plombs, mag 6, réserve 24+, recharge 1.6s.
  Très bonne arme au corps-à-corps, médiocre à distance.
- **Munitions** ($100) : recharge +4×magazine de l'arme active.
- **Blackout** : vagues 3, 6, 9… durée 14s, ambient 0.85→0.12, fog 28→14,
  néons grésillants.
- **Headshot bonus** : ×2.4 dégâts + $5 supplémentaires.

## Pièges connus

- **`flatShading` est sans effet sur `BoxGeometry`** (les faces sont déjà
  planes). On le met quand même via `applyLowPoly` pour homogénéité, mais
  ne pas s'attendre à un changement visuel — c'est sur cylindres / sphères /
  icosaèdres que le facetté apparaît.
- **Le préview MCP a un buffer de console non vidé entre reloads** —
  d'éventuels warnings résiduels (notamment `useLegacyLights` de sessions
  pré-r154) peuvent persister. Un navigateur frais a une console propre.
- **`window.innerWidth` peut être 0** dans certains environnements (preview
  headless). `maybeResize` a un fallback `|| 1280` pour éviter un canvas 0×0.
  En vrai navigateur ça n'arrive jamais.
- **Pointer-lock requiert http** — ne JAMAIS recommander à Dylan d'ouvrir
  `index.html` en `file://`, ça ne marche pas.
- **Les zombies cadavres restent dans le tableau `zombies[]`** pendant leur
  fade. Toute fonction qui itère `zombies[]` doit filtrer par
  `userData.alive` (voir `getAliveZombies()` pour le raycast d'arme).

## Idées roadmap

- **Matraque de départ** (selon le pitch original) — arme melee, animation
  swing, hit en cône proche.
- **Nouvelle zone : Supermarché** — débloquable via porte payante depuis
  le hall, ajoute des rayonnages, caisses, peut-être un événement spécial
  (alarme incendie qui attire les zombies).
- **Événement Lockdown** — barrières qui descendent, zone restreinte
  temporairement, doit survivre dans la cage.
- **Event Blood Hour** — vagues plus denses pendant 60s, drop d'argent ×2.
- **Animation de mort plus poussée** — ragdoll simple (chaque membre détaché),
  ou explosion sang plus violente.
- **Highscore localStorage** — wave atteinte / kills / argent total, top 5.
- **Settings rapides** — slider volume drone/SFX, toggle flat shading,
  slider fog distance.

## Notes Dylan

Dylan (`encheres.nc@gmail.com`). Francophone. Dev JS/React, pas Go ni shader.
Aime Netflix UX, low-friction (zéro build, zéro asset), self-hoste sur homelab.
Son autre projet majeur dans le mémory parallèle : **Kuro** (fork seanime
rebrandé Netflix, à `~/Documents/seanime`).

Pour DEAD MALL spécifiquement : préfère **simplicité** sur configurabilité,
**proto rapide** sur architecture parfaite. Les itérations valident d'abord
le *fun* avant de complexifier.
