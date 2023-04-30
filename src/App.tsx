import '@blocksuite/editor/themes/affine.css'
import './App.css'

import { AffineSchemas } from '@blocksuite/blocks/models'
import { EditorContainer } from '@blocksuite/editor'
import { Workspace } from '@blocksuite/store'
import { createIndexedDBProvider } from '@toeverything/y-indexeddb'

import { assertExists } from '@blocksuite/store'
import { createEffect, createMemo, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'

const [workspaceIdsStore, setStoreState] = createStore(
  {
    ids: [] as string[],
  },
  {
    name: 'workspaces',
  },
)
if (localStorage.getItem('workspaces') === null) {
  setStoreState({
    ids: ['demo-workspace'],
  })
} else {
  setStoreState({
    ids: JSON.parse(localStorage.getItem('workspaces') as string),
  })
}

createEffect(() => {
  const nextIds = workspaceIdsStore.ids
  localStorage.setItem('workspaces', JSON.stringify(nextIds))
})

const [currentWorkspaceIdSingal, setCurrentWorkspaceId] = createSignal<
  string | null
>(null)

class WorkspaceMap extends Map<string, Workspace> {
  #lastWorkspaceId: string | null = null
  public providers: Map<string, ReturnType<typeof createIndexedDBProvider>> =
    new Map()

  override set(key: string, workspace: Workspace) {
    const provider = createIndexedDBProvider(key, workspace.doc)
    this.providers.set(key, provider)
    provider.connect()
    provider.whenSynced.then(() => {
      if (workspace.isEmpty) {
        const page = workspace.createPage({
          id: 'page0',
        })

        const pageBlockId = page.addBlock('affine:page', {
          title: new Text(),
        })

        page.addBlock('affine:surface', {}, null)

        // Add frame block inside page block
        const frameId = page.addBlock('affine:frame', {}, pageBlockId)
        // Add paragraph block inside frame block
        page.addBlock('affine:paragraph', {}, frameId)
        page.resetHistory()
      } else {
        const page = workspace.getPage('page0')
        assertExists(page)
      }
    })
    this.#lastWorkspaceId = key
    return super.set(key, workspace)
  }

  override get(key: string) {
    if (this.#lastWorkspaceId) {
      const lastWorkspace = super.get(this.#lastWorkspaceId)
      assertExists(lastWorkspace)
      const provider = this.providers.get(this.#lastWorkspaceId)
      assertExists(provider)
      provider.disconnect()
    }
    return super.get(key)
  }
}

const hashMap = new WorkspaceMap()
const currentWorkspace = createMemo<Workspace | null>(() => {
  const id = currentWorkspaceIdSingal()
  if (!id) return null
  let workspace = hashMap.get(id)
  if (!workspace) {
    workspace = new Workspace({
      id,
    })
    workspace.register(AffineSchemas)
    hashMap.set(id, workspace)
  }
  return workspace
})

const editorAccessor = createMemo<Promise<EditorContainer | null>>(async () => {
  const workspace = currentWorkspace()
  if (!workspace) return null
  const editor = new EditorContainer()
  const provider = hashMap.providers.get(workspace.id)
  assertExists(provider)
  await provider.whenSynced
  const page = workspace.getPage('page0')
  assertExists(page)
  editor.page = page
  return editor
})

function App() {
  let ref: HTMLDivElement = null as any

  const getIds = createMemo(() => workspaceIdsStore.ids)

  createEffect(() => {
    const ids = getIds()
    if (currentWorkspaceIdSingal() === null && ids.length > 0) {
      setCurrentWorkspaceId(ids[0])
    }
  })

  createEffect(async () => {
    const workspace = currentWorkspace()
    const editor = editorAccessor()
    if (!editor || !workspace) return
    if (ref) {
      const editorEl = await editor
      if (!editorEl) return
      const div = ref
      div.appendChild(editorEl)
      return () => {
        div.removeChild(editorEl)
      }
    }
  })

  return (
    <div>
      <div ref={ref} id="editor-container" />
    </div>
  )
}

export default App
