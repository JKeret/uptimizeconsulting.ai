// portal/files.js
import { supabase } from './supabaseClient.js'
import { formatBytes, storagePathFor } from './lib.js'

const BUCKET = 'customer-files'

export async function renderFiles(containerId, userId, opts = {}) {
  const container = document.getElementById(containerId)
  container.innerHTML = ''
  container.appendChild(buildDropzone(userId, () => renderFiles(containerId, userId, opts)))

  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    limit: 200, sortBy: { column: 'name', order: 'asc' },
  })
  if (error) { container.appendChild(msg('Could not load files: ' + error.message)); return }

  const files = (data || []).filter((f) => f.id !== null) // drop folder placeholders
  if (!files.length) { container.appendChild(msg('No files yet.', 'empty')); return }

  for (const f of files) {
    container.appendChild(fileRow(userId, f, opts, () => renderFiles(containerId, userId, opts)))
  }
}

function fileRow(userId, f, opts, refresh) {
  const row = document.createElement('div')
  row.className = 'file-row'
  const meta = document.createElement('div')
  meta.className = 'file-meta'
  meta.innerHTML = `<span class="file-name"></span><span class="file-sub"></span>`
  meta.querySelector('.file-name').textContent = f.name
  meta.querySelector('.file-sub').textContent = formatBytes(f.metadata?.size || 0)
  row.appendChild(meta)

  const actions = document.createElement('div')
  actions.className = 'file-actions'

  const dl = document.createElement('button')
  dl.className = 'btn ghost'; dl.textContent = 'Download'
  dl.addEventListener('click', () => downloadFile(`${userId}/${f.name}`))
  actions.appendChild(dl)

  if (opts.canDelete) {
    const del = document.createElement('button')
    del.className = 'btn ghost'; del.textContent = 'Delete'
    del.addEventListener('click', async () => {
      if (!confirm(`Delete "${f.name}"?`)) return
      const { error } = await supabase.storage.from(BUCKET).remove([`${userId}/${f.name}`])
      if (error) { alert('Delete failed: ' + error.message); return }
      refresh()
    })
    actions.appendChild(del)
  }
  row.appendChild(actions)
  return row
}

async function downloadFile(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60, { download: true })
  if (error) { alert('Download failed: ' + error.message); return }
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function buildDropzone(userId, refresh) {
  const dz = document.createElement('div')
  dz.className = 'dropzone'
  dz.innerHTML = `<p>Drag files here or <label class="link"><u>browse</u><input type="file" multiple hidden></label></p>`
  const input = dz.querySelector('input')
  input.addEventListener('change', () => uploadAll([...input.files], userId, refresh))
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag') })
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'))
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag')
    uploadAll([...e.dataTransfer.files], userId, refresh)
  })
  return dz
}

async function uploadAll(files, userId, refresh) {
  const MAX = 100 * 1024 * 1024 // 100 MB guard
  for (const file of files) {
    if (file.size > MAX) { alert(`"${file.name}" exceeds 100 MB and was skipped.`); continue }
    const path = storagePathFor(userId, file.name)
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) { alert(`Upload of "${file.name}" failed: ` + error.message) }
  }
  refresh()
}

function msg(text, cls = 'empty') {
  const p = document.createElement('p'); p.className = cls; p.textContent = text; return p
}
