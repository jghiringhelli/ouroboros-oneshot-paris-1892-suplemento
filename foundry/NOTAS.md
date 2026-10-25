# NOTAS técnicas — Sistema Ouroboros para Foundry VTT v13

## 1. Incoherencias del documento del one-shot (se aplican las fórmulas de reglas)

Los atributos de los pregenerados se derivaron de los Circles dados (Circle = media de su par, redondeo hacia abajo).

| PJ | Documento | Fórmulas (lo que calcula el sistema) | Decisión |
|---|---|---|---|
| Edwina | HP 28, Pasiva 3, Saves 2/2/2/1 | idéntico | OK |
| Jane | HP 28, Pasiva 3, Saves 1/2/2/2 | idéntico | OK |
| Clovis | HP **34**, Nerve **3** | HP **35**, Nerve **2** (Earth 3, Water 2, Air 3) | Se usa la fórmula. HP 34 solo se alcanza con `PG fijos = 34` en la ficha. |
| Donatien | HP **34**, Reflex **1**, Resolve **2**, Nerve **3** | HP **32**, Reflex **2**, Resolve **1**, Nerve **2** (Earth 2, Water 3, Air 2, Fire 1) | Se usa la fórmula. |
| Clovis / Donatien | Defensa pasiva 4 / 3 | Reflexes (2 / 1) + armadura | Se añadió «Abrigo pesado» (+2) a ambos para que cuadre (4 y 3). La Defensa pasiva no puede derivarse solo de Fire. |

Otras decisiones:
- Fire 1 de Clovis/Donatien se reparte como Ref 2/Int 1 y Ref 1/Int 1 (el documento solo da el Circle).
- Bathsheba: los atributos del documento dan Circles 4/4/2/2 y HP 44 (coinciden). Defensa +4 = objeto «Mármol animado».
- Musas, Minotauro y Kraken usan «PG fijos» (10, 36, 40) porque el documento da HP, no atributos. Sus atributos son inventados.
- Manifestación: físicos 4 / mentales 1 → HP 30 por fórmula (coincide).
- Quinto pregenerado: René Rochefort (Rogue, periodista); derivados por fórmula HP 30, mano 2, pasiva 2, salvaciones 2/2/2/2 (cubierto por test). `importAdventure` reparte mano a todos los `character` importados (5 pregenerados + 4 demo).
- Galería: 10 obras (`10_estatua_bathsheba` añadida; ver `ARTWORKS` en `art.mjs`). TN por defecto *Moderate* y textos atmosféricos genéricos, iguales para todas las obras. La aventura transcurre el 10 de abril de 1892; el repo de medios conserva su nombre.
- Demo (Viktor, Elena, Dmitri, Magnus): todos coinciden con las fórmulas (HP 33/32/28/28, pasivas 5/1/3/3).
- «Luck» del one-shot se sustituye por Resolve Moderada (ya indicado en el documento).
- Recortes: los PNJ secundarios (Péladan, La Rush, etc.) no tienen estadísticas en el documento; sus fichas son sencillas e inventadas. El reparto de la Escena 1 no incluye cifras.
- Las condiciones se implementaron como efectos de estado (nombres/duración se gestionan a mano).

## 2. Reglas interpretadas

- Redondeo hacia abajo en Circles, innatas, saves y Willpower (mín. 2). Mano = Willpower (−1 si Sembrado, mín. 1).
- Defensa pasiva = Reflexes + armaduras equipadas + bono manual. Iniciativa = Carta + Fire + Air (desempate por Fire).
- Figura jugada de la mano: se elige una carta numérica base del mismo color de la mano (o 5). Jota: −5 en chequeos, +5 en combate. Reina: se anota el segundo golpe (no se automatiza). Rey: cancela. Joker: valor 1–10 y palo del color.
- Daño mínimo 1 si el ataque supera la defensa (resolveAttack). Si tu mesa lo trata distinto, edita `logic.mjs`.
- Todas las operaciones sobre mazos pasan por el **GM activo** (socket `system.ouroboros`), porque los jugadores no pueden modificar mazos del mundo. Sin GM conectado no se puede robar/jugar cartas.

## 3. Puntos de API de Foundry v13 que no pude ejecutar (revisar si algo falla)

No hay Foundry disponible aquí; solo se comprobó con `node --check`, los tests de `logic.mjs` y `tests/validate.mjs`. Se verificó en la documentación v13: `ActorSheetV2`, `DocumentSheetConfig` (`foundry.applications.apps`), `CONFIG.Cards.presets`, `CONFIG.TextEditor.enrichers`, `Cards#draw/pass/recall/shuffle`, `registerMenu` con ApplicationV2.

Inciertos:
1. **Preset de póker**: se intenta leer `CONFIG.Cards.presets.pokerDark.src` y reconocer 54 cartas por nombre (`parseCardName`). Si el JSON no tiene esa forma, se crean cartas manuales (sin imagen, rank/suit como flags). Es lo primero que conviene comprobar (consola: «preset de póker no utilizable»).
2. `Cards#pass` desde la pila de descarte al mazo: se espera que las cartas vuelvan como «no robadas» (`drawn=false`). Si el recuento «Quedan» no sube tras barajar, usar el botón *Reiniciar*.
3. `Cards.create` con `cards` embebidas (se usa para ambos mazos).
4. `getSceneControlButtons` (v13: `controls.tokens.tools`): está en try/catch; si no aparece el botón, se usa la macro «Mano» / «Panel del GM».
5. `data-action="editImage"` en la imagen de la ficha (ActorSheetV2) y `data-edit="img"`.
6. Enriquecedores `@Chequeo[id]{txt}`, `@Obra[id]`, `@Spawn[id]`: se renderizan como `<a class="ouro-enricher">` con un único listener de clic delegado (no se usa `onRender`).
7. `Combat#rollInitiative` sobrescrito (`OuroborosCombat`): actualiza `initiative = total + Fire/10` y mantiene el turno actual solo si eres GM.
8. `CONFIG.statusEffects` con iconos `icons/svg/*.svg` del núcleo (algunos nombres pueden no existir; se verán rotos pero funcionan). `foundry.utils.escapeHTML`.
9. `DialogV2.wait` con `button.form` (los contenidos no llevan `<form>` propio).
10. `game.user.assignHotbarMacro` y `game.user.hotbar` al crear la barra de macros.
11. `User#isActiveGM` / `game.users.activeGM`.
12. Imágenes de macros (`icons/svg/card-hand.svg`, etc.) del núcleo.
13. Los jugadores deben tener permiso para crear mensajes de chat (por defecto sí).

## 5. Teatro de la mente: mazos, chequeos y galería (rediseño)
Archivos: `module/cards.mjs` (mazos/manos/operaciones), `rolls.mjs` (chequeos, usos, tope), `checks.mjs` («Pedir chequeo»), `gallery.mjs`, `art.mjs` (overlay + vídeo), `apps.mjs` (Mesa, Mano, Panel GM). Lógica pura con tests en `logic.mjs`.

**Quitado** respecto a la versión anterior: la escena «Galería – Un Mensaje de Arte» (Tiles, Drawings, tokens de PJ), la proximidad (`updateToken`), la capa PIXI sobre las tiles, el ajuste `galleryRadius`, el botón *Crear galería*, la colocación de tokens de los combates (ahora `spawnEncounter` susurra al GM la lista de criaturas y sus PV) y el panel «Mostrar obra» del Panel del GM (sustituido por la ventana Galería). No se depende de `Scene`/`canvas`.

**Estado**: pila de robo = cartas del mazo con `drawn=false` ordenadas por `sort` (menor = arriba); descarte con `flags.ouroboros.seq` creciente. Los jugadores no leen los mazos: el GM publica en el Setting de mundo `tableState` solo el conteo y el descarte ordenado (nunca el orden de la pila). Galería: Setting `galleryState` `{id:{tn,mode,played:[userId]}}`. Ambos con `onChange` → `Hooks.callAll("ouroborosTable"/"ouroborosGallery")` para refrescar ventanas.

**Consciente vs. pasivo** (`cardSource`, `checkView`): consciente = el cliente del jugador elige carta de la mano; pasivo = `runPassiveCheck` en el cliente del GM (el Joker lo declara el GM), mensaje completo susurrado a los GM y al jugador solo el texto percibido, si supera. La carta del tope va al descarte público (se sabe que se usó una carta, no para qué).

No verificado sin Foundry / dudas de API:
1. **`Cards#pass` con `updateData`** (se usa `{updateData:{flags:{ouroboros:{seq}}}}` para numerar el descarte): si la opción no existiera, el orden del descarte caería a `sort`. También se asume que las cartas conservan su id al pasar de mazo a pila y que pasar desde un mazo las marca `drawn`.
2. **`Cards#recall`** (reiniciar) y `Cards#shuffle` con el nuevo `sort`: tras barajar se reescribe `sort` explícitamente (`sortsFor`) para que el orden sea el nuestro. Comprobar que «Quedan» y el orden coinciden tras reordenar/barajar.
3. Las cartas devueltas a un mazo (mano→tope/fondo, Joker) se detectan por diferencia de ids (`addedIds`); si Foundry cambia el id al pasar, `handToDeck` falla con «La carta no volvió al mazo».
4. **Settings `onChange` en clientes** de jugadores: se espera que se dispare al escribir el GM un Setting de mundo; si no, las ventanas Mesa/Galería no se refrescarían solas (reabrir).
5. Los jugadores crean `ChatMessage` susurrados desde su cliente (consciente); los pasivos los crea el GM. `DialogV2.prompt/wait` con `button.form` (ver §3).
6. **Overlay y diálogos**: el overlay a ventana grande usa `z-index:90` para que los diálogos queden encima; si una ventana de Foundry lo tapa, ajustar en `css/ouroboros.css`.
7. **Vídeo**: `<video>` HTML en el overlay (muted, sin loop, `playsInline`, `ended` → queda la imagen original). El autoplay silenciado debería permitirse sin gesto del usuario; si el navegador lo bloquea, `play()` rechaza y se queda la imagen (se registra en consola).
8. El susurro con enlaces depende de que el repo de medios siga público; Foundry puede sanear `target`/`rel` de los enlaces.
9. Quien entra tarde no ve el vídeo, solo la imagen; el estado «ya vista» es por usuario, no por personaje. Un jugador sin personaje (`user.character` o propietario) no hace chequeo.
10. `getSceneControlButtons` (`controls.tokens.tools`): botones Mesa/Mano/Galería/Panel en try/catch (mismo riesgo que §3.4); alternativa: las macros.
11. `Actor#testUserPermission(user,"OWNER")` para localizar el personaje del jugador.
12. El diálogo de peek ordena por los números que escribe el jugador; empates se resuelven por posición original.

## 6. Mapa de París y retratos/carteles
Archivos: `module/map.mjs`, `templates/map-app.hbs`, lógica pura (`mapStateOf`, `revealMarker`, `setParty`, `visibleMarkers`, `clickToNorm`…) en `logic.mjs`; `EXTRA_IMAGES` en `art.mjs`. Socket `{type:"map", cmd:"open", users}`. Assets: `assets/map/`, `assets/extra/` (copiados por `sync_art.ps1`, que ahora acepta `-MapSource` y `-ExtraSource`).

No verificado sin Foundry:
1. Posición de los marcadores: `left/top` en % sobre un contenedor `position:relative` del ancho de la imagen (`line-height:0`); si el CSS de Foundry añade márgenes o escala la imagen, comprobar que el pin cae sobre el lugar. El marcador 7 (Thoiry) está dentro del 0–1 pero «fuera del plano» (cae sobre el margen del plano o sobre la leyenda).
2. Clic para mover el grupo: `getBoundingClientRect()` del contenedor interior (el scroll de `.ouro-mapscroll` está soportado porque el rect ya viene desplazado).
3. `onChange` del Setting `mapState` en clientes de jugadores (como §5.4) para refrescar sin reabrir.
4. Ventana de 900×700 con la imagen de 3600 px (5 MB): carga lenta la primera vez; se reduce con el zoom del navegador, no hay zoom propio.
5. Retratos/carteles: PNG de ~1,6 MB cada uno; la lista de la Galería los carga como miniaturas (15 × 1,6 MB) al abrirse. Se muestran con el mismo overlay (sin macabra ni vídeo).
6. `Hooks ouroborosMap` también re-renderiza el Panel del GM si está abierto.

## 7. PROPUESTA (no ejecutada): separar sistema y módulo de contenido
**Sistema `ouroboros`** (reglas, genérico): `system.json`, `module/{ouroboros,data,documents,sheets,cards,rolls,checks,apps}.mjs`, `logic.mjs` (parte de reglas: deriveStats, mazo, pilas, chequeos, mano), `templates/{actor-sheet,item-sheet,hand-app,table-app}.hbs`, `css/ouroboros.css` (sin las clases del mapa/overlay), `lang/es.json` (claves de reglas: Deck/Hand/Table/Use/Check/Roll/Joker/…), tests de reglas.
**Módulo `ouroboros-mensaje-de-arte`** (contenido): `module.json` (relationships: requires system `ouroboros`), `module/{importer,gallery,art,map,main}.mjs`, `logic.mjs` de contenido (galería, mapa, mediaUrls), `templates/{gallery-panel,map-app,gm-panel}.hbs`, `data/*.json` (actores, items, checks, encuentros, journals), `assets/{art,map,extra}`, `lang/es.json` (Gallery/Map/Art/Panel), `sync_art.ps1`, su propio zip y tests (galería/mapa/validate de datos).
**Riesgos**
1. Hooks/API entre ambos: el módulo usa `game.ouroboros` (openGMPanel, requestCheck, runPassiveCheck, markGalleryPlayed…); habría que definir una API pública estable (`game.ouroboros.api`) y versionarla.
2. `cards.mjs` hoy escribe `galleryState` (op `galleryPlayed`) y `rolls.mjs` importa lógica de galería: hay que invertir la dependencia (el módulo registra ops/handlers por un registro de extensiones).
3. Un solo socket `system.ouroboros`: el módulo necesita el suyo (`module.ouroboros-mensaje-de-arte`) y declararlo en `module.json`.
4. Rutas `systems/ouroboros/...` pasarían a `modules/ouroboros-mensaje-de-arte/...` (assets, data, plantillas); `validate.mjs` y `sync_art.ps1` deben adaptarse, y los flags `flags.ouroboros.id` se mantienen (mismo namespace) o se migran.
5. Plantillas compartidas (`gm-panel.hbs` mezcla reglas y contenido) y claves de idioma repartidas: cada parte necesita su `es.json` y los `loadTemplates` por separado.
6. Migración de mundos existentes: ajustes `galleryState/mapState/mediaBaseUrl` cambian de namespace (`ouroboros` → módulo); hay que migrarlos o aceptar el reinicio.
7. Compatibilidad: v13 exige orden de carga (módulo después del sistema) y comprobar que el sistema funciona sin el módulo (sin importador ni galería).
Beneficios: un sistema reutilizable para otras aventuras, el zip del sistema deja de pesar ~45 MB y el contenido se versiona/actualiza aparte.
## 4. Revelado de obras
- El socket es `system.ouroboros` (declarado en `system.json`). Mensaje `{type:"art", cmd, users, art, delay}`; cada cliente se filtra por su id de usuario.
- Los jugadores no reciben aviso. `Esc` cierra el overlay en el cliente local.
- Si falta una imagen aparece «Falta la imagen: …». Ejecuta `foundry\sync_art.ps1` cuando el arte esté listo.
