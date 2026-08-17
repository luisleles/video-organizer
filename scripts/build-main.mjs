// Empacota os dois pontos de entrada do lado Electron com esbuild.
//
// Por que bundle em vez de deixar o tsc emitir arquivos soltos: o preload roda
// com sandbox ligado, e nesse modo o `require` dele NÃO resolve arquivos locais
// (só `electron` e alguns builtins). Um preload que importe qualquer módulo do
// projeto quebra em runtime. Empacotar resolve isso inlinando as dependências.
//
// A checagem de tipos fica com o tsc (`npm run typecheck`), que o esbuild não faz.
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/main/main.ts', 'src/main/preload.ts'],
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  // Electron 43 embarca Node 24.
  target: 'node24',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // `electron` é fornecido pelo runtime; `better-sqlite3` é módulo nativo (.node),
  // não pode ser inlinado — precisa ser carregado de node_modules em runtime.
  external: ['electron', 'better-sqlite3'],
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
} else {
  await esbuild.build(options)
}
