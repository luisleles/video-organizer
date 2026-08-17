# video-organizer

App desktop para organizar bibliotecas de vídeo, construído com Electron, React,
TypeScript, Vite e TailwindCSS. Alvo: Linux (Zorin OS / Ubuntu).

**Status:** tela de configuração inicial funcionando — cadastro de pastas de
origem pelo seletor nativo, escaneamento recursivo de vídeos e imagens, e
catálogo persistido em SQLite. A tela do feed ainda é um esqueleto.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe Vite (:5173), empacota o processo main em watch e abre a janela do Electron |
| `npm run build` | Typecheck + empacota main (`dist-electron/`) e renderer (`dist/renderer/`) |
| `npm run preview` | Build + abre a janela carregando os arquivos compilados (sem Vite) |
| `npm run typecheck` | Checagem de tipos dos dois lados, sem emitir nada |

## Estrutura

```
src/main/main.ts       cria a janela, inicializa banco e handlers
src/main/ipc.ts        handlers IPC: seletor de pasta, cadastro, remoção
src/main/db.ts         SQLite (better-sqlite3): schema e queries
src/main/scanner.ts    varredura recursiva de vídeos e imagens
src/main/preload.ts    ponte segura main <-> renderer (window.api)
src/shared/            tipos e nomes de canais usados pelos dois lados
src/renderer/          app React (Vite serve esta pasta como raiz)
scripts/build-main.mjs bundle do lado Electron com esbuild
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
