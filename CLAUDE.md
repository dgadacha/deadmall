# HORDE — Claude context

FPS horde-survival solo, mono-map, esthétique **PS2 horror** (vertex jitter
léger 256×192, flat shading, low-poly low-texture, ambiance sombre type
Silent Hill 2 / RE Outbreak, fog dramatique violet-bleu, torche du joueur
comme source principale d'éclairage). Le user (Dylan) est **francophone —
réponds en français sauf demande contraire**.

Pitch : *Le dernier bus ne viendra pas. Le dépôt désaffecté est devenu ta
dernière ligne de défense. Barricade les fenêtres, achète aux murs, dépense
dans la boîte mystère, survis le plus longtemps possible.* Vagues infinies,
boucle kill → argent → wall buys / mystery box / perks.

Le projet s'appelait précédemment **DEAD MALL** (centre commercial multi-zones).
Pivot vers MVP plus tight : 1 seule map plate (Bus Depot), mécaniques inspirées
des grands classiques du genre (CoD Zombies, Killing Floor) — boîte mystère,
wall buys, perks-bouteilles, barricades fenêtres reconstructibles, power-ups
drops, rounds. Toutes ces mécaniques sont des patterns de gameplay génériques,
réimplémentés en propre.

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
via importmap dans `index.html`. Modifier un module → recharger l'onglet.

## Stack

- **Three.js r154** via CDN jsDelivr (pinné, voir « r154 sur pinné » ci-dessous)
- **Vanilla JS** modules ES (`<script type="module">`)
- **importmap** pour résoudre `three` et `three/addons/`
- **WebAudio** synthèse procédurale (aucun asset audio)
- **CanvasTexture** procédurales + quelques PNG dans `public/textures/`
- **GLTFLoader** pour `public/models/zombie.glb` (Meshy AI rigged)

## Architecture

```
dead-mall/                       # le dossier garde son nom historique
├── index.html                   # DOM lean : canvas, overlays, écrans, importmap
├── style.css                    # tout le visuel HUD/écrans + vignette des bords
├── CLAUDE.md                    # ce fichier
├── prompt.md                    # prompts Midjourney/Meshy pour models + textures
├── public/
│   ├── models/                  # zombie.glb (Meshy AI), car.glb (pas encore wiré)
│   └── textures/                # PNG floor/wall générés à la demande
└── src/
    ├── main.js                  # init + boucle + game state transitions
    ├── config.js                # constantes (ARENA, EYE, WEAPONS, FOG, SPAWN, REWARDS, …)
    ├── state.js                 # état mutable partagé : player, wave, game, ammo, owned
    ├── renderer.js              # scene/camera/renderer + maybeResize + applyLowPoly PS2
    ├── world.js                 # BUS DEPOT (mono-zone) + buy stations + barricades
    ├── player.js                # PointerLockControls + WASD + collision + camera shake
    ├── weapons.js               # viewmodel + tir hitscan + recharge + torche
    ├── enemies.js               # zombies + vagues + cadavres qui tombent
    ├── effects.js               # particules + tracers + flaques de sang
    ├── audio.js                 # drone ambiant + SFX + heartbeat + grognements
    ├── hud.js                   # DOM (HUD, écrans menu/pause/over, prompts, vignette)
    └── gallery.js               # viewer 3D des modèles (galerie depuis le menu)
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
  `wave`, `game`, `ammo`, `owned`). Les modules importent et mutent.
- **Pas de classes** sauf quand Three l'impose. Fonctions + closures.
- **Pas de TypeScript**. Pas de tests automatisés.
- **Commits** : messages courts en français, présent narratif. Préfixe optionnel
  type `feat:`, `fix:`, `refactor:`. Pas d'emoji.
- **Constantes magiques** dans `config.js` si réutilisées, sinon inline avec un
  nom parlant.
- **Pas de README.md** sauf demande explicite. Ce CLAUDE.md fait office de doc.
- **Co-auteur des commits** : `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## La map : BUS DEPOT (mono-zone, plate, no étages)

Cour extérieure **44 × 44** entourée d'un mur d'enceinte, avec au centre un
bâtiment **DEPOT 14 × 10** (hauteur intérieure 4.5). 3 bus scolaires
abandonnés disséminés autour pour casser les sightlines + 4 lampadaires
grésillants aux coins.

```
                            mur nord
   ┌─────────────────────────────────────────────┐
   │  💡                                       💡 │
   │      🚌                                      │
   │              ┌───── DEPOT ─────┐             │
   │              │ porte           │             │
   │              │   ↓             │             │
   │              │ comptoir        │  🎁 box     │
   │              │            REGEN│             │
   │              │ porte ↑         │             │
   │              └─────────────────┘             │
   │                                              │
   │                                    🚌        │
   │  💡                                        💡│
   └─────────────────────────────────────────────┘
                            mur sud
```

- **Entrées du depot** : porte large nord + porte large sud (passages vides
  dans le mur, pas de battant). Les zombies y entrent en ligne droite.
- **Fenêtres barricadées** : 2 sur le mur est, 2 sur le mur ouest, hauteur
  ~2m. 4 planches de bois en travers (visuel V1). La mécanique de cassage
  par les zombies + reconstruction joueur viendra plus tard.
- **Wall buys** : 4 panneaux affichés sur les murs : PISTOL AMMO (250),
  OLYMPIA fusil à pompe (500), MP5 SMG (1000), BAT mêlée (250).
- **Mystery Box** : coin nord-est de la cour, caisse en bois avec halo doré
  pulsant, point d'interrogation jaune en façade. 950$ par usage.
- **Perk Machine REGEN** : intérieur du depot, distributeur émissif vert,
  bouteille + étiquette + halo. Active la regen HP après 5s sans dégât.
- **Spawn zombies** : 10 points — 2 portes + 4 fenêtres + 4 coins de cour.
- **Spawn joueur** : centre du bâtiment, face au sud.

## Choix techniques notables

### Style PS2 horror (Silent Hill 2 / RE Outbreak vibe)

DA verrouillée. Stack technique :

1. **Vertex jitter PS2** (`renderer.js::applyPS2Jitter`) — la position projetée
   `gl_Position.xy` est quantizée sur une grille 256×192 *par face* (via
   `onBeforeCompile` qui injecte du GLSL dans tous les vertex shaders lit).
   Subtil mais perceptible en mouvement. Appliqué partout sauf MeshBasicMaterial.

2. **Flat shading** (`material.flatShading = true`) — normales par face,
   aspect facetté typique PS2.

3. **`applyLowPoly(material)`** : helper qui combine flatShading + jitter.

4. **`THREE.NoToneMapping`** + **pas de shadow map** : style PS2.

5. **Lumière horror** :
   - AmbientLight : `0x5a5a6a × 0.20`
   - DirectionalLight (moon) : `0x6068a0 × 0.16`
   - Néons grésillants : 1 dans le depot + 4 aux coins de la cour
   - Torche du joueur : SpotLight, source d'éclairage local principale

6. **Fog** : `FOG_NEAR=6, FOG_FAR=32, FOG_COLOR=0x0a0a14` (violet-bleu nuit).

### Audio 100% procédural (WebAudio)

`audio.js` ne charge aucun asset. Drone ambiant (sawtooth 41Hz + sine 55Hz),
heartbeat HP<60, SFX tir/recharge/hit/death procéduraux, grognements lointains
toutes les 5-14s.

### Pointer-lock = vrai geste utilisateur

`controls.lock()` ne peut être déclenché que sur un `click` réel — pas de
test automatique du gameplay, vérification manuelle.

### r154 pinné

Three pinné en **0.154.0**. À partir de r155 : `useLegacyLights` passe à
`false` par défaut → spam console + il faut multiplier les intensités
PointLight/SpotLight par ~10-15. r154 marche direct avec les valeurs actuelles.

### Camera shake via CSS

Le shake `transform: translate(x,y)` le canvas (`inset:-12px`) au lieu de
toucher au `camera.quaternion` (qui se battrait avec PointerLockControls).

## Mécaniques implémentées (V1 mono-map)

- **Vagues** : `4 + wave*3` zombies, cap 22 actifs simultanés.
- **Économie** : kill body = $50, headshot = $100, +$10 par coup qui touche.
  Constantes dans `config.js` : `REWARD_HIT`, `REWARD_BODY`,
  `REWARD_HEAD_BONUS`, `REWARD_MELEE_BONUS` (ce dernier pas encore câblé).
- **Armes** : pistol (départ ∞ réserve), shotgun, smg, bat, axe (mêlée).
- **Perks** : `regen` (autoheal HP après 5s sans dégât) — wired sur la perk
  machine du depot. `nightVision`, `lightUpgrade` stubés (perk machine non
  posée pour l'instant).
- **Torche** : SpotLight devant le joueur, dirige l'attention.

## HUD survival classique

Layout 4 coins :

```
 ┌──────────────────────────────────────────────────┐
 │                              POINTS              │ ← top-right
 │                              500                 │   gros chiffre vert
 │                              ☠ 12                │   zombies left
 │                                                  │
 │              +50  +100  +10  ← score popups      │   centre-écran
 │                       ✛                          │   crosshair
 │                                                  │
 │  👤 SECURITY LV.1                                │ ← bottom-left
 │  ▓▓▓▓▓▓▓▓░░ 80                                   │   portrait + HP bar
 │                                                  │
 │                    ROUND                12 / ∞   │
 │                     IV                   PISTOL  │ ← bottom-center / right
 └──────────────────────────────────────────────────┘
```

Éléments injectés dans `index.html` :
- `#hud-top-right` : POINTS (cumulés player.money), zombies-left line.
- `#round-display` : `ROUND <chiffre romain>` persistant en bas-centre.
- `#round-flash` : version énorme du round qui flash en début de vague avec
  animation slash (skew + scale 2.6s).
- `#score-popups` : container des popups `+10` / `+50` / `+100` qui montent
  et fadent (3 variantes CSS : `.hit` / `.body` / `.head`).

Helpers exposés par `hud.js` :
- `toRoman(n)` — pour les chiffres romains.
- `popupScore(amount, variant)` — variant ∈ `'hit'|'body'|'head'|'melee'`.
- `showRoundStart(num)` — flash + maj du persistant.

Câblé dans `enemies.js` :
- Chaque hit dans `damageZombie()` → `+10 / popup 'hit'`.
- Chaque kill dans `killZombie()` → `+50 (body) ou +100 (head) / popup`.
- Chaque début de vague dans `startWave()` → `showRoundStart(n)`.

## Mécaniques à implémenter (prochaines étapes)

Ordre proposé :
1. **HUD round romain** : "ROUND IV" en chiffres romains rouge sang centre-bas
   au début de chaque vague, animation slash. Score popups +10/+50/+100 sur
   chaque hit/kill.
2. **Mystery Box fonctionnelle** : RNG sur la liste d'armes, animation
   "peluche qui s'envole" après N usages, relocalisation aléatoire vers un
   autre slot pré-défini de la map.
3. **Barricades reconstructibles** : zombies arrachent une planche par sec
   à une fenêtre, joueur appuie E proche de la fenêtre pour rebuild +10/planche.
4. **Power-ups drops** : random kill → power-up flotte 10s — Max Ammo,
   Double Points, Insta-Kill, Nuke, "Carpenter" (rebuild toutes barricades).
5. **Perks supplémentaires** : TANK (+max HP, dégâts -20%), QUICK
   (reload -50%), STEEL (armure absorption +). Stations à poser dans le depot.
6. **Knife** : touche V, hit conique courte portée, insta-kill jusqu'au
   round 8 puis dégâts dégressifs.
7. **Crawlers** : grenade aux jambes → zombie devient rampant (utile pour
   acheter en fin de vague).
8. **Round-start animation** : son de gong + "ROUND X" qui apparaît avec
   slash sang, fog s'épaissit 2s, drone monte d'une octave.

## Pièges connus

- **`flatShading` est sans effet sur `BoxGeometry`** (faces déjà planes).
  Visible sur cylindres / sphères / icosaèdres uniquement.
- **`window.innerWidth` peut être 0** dans certains environnements (preview
  headless). `maybeResize` a un fallback `|| 1280`.
- **Pointer-lock requiert http** — ne JAMAIS recommander d'ouvrir
  `index.html` en `file://`.
- **Les zombies cadavres restent dans `zombies[]`** pendant leur fade. Toute
  fonction qui itère doit filtrer par `userData.alive`.
- **Stubs zones** : `getZone()`, `switchToZone()`, `getCurrentZone()`,
  `prepareZoneTransition()`, `setTransitionHandler()` sont des stubs MVP
  mono-zone. Ils retournent FAKE_ZONE / no-op pour ne pas casser le code
  legacy. Ne pas les utiliser pour de la nouvelle logique — la map est une.

## Notes Dylan

Dylan (`encheres.nc@gmail.com`). Francophone. Dev JS/React, pas Go ni shader.
Aime Netflix UX, low-friction (zéro build, zéro asset), self-hoste sur homelab.
Son autre projet majeur : **Kuro** (fork seanime rebrandé Netflix, à
`~/Documents/seanime`).

Pour HORDE spécifiquement : préfère **simplicité** sur configurabilité,
**proto rapide** sur architecture parfaite. Les itérations valident d'abord
le *fun* avant de complexifier. Repo GitHub : `dgadacha/deadmall` (le nom du
dossier et du repo restent "deadmall" pour ne pas casser les remotes — seul
le nom affiché du jeu a changé).

Identité git locale : `user.name="Dylan"`, `user.email="dylan@tealforge.com"`.
