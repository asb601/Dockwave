# Chatbot Page – Context-Aware Spec

Goal
- Build a basic chatbot page that supports choosing the chat context:
  - Entire context (default)
  - A specific folder (chat over all files within it)
  - A specific file

Route
- Path: `/chat`
- Theme: Minimal black (neutral-950 background, neutral-900/800 surfaces) consistent with the app.

High-level UX
1. Header
   - Title: Chat
   - Back/Links: Home, Profile
2. Context Selector (top of chat)
   - Radio group: Entire (default), Folder, File
   - When Folder is selected: show a dropdown of user folders (root-level first; future: tree/select)
   - When File is selected: show a dropdown of user files (root-level first; future: search)
3. Messages Panel
   - Left-aligned assistant bubbles, right-aligned user bubbles
   - Scrolling container, auto-scroll to bottom on send
4. Composer
   - Text input + Send button
   - Disabled state while sending

Data sources
- Use existing: `GET /api/user/files-folders` to load `folders[]` and `files[]`
- New (to implement later): `POST /api/chat`
  - Request
    - messages: Array<{ role: 'user' | 'assistant', content: string }>
    - context: { type: 'entire' } | { type: 'folder', id: string } | { type: 'file', id: string }
  - Response
    - message: { role: 'assistant', content: string }
    - optional: citations: Array<{ fileId: string, fileName: string, snippet?: string }>

State model (client)
- contextType: 'entire' | 'folder' | 'file' (default: 'entire')
- selectedFolderId?: string | null
- selectedFileId?: string | null
- folders: Folder[]
- files: FileItem[]
- loading: boolean
- messages: Array<{ role: 'user' | 'assistant', content: string }>
- sending: boolean

Validation rules
- If contextType === 'folder', require selectedFolderId
- If contextType === 'file', require selectedFileId
- Else default to entire

Empty/loading states
- Context selector skeleton while loading folders/files
- Messages panel: show a subtle placeholder when empty

Minimal UI (class hints)
- Page wrapper: `min-h-screen bg-neutral-950`
- Card surfaces: `bg-neutral-900 border border-neutral-800 rounded-2xl`
- Inputs: `bg-neutral-900 border border-neutral-800 text-neutral-200`
- Labels/hints: `text-neutral-400`

Component outline
- `src/app/chat/page.tsx` (Server component wrapper)
  - Ensures auth via `getServerSession`
  - Renders `<ChatClient folders={folders} files={files} />`
- `src/components/ChatClient.tsx` (Client)
  - Props: { folders: Folder[], files: FileItem[] }
  - Renders Context Selector, Messages, Composer
  - Handles POST `/api/chat`

Pseudocode (client logic)
```
const [contextType, setContextType] = useState('entire');
const [folderId, setFolderId] = useState<string | null>(null);
const [fileId, setFileId] = useState<string | null>(null);
const [messages, setMessages] = useState<Message[]>([]);

async function sendMessage(text: string) {
  const ctx = contextType === 'folder' && folderId
    ? { type: 'folder', id: folderId }
    : contextType === 'file' && fileId
      ? { type: 'file', id: fileId }
      : { type: 'entire' };

  const body = { messages: [...messages, { role: 'user', content: text }], context: ctx };
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  // Append assistant reply
}
```

Accessibility
- Radio group for context with labels
- Select elements keyboard accessible
- Announce sending state

Future enhancements
- Tree picker for nested folders
- Multi-select context (multiple files/folders)
- Streaming responses (SSE / fetch ReadableStream)
- Citation chips with scroll-to-file
- Upload in composer

Acceptance criteria
- `/chat` renders with black theme and shows context selector
- Entire context is default; changing to Folder/File shows the proper dropdowns
- Can send a message and display assistant reply (mockable until backend ready)
- Error/empty/loading states are handled

Tasks
1) Page skeleton
- Create `src/app/chat/page.tsx` (server) + `src/components/ChatClient.tsx` (client)
- Load folders/files via `/api/user/files-folders`
- Implement context selector + disabled states
2) Messaging
- Simple messages array state, append on send, clear input
- Wire `POST /api/chat` (placeholder route returning a canned response initially)
3) Polish
- Persist last selected context in localStorage
- Scroll-to-bottom on new messages
- Add basic error toast
```
