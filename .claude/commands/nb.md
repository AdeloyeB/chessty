# NB CLI Voice Commands

Handle voice-dictated note-taking commands via the `nb` CLI tool. The user dictates commands via Wispr Flow (voice-to-text).

## Current Notebook
`home`

## Command Mapping

| Voice Phrase | Command |
|-------------|---------|
| "create a note about [topic]" | `nb add --title "[topic]"` |
| "new note titled [title]" | `nb add --title "[title]"` |
| "add a note with content [text]" | `nb add --title "Untitled" --content "[text]"` |
| "write a note about [topic] saying [content]" | `nb add --title "[topic]" --content "[content]"` |
| "create a todo [task]" | `nb todo add "[task]"` |
| "add a task [task]" | `nb todo add "[task]"` |
| "mark todo [number] as done" | `nb do [number]` |
| "complete task [number]" | `nb do [number]` |
| "show my notes" | `nb ls` |
| "list my notes" | `nb ls` |
| "list all notes" | `nb ls -a` |
| "show note [id or title]" | `nb show [id or title]` |
| "open note [id or title]" | `nb show [id or title]` |
| "read note [id or title]" | `nb show [id or title]` |
| "search notes for [query]" | `nb search "[query]"` |
| "find notes about [query]" | `nb search "[query]"` |
| "edit note [id or title]" | `nb edit [id or title]` |
| "update note [id or title]" | `nb edit [id or title]` |
| "delete note [id or title]" | `nb delete [id or title] --force` |
| "remove note [id or title]" | `nb delete [id or title] --force` |
| "bookmark [url]" | `nb bookmark [url]` |
| "save this link [url]" | `nb bookmark [url]` |
| "bookmark [url] tagged [tags]" | `nb bookmark [url] --tags [tags]` |
| "create a folder called [name]" | `nb folders add [name]` |
| "new folder [name]" | `nb folders add [name]` |
| "move note [id] to [folder]" | `nb move [id] [folder]/` |
| "list notebooks" | `nb notebooks` |
| "create notebook [name]" | `nb notebooks add [name]` |
| "switch to notebook [name]" | `nb use [name]` |
| "sync notes" | `nb sync` |
| "count my notes" | `nb count` |
| "pin note [id]" | `nb pin [id]` |
| "unpin note [id]" | `nb unpin [id]` |
| "show my todos" | `nb tasks` |
| "list tasks" | `nb tasks` |
| "export note [id] as PDF" | `nb export [id] ./export.pdf` |
| "show note history" | `nb history` |

## Interpretation Rules

1. **Fuzzy matching** - Match intent, not exact wording. "jot down a note about Docker" = `nb add --title "Docker"`
2. **Title extraction** - Whatever the user says the note is "about" or "titled" becomes `--title`
3. **Content extraction** - "saying...", "with content...", "that says..." → `--content`
4. **Tags** - "tagged with" or "tag it as" → `--tags tag1,tag2`
5. **IDs vs titles** - Numbers = ID, words = title search
6. **Confirm deletes** - Always ask "Delete note [id/title]?" before running
7. **Show output** - After create/modify, show result with `nb show` or `nb ls`

## Examples

**"Create a note about the Docker setup we just did"**
```bash
nb add --title "Docker setup" --content "Notes on Docker configuration for the chess game Bun server."
```

**"Add a todo to set up Redis"**
```bash
nb todo add "Set up Redis for game state persistence"
```

**"Find my notes about Polygon"**
```bash
nb search "Polygon"
```

**"Bookmark this link https://docs.polygon.technology tagged crypto,polygon"**
```bash
nb bookmark "https://docs.polygon.technology" --tags crypto,polygon
```
