# Publish Faveo Ticket Labels on AMO

The extension is prepared for the **listed** Firefox Add-ons (AMO) channel. Its release version is `1.1.0` and its stable identifier is `faveo-ticket-labels@juanvifaubel`.

## Before signing

1. Choose the project's license and replace `REPLACE_WITH_YOUR_CHOSEN_LICENSE` in `amo-metadata.json` with an AMO-accepted identifier (for example, `MPL-2.0`). This legal choice has deliberately not been assumed or published.
2. Review `amo-metadata.json`. It contains the listing summary, description, category, support links, and reviewer notes.
3. Create AMO API credentials (JWT issuer and JWT secret). Keep them only in the PowerShell session; never commit them or save them in a tracked file.
4. For a fuller listing, upload screenshots from the Developer Hub after the first submission. They are not required to create a listing through `web-ext sign`.

## Validate and build

```powershell
npm run lint
npm run build
```

The resulting package is `web-ext-artifacts/faveo-ticket-labels-1.1.0.zip`. It is a local artifact ignored by Git.

## Submit as a listed extension

Set the keys only for the current PowerShell session, then submit:

```powershell
$env:WEB_EXT_API_KEY = 'your-amo-jwt-issuer'
$env:WEB_EXT_API_SECRET = 'your-amo-jwt-secret'
npx --yes web-ext@10.5.0 sign --source-dir . --channel listed --amo-metadata amo-metadata.json --approval-timeout 0
Remove-Item Env:WEB_EXT_API_KEY, Env:WEB_EXT_API_SECRET
```

`--channel listed` creates the public AMO listing if it does not exist, and submits version `1.1.0` for review. The command does not place the credentials in shell history. Keep the same `gecko.id` for future updates.

AMO controls signing and review; the listing does not become public until AMO approves it.
