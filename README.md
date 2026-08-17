# video-organizer

App desktop para organizar bibliotecas de vídeo, construído com Electron, React,
TypeScript, Vite e TailwindCSS. Alvo: Linux (Zorin OS / Ubuntu).

**Status:** estrutura inicial. O shell do Electron, o frontend React e o pipeline
de build estão funcionando; a tela atual é só a de verificação do setup.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe Vite (:5173), compila o processo main em watch e abre a janela do Electron |
| `npm run build` | Compila main (`dist-electron/`) e renderer (`dist/renderer/`) |
| `npm run preview` | Build + abre a janela carregando os arquivos compilados (sem Vite) |
| `npm run typecheck` | Checagem de tipos dos dois lados, sem emitir nada |

## Estrutura

```
src/main/main.ts       processo main do Electron: cria a janela, acesso ao SO
src/main/preload.ts    ponte segura main <-> renderer (window.api)
src/renderer/          app React (Vite serve esta pasta como raiz)
vite.config.mts        config do Vite (.mts para carregar como ESM nativo)
tsconfig.json          renderer (browser, ESM, JSX)
tsconfig.main.json     main (Node/CommonJS -> dist-electron/)
```

O renderer roda com `contextIsolation: true` e `nodeIntegration: false`. Qualquer
acesso a arquivos precisa ser exposto no `preload.ts` via `contextBridge` e
implementado no main com `ipcMain.handle`.

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
