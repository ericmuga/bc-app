# Offline assembly

Start an **assembly session**, select a chiller and search. Tick the checkbox at the top of each required order card (or in the list’s Select column), then choose **Claim orders**. Up to five orders can be downloaded for one chiller/session. Each order is claimed on the server before any details are downloaded or stored locally. Downloads include line details, barcodes and cached BC unit conversions. If all claims succeed, offline mode starts automatically. If an order is already held by another assembler or cannot be downloaded, a popup lists it and offers **Proceed with claimed orders** or **Pick another order**. Unavailable orders are not stored locally; successfully downloaded orders remain reserved while you pick replacements. Failed downloads/storage writes attempt to release their claims; a failed release is reported for manual follow-up. Open a downloaded order, scan or select its lines and save.

Saved lines are labelled **awaiting sync**. Each line can be recorded once per bundle; use the normal correction flow after syncing. The session cannot be ended or its downloaded orders released through this screen until the bundle is synced. Offline assembly does not call the server to save lines or look up barcodes. Unknown barcodes require manual selection; mapping changes require online access.

Choose **Resume online and sync** after reconnecting. The progress bar counts server-confirmed lines. Failures pause syncing and preserve remaining work. Retry with the same account/worker; expired authentication must be renewed. Server-side ownership, revision and permissions are rechecked. Conflicts need supervisor review rather than silently overwriting server changes. **Export offline backup** preserves the bundle for investigation; it is not an automatic import facility.

The dedicated local-storage bundle has no expiry or eviction, is scoped to account and worker, and is capped at approximately 3 MB. Storage errors prevent a successful local save. Keep the assembly page open while offline: this feature does not install an offline application shell. Clearing browser data/private-browser shutdown can erase unsynced work. This is device-local storage, not a server backup. Use one assembly tab per device.

Deployment: restart the server to run the additive `DispatchAssemblyReceipt` migration (also included in the migration command), then deploy the client. Receipt rows are committed in the same SQL transaction as assembly events and movements. Stable request IDs permit safe retries after a lost response, including when a completed order's claim has already been removed. No BC tables are changed by this migration.

## Unclaiming an order

Open the order and choose **Unclaim order** while connected. Pending local assembly must be synced first. On confirmation the order is removed from the device bundle and becomes available to another assembler. If the connection drops, the downloaded order is locked against further local assembly until you retry Unclaim order and confirm its release.

## Pause and resume

Online orders can be paused from the order modal using **Pause order**. The claim stays with the assembler and the order moves from Pending assembly to **Paused orders**, immediately before Assembled. Choose **Resume assembly** to clear the pause and continue the recorded work, or **Release order** to make the order available to another assembler. Pausing requires an active own session. Ending that session releases its claims, including paused orders. Downloaded bundles must be synced before pausing. Deploy/restart the backend for the additive `DispatchOrderClaim.Paused` column migration before using this feature.
