# video-organizer

App desktop para organizar bibliotecas de vídeo, construído com Electron, React,
TypeScript, Vite e TailwindCSS. Alvo: Linux (Zorin OS / Ubuntu).

**Status:** fluxo principal completo. Cadastro de pastas pelo seletor nativo,
escaneamento recursivo, catálogo em SQLite, feed vertical estilo TikTok tocando
os vídeos direto do disco, e organização em pastas de destino com desfazer.

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

Duas coisas foram descobertas rodando aqui e já estão resolvidas nos scripts:

1. **`--ozone-platform=x11`** — o backend Wayland nativo do Chromium causa
   segfault nesta sessão. O app roda via XWayland. Para testar o Wayland nativo
   quando/se isso for corrigido: `OZONE=wayland npm run dev`. O flag precisa ser
   argumento de linha de comando; `app.commandLine.appendSwitch` e
   `ELECTRON_OZONE_PLATFORM_HINT` são aplicados tarde demais e não evitam o crash.
2. **`env -u ELECTRON_RUN_AS_NODE`** — editores baseados em Electron (VS Code)
   exportam `ELECTRON_RUN_AS_NODE=1` para processos filhos, o que faz o binário do
   Electron rodar como Node puro (`app` fica `undefined`, nenhuma janela abre).
   Os scripts removem a variável antes de iniciar.

Quando formos empacotar para Linux, o `--ozone-platform=x11` precisa ir para o
`Exec=` do `.desktop` gerado pelo empacotador (ou virar um wrapper de launch).
