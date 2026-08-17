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
  /** renderer -> main, com resposta: pastas de destino, mais usadas recentemente primeiro */
  listDestinations: 'destinations:list',
  /** renderer -> main, com resposta: cria a pasta no disco e cadastra */
  createDestination: 'destinations:create',
  /** renderer -> main, com resposta: seletor nativo para escolher onde criar */
  chooseDestinationParent: 'destinations:choose-parent',
  /** renderer -> main, com resposta: raiz sugerida para novas pastas */
  organizationRoot: 'settings:organization-root',
  /** renderer -> main, com resposta: move o arquivo e marca como organizado */
  organizeMedia: 'organize:move',
  /** renderer -> main, com resposta: move de volta e desmarca */
  undoOrganize: 'organize:undo',
  /** main -> renderer, sem resposta: progresso do escaneamento em andamento */
  scanProgress: 'scan:progress',
} as const
