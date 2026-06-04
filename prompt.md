# HORDE — Prompts Midjourney / Meshy AI

Banque de prompts pour générer modèles 3D (via Meshy AI image-to-3D) et
textures (Midjourney directement).

**DA verrouillée** : PS2 horror low-poly (Silent Hill 2 / RE Outbreak vibe).

**Univers** : horror survival rural américain années 80-90. Petite ville
dépressive, station-service de dépôt de bus abandonnée, mécaniciens en bleu
de travail, voyageurs coincés, conducteurs de bus en uniforme délavé,
ouvriers d'usine. Atmosphère Stephen King / Romero — pas de soldats héroïques,
pas de personnages reconnaissables d'autres jeux. Tout générique.

---

## Style block universel (à coller dans TOUS les prompts)

```
Silent Hill 2 era PS2 horror game style, low-poly era 2002 graphics,
hand-painted diffuse texture, muted desaturated colors,
dark moody atmosphere, slightly grainy, flat illustrated lighting baked in,
no PBR no normal maps no specular highlights, painted texture only
```

## Vibe block univers HORDE (à coller dans les prompts personnages/props)

```
80s-90s rural american horror survival setting, abandoned bus depot atmosphere,
overcast night sky vibe, working-class small town worn-down feel,
washed-out blue-collar palette, gritty Stephen King Romero zombie movie influence,
no military uniforms, no soldier characters, no recognizable game heroes,
all generic civilians and workers
```

## Paramètres Midjourney recommandés

| Paramètre | Valeur | Usage |
|-----------|--------|-------|
| `--v 6` | Midjourney v6 | Tous les prompts |
| `--s 100-150` | Stylize modéré | Modèles + textures (rester proche du prompt) |
| `--ar 9:16` | Vertical | Personnages full body |
| `--ar 1:1` | Carré | Textures tileable, props isolés |
| `--ar 4:1` | Horizontal long | Plaques, enseignes |
| `--ar 16:9` | Horizontal classique | Armes en profil |
| `--ar 2:1` | Petits panneaux | Wall buys signs |
| `--tile` | Seamless | Textures sols / murs |

---

# §1 — PERSONNAGES (Meshy image-to-3D)

## Pose universelle (à coller dans CHAQUE prompt perso)

```
relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,
feet shoulder-width apart, knees straight, shoulders relaxed and level,
neutral facial expression, rigging-ready industry-standard reference pose,
full body visible from head to toe, centered composition,
plain pure white background, even diffuse lighting from front, no cast shadows
```

## Négatifs personnages universels

```
--no T-pose, I-pose, arms touching body, arms straight down vertical, arms extended horizontally,
dynamic pose, action pose, walking, running, asymmetric, tilted, holding weapon,
side view, profile view, 3/4 view, perspective distortion, contrapposto,
arms crossed, hands on hips, hair covering face, accessories on one side only,
military uniform, soldier, recognizable game character, branded logos
```

## 1.1 — Joueur survivant (`player.glb`)

Voyageur urbain générique coincé au dépôt, pas un héros militaire.

```
Silent Hill 2 era PS2 horror game style civilian survivor character,
low-poly era 2002 graphics, hand-painted diffuse texture,

relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,
feet shoulder-width apart, knees straight, shoulders relaxed and level,

dark green bomber jacket over a faded gray t-shirt, dirty blue jeans,
brown leather work boots, brown leather belt centered with plain buckle,
short messy brown hair, light stubble, tired determined neutral expression,
small flashlight clipped to belt loop on each hip symmetrically,
exaggerated chunky proportions, working-class everyman build,

80s-90s rural american horror survival setting, washed-out blue-collar palette,
muted desaturated colors, dark moody atmosphere, flat illustrated lighting baked in,
no PBR no normal maps, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
character reference sheet, rigging-ready

--ar 9:16 --v 6 --s 120
--no T-pose, I-pose, arms touching body, dynamic pose, asymmetric, tilted, holding weapon, side view, 3/4 view, perspective distortion, military uniform, soldier, recognizable game hero, branded logos
```

## 1.2 — Zombie variant A : routier (`zombie_trucker.glb`)

```
Silent Hill 2 era PS2 horror game style infected long-haul trucker zombie,
low-poly era 2002 graphics, hand-painted diffuse texture,

relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,
feet shoulder-width apart, knees straight, shoulders level,

dirty faded red flannel shirt over stained white tank top, worn blue denim jeans,
heavy brown work boots, sagging brown leather belt centered,
mid-length messy gray-brown hair, scraggly beard,
pale sickly green-gray rotting skin, sunken hollow eyes glowing dim yellow,
crooked yellow teeth visible through slack open mouth,
dried blood splatters distributed symmetrically on shirt and both hands,
exaggerated caricature proportions, hunched torso slightly,

80s-90s rural american horror survival setting, gritty Romero zombie movie influence,
muted desaturated colors, dark moody atmosphere, flat illustrated lighting baked in,
no PBR no normal maps, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
character reference sheet, rigging-ready

--ar 9:16 --v 6 --s 120
--no T-pose, I-pose, arms touching body, dynamic pose, asymmetric, tilted, holding weapon, side view, 3/4 view, perspective distortion, military uniform, soldier, recognizable character
```

## 1.3 — Zombie variant B : conducteur de bus (`zombie_busdriver.glb`)

```
Silent Hill 2 era PS2 horror game style infected city bus driver zombie,
low-poly era 2002 graphics, hand-painted diffuse texture,

relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,
feet shoulder-width apart, knees straight, shoulders level,

faded navy blue button-up shirt with two dull metal buttons missing,
generic round badge centered on left chest reading "DEPOT" in dim letters,
navy blue work trousers, black scuffed leather work shoes,
black leather belt centered, short receding gray hair under no hat,
pale sickly green-gray rotting skin, sunken hollow eyes glowing dim yellow,
crooked teeth visible through slack open mouth,
fresh blood streak symmetrically across collar and both sleeves,
exaggerated caricature proportions,

80s-90s rural american horror survival setting, working-class small town vibe,
muted desaturated colors, dark moody atmosphere, flat illustrated lighting baked in,
no PBR no normal maps, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
character reference sheet, rigging-ready

--ar 9:16 --v 6 --s 120
--no T-pose, I-pose, arms touching body, dynamic pose, asymmetric, tilted, holding weapon, side view, 3/4 view, perspective distortion, military uniform, soldier, recognizable character, branded logo
```

## 1.4 — Zombie variant C : mécanicien de garage (`zombie_mechanic.glb`)

```
Silent Hill 2 era PS2 horror game style infected gas station mechanic zombie,
low-poly era 2002 graphics, hand-painted diffuse texture,

relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,
feet shoulder-width apart, knees straight, shoulders level,

faded gray-blue mechanic coveralls open at chest, dirty white undershirt visible,
heavy black rubber work boots, generic plain name patch on left chest,
shoulder strap pockets symmetrical on both sides,
short crew cut dark brown hair, oil-streaked face,
pale sickly green-gray rotting skin, sunken hollow eyes glowing dim yellow,
crooked teeth visible through slack open mouth,
black oil and dark blood smudges distributed symmetrically on chest and both forearms,
exaggerated caricature proportions, bulky shoulders,

80s-90s rural american horror survival setting, gritty Romero zombie movie influence,
muted desaturated colors, dark moody atmosphere, flat illustrated lighting baked in,
no PBR no normal maps, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
character reference sheet, rigging-ready

--ar 9:16 --v 6 --s 120
--no T-pose, I-pose, arms touching body, dynamic pose, asymmetric, tilted, holding weapon, side view, 3/4 view, perspective distortion, military uniform, soldier, recognizable character, branded logo
```

## 1.5 — Zombie variant D : voyageur en hoodie (`zombie_traveler.glb`)

```
Silent Hill 2 era PS2 horror game style infected backpacker traveler zombie,
low-poly era 2002 graphics, hand-painted diffuse texture,

relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,
feet shoulder-width apart, knees straight, shoulders level,

faded charcoal gray hoodie with hood down, dirty stone-washed jeans,
worn brown canvas sneakers, simple gray cotton t-shirt visible at neckline,
short tousled dark hair, hollow gaunt face,
pale sickly green-gray rotting skin, sunken hollow eyes glowing dim yellow,
crooked teeth visible through slack open mouth,
dried blood splatters distributed symmetrically on hoodie front and both sleeves,
exaggerated caricature proportions, slim build,

80s-90s rural american horror survival setting, working-class small town vibe,
muted desaturated colors, dark moody atmosphere, flat illustrated lighting baked in,
no PBR no normal maps, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
character reference sheet, rigging-ready

--ar 9:16 --v 6 --s 120
--no T-pose, I-pose, arms touching body, dynamic pose, asymmetric, tilted, holding weapon, side view, 3/4 view, perspective distortion, military uniform, soldier, recognizable character, branded logo
```

## 1.6 — Boss zombie : ouvrier d'abattoir (`zombie_boss_butcher.glb`)

Surdimensionné, plus lent, plus tanky. Variante de fin de vague boss.

```
Silent Hill 2 era PS2 horror game style oversized infected slaughterhouse worker boss,
low-poly era 2002 graphics, hand-painted diffuse texture,

relaxed A-pose, arms slightly extended downward at 30 degree angle from the body,
hands away from hips with fingers slightly curled,
perfectly symmetrical bilateral pose, front facing camera, feet pointing forward,

heavy stained brown rubber apron over torn dark gray work shirt,
brown work pants, heavy black rubber boots, leather belt centered,
massive muscular arms equal on both sides, hunched shoulders symmetrically raised,
short shaved head, exposed jaw bone in center of face,
both eyes visible and glowing dim yellow,
pale sickly green-gray rotting skin, fresh blood drenched apron symmetrically,
exaggerated brute caricature proportions, 2.4 meters tall, bulky neck,

80s-90s rural american horror survival setting, gritty butcher worker vibe,
muted desaturated colors, dark moody atmosphere, flat illustrated lighting baked in,
no PBR no normal maps, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
character reference sheet, rigging-ready

--ar 9:16 --v 6 --s 120
--no T-pose, I-pose, arms touching body, dynamic pose, asymmetric, tilted, holding weapon, holding cleaver, side view, 3/4 view, perspective distortion, military uniform, soldier, one eye covered, recognizable character
```

---

# §2 — ARMES (Meshy image-to-3D)

Pose universelle armes :

```
side profile view, isolated object, plain pure white background,
even diffuse lighting from front, no cast shadows, weapon reference sheet,
exaggerated chunky proportions for stylized 3D modeling
```

## Armes de départ / wall buys

### 2.1 — Pistolet (`pistol.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon 9mm semi-automatic pistol,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, oversized chunky proportions,
dark gunmetal gray slide and frame, brown grip with checkered texture,
brass shell ejector port, exaggerated caricature shape,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.2 — Olympia double-canon (`shotgun_olympia.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon side-by-side double-barrel shotgun,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, two horizontal black-steel barrels short-cut at the muzzle,
varnished wooden stock and forearm, exposed hammers above the breech,
oversized chunky proportions, sawed-off look, weathered and oiled,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.3 — MP5 SMG (`smg_mp5.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon submachine gun MP5,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, black polymer body, curved magazine extending below grip,
retractable wire stock extended, short barrel with cylindrical muzzle,
oversized chunky proportions, muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.4 — Batte de baseball (`bat.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon wooden baseball bat,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, polished light brown wooden bat,
black grip tape wrapping at the handle, dried dark blood splatters along the head,
slightly cracked and worn, oversized exaggerated proportions,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.5 — Hache de pompier (`axe.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon firefighter axe,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, faded red painted axe head with chipped metallic edge,
long varnished brown wooden handle with black grip tape lower half,
dried dark blood streaks on the blade, exaggerated chunky proportions, weathered,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

## Armes mystery box (RNG — extension future)

### 2.6 — M14 fusil semi-auto (`rifle_m14.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon M14 semi-automatic rifle,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, long blue-steel barrel, walnut wooden stock and forearm,
straight detachable magazine in front of trigger guard, iron sights,
oversized chunky proportions, classic american battle rifle silhouette,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.7 — AK générique (`rifle_ak.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon AK-style assault rifle,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, curved orange-brown polymer magazine, dark wood stock and grip,
black metal receiver, slanted muzzle brake, exaggerated chunky proportions,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.8 — LMG / mitrailleuse (`lmg_m60.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon belt-fed light machine gun M60,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, long dark metal barrel with bipod folded under,
visible ammo belt hanging from feed tray, dark green plastic buttstock,
exaggerated chunky proportions, heavy intimidating silhouette,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.9 — Fusil de chasse à pompe (`shotgun_pump.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon pump-action shotgun,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, dark blue-steel long barrel, wooden stock and pump forearm,
tubular magazine under barrel, brass shell loader port, iron bead sight,
oversized chunky proportions, hunting shotgun silhouette,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.10 — Carabine de chasse à lunette (`sniper_hunting.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon hunting rifle with scope,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, polished dark wood stock, long blue-steel barrel,
black cylindrical telescopic scope mounted above receiver,
bolt-action mechanism visible, exaggerated chunky proportions, classic hunter rifle,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.11 — Lance-roquettes (`rocket_rpg.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon shoulder-fired rocket launcher,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, dark olive green tube with conical warhead protruding from the front,
black pistol grip and folding iron sights, simple wire trigger guard,
oversized chunky proportions, surplus military silhouette,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.12 — Machette mêlée (`machete.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon survival machete,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, long flat steel blade with curved tip,
black rubberized grip wrapped with paracord at the pommel,
dried dark blood streaks along the cutting edge, weathered nicks,
exaggerated chunky proportions, brutal silhouette,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
```

### 2.13 — Wonder weapon "ARC GUN" (`arc_gun.glb`)

Arme rare originale (pas une copie d'une wonder weapon copyrightée).

```
Silent Hill 2 era PS2 horror game style cartoon improvised lightning rifle prototype,
low-poly era 2002 graphics, hand-painted diffuse texture,
side profile view, scrap metal body painted matte black with copper coil wrapping,
glowing acid-green tesla coil mounted on top of the receiver,
glass vacuum tube glowing green at the muzzle, exposed wires and bolts,
duct tape patches over the handle, scratched warning sticker on the side,
oversized chunky proportions, junkyard improvised prototype silhouette,
muted desaturated colors with acid green emissive accents, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
weapon reference sheet, isolated object

--ar 16:9 --v 6 --s 130
--no clean, polished, military issue, branded logo, recognizable game weapon
```

---

# §3 — MAP BUS DEPOT — textures (seamless tileable sauf indication)

## 3.1 — `floor_asphalt.png` (cour extérieure)

```
seamless tileable texture, cracked dark asphalt parking lot at night,
deep gray-black with subtle violet-blue tint, hairline cracks spreading,
faded yellow parking line fragments, oil stains, tire skid marks,
small puddles reflecting nothing, scattered cigarette butts,
Silent Hill 2 era PS2 horror game texture, hand-painted diffuse 512x512,
muted desaturated palette, top-down view, no perspective,
flat illustrated lighting baked in, no shadows on texture

--ar 1:1 --v 6 --s 100 --tile
```

## 3.2 — `floor_depot_concrete.png` (intérieur Depot)

```
seamless tileable texture, abandoned bus depot waiting area concrete floor,
dirty pale gray polished concrete slabs with thin black expansion joints,
scuff marks from boots, faint coffee stains, small dried blood spot,
worn salt streaks, Silent Hill 2 era PS2 horror game texture,
hand-painted diffuse 512x512, muted desaturated grays,
top-down view, no perspective, no shadows on texture

--ar 1:1 --v 6 --s 100 --tile
```

## 3.3 — `wall_depot.png` (mur intérieur/extérieur Depot)

```
seamless tileable texture, abandoned bus depot exterior wall,
dirty pale beige plaster with thin horizontal trim line at top,
oil splash stains low on the wall, faded blue paint scrapes,
graffiti scribbles in dark red, hairline cracks,
Silent Hill 2 era PS2 horror game texture, hand-painted diffuse 512x512,
muted desaturated palette, front view, no perspective, no shadows

--ar 1:1 --v 6 --s 100 --tile
```

## 3.4 — `wall_fence_brick.png` (mur d'enceinte de la cour)

```
seamless tileable texture, weathered industrial brick perimeter wall,
horizontal courses of small dark gray bricks with thin black mortar,
small efflorescence salt streaks, scattered moss patches in shadow,
faded red spray-paint X marks, dust accumulation at base of bricks,
Silent Hill 2 era PS2 horror game texture, hand-painted diffuse 512x512,
muted desaturated grays with rust accents, front view, no perspective, no shadows

--ar 1:1 --v 6 --s 100 --tile
```

## 3.5 — `bus_body_yellow.png` (carrosserie bus, tileable)

```
seamless tileable texture, weathered school bus yellow body paint with extensive rust,
faded ochre yellow base with oxidation streaks running vertically,
patches of bare metal showing through, dirt accumulation, dried mud splatter,
Silent Hill 2 era PS2 horror game texture, hand-painted diffuse 512x512,
muted desaturated palette, side view, no perspective, no shadows on texture

--ar 1:1 --v 6 --s 100 --tile
```

## 3.6 — `plank_wood.png` (planche bois barricades, tileable)

```
seamless tileable texture, rough sawn wooden plank used for boarding up windows,
dark stained oak with visible grain, knots, splinters and rusty nail marks,
small bloodstains in places, abandoned hardware store wood,
Silent Hill 2 era PS2 horror game texture, hand-painted diffuse 512x512,
muted desaturated warm browns, top-down view of plank surface,
no perspective, no shadows on texture

--ar 1:1 --v 6 --s 100 --tile
```

## 3.7 — `metal_corrugated.png` (toit / panneau métal ondulé, tileable)

Pour ajouts de toits, conteneurs, cabanes annexes.

```
seamless tileable texture, weathered corrugated metal sheet roofing,
dark gunmetal gray with horizontal ridges, rust streaks running vertically
from each ridge, peeling paint patches, small bullet holes scattered,
Silent Hill 2 era PS2 horror game texture, hand-painted diffuse 512x512,
muted desaturated grays, front view, no perspective, no shadows

--ar 1:1 --v 6 --s 100 --tile
```

---

# §4 — PROPS GAMEPLAY (Meshy image-to-3D)

## 4.1 — Mystery box (`mystery_box.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon wooden mystery crate,
low-poly era 2002 graphics, hand-painted diffuse texture,
3/4 front view, rectangular wooden crate slightly taller than wide,
dark stained oak planks with black iron strap bands around the sides,
large painted yellow question mark "?" centered on the front face,
small rusted padlock on lid, slightly chipped corners, dust patina,
oversized chunky proportions, exaggerated cartoon prop shape,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 1:1 --v 6 --s 130
--no shiny, modern, plastic, perspective distortion, action pose
```

## 4.2 — Perk machine REGEN (`perk_machine_regen.glb`)

Vert acide — heal HP après 5s sans dégât.

```
Silent Hill 2 era PS2 horror game style cartoon vintage perk vending machine,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, tall narrow standing vending machine box,
dark navy metal casing with glowing acid-green front panel,
large illustrated bottle icon at top showing toxic green liquid with white cap,
illuminated label below reading "REGEN" in bold blocky white letters,
coin slot and small dispensing tray at bottom, rusted edges, sticker peeling,
oversized chunky proportions, exaggerated cartoon prop shape,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 130
--no shiny, modern, perspective distortion, multiple bottles, branded logo
```

## 4.3 — Perk machine TANK (`perk_machine_tank.glb`)

Rouge sang — +max HP, dégâts réduits.

```
Silent Hill 2 era PS2 horror game style cartoon vintage perk vending machine,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, tall narrow standing vending machine box,
dark navy metal casing with glowing blood-red front panel,
large illustrated bottle icon at top showing crimson liquid with brass cap,
illuminated label below reading "TANK" in bold blocky white letters,
coin slot and small dispensing tray at bottom, rusted edges, sticker peeling,
oversized chunky proportions, muted desaturated colors,
no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 130
--no shiny, modern, perspective distortion, branded logo
```

## 4.4 — Perk machine QUICK (`perk_machine_quick.glb`)

Bleu cyan — recharge -50%.

```
Silent Hill 2 era PS2 horror game style cartoon vintage perk vending machine,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, tall narrow standing vending machine box,
dark navy metal casing with glowing cyan-blue front panel,
large illustrated bottle icon at top showing electric blue liquid with chrome cap,
illuminated label below reading "QUICK" in bold blocky white letters,
coin slot and small dispensing tray at bottom, rusted edges, sticker peeling,
oversized chunky proportions, muted desaturated colors,
no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 130
--no shiny, modern, perspective distortion, branded logo
```

## 4.5 — Perk machine BRUTE (`perk_machine_brute.glb`)

Jaune ambre — dégâts armes ×1.5.

```
Silent Hill 2 era PS2 horror game style cartoon vintage perk vending machine,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, tall narrow standing vending machine box,
dark navy metal casing with glowing amber-yellow front panel,
large illustrated bottle icon at top showing golden liquid with black cap,
illuminated label below reading "BRUTE" in bold blocky white letters,
coin slot and small dispensing tray at bottom, rusted edges, sticker peeling,
oversized chunky proportions, muted desaturated colors,
no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 130
--no shiny, modern, perspective distortion, branded logo
```

## 4.6 — Perk machine IRON (`perk_machine_iron.glb`)

Violet — sprint illimité.

```
Silent Hill 2 era PS2 horror game style cartoon vintage perk vending machine,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, tall narrow standing vending machine box,
dark navy metal casing with glowing deep purple front panel,
large illustrated bottle icon at top showing violet liquid with gold cap,
illuminated label below reading "IRON" in bold blocky white letters,
coin slot and small dispensing tray at bottom, rusted edges, sticker peeling,
oversized chunky proportions, muted desaturated colors,
no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 130
--no shiny, modern, perspective distortion, branded logo
```

## 4.7 — Lampadaire industriel (`street_lamp.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon industrial street lamp,
low-poly era 2002 graphics, hand-painted diffuse texture,
side view, tall straight black metal pole about 5 meters,
rectangular box light fixture at the top with single yellow bulb behind glass,
small mounting bracket below light, rust at the base, slight lean,
exaggerated chunky proportions, abandoned industrial outdoor lamp,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 130
--no modern LED, decorative, ornate, perspective distortion
```

## 4.8 — Barricade planches (`barricade_planks.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon barricaded window planks,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, four rough horizontal wooden planks nailed across each other
in a slightly crooked pattern, dark stained oak with visible knots and grain,
rusty bent nails at the ends, splinters and chips, dried blood smear on one plank,
exaggerated chunky proportions, isolated as a single asset,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 1:1 --v 6 --s 130
--no perfect, clean, new, modern, perspective distortion
```

## 4.9 — Banc de salle d'attente (`bench_waiting.glb`)

Pour le mobilier intérieur du depot.

```
Silent Hill 2 era PS2 horror game style cartoon bus depot waiting bench,
low-poly era 2002 graphics, hand-painted diffuse texture,
side view, long horizontal wooden bench with three flat seat slats,
dark stained oak planks with visible grain, black wrought-iron legs at each end,
slightly cracked seat, dust patina, exaggerated chunky proportions,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 1:1 --v 6 --s 130
```

## 4.10 — Distributeur de boissons (`vending_machine.glb`)

Décoratif (pas un perk).

```
Silent Hill 2 era PS2 horror game style cartoon abandoned soda vending machine,
low-poly era 2002 graphics, hand-painted diffuse texture,
front view, tall rectangular dispenser, dirty faded red and white paint
with generic "DRINKS" plate at the top, dark glass display showing
washed-out soda bottle silhouettes in rows, dim broken price labels,
coin slot and small cup tray at the bottom, scratched and graffitied front panel,
oversized chunky proportions, muted desaturated colors,
no PBR, painted texture only,
plain pure white background, even diffuse lighting, no shadows,
prop reference sheet, isolated object

--ar 9:16 --v 6 --s 120
--no branded soda logo, recognizable brand, modern LED
```

---

# §5 — VÉHICULES (Meshy image-to-3D)

## 5.1 — Bus scolaire abandonné (`bus_school.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon abandoned school bus,
low-poly era 2002 graphics, hand-painted diffuse texture,
3/4 front isometric view, faded yellow body paint with extensive rust patches,
flat tires sagging, cracked dark windshield, broken side windows boarded with wood planks,
black bumpers, single red taillight, blank signage above windshield,
oversized chunky proportions, exaggerated caricature shape, abandoned vehicle vibe,
muted desaturated colors, dark moody atmosphere, no PBR, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
vehicle reference sheet, isolated object

--ar 1:1 --v 6 --s 130
--no shiny, glossy, new, perspective distortion, action pose, motion lines, branded logo
```

## 5.2 — Berline abandonnée (`car_sedan.glb`)

```
Silent Hill 2 era PS2 horror game style cartoon abandoned sedan car,
low-poly era 2002 graphics, hand-painted diffuse texture,
3/4 front isometric view, worn cream-white body paint with extensive rust patches
and scratches, dirty cracked windshields, flat front tire on driver side,
oversized chunky proportions, generic 1980s mid-size sedan silhouette,
broken left headlight, blank dirty license plate,
muted desaturated colors, no PBR, painted texture only,
plain pure white background, even diffuse lighting from front, no cast shadows,
vehicle reference sheet, isolated object

--ar 1:1 --v 6 --s 120
--no shiny, new, modern, recognizable car model, branded logo, perspective distortion
```

---

# §6 — DECALS & SIGNALÉTIQUE (fond transparent)

## 6.1 — Enseigne `sign_bus_depot.png` (au-dessus de la porte du Depot)

```
illuminated bus depot exterior signboard reading "BUS DEPOT 04",
faded white sans-serif text on dark navy plastic backing,
small cracked bulbs along the top edge, rust at corners,
graffiti tag scribbled in red across one letter, slight tilt to one side,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 4:1 --v 6 --s 130
```

## 6.2 — Wall buy `sign_wall_pistol_ammo.png` ($250)

```
small wall-mounted purchase signage reading "PISTOL AMMO" with "$250" price tag,
white text on dark plastic frame with thin yellow neon border,
small bullet silhouette icon next to text, slightly dusty and worn,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 2:1 --v 6 --s 130
```

## 6.3 — Wall buy `sign_wall_olympia.png` ($500)

```
small wall-mounted purchase signage reading "OLYMPIA" with "$500" price tag
and a stylized double-barrel shotgun silhouette icon,
white text on dark plastic frame with thin yellow neon border, slightly dusty,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 2:1 --v 6 --s 130
```

## 6.4 — Wall buy `sign_wall_mp5.png` ($1000)

```
small wall-mounted purchase signage reading "MP5" with "$1000" price tag
and a stylized submachine gun silhouette icon,
white text on dark plastic frame with thin yellow neon border, slightly dusty,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 2:1 --v 6 --s 130
```

## 6.5 — Wall buy `sign_wall_bat.png` ($250)

```
small wall-mounted purchase signage reading "BAT" with "$250" price tag
and a stylized baseball bat silhouette icon,
white text on dark plastic frame with thin yellow neon border, slightly dusty,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 2:1 --v 6 --s 130
```

## 6.6 — Decal sang `decal_blood_splatter.png`

```
single large blood splatter decal, dark crimson red with darker dried edges,
irregular organic shape, droplets and trails radiating outward,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, top-down view, no perspective, no shadows

--ar 1:1 --v 6 --s 130
```

## 6.7 — Decal graffiti `decal_graffiti_run.png`

```
spray-painted warning graffiti in dark red, reading "RUN" in jagged
irregular letters, drips of paint running downward, slightly faded,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 2:1 --v 6 --s 130
```

## 6.8 — Decal graffiti `decal_graffiti_help.png`

```
spray-painted warning graffiti in dark red, reading "HELP US" in jagged
irregular letters with drips running downward, partially smeared with dirt,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 2:1 --v 6 --s 130
```

## 6.9 — Affiche `poster_missing.png`

Affiche "missing person" pour décorer un mur.

```
weathered missing person poster, faded printed photo of a generic blank face,
text reading "MISSING" at the top and "LAST SEEN" with smudged date below,
yellowed paper edges curling, water stains, torn corners,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective, no shadows

--ar 3:4 --v 6 --s 130
--no real person, recognizable face, branded logo, modern QR code
```

## 6.10 — Plaque immatriculation générique `plate_generic.png`

```
1980s american car license plate "DPT 247" text, cream-yellow background,
thin dark blue border, weathered with scratches and rust spots,
bold black serif font, no state name visible,
Silent Hill 2 era PS2 horror style, hand-painted diffuse,
isolated on transparent background, front view, no perspective

--ar 4:1 --v 6 --s 120
--no state seal, recognizable state name, brand logo
```

---

# Workflow recommandé

## Pour les modèles

1. **Génère sur Midjourney** avec le prompt ci-dessus (3-5 variantes par asset)
2. **Sélectionne la meilleure** (vérifie la symétrie A-pose, voir checklist plus bas)
3. **Upload sur Meshy AI** en mode "Image to 3D"
4. Si possible, sur Meshy clique **"Animate"** pour auto-rigger + animations
5. **Export GLB** avec rigging + animations
6. **Mets dans** `public/models/<nom>.glb`
7. **Dis à Claude** le nom du fichier et les noms exacts des animations

## Pour les textures

1. **Génère sur Midjourney** (utilise `--tile` pour seamless)
2. Si la texture a une couture visible : passe-la dans un outil seamless en ligne
3. **Sauve en PNG** dans `public/textures/<nom>.png`
4. **Dis à Claude** : "j'ai ajouté `<nom>.png`"

## Checklist visuelle A-pose (avant Meshy, pour les persos)

| Check | OK si | Pas OK si |
|-------|-------|-----------|
| Bras | Descendent à ~30° du corps, symétriques | Touchent le corps OU sont à 90° horizontaux |
| Mains | Doigts visibles, légèrement écartées du corps | Dans poches, en poing, tenant un objet |
| Pieds | Pointent vers l'avant, écartés ~hauteur épaules | Croisés, un en avant, talons écartés |
| Tête | Droite, regard caméra | Inclinée, tournée, baissée |
| Vêtements | Plis symétriques | Plus ample d'un côté |
| Accessoires | Centrés ou symétriques | Casquette de travers, montre sur 1 poignet |
| Branding | Aucun logo identifiable | Marques réelles, logos de jeux existants |

## Ordre de génération recommandé pour HORDE V1

Priorité décroissante :

1. **Textures Bus Depot** (§3.1 à §3.6) — la map est tout de suite plus belle
2. **Bus scolaire** (§5.1) — remplace le bus procédural actuel
3. **Mystery box** (§4.1) — visuellement signature
4. **Perk REGEN** (§4.2) — la seule perk actuellement câblée
5. **Lampadaire** (§4.7) — remplace les poteaux procéduraux
6. **Variantes zombies** (§1.2 à §1.5) — diversifie le visuel des hordes
7. **Joueur** (§1.1) — pour une éventuelle 3e personne / mort cinématique
8. **Signalétique wall buys** (§6.1 à §6.5) — remplace les canvas procéduraux
9. **Reste** (perks supplémentaires, armes mystery box, decals, voiture, boss)
