# Ouroboros RPG — sistema para Foundry VTT v13

Sistema de rol sin dados (todo con cartas), interfaz en español. Incluye el one-shot **«Un Mensaje de Arte»** (teatro de la mente, sin mapa ni tokens) con pregenerados, PNJ, criaturas, diarios, mazo compartido y manos, chequeos conscientes/pasivos y una **galería** de obras en pantalla de cada jugador.

## Instalación
1. Descomprime `ouroboros-system.zip` dentro de `Data\systems\` de Foundry (debe quedar `Data\systems\ouroboros\system.json`).
2. (El arte ya viene incluido en el zip; para actualizarlo) ejecuta `foundry\sync_art.ps1` en este PC y vuelve a copiar la carpeta, o copia a mano `*_pure.png`/`*_macabre.png` a `Data\systems\ouroboros\assets\art\`.
3. Reinicia Foundry, crea un mundo con el sistema **Ouroboros RPG** y entra como GM.
4. **Importar**: Ajustes → Configuración del sistema → *Importar aventura* (o consola: `game.ouroboros.importAdventure()`). Es idempotente: se puede repetir sin duplicar. Crea carpetas, 5 pregenerados (Edwina, Jane, Clovis, Donatien, Rochefort) + 4 demo, PNJ/criaturas, armas/armaduras/poderes, 4 diarios, mazos «Mazo de Jugadores» y «Mazo del GM» (con su descarte), manos (los 5 pregenerados y los 4 demo reciben su mano) y macros en la barra. No crea ninguna escena.

## Cómo usar como GM
Requisito: **el GM debe estar conectado** (los jugadores operan los mazos a través de él). Idioma: el sistema trae sus textos en español y los registra para `es` y `en`; no hace falta cambiar el idioma de Foundry.

1. **Primera vez**: *Ajustes → Configurar ajustes → Ouroboros RPG → Panel del GM* (o botón **Panel del GM** en la cabecera de la pestaña *Actores*, o el icono del dragón en los controles de *Tokens*). Pulsa **Importar aventura**: crea actores (5 pregenerados + PNJ/criaturas), diarios, macros, los 2 mazos y **reparte las manos de jugadores y de los PNJ/criaturas con mano** (Bathsheba, Manifestación, Minotauro, Kraken, Péladan, La Rush).
2. **Mesa del GM** (mazos y manos de todos): pestaña *Actores* → botón **Mesa del GM**; o Panel del GM → *Mesa y manos* → **Mesa del GM**; o macro *Mesa (mazos)*. Para cada mazo (jugadores y GM/enemigos) ves pila de robo, descarte en orden y botones: *Mirar el tope (peek)* y reordenar, *Revelar tope al descarte*, *Tope al fondo*, *Barajar*, *Barajar descarte al mazo*, *Buscar carta*. Debajo, **cada mano** con sus cartas visibles y botones: por carta *Jugar* (pide el uso y lo publica en el chat), *Descartar*, ↑/↓ al tope/fondo del mazo; por mano *Abrir mano*, *Robar*, *Rellenar mano*, *Descartar mano* (con o sin robar de nuevo) y *Usar tope*.
3. **Mano de un PNJ**: desde la Mesa del GM (arriba), desde el Panel del GM → *Manos (jugadores y PNJ)* (icono ♦), desde su **ficha** (botón de la mano; la ficha muestra ahora las cartas con *Jugar/Descartar/Rellenar/Descartar mano/Usar tope*) o con la ventana **Mano** (selector de actor). Si un PNJ no tiene mano, en su ficha aparece *Crear mano* (la crea y reparte).
4. **Pedir chequeo** (consciente/pasivo): Panel del GM → *Pedir chequeo* (o macro), o el botón de papel junto a cada chequeo del Panel.
5. **Galería**: Panel del GM → *Galería* (la lista tiene scroll). Marca jugadores, elige modo/TN y pulsa el ojo (*Mostrar*), ▶ (*Disparar ya*, sin chequeo) o ↺ (*Reiniciar*). *Transformar sin avisar* y *Ocultar* actúan sobre los marcados. En la misma ventana: retratos y carteles.
6. **Mapa**: Panel del GM → *Mapa de París* y *Mostrar mapa a todos*; ojo para revelar lugares; *Mover el grupo* y clic en el plano.
## Teatro de la mente: Mesa, manos y mazos
No hay mapa, tokens ni escenas: todo es chat, ventanas y cartas. Los mazos («Mazo de Jugadores» y «Mazo del GM») son **compartidos**.
- **Mesa** (botón ▦ de escena, macro *Mesa (mazos)* o `game.ouroboros.openTable()`): ventana visible para todos con, por cada mazo, la **pila de robo** (solo el conteo; su orden nunca se publica) y la **pila de descarte completa en orden** (la última carta descartada arriba).
- **Mano** (botón ◆, macro *Mano*): privada (solo su dueño y el GM). Tamaño = **Voluntad (mín. 2)**, −1 si Sembrado. Acciones:
  - **Rellenar mano** (robar hasta el tamaño) y **Robar** una.
  - **Descartar mano**: todas van al descarte y, si quieres, roba nuevas hasta el tamaño.
  - **Jugar** una carta: eliges su uso (*ataque, defensa, habilidad, salvación, iniciativa, otro* con texto libre); se publica en el chat con la carta y su uso y pasa al descarte.
  - **Poner encima / mandar al fondo del mazo** una carta de la mano.
- **Usar tope del mazo**: robo ciego de la carta de arriba para cualquier uso (figura = 5; Joker = comodín 1–10 que declaras). La carta va al descarte, visible en la Mesa.
- **Manipular el mazo**: *Mirar el tope* (peek de N cartas, solo tú las ves) con reordenado de esas N, *Tope al fondo*, *Barajar mazo*, *Barajar descarte al mazo* y *Buscar carta* (solo GM; la deja arriba o en una mano). El chat público registra cada acción **sin revelar** las cartas miradas.
- **Un GM debe estar conectado**: todas las operaciones pasan por el GM activo (socket `system.ouroboros`).
- API: `game.ouroboros.drawToHand/fillHand/discardHand/playWithUse/useTopCard/peekDeck/reorderDeck/topToBottomDeck/handToDeck/shuffleDeck/shuffleDiscardBack/searchDeck/takeCard`.

## Chequeos: consciente vs. pasivo
Ouroboros no tiene dados: lo más parecido a una tirada es **una carta**. Hay dos modos, siempre visibles (leyenda en la Mano, en «Pedir chequeo» y en el chat):
- **Consciente**: el jugador sabe que se juega algo y **elige** una carta de su mano (si su mano está vacía, roba el tope).
- **Pasivo**: el jugador no sabe que busca nada. Se **fuerza** un robo ciego del tope del mazo (no elige). El **GM ve** todo (habilidad, TN, carta, resultado); el jugador **solo recibe lo que percibe** (la pista, y solo si supera), sin TN ni qué se comprobó. Lo ejecuta el cliente del GM.
- Fórmulas (las de siempre): Habilidad = Carta − Círculo − Resonancia ≤ TN; Salvación = Carta − Salvación ≤ TN (menor es mejor).
- **Pedir chequeo** (GM; macro, botón de la Mano o Panel del GM): TN (numérico o por dificultad), habilidad/atributo/salvación o habilidad de ficha, pista, **modo** y **destino** (un personaje o todos). También los botones «Pedir» de los diarios (`@Chequeo[id]`).

## Galería sin mapa
Ventana **Galería** (GM: botón de escena, macro *Galería* o `game.ouroboros.openGallery()`) con las 11 obras (la 11, «La transformación de Bathsheba», parte de la estatua, reproduce el vídeo estatua→mujer y queda congelada en la mujer) (imagen original).
- **Mostrar** una pintura a los jugadores marcados: la ven en una ventana grande. Por pintura se configura el **TN** (por defecto *Moderate*) y el **modo** (pasivo por defecto, consciente, o sin chequeo).
- **Pasivo**: tras unos segundos el GM fuerza el tope del mazo del personaje (Percepción). **Consciente**: al jugador se le pide elegir carta de su mano.
- **Éxito**: se reproduce el **vídeo MP4 local**, una vez y silenciado, en su ventana; después queda **congelada** en la imagen original; además recibe un **susurro** (solo él y el GM) con los enlaces raw al vídeo y a la imagen macabra. **Fallo**: solo un texto atmosférico y la imagen sigue fija. Cada jugador lo ve una vez por pintura (estado en el Setting de mundo `galleryState`).
- **Controles GM**: *Disparar ahora* (muestra y reproduce sin chequeo), *Reiniciar pintura / todas*, **Transformar sin avisar** (morph a la versión macabra a quien la tenga abierta) y *Ocultar*. Desde los diarios, `@Obra[id]` abre la Galería.
- Ajuste **URL base de medios** (por defecto `https://raw.githubusercontent.com/jghiringhelli/ouroboros-oneshot-paris-1892-suplemento/main`, con `video/<id>.mp4`, `original/<id>.png`, `macabra/<id>.png`).
- Arte: `foundry\sync_art.ps1` copia a `assets\art\` los `*_pure.png`, `*_macabre.png` y `<id>.mp4` y regenera `ouroboros-system.zip`.

## Mapa de París (sin escena ni tokens)
Ventana **Mapa** (GM: botón de escena, macro *Mapa de París*, `game.ouroboros.openMap()` o Panel del GM) con el plano Hachette 1892 limpio y los 7 marcadores como botones HTML sobre la imagen (posición en %).
- **Revelado**: por defecto solo los lugares 1 y 2. El GM revela/oculta cada lugar con el ojo en la ventana del mapa o en el **Panel del GM → Mapa**. Los jugadores solo ven los revelados; el GM ve los ocultos atenuados.
- **El grupo**: pin dorado (★). *Mover el grupo* (GM): activa el modo y haz clic en el plano o en un lugar.
- **Mostrar mapa a todos** abre la ventana en los jugadores conectados. Clic en un lugar revelado = nombre y subtítulo.
- **Obra enlazada** (opcional, solo dato para el GM): cada lugar puede apuntar a una obra de la Galería (por defecto 2 → cartel Rosa+Cruz; 5 Morgue sin obra).
- Estado en el Setting de mundo `mapState` (`{revealed, party, links}`), sincronizado a los clientes. Datos: `assets/map/{paris_1892_limpio.jpg, paris_1892_marcado.jpg, marcadores.json}` (el marcado queda como recurso, no se usa).

## Retratos y carteles
En la ventana **Galería** hay dos listas más: **Retratos** (11) y **Carteles** (4), de `assets/extra/`. El ojo los muestra sin chequeo a los jugadores marcados (mismo overlay; *Ocultar* los cierra).
## Revelado de obras (sesión online con Discord)
El overlay de la Galería es el mismo mecanismo de siempre (imagen pura, morph a macabra y regreso). Desde el Panel del GM / Galería: **Transformar sin avisar** y **Ocultar**; macros *Transformar obra (todos)* y *Ocultar obra*. Cualquier jugador puede cerrarlo con `Esc` o con ×.

## Diarios y combates
- *Resumen del one-shot*, *Combates* (5 encuentros; el botón susurra al GM la lista de criaturas y sus PV, sin tokens), *Chequeos de habilidad* (cada fila tiene un botón «Pedir» que publica un mensaje con un botón por PJ) y *Hoja de reglas*.
- Macro **Pedir chequeo** o el Panel del GM para lanzar cualquiera.

## Lista de comprobación rápida
- [ ] El sistema aparece al crear mundo y carga sin errores en consola (F12).
- [ ] *Importar aventura* crea actores, diarios, macros y los 2 mazos (54 cartas) + manos.
- [ ] Abrir ficha de Edwina: HP 28, mano 2, pasiva 3. Clic en una habilidad → diálogo → carta → chat con verdicto.
- [ ] Un jugador conectado puede robar/jugar cartas (GM conectado).
- [ ] Atacar con un token objetivo → «Defender» → «Aplicar daño» baja los PG.
- [ ] Iniciativa en el Combat tracker.
- [ ] Mesa abierta en un segundo navegador (jugador): conteo de la pila y descarte en orden se actualizan.
- [ ] Chequeo pasivo desde «Pedir chequeo»: el jugador solo ve lo percibido; el GM ve TN y carta.
- [ ] Mesa del GM: ves las manos de Bathsheba y los demás PNJ con cartas, y puedes robar/jugar/descartar por PNJ.
- [ ] La lista de la Galería hace scroll y se alcanzan las 11 obras y los retratos/carteles.
- [ ] Mapa: *Mostrar mapa a todos* lo abre a los jugadores; revelar un lugar lo hace aparecer; mover el grupo mueve el pin dorado.
- [ ] Mostrar una pintura a un jugador: éxito → vídeo una vez y susurro con enlaces; fallo → texto atmosférico.
- [ ] «Colocar» un combate desde el diario susurra la lista de criaturas al GM.
- [ ] Galería: *Disparar ahora* reproduce el MP4 una vez y deja la imagen fija; no se repite; *Reiniciar* lo rearma.

Ver `NOTAS.md` para incoherencias del documento y puntos de API no verificados.
