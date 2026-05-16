# Security Specification & "Dirty Dozen" Payloads

## Data Invariants
1. A user's `role` can only be set or changed by an Admin.
2. A user's `balance` can only be incremented by the system (via Admin/SuperAdmin) and never by the user themselves.
3. `affiliateStatus` must progress from `none` -> `pending`/`active` -> `approved`, and only Admins can set it to `approved` (manual activation sets to `active`).
4. Users cannot unsuspend themselves.
5. Withdrawals cannot be created with a status other than `pending`.

## The "Dirty Dozen" Payloads

### 1. Privilege Escalation (Role Injection)
**Operation**: `update` on `/users/{uid}`
```json
{
  "role": "admin"
}
```
**Expected**: `PERMISSION_DENIED`

### 2. Balance Poisoning
**Operation**: `update` on `/users/{uid}`
```json
{
  "balance": 1000000
}
```
**Expected**: `PERMISSION_DENIED`

### 3. Self-Approval of Affiliate Status
**Operation**: `update` on `/users/{uid}`
```json
{
  "affiliateStatus": "approved"
}
```
**Expected**: `PERMISSION_DENIED`

### 4. Self-Unsuspension
**Operation**: `update` on `/users/{uid}`
```json
{
  "status": "active"
}
```
**Expected**: `PERMISSION_DENIED` (Unless previously active)

### 5. Identity Spoofing (Log Injection)
**Operation**: `create` on `/system_logs/{id}`
```json
{
  "userId": "SOME_OTHER_USER_ID",
  "purpose": "Hacking",
  "createdAt": "2024-01-01T00:00:00Z"
}
```
**Expected**: `PERMISSION_DENIED`

### 6. Withdrawal Status Pre-Approval
**Operation**: `create` on `/withdrawals/{id}`
```json
{
  "userId": "MY_UID",
  "amount": 5000,
  "status": "approved"
}
```
**Expected**: `PERMISSION_DENIED`

### 7. Global Settings Corruption
**Operation**: `update` on `/settings/institutional_links`
```json
{
  "supportEmail": "hacker@evil.com"
}
```
**Expected**: `PERMISSION_DENIED`

### 8. Resource Exhaustion (String Poisoning)
**Operation**: `update` on `/users/{uid}`
```json
{
  "displayName": "A".repeat(1024 * 512)
}
```
**Expected**: `PERMISSION_DENIED` (Exceeds size limits)

### 9. Orphaned Payment Creation
**Operation**: `create` on `/payments/{id}`
```json
{
  "userId": "MY_UID",
  "courseId": "NON_EXISTENT_COURSE",
  "status": "success"
}
```
**Expected**: `PERMISSION_DENIED` (Requires `exists()` validation)

### 10. Cross-Tenant PII Leak (List Scrape)
**Operation**: `list` on `/users`
**Expected**: `PERMISSION_DENIED` (Should only see own doc or referrals)

### 11. Payment Status Tampering
**Operation**: `update` on `/payments/{id}`
```json
{
  "status": "success"
}
```
**Expected**: `PERMISSION_DENIED`

### 12. Faculty Price Hijacking
**Operation**: `create` on `/faculties/{id}`
```json
{
  "name": "Free Faculty",
  "price": 0
}
```
**Expected**: `PERMISSION_DENIED`
