import { app, BrowserWindow, screen, shell } from 'electron'
import path from 'node:path'
import { closeDatabase, initDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { registerMediaProtocol, registerMediaSchemePrivileges } from './media-protocol'

// Fora do whenReady de propósito: precisa acontecer antes da inicialização do
// Chromium, senão os privilégios do esquema media:// são ignorados.
registerMediaSchemePrivileges()

// Nesta combinação Zorin/Wayland + Intel i915, o processo de GPU do Chromium
// encerra com SIGSEGV antes de produzir o primeiro frame. Como a janela depende
// desse frame para exibir o renderer, o resultado é uma janela vazia. Renderizar
// por software é um pouco mais pesado durante a reprodução, mas deixa o app
// funcional e não altera a decodificação nem o acesso aos arquivos. A opção
// fica antes de whenReady porque o Chromium decide o backend gráfico ao subir.
// O opt-in permite testar novamente a GPU depois de uma atualização de driver.
if (process.env.VIDEO_ORGANIZER_ENABLE_GPU !== '1') {
  app.disableHardwareAcceleration()
}

// Usa o backend nativo da sessão. Forçar X11 dentro do GNOME/Wayland faz o
// bitmap presenter de software passar pelo XWayland; nesta máquina ele recebe
// um XID inválido e não desenha a interface. O override OZONE continua útil
// para diagnóstico sem precisar gerar outro pacote.
const sessionOzonePlatform =
  process.platform === 'linux' &&
  process.env.XDG_SESSION_TYPE === 'wayland' &&
  process.env.WAYLAND_DISPLAY
    ? 'wayland'
    : 'x11'
const ozonePlatform = process.env.OZONE || sessionOzonePlatform
app.commandLine.appendSwitch('ozone-platform', ozonePlatform)

console.log(
  '[graphics]',
  `ozone=${ozonePlatform}`,
  `acceleration=${process.env.VIDEO_ORGANIZER_ENABLE_GPU === '1' ? 'hardware' : 'software'}`,
)

// Pinça no touchpad = zoom na mídia. No Windows e no macOS o Chromium já
// converte o gesto de dois dedos em eventos `wheel` com `ctrlKey: true` por
// padrão — é o sinal que `useZoomPan`, em MediaFeed.tsx, escuta para dar zoom.
// No Linux essa conversão fica desligada por padrão e precisa ser pedida
// explicitamente por linha de comando, pelo mesmo motivo acima. Em Wayland
// nativo a conversão passa pelo compositor, não por esta flag, mas ligá-la de
// qualquer forma não tem efeito colateral.
app.commandLine.appendSwitch('enable-pinch')

// Em dev (`npm run dev`) o app não está empacotado: carregamos a URL do Vite.
// Empacotado, carregamos o HTML gerado por `npm run build`.
const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    // Evita o "flash branco": só mostra quando o conteúdo estiver pronto.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Isolamento ligado: o renderer não enxerga Node diretamente. Nenhuma
      // dessas opções bloqueia a Fullscreen API do HTML — ela é um recurso da
      // plataforma web do Chromium, não relacionado a Node/sandboxing.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const showWindow = (): void => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  }

  mainWindow.once('ready-to-show', showWindow)

  // Falhas de preload/renderer antes ficavam escondidas no DevTools do app
  // empacotado. Estes logs deixam o terminal dizer se o HTML carregou, se o
  // preload falhou ou se o processo do React encerrou. Exibir também ao fim do
  // load evita depender exclusivamente do primeiro frame do compositor.
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[renderer] loaded', mainWindow?.webContents.getURL())
    showWindow()
  })
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error('[renderer] load failed', errorCode, errorDescription, validatedURL)
      }
    },
  )
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload] failed', preloadPath, error)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone', details.reason, details.exitCode)
  })
  mainWindow.webContents.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') {
      console.error(`[renderer:${details.level}]`, details.message, details.sourceId, details.lineNumber)
    }
  })

  // Último tamanho conhecido da janela FORA da tela cheia — atualizado a cada
  // redimensionamento/movimento enquanto não está em tela cheia. Não dá pra
  // simplesmente ler mainWindow.getBounds() dentro de 'enter-html-full-screen'
  // pra saber o tamanho "de antes": o Electron já redimensiona a janela pra
  // cobrir o monitor ANTES desse evento disparar, então nessa hora já é tarde
  // — getBounds() ali devolveria o tamanho da tela cheia, não o original.
  let lastWindowedBounds: Electron.Rectangle = mainWindow.getBounds()
  function rememberWindowedBounds(): void {
    if (mainWindow && !mainWindow.isFullScreen()) lastWindowedBounds = mainWindow.getBounds()
  }
  mainWindow.on('resize', rememberWindowedBounds)
  mainWindow.on('move', rememberWindowedBounds)

  // O Electron já sincroniza a janela nativa sozinho quando um elemento do
  // HTML pede requestFullscreen() — a JANELA cresce e perde a decoração,
  // efeito visual de tela cheia. Mas em alguns ambientes Linux essa
  // sincronização automática deixa a ÁREA DE CONTEÚDO que o Chromium desenha
  // (o que window.innerWidth/innerHeight reportam) presa no tamanho de antes,
  // dentro de uma janela agora maior — o vídeo/imagem fica pequeno, cercado
  // de espaço vazio que na verdade é a moldura da janela, não fundo do app.
  // Forçar explicitamente o tamanho do conteúdo pro tamanho do monitor aqui
  // garante que os dois batem, independente de como o gerenciador de janelas
  // do sistema lidou com a sincronização automática.
  mainWindow.webContents.on('enter-html-full-screen', () => {
    if (!mainWindow) return
    const display = screen.getDisplayMatching(mainWindow.getBounds())
    // Um instante depois, não na mesma volta do laço de eventos: dá tempo do
    // próprio ajuste automático da janela terminar antes da nossa correção,
    // em vez de os dois brigarem por cima um do outro.
    setTimeout(() => {
      mainWindow?.setContentSize(display.bounds.width, display.bounds.height)
    }, 50)
  })

  mainWindow.webContents.on('leave-html-full-screen', () => {
    if (!mainWindow) return
    const restoreBounds = lastWindowedBounds
    setTimeout(() => {
      mainWindow?.setBounds(restoreBounds)
    }, 50)
  })

  // Links externos abrem no navegador do sistema, não dentro do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

void app.whenReady().then(() => {
  // Ordem importa: o banco precisa existir antes dos handlers, e os handlers
  // antes da janela — o React chama listFolders() no primeiro render.
  console.log('[db]', initDatabase())
  registerIpcHandlers()
  // Depende do banco: o handler consulta o catálogo para decidir o que servir.
  registerMediaProtocol()
  createWindow()

  // Convenção do macOS; inofensivo no Linux.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Fecha o banco limpo: garante o checkpoint do WAL em vez de deixar o -wal
// pendurado para a próxima abertura recuperar.
app.on('before-quit', closeDatabase)
