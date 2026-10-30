# VelaSolarVR

Vela Solar: uma nave sem motor, movida a luz, em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. Você fica de pé numa pequena gôndola e pilota com os dois braços uma vela solar
gigante: as mãos seguram a barra (retranca) e a direção da barra e o giro dos punhos definem a vela.
A luz das estrelas empurra a vela pela frente (força pela normal, ∝ cos² do ângulo e 1/r²); vela de
lado para a luz não empurra nada, então dá para "bordejar" como um veleiro: inclinada a favor do
movimento acelera a órbita, contra o movimento freia e cai para perto da estrela. A gravidade das
estrelas e planetas atua de verdade (órbitas, estilingue), e a sombra de planetas e luas corta a luz.
Um mapa holográfico à frente mostra o sistema de cima e a trajetória prevista (pontilhada), que muda
ao vivo quando a vela mexe. 15 fases em 3 sistemas estelares, 3 estrelas por tempo. Também joga no
PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/VelaSolarVR/** (depois de
publicado) e apertar "Entrar em VR". Para publicar: commitar e rodar `python publicar.py VelaSolarVR`
na pasta `C:\claude code` (só quando o Eduardo pedir).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8835` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443). `--port N` troca a porta.

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar a barra da vela | Segurar o aperto (botão lateral) das duas mãos. Uma mão só também segura (a barra segue o controle) | (sempre na mão) |
| Girar a vela | Girar a barra no plano: uma mão para a frente, a outra para trás. Barra atravessada = vela de frente para a frente | Arrastar com o botão esquerdo para os lados, ou A/D |
| Deitar a vela (empurra menos) | Girar os punhos em volta da barra | W/S (ou arrastar para cima/baixo) |
| Recolher / abrir a vela | A ou X; ou juntar as mãos na barra (recolhe enquanto juntas) | Espaço |
| Soltar a barra | Soltar o aperto: a vela fica como estava | |
| Zoom do mapa | Manche para cima/baixo | Roda do mouse (ou + / -) |
| Olhar em volta | Virar a cabeça (a gôndola não gira) | Arrastar com o botão direito |
| Câmera | | Tab: gôndola ou visão de cima |
| Pausa | B ou Y | Esc ou P |
| Recomeçar | Pausa → Recomeçar | R |
| Menu | Apontar com o controle e gatilho | Clique |
| Só com as mãos | Pinça das duas mãos segura a barra; apontar e pinça no menu | |
| FPS | Menu → FPS | Tecla F |

Na pausa do VR: "Recentralizar" põe os olhos no meio da gôndola olhando para a frente e acerta a
altura medindo a cabeça (funciona sentado ou em pé); "Mais baixo / Mais alto" ajustam de 5 em 5 cm
(fica salvo). O controle vibra de leve com a força da luz enquanto segura a barra.

### Regras e fases

Cada fase começa com 3 s de contagem com a nave parada: dá para ajeitar a vela olhando a previsão.
Objetivos em ordem: passar pelas boias de luz (faróis), entrar em órbita estável de um planeta
(periastro acima de 1,6 raio e apoastro abaixo do anel tracejado por alguns segundos seguidos),
entregar carga numa lua/planeta (chegar perto devagar: velocidade relativa abaixo do limite) ou
chegar ao portal. Perde ao cair numa estrela ("a vela queimou"), bater num planeta/cometa, sair do
mapa ("perdido no espaço"), ser alcançado pela onda da nova ou passar do tempo limite (se a fase
tiver). Estrelas pelo tempo (`stars` de cada fase); acima do limite de 1 estrela termina com 0 e não
libera a próxima. Progresso no navegador (localStorage `velasolarvr.v1`).

Fases (em `js/levels.js`):
- Sol Amarelo: 1 Primeira luz (acelerar), 2 Frear a órbita, 3 Colar de faróis, 4 Órbita de Aurora,
  5 Carga para Pérola (lua).
- Estrela Dupla (duas estrelas girando, luz de dois lados): 6 Duas luzes, 7 Sombra do gigante (boia
  escondida na sombra de Titã), 8 Estilingue (Titã arremessa), 9 Órbita dupla, 10 Lua de cristal.
- Gigante Vermelha e Anã Branca (luz fraca longe, fortíssima perto): 11 Luz de brasa, 12 Vento
  estelar (rajadas em espiral), 13 Chuva de cometas, 14 Perto da Anã (luz mais forte que a
  gravidade), 15 Fuga da nova (a anã explode; corrida até o portal fugindo da onda).

## Como testar

- `node tests/run.js` (ou `npm test`): vela (de lado não empurra, de frente empurra o máximo, cos²,
  1/r², força pela normal e sempre para longe da luz, deitar e recolher), sombra (corta a luz, borda
  suave), gravidade (órbita circular estável, energia conservada em órbita excêntrica, vela de frente
  afasta, bordejar ganha/perde momento angular, frear se aproxima da estrela, estilingue atrás e na
  frente do planeta, cometa de Kepler periódico, elementos de órbita), previsão (bate com a simulação,
  inclui o recolher, avisa batida), objetivos (contagem, boias em ordem, queimar, perdido, tempo
  limite, órbita estável, rápido demais não é órbita, bater no planeta, entregar devagar, nova),
  validação das 15 fases e o robô: só mexe no ângulo da vela e em recolher e tem que completar as 15
  fases com folga para 1 estrela (os tempos dele aparecem no teste). Termina com "Tudo certo". Não
  toca som.
- No navegador (console): `dev.loadLevel(3)` abre a fase 3 (1 a 15), `dev.autoplay = true` faz o robô
  pilotar, `dev.advance(20)` avança 20 s na hora, `dev.state()` mostra tela, fase, tempo, objetivo,
  nave e luz, `dev.snapshot()` devolve a imagem da tela (JPEG em data URL), `dev.resetSave()` apaga o
  progresso, `dev.setCam('top')` troca a câmera, `dev.vrView(true, -0.7)` mostra no PC o layout do VR
  (mapa na gôndola, placas) com a câmera nos olhos olhando para baixo (para fotos). `window.vela` tem
  `game`, `save`, `sfx`, `startLevel`, `goMenu`, `holo`.
- **Só dá para testar no óculos:** pegar e girar a barra com os controles e com as mãos (pinça),
  giro dos punhos para deitar a vela, juntar as mãos para recolher, recentralizar e altura,
  vibração, conforto, legibilidade do mapa e das placas, FPS no Quest.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar e avisos do PC |
| `js/physics.js` | Física em 2D: corpos em trilhos (órbita circular ou de Kepler), luz na vela (cos², 1/r², deitar, recolher), sombra, vento de partículas, nova, gravidade, nave com leapfrog em passo fixo de 1/60 s, previsão, elementos de órbita. Sem navegador |
| `js/start.js` | Posição e velocidade de largada (órbita circular em volta de um corpo). Sem navegador |
| `js/game.js` | `Game`: uma fase em andamento (contagem, objetivos, falhas, cronômetro, estrelas, eventos). Sem navegador |
| `js/levels.js` | Os 3 sistemas e as 15 fases. Boias desenhadas por um voo de referência (`route`), planetas e cometas postos no caminho dele (`placeOnRoute`, `cometThrough`), estrelas por tempo (`STARS`). Sem navegador |
| `js/robot.js` | Robô: a cada 0,5 s testa planos de vela (trechos de 1,5 s, 20 s à frente) com a mesma simulação da previsão e fica com o que cumpre mais objetivos mais cedo. Usado pelos testes e pelo `dev.autoplay`. Sem navegador |
| `js/scene.js` | 3D: céu com nebulosa (shader), estrelas de fundo, estrelas com superfície animada e halo (sprites aditivos), planetas com textura de canvas e anéis, cometas com cauda, boias, portal, zona de órbita, onda da nova, vento, previsão no plano, gôndola, vela (ondula e brilha com a luz), barra e cordame |
| `js/map.js` | Mapa holográfico (recortado no disco): corpos, órbitas, sombras, objetivos, vela, força da luz, previsão pontilhada, onda da nova |
| `js/main.js` | Liga tudo: render, VR (barra entre as mãos, punhos, botões, vibração, recentralizar), mouse/teclado, câmeras, menus, HUD, sons, `dev` |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: zumbido da vela (sobe com a força da luz), ambiente, contagem, boia, órbita, entrega, recolher, sombra, cometa, nova, vitória, derrota |
| `js/save.js` | Progresso e opções salvos |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8835, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: a física é 2D no plano do sistema, em u (1 u = 10 m no 3D), tempo em segundos. Mapa
(x, y) → 3D (x·10, -30, -y·10): y do mapa = para a frente de quem está na gôndola. A gôndola fica
parada na origem e o mundo anda ao contrário da nave; o plano do sistema fica 30 m abaixo do piso,
para ver o disco um pouco de cima. A vela fica na frente e acima (centro em (0, 11, -8) m) e gira em
volta do próprio eixo; a gôndola nunca gira. Ângulo da vela `ang` = direção da normal no mapa (vale
o mesmo ±180°).

## Regras e convenções do projeto

- `physics.js`, `start.js`, `game.js`, `levels.js` e `robot.js` não podem usar navegador nem
  Three.js: os testes rodam no Node.
- A previsão do mapa, o robô e a física usam o mesmo `stepShip`: a linha pontilhada é exatamente o
  que vai acontecer se a vela ficar parada (o teste confere).
- Fase nova ou mudada: preferir boias por `route` (voo de referência com a vela em ângulos relativos
  à luz) para garantir que a fase é possível; `route` dá erro se o voo bater em algo. Rodar
  `node tests/run.js` e acertar `STARS` (3★ uns 10–15% acima do tempo do robô, 1★ com bastante
  folga, porque gente pilota pior que o robô).
- Mexeu em física, fases ou robô: rodar `node tests/run.js`.
- Os testes nunca tocam som (não carregam `audio.js`).

## Decisões

- Física própria em 2D (todo o sistema num disco) para ficar legível e confortável; visão em 3D.
- Corpos em trilhos (posição exata em função do tempo), só a nave é integrada: a previsão bate com a
  simulação e os planetas nunca saem do lugar. Integrador leapfrog (conserva energia em órbita).
- Unidades do jogo: Sol com GM 11000 e luz 6600 (a luz na vela de frente vale 60% da gravidade):
  forte o bastante para manobrar em segundos, fraca o bastante para a gravidade mandar.
- Vela com o ângulo pela normal no plano e "deitar" (tilt) que diminui o empurrão (cos³), em vez de
  vela 3D livre: dá para pilotar com uma barra só.
- No VR a vela segue a direção da barra de forma absoluta (barra atravessada = vela de frente para a
  frente); soltar a barra deixa a vela parada. A gôndola não gira nunca (conforto).
- Órbita "estável" medida pelos elementos de dois corpos em volta do planeta; planetas das fases de
  órbita são pesados (esfera de Hill grande) para a perturbação da estrela não estragar a medida.
- Estrelas calibradas pelo robô (que é bem melhor que gente): 1 estrela com ~2,5× o tempo dele.
- Desempenho de Quest: pixelRatio 1, foveação, halos e brilhos com sprites aditivos, sem
  pós-processamento, previsão recalculada um quadro sim, um não no Quest, 1 luz por estrela.
- Porta do servidor local 8835.

## Pendências / problemas conhecidos

- **Nada foi testado no Quest ainda**: pegar e girar a barra, giro dos punhos, juntar as mãos,
  pinça no rastreamento de mãos, recentralizar e altura, vibração, conforto, tamanho do mapa e das
  placas, FPS no óculos.
- As estrelas foram calibradas pelo robô; podem precisar de ajuste depois de jogar.
- O robô da fase 4 (órbita) e da 14 (perto da Anã) varia bastante de tempo de uma semente para outra.
- Sons só foram checados por não dar erro; ninguém ouviu ainda.
