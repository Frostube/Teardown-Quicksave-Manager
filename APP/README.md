# Teardown Quicksave Manager

A local companion app that stores named copies of Teardown's `quicksave.bin` and swaps the selected one into the active Teardown save location.

The app uses the safe universal flow:

```text
Select save slot
-> back up the current active quicksave.bin
-> copy the selected slot into Teardown's active quicksave.bin
-> open Teardown through Steam
-> show the required map and Quickload instruction
```

Teardown still needs to be inside the map that produced the quicksave before Quickload is meaningful. The manager treats each slot as `quicksave.bin + required map context`; it does not try to parse or rewrite Teardown's binary save format.

## Run

Desktop app:

```powershell
npm install
npm run desktop
```

Portable Windows app:

```powershell
npm run package-win
```

The generated program is written to:

```text
dist\Teardown Quicksave Manager 0.1.0.exe
```

Legacy browser mode:

```powershell
npm start
```

Then open:

```text
http://localhost:47831
```

## File Locations

Active Teardown quicksave:

```text
%LOCALAPPDATA%\Teardown\quicksave.bin
```

Managed save library:

```text
%USERPROFILE%\Documents\Teardown\Quicksave Manager\saves
```

Backups made before every activation:

```text
%USERPROFILE%\Documents\Teardown\Quicksave Manager\backups
```

Each managed save folder stores:

```text
quicksave.bin
metadata.json
```

`metadata.json` records the display name, required map, map type, optional Teardown version, load instruction, notes, and the fixed `game: "Teardown"` / `quicksaveFile: "quicksave.bin"` fields.

## Updating an Existing Slot

Use **Update Slot** when you loaded a saved scene, played the same map, made changes, quicksaved in Teardown, and want the selected manager slot to keep those changes.

The app backs up the old stored slot file to `backups`, then replaces that slot's `quicksave.bin` with the current active Teardown `quicksave.bin`. The slot metadata stays intact.

## Backup Settings

Open **Settings** to control automatic backups separately for:

```text
Load into Teardown
Update Slot
```

Each can be set to:

```text
Every N operations
Every operation
Never
```

The default is every 5 loads and every 5 slot updates. **Backup Current** is manual and always creates a backup regardless of these settings.

## Notes

Close Teardown, or at least return to the main menu, before activating a different slot. If the game rewrites `quicksave.bin` while the app is swapping files, the active save can be replaced again by the game.

The desktop version uses Electron because the existing app is already built with HTML, CSS, and Node.js. That keeps the working save-copy logic intact while giving the tool normal desktop access to local files and folders.
