# Book Explorer: Acceptance Checklist

*The record of how each acceptance criterion in `docs/spec.md` was verified, with its result. Methods follow `docs/implementation-plan.md` §4 and §7.*

## Verification run

| | |
|---|---|
| Code verified | `cddd734` on `phase-7-final-integration-and-delivery` |
| Date | 2026-10-12 |
| OS | Ubuntu 24.04.5 LTS |
| Backend | Python 3.12.3, Django 5.2.18, Django REST framework 3.18.3, SQLite |
| Frontend | Node 24.21.0, Vite dev server with its `/api` and `/admin` proxy |
| Browser | Google Chrome 155.0.8059.39 |
| Verified by | Claude Code, driving Chrome through Playwright MCP (Browser), and the author by hand (Manual) |

**Automated results at this commit:**
- **Backend:** 157 tests pass. Coverage of the application code is 99% (coverage.py, with branches). Ruff lint and format are clean, and `makemigrations --check` finds nothing.
- **Frontend:** 167 tests pass. ESLint, Prettier, the type check and the build are clean.
- **Contract:** regenerating `backend/openapi.yaml` and `frontend/src/api/schema.d.ts` leaves no diff.
- **CI** runs the same checks on every push.

## Methods

| Method | Meaning |
|---|---|
| BE | Backend tests: Django's test runner with DRF's `APITestCase`, including the migration tests |
| FE | Frontend tests: Vitest, React Testing Library and MSW |
| Contract | Regenerating the OpenAPI schema and the TypeScript types leaves no diff |
| Browser | A check in the running app through `http://localhost:5173`, with Playwright MCP. A one-off observation, not a regression test; no browser test code is committed. |
| Manual | Checked by hand in the running app |
| README | Checked against `README.md` |

Evidence names test files and test names. Backend tests are under `backend/<app>/tests/`, or in `backend/config/tests.py`. Frontend tests sit beside their modules in `frontend/src/`. The dev database holds the seeded catalog and the demo readers. Data added for a check (notes, a reader with no notes, a superuser) was deleted afterwards.

## Catalog

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-L1 | The list shows title, author, year and genre, each linked to its book | Browser, FE, BE | **Browser:** a visitor's page 1 shows 12 books, each with its title linked to `/books/<id>`, "author · year" and genre. **FE:** `App.test.tsx` "the list shows each book's title, author, year and genre, linked to its page". **BE:** `catalog/test_api.py` `test_list_items_have_exactly_the_documented_fields` | Pass |
| AC-L2 | Data from the API, a loading state, and an error with retry | Browser | **Browser:** with the list request delayed, "Loading books…" shows. With it failing with a 500, "The books couldn't be loaded." shows with Retry, and Retry loads page 2. | Pass |
| AC-L3 | The list and detail pages work without logging in | BE, Browser | **BE:** `catalog/test_api.py` `test_visitor_can_read_the_list_and_a_book`; `accounts/test_auth.py` `CatalogStaysPublicTests`. **Browser:** with no session cookie, the list, a book and every filter work, and a book shows "Log in to add notes". | Pass |
| AC-L4 | 12 per page, the page in the URL, a page past the last handled | BE, FE, Browser | **BE:** `test_default_page_has_12_books`, `test_page_out_of_range_is_not_found`. **FE:** "a page past the last one shows This page doesn't exist", "a malformed page shows the same view without calling the API". **Browser:** Next goes to `?page=2`, "Page 2 of 9". `?page=99` shows "This page doesn't exist" with "Go to the first page". | Pass |
| AC-D1 | `/books/:id` shows every attribute, opened directly or refreshed | Browser, FE | **Browser:** `/books/273` opened directly, then refreshed, shows title, author, year, genre and description. **FE:** "a book opened directly shows every attribute and links to the first page". | Pass |
| AC-D2 | An unknown or malformed id shows "Book not found" | BE, FE, Browser | **BE:** `test_unknown_book_is_not_found`. **FE:** "a malformed book id shows Book not found without calling the API". **Browser:** `/books/99999`, `/books/abc`, `/books/0` and `/books/12abc` each show "Book not found" with a link to the catalog. | Pass |
| AC-D3 | Back from a book restores search, filters, sort and page | FE, Browser | **FE:** `BookListPage.test.tsx` "going back from a book restores the controls and the results at once"; `App.test.tsx` "Back to books returns to the list page the book was opened from". **Browser:** search "the", three genres, year descending, page 2; a book opened, then Back: the URL, every control, the results and the page come back, with focus on "Books". In a run on page 3, Back restored the list's scroll position (484 px), and Forward the book's (200 px). | Pass |
| AC-D4 | An unknown route shows "Page not found" | FE, Browser | **FE:** "an unknown route shows Page not found with a link to the catalog". **Browser:** `/nope/here` and `/books/273/extra`. | Pass |

## Seed data

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-M1 | Migrating an empty database produces the documented catalog | BE | `catalog/test_seed.py`: `test_migrations_produce_the_documented_catalog` (100 books, 50 authors, 12 genres), `test_seeded_values`, `test_every_author_has_a_sort_key_and_every_book_a_description`, `test_several_authors_have_more_than_one_book`. Also seen when migrating a fresh database for J10. | Pass |
| AC-M2 | Rolling back removes only seeded data; the notes table is dropped first | BE | `catalog/test_seed.py` `test_rollback_removes_only_seeded_data_and_reapplying_reuses_the_rest`: a book added outside the seed, with its author and genre, survives; the notes table is gone; re-applying restores the catalog. | Pass |
| AC-M3 | The migration uses historical models | BE, review | The same round trip. `catalog/migrations/0002_seed_books.py` loads every model through `apps.get_model`. | Pass |
| AC-M4 | The README describes the dataset | README | README, "Seed data": contents, conventions, sort keys, how it was checked, and rolling back. Checked again against the README as submitted. | Pass |

## Authentication and sessions

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-A1 | After login, the header shows the reader and Log out, and they return to where they came from | Browser, FE | **Browser:** from a book's "Log in to add notes", login returns to the book with "alice" and Log out in the header. From the header's Log in on a filtered list, it returns to that list. "Log in again" after an expiry returns to the book. **FE:** "logging in from a book returns to it, with the reader in the header". | Pass |
| AC-A2 | Invalid credentials get one generic error | BE, Browser | **BE:** `accounts/test_auth.py` `test_wrong_credentials_get_one_generic_error_and_no_session`. **Browser:** a wrong password for `alice` and an unknown username both show "Invalid username or password.", and the API's 400 bodies are identical. | Pass |
| AC-A3 | The form can't be submitted until both fields are filled | Browser | Log in stays disabled with both fields empty, with only the username, and with only the password. | Pass |
| AC-A4 | Login persists across refreshes and navigation | Browser | The header still shows "alice" after a refresh and after navigating to another list page. | Pass |
| AC-A5 | Logout ends the session on the server | BE, Browser | **BE:** `test_logout_deletes_the_session`, `test_old_session_cookie_is_worthless_after_logout`, `notes/test_authorization.py` `test_replayed_old_session_cookie_cannot_read_notes`; `test_changing_the_password_ends_the_readers_sessions`. **Browser, with `curl`:** `bob`'s session cookie read his notes (200) before he logged out, and got 401 after. | Pass |
| AC-A6 | The login page redirects a logged-in reader to the catalog | Browser, FE | **Browser:** `/login` while logged in lands on `/`. **FE:** "the login page sends a reader who is already logged in to the catalog". | Pass |
| AC-A7 | The notes API rejects unauthenticated requests, and the UI shows the reader logged out | BE, FE, Browser | **BE:** `notes/test_authorization.py` `test_visitor_gets_401_from_every_notes_endpoint`. **FE:** `App.test.tsx` "a 401 shows the reader as logged out without leaving the page"; `auth/session.test.ts` "a 401 from a query logs the reader out and removes the private entries", "a 401 from a mutation…". **Browser:** with the session cookie deleted to simulate expiry, a save gets 401: the header shows Log in, the notes list goes, and the form keeps its text with "Your session has expired…" and "Log in again". | Pass |
| AC-A8 | A session change clears the previous reader's private data; drafts kept or discarded by how it ended | FE, Browser, Manual | **FE:** `auth/session.test.ts` (private entries removed and drafts discarded on a login, a logout here and a re-check that finds another reader; drafts kept after a 401 or a re-check that finds nobody); `notes/notesSession.test.tsx`; `books/listSession.test.tsx`. **Browser:** a logout here discards an open draft. After `bob` logs out in a second tab, his next save here gets 401, his notes go, and the draft stays. `alice` then logs in here: only her notes show, the form is empty, and a DOM observer saw none of `bob`'s note text at any point. A logout on a "Books with my notes" list shows the public list. **Manual:** the two cases noticed when the tab regains focus (below). | Pass |

**AC-A8, focus re-check (Manual).** A logout in another tab, and another reader's login in another tab, each noticed when this tab regains focus, with a draft open. Browser automation doesn't reliably raise the focus and visibility events this depends on, so these were checked by hand. Both pass:
- **A logout in another tab:** on returning to the tab, the header shows Log in, the reader's notes go, and the draft stays with the expiry message and "Log in again", without a redirect.
- **`bob` logging in in another tab while `alice` has a draft open:** on returning to the tab, the header shows `bob` and only his notes show, `alice`'s never reappear, and the draft is discarded.

## Demo users

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-U1 | The command creates `alice` and `bob`, or only the missing one | BE | `accounts/test_demo_users.py` `test_creates_both_readers_when_neither_exists`, `test_creates_only_the_missing_reader`. On a fresh database it printed "Created alice." and "Created bob." | Pass |
| AC-U2 | A second run creates nothing and doesn't fail | BE | `test_second_run_creates_nothing_and_reports_both_as_skipped`. The second run on the fresh database skipped both and exited with 0. | Pass |
| AC-U3 | An existing user, even with a changed password, is left alone and reported | BE | `test_existing_user_with_a_changed_password_is_left_untouched` | Pass |
| AC-U4 | The README documents it as dev-only, with credentials and a production warning | README | README, "Users": the credentials table and "Development and review only. … Never run this command on a production database". Checked again against the README as submitted. | Pass |

## Notes

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-N1 | A reader sees only their own notes, newest first | BE, Browser | **BE:** `notes/test_authorization.py` `test_list_holds_only_the_readers_notes_on_the_book_newest_first`. **Browser:** on *A Study in Scarlet*, which holds notes by both readers, `alice` sees only her two, newest first. | Pass |
| AC-N2 | Blank bodies rejected, the length enforced, one note per double click | BE, FE, Browser | **BE:** `notes/test_api.py` `test_invalid_body_is_rejected`, `test_longest_body_is_accepted_after_trimming`, `test_surrounding_whitespace_is_trimmed_and_inner_line_breaks_kept`. **FE:** "Add note stays disabled for a blank note", "a second click while saving sends nothing". **Browser:** a whitespace-only body keeps Add note disabled; the field's `maxlength` is 5,000; the API refuses 5,001 characters with a field error; a double click on Add note created exactly one note, trimmed, with its line break kept. | Pass |
| AC-N3 | The page is optional, a whole number from 1 to 10,000, with a field error otherwise | BE, Browser, FE | **BE:** `test_invalid_page_is_rejected`, `test_valid_or_empty_page_is_accepted`, `test_edit_rejects_values_that_are_not_the_fields_json_type`, `test_page_with_thousands_of_digits_is_a_bad_request`. **FE:** "a page of %s shows the page error and sends nothing" (0, 1.5, abc, 10001), "a rejected page shows the server's message under the field and keeps the draft". **Browser:** 0, -1, 1.5, abc and 10001 each show "Enter a whole number from 1 to 10,000." under the field, with the text kept and nothing sent. | Pass |
| AC-N4 | Edit body and page in place, clear the page, Cancel discards, the update time shows | BE, Browser, FE | **BE:** `test_editing_with_a_null_page_clears_it`, `test_real_change_marks_the_note_edited`, `test_saving_the_same_values_does_not_mark_the_note_edited`. **FE:** "editing saves the new text and a cleared page, and stays on the page", "Cancel discards an edit's changes". **Browser:** Cancel discarded a new text and page; Save sent the new text with `page: null`, and the note shows "Edited" with its time. | Pass |
| AC-N5 | Delete only after confirming | Browser, FE | **Browser:** Delete opens "Delete this note? This can't be undone."; Cancel keeps the note and returns focus to its Delete button; Delete removes it. **FE:** "Cancel in the delete dialog keeps the note, and Delete removes it". | Pass |
| AC-N6 | Only one's own notes through the API; another reader's note is a 404 like a missing one | BE | `notes/test_authorization.py` `test_another_readers_note_looks_exactly_like_a_missing_one` (read, edit and delete), `test_count_and_pages_depend_only_on_the_readers_notes`, `test_nonexistent_note_is_not_found` | Pass |
| AC-N7 | The owner is the logged-in reader; a `user` field is ignored | BE | `test_owner_comes_from_the_session_and_book_from_the_url`, `test_editing_never_moves_a_note` | Pass |
| AC-N8 | A note for a book that doesn't exist is rejected | BE | `test_unknown_book_is_not_found_even_with_an_invalid_body` | Pass |
| AC-N9 | Changes update the section without a reload; failures say so and keep what was entered | FE, Browser | **FE:** "adding a note sends its body and page, clears the form and shows it first", "a failed save says so and keeps the draft", "a failed edit says so and keeps the changes", "a failed delete says so and leaves the note visible". **Browser:** a create, an edit and a delete each updated the section in place; a marker set on `window` before the delete was still there after it, so the page didn't reload. With each request failing with a 500: the create kept its text and page, the edit kept its changes, the delete left the note visible, each with an error. | Pass |
| AC-N10 | Visitors see "Log in to add notes", which returns to the book | Browser, FE | **Browser:** a visitor's book page ends with "Log in to add notes"; logging in from it returns to the book with the notes section. **FE:** "a visitor sees a login link, and logging in returns to the book with their notes". | Pass |
| AC-N11 | Note text is plain text; HTML is shown literally | Browser, FE | **Browser:** a note whose body is `<script>alert(1)</script><b>bold</b>` shows those characters, and the notes section contains no `script` or `b` element. **FE:** "a reader's notes show newest first, with page and times, as plain text". | Pass |
| AC-N12 | A save failing on expiry says so, offers login, keeps the text, doesn't redirect | FE, Browser | **FE:** `notes/notesSession.test.tsx` "a save refused with 401 keeps the draft, says the session expired, and logging in again discards it". **Browser:** after the session cookie was deleted, Add note showed "Your session has expired, and this note isn't saved. Copy anything you want to keep, then log in again." with "Log in again"; the text and page stayed, and the page was still the book 3 seconds later. The same after a logout in another tab. | Pass |
| AC-N13 | 20 per page, newest first, no repeats or gaps; the right page after each change | BE, FE | **BE:** `test_notes_created_at_the_same_instant_page_in_descending_id_order`, `test_page_out_of_range_is_not_found`. **FE:** "21 notes show 20 on page 1 and 1 on page 2", "a note added from page 2 shows on page 1, the only page fetched", "deleting the only note on the last page shows the page before it", "a page that no longer exists returns the section to page 1". **Browser (additional):** 21 notes showed 20 and 1; Next moved focus to "Your notes"; deleting the only note on page 2 showed page 1; a new note showed first on page 1. | Pass |

## Search, filters and sort

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-S1 | Search matches title and author, partial, ignoring case; every term must match | BE | `catalog/test_filters.py` `SearchTests` (7 tests, including literal `%`, `_` and quotes). Also seen in the browser: "tolkien hobbit" finds only *The Hobbit*. | Pass |
| AC-S2 | Author and genre filters combine with each other and with search; genres combine with OR | BE | `AuthorFilterTests`, `GenreFilterTests` (`test_several_genres_combine_with_or`), `CombinedFilterTests`; `catalog/test_has_notes.py` `test_combines_with_search_author_genres_and_sort` | Pass |
| AC-S3 | "Books with my notes": only the reader's noted books; hidden from visitors; a visitor's link loses it; the API refuses visitors | BE, FE | **BE:** `test_visitor_asking_for_noted_books_gets_401`, `test_each_reader_gets_only_the_books_they_noted`, `test_a_book_noted_several_times_appears_once`, `test_no_parameter_names_another_reader`. **FE:** "visitors don't see Books with my notes", "a visitor's has_notes link loses it and its page, and lists the public catalog", "a reader turning on Books with my notes lists their noted books from page 1". **Browser (additional):** a visitor's `?has_notes=true&genre=36&page=2` became `?genre=36` with no control and no `has_notes` request; the API answered such a request with 401. | Pass |
| AC-S4 | Sort by title, author surname or year, both ways, title A–Z by default; stable across pages | BE | `SortTests` `test_each_sort_ignores_case_and_breaks_ties_by_title_then_id`, `test_missing_or_empty_sort_is_by_title`; `SortTiesAcrossPagesTests`; `test_equal_titles_keep_id_order_across_pages`; `catalog/test_options.py` `test_first_ten_authors_with_books_by_sort_name` | Pass |
| AC-S5 | Refresh, back/forward and shared links restore the view; `has_notes` depends on the reader | BE, FE, Browser | **BE:** `test_each_reader_gets_only_the_books_they_noted`. **FE:** `books/listState.test.ts` "reading the URL" (46 cases); "the search box follows the URL on Back, without writing it again"; "genres in a link are read once each, and Back restores an unchecked one". **Browser:** a link with search, two genres, author sort and page 2 shows that view, and so does a refresh. The same `has_notes=true` URL lists *A Study in Scarlet* for `alice` and *A Study in Scarlet* and *A Christmas Carol* for `bob`. | Pass |
| AC-S6 | Changing search, filters or sort returns to page 1 | FE | "typing waits for a pause, then searches once from page 1, replacing the history entry"; "each genre chosen adds a history entry, in id order, from page 1"; "choosing a field keeps the direction, as a new history entry from page 1"; "the direction button flips the order from page 1…"; "the arrow keys and Enter choose an author, as a new history entry from page 1". Also seen in the browser from pages 2 and 3. | Pass |
| AC-S7 | No matches shows an empty state with "Clear all" | Browser, FE | **Browser:** "zzzqqq" shows "No books match your search and filters." with Clear all, which kept only the sort, emptied the search box and focused it. **FE:** "no match shows the empty state, and Clear all keeps only the sort and focuses the search box". | Pass |
| AC-S8 | Invalid or unknown parameters never cause a server error or expose another reader's data | BE, FE | **BE:** `InvalidParameterTests`, `test_invalid_or_unknown_author_is_rejected`, `test_invalid_or_unknown_genre_is_rejected`, `test_unknown_sort_is_rejected`, `test_invalid_page_size_is_rejected`, `test_invalid_values_are_rejected` (`has_notes`), `test_no_parameter_names_another_reader`; `config/tests.py` `ApiNotFoundTests`, `JsonParsingTests`. **FE:** `listState.test.ts` invalid pages and filters; "a malformed filter in the link shows invalid filters without a request". | Pass |
| AC-S9 | Typing waits for a pause before searching | FE | "typing waits for a pause, then searches once from page 1, replacing the history entry". Also seen in the browser: "tolkien hobbit" typed key by key sent one request. | Pass |
| AC-S10 | The author selector: suggestions after a pause, at most 10 by surname, its states, choosing and clearing, a link names the author | BE, FE, Browser | **BE:** `catalog/test_options.py` `AuthorSuggestionTests`, `AuthorDetailTests`. **FE:** `books/AuthorFilter.test.tsx` (8 tests). **Browser:** "e" sent one request after the pause and listed 10 authors in surname order (Angelou, Atwood, Austen, …); "Searching authors…", "No authors match." and "Authors couldn't be loaded." each showed; choosing George Orwell gave `?author=135` from page 1 and his four books; Clear author restored all 100 and focused the field; `?author=149` shows "H. G. Wells" without asking for suggestions. | Pass |

## Enhancements

| ID | Criterion | Method | Evidence | Result |
|---|---|---|---|---|
| AC-X1 | Per-reader note counts on the list | — | Not built (decided 2026-10-12). | Not built |
| AC-X2 | The author on a book's page opens the list filtered by that author | Browser, FE | Built and verified after the core was tagged (`v1.0-core`). **FE:** `App.test.tsx` "the author on a book's page opens the list of their books" (the URL and the list request carry `author=1`, and the author field shows the name); "a book opened directly shows every attribute…" checks the link's `href`. **Browser:** on *Animal Farm*, "George Orwell" links to `/?author=135`; following it lists his four books with his name in the author field, and Back returns to the book. The first Tab from the title reaches the link, which shows its focus ring. | Pass |

## User journeys

Each journey was walked end to end in the browser.

| Journey | Walked | Result |
|---|---|---|
| J1 Browse | A visitor on page 3 scrolls down, opens a book, and goes Back: the same page at the same scroll position, with focus on "Books". | Pass |
| J2 Find | Search, three genres, sort and direction, then paging; in another run, an author. The URL follows each change; a refresh and a shared link reproduce the view, and Back restores it. "zzzqqq" shows the empty state, and Clear all resets it. | Pass |
| J3 Log in | From "Log in to add notes" on a book, and from the header on a filtered list: each returns to where it started. A wrong password gets the generic error. | Pass |
| J4 Add a note | `alice` writes a note with page 42 and saves: it shows first, with its time and "p. 42", and the form clears. | Pass |
| J5 Edit a note | Edit, Cancel (the changes go), Edit again, new text and a cleared page, Save: the note shows "Edited" with its time. | Pass |
| J6 Delete a note | Delete, Cancel in the dialog (the note stays), Delete, confirm: it disappears. | Pass |
| J7 Revisit annotated books | `alice` turns on "Books with my notes": only *A Study in Scarlet*. Combined with a search for "doyle" it stays; with "christmas" the empty state shows. | Pass |
| J8 Log out | The notes section becomes "Log in to add notes", the control and `has_notes` go, an open draft is discarded, the old session cookie gets 401, and the catalog stays browsable. | Pass |
| J9 Authentication expires mid-task | With the session cookie deleted, saving a draft shows the expiry message and "Log in again", keeps the text, and stays on the book. | Pass |
| J10 Reviewer setup | On a fresh database: `migrate` loads 100 books, 50 authors and 12 genres; `create_demo_users` creates both readers, and a second run skips both and exits with 0. `alice` and `bob` then see separate notes on the same book. | Pass |

## Handled edge cases (spec §6)

| Edge case | Method | Evidence | Result |
|---|---|---|---|
| A note deleted in another tab, then edited or deleted here | FE, Browser | **FE:** "editing a note deleted elsewhere says so and refreshes the list", "deleting a note deleted elsewhere says so and refreshes the list". **Browser:** after a second tab deleted the note, both an edit and a delete here showed "That note no longer exists. It may have been deleted in another tab." and the list refreshed. | Pass |
| A logout, or another reader's login, in another tab | FE, Browser, Manual | **Browser:** a logout elsewhere is noticed on the next save (AC-A8 above). **Manual:** both cases noticed when the tab regains focus. | Pass |
| Authentication expires while writing or editing | FE, Browser | As J9. **FE:** "a re-check that finds nobody keeps an unsaved edit, and only that". | Pass |
| A visitor opens a `has_notes=true` link | FE, Browser | As AC-S3. | Pass |
| A reader with no notes turns on "Books with my notes" | FE, Browser | **FE:** "a reader with no notes who lists only noted books is told how to add one". **Browser:** a temporary reader with no notes sees "You haven't written notes on any book yet. Open a book to add one." | Pass |
| An administrator deletes a book that has notes | BE, Browser | **BE:** `notes/test_admin.py` `test_book_with_notes_cannot_be_deleted_and_the_page_lists_them`; `notes/test_models.py` `test_book_with_notes_cannot_be_deleted`. **Browser:** as a temporary superuser, deleting *A Study in Scarlet* shows "Cannot delete book", lists its four notes, and offers no confirm button. | Pass |

## Other core items

| Item | Method | Evidence | Result |
|---|---|---|---|
| Django admin for books and notes | BE, Browser | **BE:** `catalog/test_models.py` `test_superuser_can_search_the_catalog_changelists`; `notes/test_admin.py`. **Browser:** a superuser searched the books ("orwell") and the notes (by text), and was refused the delete above. | Pass |
| Loading, empty and error states | Browser, FE | **Browser:** the list and a book each show their loading state, then an error with Retry that recovers; the author selector shows its loading, no-match and error states; the list shows its empty state. **FE:** "a genre list that fails to load can be retried, and Escape closes it"; "no match and a failure each say so"; "a reader without notes on the book sees the empty state". | Pass |
| Every API error is JSON | BE, Browser | **BE:** `config/tests.py` `ApiNotFoundTests`, `ApiErrorHandlerTests`, `JsonParsingTests`. **Browser:** through `:5173`, `GET /api/books/abc/`, `GET /api/nope/`, `GET /api/books` (no slash) and a `DELETE /api/notes/abc/` with no CSRF token each get `{"detail": "Not found."}` with status 404. | Pass |
| Unexpected errors are caught and reported in one place | FE, Browser | **FE:** `components/ErrorBoundary.test.tsx`, `errorReporting.test.ts`, `api/queryClient.test.ts`. **Browser:** an unhandled promise rejection and an uncaught error, raised in the page, each reached `reportUnexpectedError` in the console. A render error can't be raised in the running app without changing code, so the tests cover the fallback. | Pass |
| Page titles and focus on navigation | FE, Browser | **FE:** `App.test.tsx` "each page is named in the document title", "opening a book moves focus to its title, and Back to books to the list's heading", "a filter change keeps focus on its control, and a page change moves it to the heading". **Browser:** each page has its own title ("Books", the book's title, "Loading book…", "Log in", "Book not found", "Page not found", "This page doesn't exist"); focus moves to the page's `<h1>` on opening a book, on Back and on Forward, without a focus ring and without undoing the scroll position. | Pass |
| Automated backend tests | BE | 157 tests pass; 99% of the application code is covered. | Pass |
| Visual design and usability | Manual | A pass by hand over the list, the filters, a book's page, notes and login, in a wide and a narrow window. | Pass (manual) |

## Limitations still outstanding

- **Accepted in the spec (§6):** the last save wins when one note is edited in two places; rolling back the seed migration deletes every note; drafts don't survive navigation or re-login; search and author suggestions don't ignore accents, and SQLite folds case for ASCII letters only; sorting doesn't skip leading articles; login attempts aren't rate-limited.
- **Production hardening** is out of scope (spec §3, architecture §10).
- **Manual only:** the AC-A8 cases noticed when a tab regains focus, because browser automation doesn't reliably raise the focus and visibility events they depend on; and the visual and usability pass, which needs a person's judgment.
- **Browser checks** are one-off observations in Chrome on Linux. The automated tests, run in CI, are the regression safety net.
