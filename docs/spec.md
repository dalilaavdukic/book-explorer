# Book Explorer: Product Specification

*Living document, last updated 2026-10-11 (Phase 2). Requirements source:* `Development_Take-Home_Assignment.md`*. Technical design:* `docs/architecture.md`*.*

## 1. Overview

Book Explorer lets people browse a catalog of books and keep a private reading journal: a set of notes for each book, each optionally tied to a page.


| Role    | Who                        | Can                                                                                                               |
| ------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Visitor | Anyone who isn't logged in | Browse, search, filter by author or genre, sort, and view book details                                            |
| Reader  | A logged-in user           | Everything a visitor can do, plus manage their own notes and narrow the catalog to books they've written notes on |


Readers never see each other's notes.

## 2. Product decisions

Approved decisions that interpret or go beyond the assignment. They stay fixed unless explicitly revisited. §5 turns them and the assignment into requirements and acceptance criteria; §7 lists working assumptions that haven't been explicitly decided.


| Topic            | Decision                                                                                                                                            | Why                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Feature choice   | Build all three suggested features. Notes is the primary "complex feature"; search, filter and sort are secondary.                                  | "Implement following features" is plural. Notes involve the most design work: data model, ownership, validation and full CRUD.          |
| Catalog access   | The catalog is public; login is needed only for notes.                                                                                              | "Allow logged-in users to add notes" implies there are users who aren't logged in. A public catalog is also the realistic product.      |
| Search vs filter | Search is free text over title and author. Filters are exact criteria: author, genre, and "books with my notes". There is no separate title filter. | The assignment lists title and author under both features. Splitting them into "free text" and "exact match" gives each a distinct job. |
| Notes per book   | A reader can keep many independent notes per book, each with an optional page reference. They're shown 20 per page.                                             | It works as a reading journal and matches the plural "notes". A reader can realistically keep more than 100 notes on one book, so the notes are paginated. |
| Registration     | None. Demo accounts are provided for review (§5.4); administrators are created with `createsuperuser`.                                                                                  | The assignment asks only for a login flow. |
| Books with my notes | A core filter, available only to logged-in readers. | It connects notes to catalog discovery, and it's where the API must return per-reader results without exposing them to anyone else. |
| Author and genre filters | The author is chosen with a type-to-search selector that asks the server for matching authors. Several genres can be selected at once: a book matches any selected genre, and different filters still all apply. | A real catalog has too many authors for one dropdown. Combining genres ("Fantasy or Science Fiction") is a natural way to browse; each book still has exactly one genre. |
| Sorting and pagination | Sort by title, author or publication year. Author order uses a surname-first sort key stored with each author (§5.2). The list is paginated. | Surname order is the library convention. Pagination keeps the list usable as the catalog grows. |
| Seed data | 100 real books (§5.2). | Enough to make search, filters, sorting and pagination meaningful: about nine pages at 12 per page. |
| List state | Search, filters, sort and page are kept in the URL. | Refresh, back/forward and shared links keep working.                                                                                              |




## 3. Scope

**Core**

- Login and logout.
- Public catalog list and detail pages.
- Seed-data migration and the demo-user command.
- Notes CRUD with an optional page reference, with the notes paginated.
- Search, filters (author search, one or more genres, "books with my notes"), sort and pagination, with list state kept in the URL.
- Loading, empty and error states.
- Django admin for books and notes.
- Automated backend tests.

**Enhancements** (built only after the core is complete and verified)

- Each reader sees their own note count per book on the list.
- The author name on the detail page links to the list filtered by that author.

**Out of scope**

- Registration, password reset, social login, and login rate limiting.
- A cross-book "My Notes" page.
- Searching or filtering within a book's notes.
- Creating or editing books outside Django admin.
- Multiple authors or genres per book; page count, ISBN and cover images.
- Shared or public notes; rich text or markdown in notes.
- Fuzzy, accent-insensitive or relevance-ranked search.
- Detecting conflicting edits to the same note (the last save wins).
- Deployment. The app runs locally.



## 4. User journeys

- **J1 Browse:** a visitor opens the app, sees the paginated book list, opens a book, then goes back to the list exactly as they left it.
- **J2 Find:** a visitor searches, filters by author or by one or more genres, and changes the sort or page. The list and the URL update, and refreshing, going back or sharing the link reproduces the same view. If nothing matches, an empty state offers "Clear all".
- **J3 Log in:** a visitor logs in from the header or from the "Log in to add notes" prompt on a book and lands back on the same page. Wrong credentials produce a generic error.
- **J4 Add a note:** on a book's page, a reader writes a note, optionally adds a page number, and saves. The note appears at the top of the first page of notes, with its timestamp and page label.
- **J5 Edit a note:** the reader clicks Edit, changes the text or page, and saves. Cancel discards the changes. The note shows that it was edited and when.
- **J6 Delete a note:** the reader clicks Delete and confirms, and the note disappears.
- **J7 Revisit annotated books:** a reader turns on "Books with my notes", alone or combined with search, filters and sort, and sees only books they've written notes on.
- **J8 Log out:** the notes UI and the "Books with my notes" control disappear, any `has_notes=true` filter is dropped, the reader's notes and any unsaved note draft are cleared from the browser (AC-A8), and the server rejects note requests. The public catalog stays browsable.
- **J9 Authentication expires mid-task:** a save fails because the reader's authentication has expired. An error explains this and offers a way to log in again. The typed text stays in the form, and the app doesn't redirect away on its own.
- **J10 Reviewer setup:** a reviewer runs the migrations and the demo-user command (running it twice is harmless), then logs in as `alice` and as `bob` and sees that each has separate notes.



## 5. Features



### 5.1 Catalog

- A book has a title, an author, a publication year, exactly one genre and a short description.
- Books are read-only in the app. Administrators manage them in Django admin.
- The list lives at `/` and shows 12 books per page. A book's detail page lives at `/books/:id`.


| ID    | Acceptance criterion                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-L1 | The list shows each book's title, author, publication year and genre, and each entry links to that book's detail page.                                                     |
| AC-L2 | List data comes from the API. A loading state shows while it loads, and an error with a retry action shows if loading fails.                                               |
| AC-L3 | The list and detail pages work without logging in.                                                                                                                         |
| AC-L4 | The list is paginated at 12 per page and the page number is in the URL. A page number past the last page is handled gracefully: no crash, and a way back to valid results. |
| AC-D1 | `/books/:id` shows every attribute and works when opened directly or refreshed.                                                                                            |
| AC-D2 | An unknown or malformed book id shows a "Book not found" view.                                                                                                             |
| AC-D3 | Going back from a detail page restores the list exactly as it was: search, filters, sort and page.                                                                         |
| AC-D4 | An unknown route shows a "Page not found" view.                                                                                                                            |




### 5.2 Seed data

- **How it's loaded:** a Django data migration, so running `migrate` on an empty database produces a usable catalog. The migration contains catalog data only; it never creates users or notes.
- **What it contains:** 100 real, well-known books:
  - Several authors have more than one title, so the author filter is meaningful.
  - The books cover a range of genres and publication years, so filtering (including several genres at once), sorting and pagination are meaningful.
  - Each book has exactly one author and one genre.
  - As a guide, roughly 40–50 authors and 10–15 genres. These aren't fixed targets.
- **Author sort key:** each author has a surname-first sort key such as "Orwell, George" or "García Márquez, Gabriel". The key is set explicitly in the data rather than worked out by splitting names, because splitting fails for compound surnames and single-name authors.
- **Titles, years and author names:**
  - Title: the best-known English title.
  - Year: first publication in the original language, as the source gives it. For a work serialized over several years, the year the complete work had appeared.
  - Author names: in English, keeping their accents.
- **Descriptions:** original one-line summaries, never copied from publishers.
- **Accuracy:** titles, authors and years are checked against a reliable source, not taken unchecked from AI output.


| ID    | Acceptance criterion                                                                  |
| ----- | ------------------------------------------------------------------------------------- |
| AC-M1 | Running migrations on an empty database produces the documented catalog.              |
| AC-M2 | Rolling back the seed migration removes the seeded books, plus any seeded authors and genres no remaining book uses, and leaves books added through admin untouched. Because the notes migrations depend on the catalog, Django undoes them first, which drops the notes table: every note is removed, including notes on books added through admin. This is accepted for local development only (§6). |
| AC-M3 | The migration uses Django's historical models, so later model changes don't break it. |
| AC-M4 | The README describes the dataset.                                                     |




### 5.3 Authentication and sessions

- Readers log in with a username and password. There is no registration, password reset or social login.
- Session lifetime, the expiration policy and whether any renewal mechanism is needed are decided in the architecture step (§8).


| ID    | Acceptance criterion                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-A1 | After a valid login, the header shows the reader's username and a Log out action, and the reader returns to the page they came from (the catalog if there was none).                                               |
| AC-A2 | Invalid credentials produce one generic error that doesn't reveal whether the username exists.                                                                                                                     |
| AC-A3 | The form can't be submitted until both username and password are filled in.                                                                                                                                        |
| AC-A4 | Login persists across page refreshes and navigation until the reader logs out or their authentication expires.                                                                                                                                                                    |
| AC-A5 | Logging out invalidates authenticated access on the server, not only in the browser, so the old login can no longer be used for notes.                                                                                                                    |
| AC-A6 | Opening the login page while already logged in redirects to the catalog.                                                                                                                                           |
| AC-A7 | The notes API rejects unauthenticated requests, including those made after authentication has expired. The UI then shows the reader as logged out and offers to log in again, rather than crashing or failing silently. An open note form isn't cleared when this happens (AC-N12).                                                                                                                                               |
| AC-A8 | When a reader's session ends (they log out, it expires, or they log out in another tab, once this tab detects it, §6) or a different reader logs in, the app stops showing the previous reader's notes and personalized results ("Books with my notes" results and, if built, note counts) and doesn't keep them in the browser. Public catalog data can stay loaded. What happens to an unsaved note draft depends on how the session ended. If it expired, or the reader logged out in another tab (which looks the same to this tab), an open note form keeps its text (AC-N12). If the reader logs out here, or any reader logs in (here, or in another tab once this tab detects it), the draft is discarded. The next reader to log in never sees the previous reader's notes, personalized results or draft, not even briefly while their own data loads. |



### 5.4 Demo users

A management command creates two demo readers, `alice` and `bob`, for development and review.

- **Idempotent:** running it again creates nothing new and doesn't fail.
- **Never modifies an existing user:** if a user already exists, the command leaves it alone (no password reset) and reports it as skipped.
- **Dev only:** the README documents the command as development/demo-only, lists the credentials, and warns never to use them in production.
- **Credentials:** migrations never create user credentials. Administrators are created with `createsuperuser`.
- **Not a substitute for tests:** demo accounts make manual review easier, but authorization is verified by automated tests.


| ID    | Acceptance criterion                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| AC-U1 | The command creates `alice` and `bob` when they don't exist. If only one exists, it creates only the missing one.                |
| AC-U2 | A second run creates no duplicates and doesn't fail.                                                                             |
| AC-U3 | An existing user, including one whose password has since been changed, is left untouched, and the command reports it as skipped. |
| AC-U4 | The README documents the command as dev-only, lists the credentials, and warns against using them in production.                 |




### 5.5 Notes

A note belongs to one reader and one book.


| Field             | Rules                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Body              | Required plain text, max 5,000 characters. Surrounding whitespace is trimmed, a whitespace-only body is rejected, and line breaks are kept.  |
| Page              | Optional whole number from 1 to 10,000. It isn't checked against the book's length, because editions differ. It can be cleared when editing. |
| Created / updated | Set by the server.                                                                                                                           |
| Owner, book       | The owner is always the logged-in reader and the book is the one the note was created on. Neither can be changed later.                       |


- Notes appear in a section on the book's detail page, newest first, 20 per page, with page controls rather than infinite scrolling. The current notes page isn't part of the URL: opening or refreshing a book starts at the first page of notes.
- Each note shows its text, a "p. N" label if a page is set, when it was created, and an "edited" marker with the update time if it has been changed.
- A note is deleted along with its owner's account.
- A book that has notes can't be deleted until those notes are deleted, so removing a book from the catalog never destroys readers' notes as a side effect.


| ID     | Acceptance criterion                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-N1  | A reader sees only their own notes for the book, newest first.                                                                                                                                                                                               |
| AC-N2  | **Creating a note:** an empty or whitespace-only body is rejected, and the server enforces the length limit (the form mirrors it). The save button is disabled while saving, so a double click creates one note. |
| AC-N3  | The page reference is optional. If one is given, it must be a whole number from 1 to 10,000. Zero, negative, decimal and non-numeric values are rejected with a field-level error.                                                                           |
| AC-N4  | **Editing a note:** a reader can change their own note in place, both the body and the page, and can clear the page. Cancel discards the changes, and a saved edit shows the update time.                                                                    |
| AC-N5  | A reader can delete their own note, but only after confirming.                                                                                                                                                                                               |
| AC-N6  | Through the API, a reader can list only their own notes for a book. The list response never includes another reader's notes or reveals their existence through pagination or counts. Attempts to view, change, or delete another reader's individual note return 404, indistinguishable from a note that does not exist.                                                                          |
| AC-N7  | The owner is always the logged-in reader. A `user` field in the request is ignored.                                                                                                                                                                          |
| AC-N8  | Creating a note for a book that doesn't exist is rejected.                                                                                                                                                                                                   |
| AC-N9  | **Outcome of every change:** a successful create, edit or delete updates the notes section without a full page reload. A failed create or edit shows an error and keeps the entered text and page in the form. A failed delete shows an error and leaves the note visible. A failed operation is never shown as successful.                                                                                                                                                                                            |
| AC-N10 | Visitors see a "Log in to add notes" prompt instead of the notes section. Logging in from there returns them to the same book.                                                                                                                               |
| AC-N11 | Note text is always displayed as plain text: any HTML is shown literally and never rendered. |
| AC-N12 | If a save fails because authentication has expired, the error says so and offers a way to log in again. The entered text stays in the form (the form isn't replaced by the logged-out view) and the app doesn't redirect away on its own. The draft isn't kept across navigation or re-login, and the save isn't retried automatically after logging in (§6). This applies only when the session ends on its own, including a logout in another tab, which looks the same to this tab. Logging out here, or any reader logging in, discards the draft instead (AC-A8). |
| AC-N13 | **Paging through notes:** notes are shown 20 per page, newest first, and paging never repeats or skips a note. After creating a note the section shows the first page, so the new note is visible. After an edit it stays on the current page and shows the change. After a delete it refreshes the current page, or moves to the previous page if the current one no longer exists. If a page no longer exists for another reason (for example, notes were deleted in another tab), the section returns to the first page instead of showing an error. |




### 5.6 Search, filter and sort

**Search**

- There is a single search box.
- It matches title and author name, case-insensitively, as partial text.
- The input is split on spaces, and every term must match either the title or the author. For example, "tolkien hobbit" finds *The Hobbit*.
- Surrounding whitespace is ignored, and an empty box means no search.
- Characters such as `%`, `_` and quotes are matched literally.
- Results follow the selected sort; there is no relevance ranking.
- Searching starts as the user types, after a short pause of about 300 ms.

**Filters** combine with each other and with search; a book must meet all of them. Within the genre filter, a book needs to match only one of the selected genres.

- **Author:** type part of an author's name and pick from up to 10 matching authors in the catalog, listed by surname. Suggestions come from the server after the same short pause as the search box, so the selector keeps working however many authors the catalog has.
- **Genre:** pick one or more genres from a dropdown list of every genre in the catalog. A book matches if it belongs to any selected genre (for example, Fantasy or Science Fiction).
- **Books with my notes:** readers only. Shows books with at least one note by the current reader. Visitors don't see the control. If a visitor opens a URL containing `has_notes=true`, the app removes that parameter and shows the normal public catalog. The API rejects unauthenticated requests that ask for personalized results, so reader-specific information is never exposed.

**Sort**

- Options: title, author (by surname key) or publication year, each ascending or descending. The default is title A–Z.
- Sorting ignores case.
- Books that tie on the sort field always come back in the same order, so a book is never repeated or skipped across pages.

**Pagination and URL state**

- The list shows a fixed 12 books per page. Changing search, filters or sort goes back to page 1.
- Search, filters (the selected author and every selected genre), sort and page are all stored in the URL.
- "Clear all" resets search and every filter, including all selected genres.


| ID    | Acceptance criterion                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-S1 | Search matches title and author, ignoring case and allowing partial text. With several terms, a book must match all of them.                                                                                  |
| AC-S2 | The author and genre filters match exactly and combine with each other and with search. Several genres can be selected at once: a book matches if it's in any of them, and must still meet the author filter, "Books with my notes" and search. |
| AC-S3 | "Books with my notes" returns only books with at least one note by the current reader and combines with everything else. Visitors don't see the control, and a visitor opening a URL with `has_notes=true` gets the public catalog with that parameter removed. The API rejects unauthenticated requests for personalized results.                                                            |
| AC-S4 | Sorting works by title, author (surname) and year in both directions, with title A–Z as the default. Author suggestions are listed by surname. Paging through a sorted list never repeats or skips a book. |
| AC-S5 | Refreshing, using back/forward, or opening a shared link restores the same search, filter (including every selected genre), sort and page settings. Personalized results depend on who is logged in: Alice and Bob opening the same URL with `has_notes=true` each see their own annotated books, and a visitor gets the public catalog as in AC-S3.                                                                                                                             |
| AC-S6 | Changing search, filters or sort returns to page 1.                                                                                                                                                           |
| AC-S7 | When nothing matches, an empty state shows with a "Clear all" action.                                                                                                                                         |
| AC-S8 | Invalid or unknown query parameters never cause a server error and never expose another reader's data.                                                                                                        |
| AC-S9 | Typing in the search box doesn't send a request on every keystroke; it waits for a short pause.                                                                                                               |
| AC-S10 | **Author selector:** after a short pause in typing, it suggests at most 10 authors whose name contains the typed text, ignoring case, listed by surname. It shows loading, no-match and error states. Choosing an author filters the list, and clearing the selection removes the filter. Refreshing or opening a link with an author selected shows that author's name, even if they wouldn't appear among the first suggestions. |




### 5.7 Enhancements (after the core is complete)


| ID    | Acceptance criterion                                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-X1 | Each book in the list shows the logged-in reader's own note count for it. Visitors see no counts. The counts are loaded efficiently, not with one query per book. |
| AC-X2 | The author name on a book's detail page opens the list filtered by that author.                                                                                   |




## 6. Edge cases and known limitations

**Handled**

- **Note deleted in another tab, then edited here:** the reader is told the note no longer exists, and the notes list refreshes.
- **Logout, or a different reader's login, in another tab:** this tab notices a logout on its next request that needs login (which fails) or when it regains focus and re-checks the session; it notices a different reader's login only on that re-check. It then switches to the logged-out state, or to the new reader, and clears the previous reader's notes and personalized results. An open draft is kept after a logout elsewhere, as after expiry (AC-N12), and discarded once a reader is detected as logged in (AC-A8).
- **Authentication expires while writing or editing a note:** handled as in J9 and AC-N12.
- **Visitor opens a link that has "Books with my notes" turned on** (shared by someone else, or saved before logging out): the app removes `has_notes=true` and shows the public catalog without the control (AC-S3).
- **Reader with no notes turns on "Books with my notes":** the empty state explains why nothing is shown.
- **An administrator deletes a book that readers have notes on:** the delete is refused, and Django admin lists the notes that block it. Those notes must be deleted first (§5.5).

**Known limitations (accepted)**

- If the same note is edited in two places at once, the last save wins.
- **Rolling back the seed migration deletes every note.** Django first undoes the notes migrations, which drops the notes table, so notes on books added through admin are lost too (AC-M2). This is acceptable only because a local development database holds no real user data; production data would need safeguards first (`docs/architecture.md` §5). It is unrelated to deleting a book in admin, which is still refused while the book has notes (§5.5).
- **Drafts don't survive navigation or re-login.** If a save fails because authentication expired, the text stays in the form, but leaving the page to log in discards it, and the save isn't retried after login. A production app would persist drafts so longer notes can't be lost; for this assignment, keeping the form state after a failed save is enough. The README must explain this tradeoff.
- Search and author suggestions don't ignore accents, so "Garcia" doesn't find "García". With SQLite (`docs/architecture.md`), case-insensitive matching covers ASCII letters only: "garcía" finds "García", but "GARCÍA" doesn't.
- Sorting doesn't skip leading articles, so *The Hobbit* sorts under T.
- Login attempts are not rate-limited.



## 7. Assumptions

Working defaults chosen during discovery that haven't been explicitly decided. The requirements in §5 follow them; changing one means updating the affected criteria.

- After logging in, the reader returns to the page they came from.
- Each book has exactly one author.
- Books can't be edited in the app, only in Django admin.
- Another reader's note looks "not found" rather than "forbidden", so the response doesn't reveal that it exists.
- A note can't be moved to a different book.
- **Limits:** note body up to 5,000 characters; page from 1 to 10,000; 12 books per page; about 300 ms pause before searching.
- Every view that loads data has loading, empty and error states.
- Backend tests are required, even though the assignment marks them optional.



## 8. Deferred to architecture

All items below are resolved in `docs/architecture.md`.

- **Auth mechanism** (session cookie with CSRF protection, token, or JWT). It also decides session lifetime, the expiration policy, whether any renewal mechanism is needed, and how frontend and backend are connected in development.
- **Database** (SQLite or PostgreSQL), including whether case-insensitive matching works for non-ASCII letters.
- **Tooling:**
  - JavaScript or TypeScript. The assignment specifies JavaScript.
  - poetry or `requirements.txt`, the build tool, styling and data fetching.
  - Test tools. The assignment names Django's testing framework.
- **Query parameters:** how they're handled, what the API returns for invalid parameters, and the exact error response when an unauthenticated request asks for personalized results.
- **Data model:** author as a text field or its own table (the surname key points toward a table), and genre as a fixed list of choices or its own table.
- Docker and CI.



## 9. Traceability


| Assignment requirement                                                               | Covered by                                             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Django (Python 3.x) and DRF for API endpoints                                        | Architecture                                           |
| Basic login flow (Django auth or DRF)                                                | §5.3                                                   |
| CRUD for the complex-feature resource                                                | §5.5                                                   |
| Data migration with initial books                                                    | §5.2                                                   |
| poetry or requirements.txt                                                           | Architecture, README                                   |
| Unit tests with Django's testing framework (optional)                                | §7 (required by us), architecture                      |
| React (JavaScript ES6+)                                                              | Architecture                                           |
| Login form                                                                           | §5.3                                                   |
| Book list view fetched from the API                                                  | §5.1                                                   |
| Book detail view                                                                     | §5.1                                                   |
| UI for the complex feature and its CRUD                                              | §5.5                                                   |
| yarn or npm                                                                          | Architecture, README                                   |
| react-router-dom for navigation                                                      | Architecture; URL state in §5.6                        |
| Feature 1: user-specific book notes                                                  | §5.5                                                   |
| Feature 2: filtering and sorting                                                     | §5.6                                                   |
| Feature 3: basic search                                                              | §5.6                                                   |
| GitHub repo with separate backend/frontend directories                               | Architecture, Phase 6                                  |
| README contents (setup, dependencies, seed data, feature design, assumptions, tests) | README; §2 and §7 supply the decisions and assumptions |


