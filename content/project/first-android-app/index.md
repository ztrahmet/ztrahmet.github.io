---
title: First Android Mobile App
start: 2021-06
end: 2021-12
url: https://play.google.com/store/apps/details?id=com.example.app
repository: https://github.com/username/first-android-app
image: /images/projects/android-app.png
logo: /images/projects/android-mark.svg
description: A native Android expense tracker with offline-first sync and budget visualisation, and the project where I learned what a memory leak feels like.
skills:
  - Android
  - Kotlin
  - SQLite
  - Room
---

An expense tracker built to learn the platform properly rather than to compete with the
hundred that already exist. It works offline, syncs when it can, and charts where the money
went.

## Architecture

Standard Jetpack layering, chosen because it is what the documentation assumes and fighting
that is a bad use of a first project.

```
UI (Compose)  ->  ViewModel  ->  Repository  ->  Room / Retrofit
```

The repository is the only layer that knows the network exists. Everything above it reads from
the database, which means the UI has exactly one source of truth and offline mode is not a
special case.

```kotlin
class ExpenseRepository(
    private val dao: ExpenseDao,
    private val api: ExpenseApi,
) {
    /** The database is the source of truth. The network only ever fills it. */
    fun observe(month: YearMonth): Flow<List<Expense>> = dao.observeMonth(month)

    suspend fun refresh(month: YearMonth) = runCatching {
        dao.upsertAll(api.fetchMonth(month))
    }
}
```

## What went wrong

1. **A leaked coroutine scope.** I created a scope in a fragment and never cancelled it. Every
   rotation started another collector and the app got slower the more you used it.
2. **Storing money in `Double`.** Rounding errors on a budget app are the one bug users will
   definitely notice. Migrated to `Long` minor units, which is what should have happened on
   day one.
3. **No migration plan.** Room refuses to open a database whose schema changed without a
   migration, which is correct and which I discovered on a device holding six months of real
   data.

> If you store currency in a floating point type, someone will eventually see their balance as
> 19.999999999999996 and stop trusting the app entirely.

## Status

Archived. The Play Store listing is still up and the source is readable, but it targets an
Android version that is now three releases behind and I would not ship the sync logic again
without a proper conflict resolution story.
