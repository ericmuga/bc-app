# Self-Service Active Directory Password Reset Plan

## 1. Objective

Build a secure self-service password reset feature into the existing Node.js + Vue.js application so users can reset their Active Directory password without calling IT support.

The reset must:

- Use two-factor verification.
- Support OTP delivery through external email and/or Infobip SMS.
- Never allow password reset for disabled Active Directory accounts.
- Prevent username enumeration.
- Reduce risk of brute-force attacks, session hijacking, and ransomware abuse.
- Log all security-relevant events for audit and incident response.

---

## 2. Recommended Architecture

```text
Vue.js Frontend
    |
    | HTTPS
    v
Node.js API
    |
    | LDAPS
    v
Active Directory Domain Controller

Node.js API
    |
    | SMTP / Gmail / Microsoft Graph / Infobip
    v
External Email or SMS Provider

Node.js API
    |
    v
SQL Server / PostgreSQL / MySQL / Redis
```

### Core components

1. **Vue Reset UI**
   - Request reset screen
   - OTP verification screen
   - New password screen
   - Success/failure screen

2. **Node.js Password Reset API**
   - Validates account eligibility
   - Sends OTP
   - Verifies OTP
   - Resets AD password through LDAPS
   - Logs audit events

3. **Active Directory Integration**
   - Use LDAPS only
   - Use delegated service account
   - Block disabled, privileged, service, and locked/high-risk accounts

4. **OTP Store**
   - Store hashed OTP only
   - Short expiry
   - Single-use token
   - Attempt counter

5. **Audit Store**
   - Record every reset attempt, OTP send, verification failure, success, and blocked reset

---

## 3. Security Principles

### Do not reveal whether an account exists

For the request reset endpoint, always return a generic response:

```json
{
  "message": "If the account is eligible, a verification code will be sent."
}
```

Do not return:

- User not found
- Account disabled
- No phone configured
- No external email configured

Those details should only be written to audit logs.

---

## 4. Password Reset Flow

### Step 1: User requests reset

User submits:

```json
{
  "username": "jdoe"
}
```

Backend actions:

1. Normalize username.
2. Apply rate limiting by:
   - IP address
   - username
   - user-agent/device fingerprint
   - destination email/phone if known
3. Search AD for the account.
4. Check account eligibility.
5. If eligible, create OTP challenge.
6. Send OTP by preferred channel.
7. Return generic response.

---

### Step 2: Account eligibility checks

The backend must verify:

- Account exists.
- Account is not disabled.
- Account is not a service account.
- Account is not in privileged groups.
- Account is not in a blocked OU.
- Account has a registered external email or phone.
- Account is allowed to reset password.
- Account is not marked for manual IT review.

Recommended blocked groups:

- Domain Admins
- Enterprise Admins
- Schema Admins
- Account Operators
- Server Operators
- Backup Operators
- Organization Management
- Any custom privileged AD group

Recommended blocked account patterns:

- `svc_*`
- `service_*`
- `admin_*`
- `sql_*`
- `backup_*`
- `sync_*`

---

### Step 3: Send OTP

Supported channels:

1. External email
2. Infobip SMS
3. Authenticator app/TOTP in future phase

Do not send OTP to internal corporate email if the user may be locked out of it.

OTP rules:

- 6 to 8 digits
- Random cryptographic generation
- Valid for 5 minutes
- Single-use
- Store only hash, never plaintext
- Maximum 3 to 5 verification attempts
- Resend cooldown of 60 seconds
- Maximum daily sends per account

---

### Step 4: Verify OTP

User submits:

```json
{
  "challengeId": "opaque-random-id",
  "otp": "123456"
}
```

Backend actions:

1. Look up challenge.
2. Check expiry.
3. Check attempt count.
4. Compare OTP using hash verification.
5. If valid, mark challenge as verified.
6. Issue a short-lived reset token.

The reset token should:

- Be opaque and random.
- Be stored server-side.
- Expire in 5 to 10 minutes.
- Be bound to username, IP, user-agent/device fingerprint.
- Be single-use.

---

### Step 5: Set new password

User submits:

```json
{
  "resetToken": "opaque-random-token",
  "newPassword": "NewStrongPassword123!"
}
```

Backend actions:

1. Validate reset token.
2. Re-check AD account eligibility.
3. Validate password against password rules.
4. Reset password through LDAPS.
5. Expire all OTP/reset tokens for the user.
6. Log success.
7. Optionally notify user by email/SMS.
8. Optionally require password change at next login.

---

## 5. API Endpoints

### Public routes

```http
POST /api/password-reset/request
POST /api/password-reset/verify-otp
POST /api/password-reset/complete
POST /api/password-reset/resend-otp
```

### Admin/security routes

```http
GET /api/admin/password-reset/audit
GET /api/admin/password-reset/blocked-users
POST /api/admin/password-reset/block-user
POST /api/admin/password-reset/unblock-user
```

Protect admin routes using existing application authentication and role-based access control.

---

## 6. Suggested Database Tables

### password_reset_challenges

```sql
CREATE TABLE password_reset_challenges (
    id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    delivery_channel VARCHAR(50) NOT NULL,
    destination_masked VARCHAR(255) NULL,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    consumed_at DATETIME NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    resend_count INT NOT NULL DEFAULT 0,
    ip_address VARCHAR(100) NULL,
    user_agent TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

### password_reset_tokens

```sql
CREATE TABLE password_reset_tokens (
    id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    challenge_id VARCHAR(100) NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    ip_address VARCHAR(100) NULL,
    user_agent TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

### password_reset_audit_logs

```sql
CREATE TABLE password_reset_audit_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(255) NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    reason VARCHAR(255) NULL,
    ip_address VARCHAR(100) NULL,
    user_agent TEXT NULL,
    metadata NVARCHAR(MAX) NULL,
    created_at DATETIME NOT NULL
);
```

### password_reset_blocklist

```sql
CREATE TABLE password_reset_blocklist (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(255) NULL,
    domain_group VARCHAR(255) NULL,
    reason VARCHAR(255) NOT NULL,
    created_by VARCHAR(255) NULL,
    created_at DATETIME NOT NULL
);
```

---

## 7. Node.js Modules

Recommended folder structure:

```text
src/
  modules/
    password-reset/
      passwordReset.routes.js
      passwordReset.controller.js
      passwordReset.service.js
      passwordReset.repository.js
      passwordReset.validator.js
      otp.service.js
      ad.service.js
      notification.service.js
      audit.service.js
      rateLimit.middleware.js
      security.middleware.js
```

### Responsibilities

#### passwordReset.controller.js

- Receives HTTP requests
- Calls service methods
- Always returns safe/generic public messages

#### passwordReset.service.js

- Coordinates full reset flow
- Applies business rules
- Calls AD, OTP, notification, and audit services

#### ad.service.js

- Connects to Active Directory over LDAPS
- Searches users
- Checks disabled status
- Checks group membership
- Resets password

#### otp.service.js

- Generates OTP
- Hashes OTP
- Verifies OTP
- Handles expiry and attempt limits

#### notification.service.js

- Sends OTP via external email or Infobip SMS
- Masks destination in responses/logs

#### audit.service.js

- Writes security logs
- Records both successful and blocked attempts

---

## 8. Required Environment Variables

```env
APP_URL=https://password-reset.example.com
NODE_ENV=production

AD_URL=ldaps://dc01.example.com:636
AD_BASE_DN=DC=example,DC=com
AD_BIND_DN=CN=password-reset-svc,OU=Service Accounts,DC=example,DC=com
AD_BIND_PASSWORD=change_me
AD_USER_SEARCH_FILTER=(sAMAccountName={{username}})

AD_ALLOWED_OUS=OU=Users,DC=example,DC=com
AD_BLOCKED_GROUPS=Domain Admins,Enterprise Admins,Schema Admins,Account Operators,Server Operators,Backup Operators
AD_BLOCKED_USERNAME_PREFIXES=svc_,service_,admin_,sql_,backup_,sync_

OTP_EXPIRY_MINUTES=10
OTP_LENGTH=6
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_DAILY_SENDS=5

RESET_TOKEN_EXPIRY_MINUTES=10

INFOBIP_BASE_URL=https://xxxx.api.infobip.com
INFOBIP_API_KEY=change_me
INFOBIP_SENDER=CompanyName

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=reset@example.com
SMTP_PASSWORD=change_me
SMTP_FROM="Password Reset <reset@example.com>"

RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX_REQUESTS_PER_IP=20
RATE_LIMIT_MAX_REQUESTS_PER_USERNAME=5

SESSION_COOKIE_SECURE=true
SESSION_COOKIE_HTTP_ONLY=true
SESSION_COOKIE_SAME_SITE=strict
```

---

## 9. Active Directory Password Reset Notes

Use LDAPS, not plain LDAP.

The service account should have delegated permissions only for the allowed user OU:

- Reset password
- Change password
- Read required user attributes
- Read group membership

The service account should not be:

- Domain Admin
- Enterprise Admin
- Local admin on domain controllers

Recommended AD attributes to read:

- `sAMAccountName`
- `userPrincipalName`
- `distinguishedName`
- `userAccountControl`
- `memberOf`
- `mail`
- `mobile`
- `telephoneNumber`
- `pwdLastSet`
- `lockoutTime`

---

## 10. Vue.js Pages

Recommended routes:

```text
/reset-password
/reset-password/verify
/reset-password/new-password
/reset-password/success
```

### Reset request page

Fields:

- Username

Behavior:

- Submit username
- Always show generic success message
- Move to OTP screen only if backend returns a challenge ID
- Do not expose account status

### OTP verification page

Fields:

- OTP code

Behavior:

- Disable submit after too many local attempts
- Allow resend after cooldown
- Do not show exact reason for backend rejection

### New password page

Fields:

- New password
- Confirm password

Behavior:

- Show password strength meter
- Explain minimum requirements
- Submit new password with reset token

---

## 11. Rate Limiting

Apply rate limits to:

```http
POST /api/password-reset/request
POST /api/password-reset/verify-otp
POST /api/password-reset/resend-otp
POST /api/password-reset/complete
```

Limit by:

- IP address
- username
- challenge ID
- destination phone/email
- user-agent/device fingerprint

Recommended limits:

```text
Request reset:
- 5 attempts per username per 15 minutes
- 20 attempts per IP per 15 minutes

OTP verify:
- 5 attempts per challenge
- 10 attempts per IP per 15 minutes

Resend OTP:
- 1 resend per 60 seconds
- 5 sends per user per day

Complete reset:
- 5 attempts per reset token
- 10 attempts per IP per 15 minutes
```

Use Redis if available for fast expiry-based counters.

---

## 12. Session Hijacking Protection

This flow should not rely on a normal logged-in session.

Use opaque reset tokens with the following controls:

- Store hashed token server-side.
- Bind token to:
  - username
  - challenge ID
  - IP address
  - user-agent/device fingerprint
- Expire quickly.
- Mark as consumed immediately after use.
- Use HTTPS only.
- Use HttpOnly, Secure, SameSite cookies if cookies are used.
- Never store reset tokens in localStorage.

---

## 13. Brute Force Protection

Implement:

- Per-username throttling
- Per-IP throttling
- OTP attempt limit
- Reset token attempt limit
- Daily OTP send limit
- CAPTCHA after suspicious behavior
- Temporary account reset lockout after repeated abuse
- Generic responses
- Audit logs
- Security alerts

---

## 14. Ransomware and Abuse Protection

To reduce mass-reset or account takeover risk:

- Block privileged accounts.
- Block service accounts.
- Block disabled accounts.
- Require two-factor verification.
- Limit reset volume per IP/subnet.
- Limit reset volume per hour globally.
- Alert IT/security on unusual spikes.
- Store audit logs in a central location that app admins cannot modify.
- Monitor resets outside normal working hours.
- Require manual approval for high-risk users.
- Keep AD service account permissions minimal.
- Rotate API keys and service credentials.
- Do not expose this service directly without WAF/reverse proxy controls.
- Use endpoint protection on the server hosting the Node.js app.

---

## 15. Audit Events

Log these events:

```text
RESET_REQUEST_RECEIVED
ACCOUNT_NOT_FOUND
ACCOUNT_DISABLED_BLOCKED
ACCOUNT_PRIVILEGED_BLOCKED
ACCOUNT_SERVICE_BLOCKED
NO_DELIVERY_METHOD_BLOCKED
OTP_CREATED
OTP_SENT
OTP_SEND_FAILED
OTP_VERIFY_SUCCESS
OTP_VERIFY_FAILED
OTP_EXPIRED
OTP_MAX_ATTEMPTS_EXCEEDED
RESET_TOKEN_CREATED
PASSWORD_POLICY_FAILED
PASSWORD_RESET_SUCCESS
PASSWORD_RESET_FAILED
RATE_LIMIT_BLOCKED
SUSPICIOUS_ACTIVITY_BLOCKED
```

Each audit log should include:

- username if provided
- event type
- status
- reason
- IP address
- user-agent
- masked destination
- timestamp
- correlation/request ID

---

## 16. Notification Templates

### OTP email

Subject:

```text
Your password reset verification code
```

Body:

```text
Your verification code is: {{otp}}

This code expires in {{minutes}} minutes.

If you did not request this, contact IT support immediately.
```

### OTP SMS

```text
Your password reset code is {{otp}}. It expires in {{minutes}} minutes. If you did not request this, contact IT.
```

### Successful reset notification

```text
Your password was reset successfully. If this was not you, contact IT support immediately.
```

---

## 17. Password Rules

Use AD password policy as the final authority.

Frontend should show helpful guidance only.

Recommended frontend checks:

- Minimum length
- Uppercase/lowercase
- Number
- Symbol
- Password confirmation
- Prevent username inside password

Backend should:

- Re-check against basic rules
- Attempt AD reset
- Return generic message if AD rejects password
- Log exact AD rejection internally

---

## 18. Implementation Phases

### Phase 1: Foundation

- Add environment variables.
- Create database tables.
- Create password reset module folder.
- Add audit logging service.
- Add rate limiting middleware.

### Phase 2: Active Directory integration

- Configure LDAPS.
- Create delegated AD service account.
- Implement AD user lookup.
- Implement disabled account detection.
- Implement blocked group checks.
- Implement password reset function.

### Phase 3: OTP and notification

- Implement OTP generation.
- Store OTP hashes.
- Implement OTP expiry and attempt limits.
- Integrate external email.
- Integrate Infobip SMS.
- Add resend cooldown.

### Phase 4: API flow

- Build request reset endpoint.
- Build verify OTP endpoint.
- Build complete reset endpoint.
- Build resend OTP endpoint.
- Add generic public responses.
- Add audit logs throughout.

### Phase 5: Vue UI

- Add reset request page.
- Add OTP verification page.
- Add new password page.
- Add success page.
- Add password strength indicator.
- Add cooldown timers.

### Phase 6: Security hardening

- Add CAPTCHA after suspicious activity.
- Add global reset volume limits.
- Add admin audit view.
- Add SIEM/log forwarding.
- Add alerts for blocked or suspicious attempts.
- Test username enumeration resistance.
- Test OTP brute-force resistance.
- Test disabled account block.
- Test privileged account block.

### Phase 7: Pilot and rollout

- Pilot with a small user group.
- Monitor audit logs.
- Tune rate limits.
- Validate Infobip/email delivery.
- Train IT support.
- Roll out to all eligible users.

---

## 19. Testing Checklist

### Functional tests

- Valid user can request OTP.
- Valid user receives OTP.
- Valid OTP creates reset token.
- Valid reset token resets password.
- Expired OTP fails.
- Wrong OTP fails.
- Reused OTP fails.
- Reused reset token fails.

### Security tests

- Disabled account cannot reset password.
- Privileged account cannot reset password.
- Service account cannot reset password.
- Unknown user receives generic response.
- Brute-force OTP attempts are blocked.
- Repeated reset requests are rate-limited.
- Reset token expires.
- Reset token cannot be reused.
- Reset token cannot be used from changed device/IP if binding is enabled.
- Plain HTTP is rejected.
- OTP is never stored in plaintext.
- Reset token is never stored in plaintext.
- Audit logs are written for all important events.

### AD tests

- Password reset works over LDAPS.
- Password reset fails over plain LDAP.
- AD password policy rejection is handled safely.
- Service account cannot modify users outside allowed OU.
- Service account cannot reset privileged users.

---

## 20. Recommended Libraries

For Node.js:

```text
ldapts or ldapjs
express-rate-limit
rate-limiter-flexible
bcrypt or argon2
crypto
nodemailer
axios
helmet
csurf
zod or express-validator
winston or pino
```

For Vue.js:

```text
axios
vee-validate or vuelidate
zod or yup
PrimeVue components if already used
```

If avoiding extra validation libraries, implement strict manual validation in middleware.

---

## 21. Minimum Viable Secure Version

The first production version should include:

- LDAPS AD connection
- Disabled account block
- Privileged/service account block
- External email OTP
- Infobip SMS fallback
- Hashed OTPs
- Short-lived reset tokens
- Rate limiting
- Generic responses
- Audit logging
- HTTPS only
- Dedicated delegated AD service account

Do not launch without these controls.

---

## 22. Future Enhancements

- Authenticator app/TOTP
- Push notification approval
- Admin dashboard
- SIEM integration
- Risk scoring
- Geo/IP anomaly detection
- Self-service user enrollment for external email/phone
- Helpdesk override workflow
- Passwordless recovery with hardware security keys
