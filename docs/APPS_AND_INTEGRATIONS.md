# Apps & integrations

`/settings/integrations` is the app directory. Settings and the service importer link to it. The selected artist is resolved against the existing authorized artist list; URL IDs remain preferences, never authorization. Existing APIs enforce tenant and artist authorization. No credentials, new provider permissions, database tables, or automatic imports are introduced.

Square offers public-page/CSV service imports and a separate, explicitly labeled scheduling connection. The latter changes scheduling provider; service-only OAuth is not implemented. The directory reads existing scheduling status, with an explicit error if unavailable; payment, form, and channel cards link to their settings without inventing connected status.

GlossGenius and Vagaro offer the shared public-link/CSV preview workflow. They have no direct account connector in Maia. The UI does not imply a provider supports native CSV export: artists may supply a CSV they already have or use Maia's template. Public links may fail for login-only or dynamic pages. All import changes require reviewing and saving selected services. Calendar and deposit settings are not imported.

Links preserve the selected artist to services and Square scheduling. Services accepts only `import=website` or `import=csv` as initial UI choices. This opens the relevant input, without fetching a URL, uploading, authorizing, or importing automatically.

Deployment: no migration or environment changes. Rollback is a code rollback; existing service and connection data is unaffected.
