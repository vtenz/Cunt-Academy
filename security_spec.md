# Phase 0: Payload-First Security TDD Specification (`security_spec.md`)

## 1. Data Invariants
1. **Identity & Ownership Invariant (`UserProfile`)**:
   - A `/userProfiles/{userId}` document can only be read, created, updated, or deleted by an authenticated user with `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
   - `ownerId` inside `/userProfiles/{userId}` must strictly equal `userId` and `request.auth.uid`, and is immutable after creation.
   - No PII (such as raw email, phone number, or address) is stored in `/userProfiles/{userId}`.
2. **Relational Parent Invariant (`FlashcardDoc` & `SavedSentenceDoc`)**:
   - Every `/userProfiles/{userId}/cards/{cardId}` and `/userProfiles/{userId}/sentences/{sentenceId}` document belongs exclusively to `/userProfiles/{userId}`.
   - Access to any subcollection document requires `request.auth.uid == userId`, `request.auth.token.email_verified == true`, and relational parent verification (`get(/databases/$(database)/documents/userProfiles/$(userId)).data.ownerId == request.auth.uid`) on single-document operations (`get`, `create`, `update`, `delete`), plus `resource.data.ownerId == request.auth.uid && userId == request.auth.uid` on `list` queries.
3. **Temporal & Schema Integrity Invariant**:
   - Every create operation must set `createdAt == request.time` and `updatedAt == request.time`.
   - Every update operation must preserve `createdAt == resource.data.createdAt`, `ownerId == resource.data.ownerId`, and set `updatedAt == request.time`.
   - Every string field and array field has strict `.size()` upper bounds matching `firebase-blueprint.json`.

---

## 2. The "Dirty Dozen" Payloads (All Must Return `PERMISSION_DENIED`)

1. **Unauthenticated Profile Creation (Identity Breach)**:
   - Path: `/userProfiles/user_123` (`auth = null`)
   - Payload: `{ "ownerId": "user_123", "displayName": "Hacker" }`
2. **Unverified Email Write Attempt (Spoofed Email Breach)**:
   - Path: `/userProfiles/user_123` (`auth = { uid: "user_123", token: { email_verified: false } }`)
   - Payload: Valid `UserProfile` payload.
3. **Cross-User Profile Hijack (Identity Spoofing)**:
   - Path: `/userProfiles/victim_uid` (`auth = { uid: "attacker_uid", token: { email_verified: true } }`)
   - Payload: `{ "ownerId": "victim_uid", "displayName": "Hijacked" }`
4. **Shadow Field Injection on Profile (`hasOnly` Bypass)**:
   - Path: `/userProfiles/user_123`
   - Payload: Valid `UserProfile` fields + `{ "isAdmin": true }`
5. **Orphaned Card Creation Without Parent `UserProfile` (Master Gate Breach)**:
   - Path: `/userProfiles/user_no_profile/cards/word_test`
   - Payload: Valid `FlashcardDoc` when `/userProfiles/user_no_profile` does not exist.
6. **Immutable `ownerId` / `createdAt` Mutation on Card Update**:
   - Path: `/userProfiles/user_123/cards/word_ubiquitous`
   - Payload: Update changing `ownerId` to `"other_user"` or modifying `createdAt`.
7. **Forged Client Timestamp on Create/Update (Temporal Integrity Breach)**:
   - Path: `/userProfiles/user_123/cards/word_ubiquitous`
   - Payload: `updatedAt` set to a past or future timestamp `!= request.time`.
8. **Invalid Enum Value on Card Status / AnkiState (State Integrity Breach)**:
   - Path: `/userProfiles/user_123/cards/word_ubiquitous`
   - Payload: `{ "status": "hacked_status", "ankiState": "infinite" }`
9. **Oversized String Denial-of-Wallet Payload (`translationFa > 500` chars)**:
   - Path: `/userProfiles/user_123/cards/word_ubiquitous`
   - Payload: `translationFa` with 10,000 characters.
10. **Array Overflow / Non-String Element in `miniMeaningsFa`**:
    - Path: `/userProfiles/user_123/cards/word_ubiquitous`
    - Payload: `miniMeaningsFa` with 50 items or `[12345]`.
11. **Malformed Document ID Poisoning (`cardId` with slashes/spaces/200 chars)**:
    - Path: `/userProfiles/user_123/cards/invalid$id!@#`
    - Payload: Valid `FlashcardDoc`.
12. **Cross-Tenant List Query Scraping on `/userProfiles/victim_uid/cards`**:
    - Path: `/userProfiles/victim_uid/cards` (`auth.uid = "attacker_uid"`)
    - Operation: `list` query attempting to enumerate another user's flashcards.

---

## 3. Security Rules Test Specification (`firestore.rules.test.ts` Reference)

```ts
// Reference verification suite for the Dirty Dozen payloads against firestore.rules
// 1. Unauthenticated writes -> PERMISSION_DENIED
// 2. email_verified == false -> PERMISSION_DENIED
// 3. Cross-UID profile/card/sentence read or write -> PERMISSION_DENIED
// 4. Shadow field injection -> PERMISSION_DENIED
// 5. Orphaned subcollection write without parent UserProfile -> PERMISSION_DENIED
// 6. Immutable field tampering (ownerId, id, createdAt) -> PERMISSION_DENIED
// 7. Forged updatedAt != request.time -> PERMISSION_DENIED
// 8. Invalid enum values for status/pumpStage/ankiState -> PERMISSION_DENIED
// 9. Oversized strings exceeding blueprint maxLength -> PERMISSION_DENIED
// 10. miniMeaningsFa > 12 items or non-string first item -> PERMISSION_DENIED
// 11. Non-matching path IDs -> PERMISSION_DENIED
// 12. Unauthorized list scraping -> PERMISSION_DENIED
```
