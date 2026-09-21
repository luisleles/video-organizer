import test from 'node:test'
import assert from 'node:assert/strict'
import { toMediaUrl, pathFromMediaUrl } from '../src/shared/media-url.ts'
import { validateFolderName } from '../src/shared/folder-name.ts'

for (const filePath of [
  String.raw`C:\Users\Ana\Vídeos\férias #1 (100%).mp4`,
  String.raw`D:\film.mp4`,
  String.raw`\\servidor\mídia\Vídeos\clipe.mp4`,
  '/home/ana/Vídeos/férias #1? 100%.mp4',
  '/media/HD/arquivo\\com-barra.mp4',
]) {
  test(`URL preserva o caminho: ${filePath}`, () => {
    assert.equal(pathFromMediaUrl(new URL(toMediaUrl(filePath)).href), filePath)
  })
}

test('URLs inválidas não são aceitas', () => {
  for (const url of [
    'invalid', 'file:///C:/secret', 'media://other/file?path=C%3A%5Cfilm.mp4',
    'media://local/file?path=relative.mp4', 'media://local/file?path=C%3Arelative',
    'media://local/file?path=%00', 'media://local/file',
  ]) assert.equal(pathFromMediaUrl(url), null, url)
})

test('nomes de pasta respeitam as restrições do Windows', () => {
  for (const name of ['..', '../escape', '..\\escape', 'C:\\escape', 'NUL',
    'con.txt', 'COM1', 'LPT9.ext', 'trailing.', 'trailing ', 'a:b', 'a?b', 'a*b']) {
    assert.ok(validateFolderName(name, 'win32'), name)
  }
  for (const name of ['Férias 2026', 'CONTRATOS', 'COM10', 'Vídeos #1']) {
    assert.equal(validateFolderName(name, 'win32'), null, name)
  }
  assert.equal(validateFolderName('a:b', 'linux'), null)
})
