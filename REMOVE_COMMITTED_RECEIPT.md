# TODO (later): remove the committed test receipt from git

Not urgent — only matters before you share the code, push it to a remote, or add another
developer. Nothing is needed while the project only lives on your machine.

## What this is

One real employee expense receipt got saved into git history:

```
server/uploads/reimbursements/CLM-86887-Screenshot_2026-07-15_101427.png
```

Because it's in git, anyone who gets a copy of the repo's history gets that receipt too.
The `server/uploads/` folder is now git-ignored, so **no new uploads get committed** — but the
one file already in there has to be removed separately.

## Two parts

### Part 1 — Stop tracking it going forward (simple, safe)

```bash
git rm --cached "server/uploads/reimbursements/CLM-86887-Screenshot_2026-07-15_101427.png"
git commit -m "Remove committed upload; server/uploads is git-ignored"
```

After this, the file stays on your disk (still works locally) but is no longer tracked by git,
and won't come back.

### Part 2 — Erase it from past history (optional, more disruptive)

Part 1 stops tracking it, but git still remembers it in older commits. To scrub it completely
you rewrite history. Do this **before** the repo is ever shared/pushed, and coordinate with
anyone who has a copy (it changes commit hashes).

Using `git filter-repo` (install it first: `pip install git-filter-repo`):

```bash
git filter-repo --path "server/uploads/reimbursements/CLM-86887-Screenshot_2026-07-15_101427.png" --invert-paths
```

Or the whole uploads folder at once:

```bash
git filter-repo --path server/uploads --invert-paths
```

Then, if you have a remote, force-push the rewritten history:

```bash
git push origin --force --all
```

> ⚠️ Only force-push if you understand it replaces the remote history. If you're a solo
> developer with no remote yet, you can skip the push entirely.

## Quick check — is it still tracked?

```bash
git ls-files server/uploads
```

If that prints the filename, Part 1 hasn't been done yet. If it prints nothing, you're good.

---

*When you're ready, you can also just ask Claude to do Part 1 for you — it will ask before
committing, per your standing rule.*
