# video-organizer

App desktop para organizar bibliotecas de vídeo, construído com Electron, React,
TypeScript, Vite e TailwindCSS. Alvo: Linux (Zorin OS / Ubuntu).

**Status:** fluxo principal completo. Cadastro de pastas pelo seletor nativo,
escaneamento recursivo, catálogo em SQLite, feed vertical estilo TikTok tocando
os vídeos direto do disco, organização em pastas de destino com desfazer, e
empacotamento para Linux (`.AppImage` e `.deb`, ver seção própria abaixo).

## Estado do projeto

- [x] Etapa 1: Setup Electron + React + TypeScript + TailwindCSS
- [x] Etapa 2: Cadastro de pastas de origem + scan de arquivos
- [x] Etapa 3: Feed vertical (scroll estilo TikTok)
- [x] Etapa 4: Organização (mover para pasta)
- [x] Etapa 5: Polimento visual
- [x] Etapa 6: Empacotamento Linux
- [ ] Etapa 7: README / GitHub
- [x] Reformulação de design (feed inicial, painel lateral de destino e favoritos)

## Identidade visual

O app é escuro por decisão de produto — é uma interface de mídia em tela cheia —,
não por seguir a preferência do sistema. `color-scheme: dark` no `:root` faz o
Chromium desenhar também barras de rolagem e controles nativos em escuro.

As cores, cantos e espaçamentos vivem como tokens semânticos em
`src/renderer/index.css`, dentro de `@theme`. As telas usam `bg-surface`,
`text-fg-muted`, `border-line` — nomes que descrevem o papel do elemento, não a
cor. Trocar a paleta inteira (ou acrescentar um tema claro) é editar esse bloco,
sem tocar em nenhuma tela.

## Atalhos do feed

| Tecla | Ação |
| --- | --- |
| `↓` / `↑` | Próximo / anterior |
| `O` | Abre o painel de organizar |
| `S` | Pula (o arquivo volta no fim da fila) |
| `M` | Liga/desliga o som |
| `Esc` | Volta para a configuração |

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe Vite (:5173), empacota o processo main em watch e abre a janela do Electron |
| `npm run build` | Typecheck + empacota main (`dist-electron/`) e renderer (`dist/renderer/`) |
| `npm run preview` | Build + abre a janela carregando os arquivos compilados (sem Vite) |
| `npm run typecheck` | Checagem de tipos dos dois lados, sem emitir nada |
| `npm run package` | Build + gera o `.AppImage` e o `.deb` em `release/` |

## Estrutura

```
src/main/main.ts          cria a janela, inicializa banco e handlers
src/main/ipc.ts           handlers IPC: seletor de pasta, cadastro, remoção
src/main/db.ts            SQLite (better-sqlite3): schema e queries
src/main/scanner.ts       varredura recursiva de vídeos e imagens
src/main/media-protocol.ts  protocolo media:// que serve os arquivos do disco
src/main/preload.ts       ponte segura main <-> renderer (window.api)
src/shared/               tipos, nomes de canais e a URL media:// (dois lados)
src/renderer/             app React (Vite serve esta pasta como raiz)
scripts/build-main.mjs    bundle do lado Electron com esbuild
```

## Comunicação entre processos (IPC)

O renderer roda com `contextIsolation: true`, `nodeIntegration: false` e
`sandbox: true` — ele não tem `require`, `fs` nem `ipcRenderer`. Tudo que toca o
sistema operacional acontece no main; o preload define, em `window.api`, a única
superfície que a interface enxerga.

São dois padrões, com propósitos diferentes:

- **`invoke` / `handle`** (pergunta e resposta) — `listFolders`, `addFolder`,
  `removeFolder`. O renderer chama e recebe uma Promise.
- **`send` / `on`** (aviso sem resposta) — progresso do scan, do main para o
  renderer. Um scan pode levar minutos e `invoke` só responderia no fim.

Os nomes dos canais ficam em `src/shared/ipc.ts` e os formatos em
`src/shared/types.ts`, importados pelos dois lados: se um lado mudar o contrato,
o outro para de compilar em vez de falhar só em runtime.

## Como os arquivos chegam na tela (protocolo `media://`)

O feed precisa exibir vídeos e imagens que estão em qualquer lugar do disco. O
caminho curto seria `webSecurity: false` e `<video src="file:///...">`, mas isso
desliga a same-origin policy do renderer inteiro: qualquer script na página
passaria a ler `file:///etc/passwd`, `~/.ssh/` e o resto do sistema.

Em vez disso, `webSecurity` continua ligado e o app registra um esquema próprio,
`media://`, servido por `src/main/media-protocol.ts`. A trava é o catálogo: o
handler só entrega um arquivo se ele estiver em `media_files`, ou seja, se veio
de uma pasta que o usuário escolheu no seletor nativo. Pedidos a qualquer outro
caminho respondem 404 — inclusive tentativas de path traversal, porque o esquema
é registrado como `standard` e o Chromium normaliza `..` antes de chegar ao
nosso código.

O handler também implementa requisições parciais (`Range` / 206), que é o que
permite ao `<video>` começar a tocar e fazer seek sem carregar o arquivo inteiro,
e transmite por stream em vez de ler tudo para a memória.

## Mover arquivos com segurança

`src/main/file-mover.ts` é o único lugar que escreve no disco do usuário, e ele
segue três regras:

1. **Nunca sobrescreve.** `fs.rename` apaga o destino existente sem avisar — o
   que aqui significaria destruir um vídeo. Se o nome já existir no destino, o
   arquivo vira `nome (2).mp4`, e a interface avisa que houve renomeação.
2. **Atravessa sistemas de arquivos.** `rename` falha com `EXDEV` entre
   partições ou para um HD externo; nesse caso cai para copiar e apagar. Se a
   cópia funcionar mas o original não puder ser removido, a cópia é desfeita —
   melhor falhar do que deixar o arquivo duplicado sem o usuário saber.
3. **Disco primeiro, banco depois.** O catálogo só é atualizado depois que o
   sistema de arquivos confirmou a operação.

Erros previstos (arquivo sumiu, sem permissão, disco cheio) viram mensagens na
interface em vez de exceção. O desfazer usa a coluna `original_path`, gravada no
momento em que o arquivo é organizado.

## Banco de dados

SQLite via `better-sqlite3`, em `~/.config/video-organizer/library.db` (fora do
projeto, porque o app instalado fica numa pasta somente-leitura). Duas tabelas:
`source_folders` e `media_files`, ligadas por `ON DELETE CASCADE` — remover uma
pasta do cadastro descarta os arquivos catalogados dela, sem tocar no disco.

`better-sqlite3` é módulo nativo e precisa ser compilado contra o ABI do Electron,
não o do Node do sistema. O `postinstall` roda `electron-rebuild` automaticamente;
se aparecer `NODE_MODULE_VERSION` incompatível, rode `npx electron-rebuild -f -w
better-sqlite3`. Exige `python3`, `make` e `g++` instalados.

## Por que esbuild em vez de tsc no lado Electron

Com `sandbox: true`, o `require` do preload resolve apenas `electron` e alguns
builtins — **não** resolve arquivos do próprio projeto. Um preload que importe
qualquer módulo local (como `src/shared/ipc.ts`) quebra em runtime, sem erro de
compilação. O esbuild empacota preload e main em arquivos autocontidos, e o `tsc`
fica só com a checagem de tipos (`npm run typecheck`, que o `build` roda antes).

## Particularidades desta máquina (Zorin/Wayland)

Duas coisas foram descobertas rodando aqui e já estão resolvidas:

1. **Backend Ozone acompanha a sessão** — em GNOME/Wayland, o app usa Wayland;
   numa sessão X11, usa X11. Forçar X11 no Wayland fazia o renderizador por
   software passar pelo XWayland e falhar com `XGetWindowAttributes failed`.
   Para diagnóstico, o backend ainda pode ser sobrescrito ao iniciar, por
   exemplo: `OZONE=x11 video-organizer`.
2. **`env -u ELECTRON_RUN_AS_NODE`** — editores baseados em Electron (VS Code)
   exportam `ELECTRON_RUN_AS_NODE=1` para processos filhos, o que faz o binário do
   Electron rodar como Node puro (`app` fica `undefined`, nenhuma janela abre).
   Os scripts removem a variável antes de iniciar.
3. **Renderização por software** — nesta combinação Intel i915 + Zorin/Wayland,
   o processo de GPU do Chromium pode encerrar com `exit_code=11` e deixar a
   janela vazia. O app desativa a aceleração de hardware antes do Chromium subir.
   Para testar a GPU novamente depois de atualizar o sistema ou o driver:
   `VIDEO_ORGANIZER_ENABLE_GPU=1 video-organizer`.

## Empacotamento para Linux

`npm run package` builda tudo e roda o [electron-builder](https://www.electron.build/),
configurado em `package.json` (chave `"build"`), gerando dois artefatos em
`release/`:

- **`.AppImage`** — um único arquivo executável, sem instalação; funciona em
  qualquer distro Linux (precisa de `libfuse2` no sistema em distros que não a
  trazem mais por padrão — ver abaixo).
- **`.deb`** — pacote para instalar via `apt`/`dpkg` no Zorin OS e derivados de
  Ubuntu/Debian.

Pontos que valem saber:

- **Ícone**: `build/icon.svg` é a fonte editável (um placeholder simples — um
  quadrado arredondado na cor de destaque do app com um triângulo de "play");
  `build/icon.png` (1024×1024) é o que o electron-builder de fato usa, porque
  ele não rasteriza SVG. Trocando o ícone definitivo, é só sobrescrever os dois
  (ou só o `.png`, se o SVG não importar mais) — nenhuma outra configuração
  precisa mudar.
- **Nome, versão e identidade**: `productName` ("Video Organizer") é o nome
  visível — no launcher, no título da janela, no nome do pacote `.deb`
  legível. `name` ("video-organizer", em `package.json`) continua sendo só o
  identificador do pacote npm. `version` é o que aparece no nome dos arquivos
  gerados. `appId` (`com.luisleles.videoorganizer`, dentro de `"build"`) é um
  identificador interno estável — não precisa refletir nada visível, mas
  convém não trocar depois de publicado, pois é o que o SO usa para associar
  janela/ícone ao app.
- **Módulo nativo**: `better-sqlite3` não pode ir dentro do `app.asar` (um
  `.node` não pode ser carregado de dentro do arquivo empacotado) — `asarUnpack`
  cuida disso, deixando o binário nativo solto em `resources/app.asar.unpacked/`.
- **Rebuild automático**: o electron-builder roda seu próprio `electron-rebuild`
  antes de empacotar, então o `.node` do `better-sqlite3` sai já compilado para
  a versão do Electron do projeto — exige `python3`, `make` e `g++`, os mesmos
  pré-requisitos do `postinstall` (ver seção do banco de dados acima).

### Instalando o `.deb` gerado

```bash
sudo apt install ./release/video-organizer-1.0.3-amd64.deb
```

Usar `apt install ./arquivo.deb` (com o `./` na frente) em vez de `dpkg -i` é o
que faz o `apt` também resolver e instalar sozinho as dependências do pacote
(GTK, libnotify, libnss etc.) — com `dpkg -i` puro, dependência faltando vira
erro manual para resolver com `apt --fix-broken install` depois.

Depois de instalado, o app aparece no menu de aplicativos do Zorin (categoria
Vídeo) como "Video Organizer", e também dá para abrir pelo terminal com
`video-organizer`. Para desinstalar: `sudo apt remove video-organizer`.

### Rodando o `.AppImage`

```bash
chmod +x release/video-organizer-1.0.3-x86_64.AppImage
./release/video-organizer-1.0.3-x86_64.AppImage
```

Não precisa de `sudo` nem de instalação — o arquivo já é o app inteiro. Se o
Zorin reclamar de FUSE ao abrir (`dlopen(): error loading libfuse.so.2` — comum
em Ubuntu 22.04+ e derivados, que pararam de trazer FUSE2 por padrão):
`sudo apt install libfuse2t64` (ou `libfuse2` em versões mais antigas).
