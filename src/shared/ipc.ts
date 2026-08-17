// Nomes dos canais IPC, num só lugar, importados pelos dois lados (main e preload).
// Deixar as strings centralizadas evita o bug clássico de IPC: o main escutar
// 'folders:list' e o renderer chamar 'folder:list' — nada acontece, sem erro nenhum.
export const IPC = {
  /** renderer -> main, com resposta: devolve as pastas cadastradas e suas contagens */
  listFolders: 'folders:list',
  /** renderer -> main, com resposta: abre o seletor nativo, cadastra e escaneia */
  addFolder: 'folders:add',
  /** renderer -> main, com resposta: descadastra uma pasta (não toca no disco) */
  removeFolder: 'folders:remove',
  /** renderer -> main, com resposta: fila do feed (o que ainda não foi organizado) */
  listUnorganizedMedia: 'media:list-unorganized',
  /** main -> renderer, sem resposta: progresso do escaneamento em andamento */
  scanProgress: 'scan:progress',
} as const
