# Supabase SQL tests

## `rls_tests.sql`

Proves core Row Level Security and booking constraints:

- A user cannot edit or delete another user’s listing
- A user cannot read another user’s conversations or messages
- A user cannot make themselves admin
- An owner cannot change their own listing status
- Phone numbers are hidden via `profiles_safe` for other users
- The same listing + meeting slot cannot be double-booked
- The public cannot see `pending` listings

### How to run

1. Use a **test** or **local** Supabase project — never production.
2. Ensure `schema.sql` and migrations (including bookings) are applied.
3. Open **SQL Editor** → paste `rls_tests.sql` → **Run**.
4. Confirm the messages panel shows `PASS: …` lines and `ALL RLS TESTS PASSED`.
5. The script ends with `ROLLBACK`, so fixture users/listings are not kept.

If a check fails, the script raises `FAIL: …` and rolls back.
