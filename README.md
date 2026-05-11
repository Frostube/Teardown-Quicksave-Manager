# Teardown-Quicksave-Manager

Desktop companion app for managing multiple Teardown `quicksave.bin` slots.

The manager stores named quicksave profiles with required map metadata, swaps the selected slot into Teardown's active quicksave path, and opens Teardown through Steam. It intentionally uses the safe universal flow: the user still opens the required map in Teardown, then quickloads.

## Run

```powershell
npm install --prefix APP
npm run desktop
```

## Package

```powershell
npm run package-win
```

## Notes

- Active Teardown quicksave: `%LOCALAPPDATA%\Teardown\quicksave.bin`
- Managed saves: `%USERPROFILE%\Documents\Teardown\Quicksave Manager\saves`
- Automatic backup frequency is configurable in the app settings.
