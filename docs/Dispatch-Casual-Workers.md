# Dispatch casual workers

Dispatch supervisors and administrators can maintain casual workers in **Dispatch → Admin setups → Casual workers**. Create a unique worker code, name, allowed stages (assembly, packing, loading), and a 6–12 digit passcode. Workers do not need a Users account. Codes remain fixed to preserve attribution; names and permissions can be updated, passcodes reset, and workers deactivated.

The main account logs in normally and opens the relevant work page. Before starting a session, enter the worker code and passcode in **Working as**, then choose **Delegate to worker**. Start and complete work using the existing session controls. End the work session before handing over to another worker. **Return to main account** ends delegated access without removing completed work or closing an unfinished work session. Re-entering the same worker's passcode renews access and allows unfinished work to resume.

Main accounts can delegate only stages their role permits. Delegated requests use the casual worker's stable ID and name, with the main account and delegation recorded separately. Assembly and packing session reports include the worker code/ID and main account; loading sessions show the loader ID/name and main account. Packed-line exports use the casual worker code for BC's User ID. Supervisors can review delegation history in setup.

Passcodes are hashed. Access expires after 12 hours and is bound to the main account. Five incorrect passcode attempts lock a worker for 15 minutes; a supervisor reset clears the lock. Updating a worker revokes existing grants, including when deactivating a worker or resetting their passcode. Delegation tokens are stored in the browser tab's session storage; passcodes are not stored there.

This supports attribution within an existing logged-in account; it is not a separate kiosk login. The main account remains responsible for the device. Delegated mutation attempts are recorded in DispatchActionAudit with worker, main account, stage and endpoint, without passcodes or request bodies; these audit records describe requests, not proof of successful completion. Work records retain their normal completion state. Session parent details identify the account that started the session; request audit details identify the account making each delegated request.

The additive migration creates DispatchWorker and DispatchDelegation and adds attribution columns to assembly, packing and loading session tables. Run the normal database migration on each deployment and restart the API. Existing sessions are retained; older sessions have no delegation details.

Validation: `node --test tests/dispatch-workers.mjs`; application database integration checks: from `server`, `node src/db/testDispatchWorkers.js`. The latter creates uniquely named test workers/sessions and cleans up those fixtures.
