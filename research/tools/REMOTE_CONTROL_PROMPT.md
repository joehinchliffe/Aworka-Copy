# Prompt for the local (Remote Control) session with Claude in Chrome

Preconditions on your machine: this repo checked out on branch
`claude/hopeful-wozniak-ym0p1y`, Chrome running with the Claude in Chrome
extension connected, and a tab already logged in to https://aworka.app with the
throwaway test account. Start the session with `claude remote-control` in the
repo folder (or the Desktop app's Remote Control), then send the text below.

---

You are capturing the logged-in DESKTOP web application at https://aworka.app so
that another session can write a plan to replicate the product. Work in Claude in
Chrome (a new tab; I am already signed in to aworka.app). This is a throwaway test
account. Save everything you learn into this repo under `research/aworka/desktop/`
and push to branch `claude/hopeful-wozniak-ym0p1y`.

Rules
- You MAY create sample data so screens render properly: 3-4 customers (one
  invoiced by email, one paying on the day, one with a different job address),
  recurring jobs in two rounds with different frequencies, plan them on the
  planner, mark some done, record payments including a part payment, create at
  least one invoice, a few expenses in two categories, a vehicle with mileage.
- You MUST NOT: send any email or SMS to anyone, connect GoCardless, PayPal,
  QuickBooks, HMRC or an SMTP/Gmail/Outlook account, buy SMS credits, change the
  subscription or plan, delete the account, or anonymise/export data. Cancel
  out of any dialog that would do those things. Do not trigger browser
  alert/confirm dialogs; if a delete would show one, skip it.
- Never record the account password anywhere.

For every page, popup and print layout you can reach from the navigation (and
from buttons/links within pages), do all of the following:
1. Navigate to it (or open the popup). Read it with get_page_text / read_page.
2. Grab the DOM with the javascript tool
   (`document.documentElement.outerHTML`) and save it to
   `research/aworka/desktop/html/<area>__<page>.html` (write the file with a
   heredoc in Bash; for popups save the popup's outerHTML).
3. Write `research/aworka/desktop/<area>/<page>.md` containing: URL, what the
   page is for, layout (nav, sidebars, tabs, tables, filters, buttons), EVERY
   field/control with its label, type, options and defaults, every action
   button and what it does, validation messages you observe, keyboard/drag
   behaviours (e.g. dragging jobs on the planner), and what changes elsewhere
   after an action (balances, debts, next due dates). Be exhaustive; this
   document is the spec a developer will build from.
4. Record a short GIF of each interactive workflow with the gif tool
   (planner: add jobs to a day, mark done, add payment; customer: create;
   invoice: create and preview; expenses: add; reports: change period) into
   `research/aworka/desktop/gifs/`.

Cover at least these areas, each in its own folder: dashboard/home, planner
(day, week, month, print job sheet, add jobs, job popups, round organiser, route
map/optimise if present), customers (list, filters, details, edit, jobs, history,
tags), debts/statements, invoices (list, new, preview/print, email form,
payments), estimates/quotes if present, expenses (list, add, categories,
suppliers), mileage/vehicles, reports (overview, income forecast, VAT return,
tax calculation, yearly summary, exports), events/history, tasks, settings
(every tab: business details, invoicing, sales tax, defaults, users/roles,
rounds, SMS, email/SMTP, PayPal, GoCardless, QuickBooks, API tokens, data
retention, backup, MTD), plans/subscription (capture every plan name, price and
what each includes), help (every article; save each as markdown under
`research/aworka/desktop/help/`), and the customer portal if a link exists.

Finish by writing `research/aworka/desktop/INDEX.md` (one line per page with
its path, purpose and md/html filenames), committing with the message
"Capture logged-in aworka.app desktop app (pages, forms, help, workflows)" and
pushing: `git push -u origin claude/hopeful-wozniak-ym0p1y` (pull --rebase first
if rejected). Then notify the planning session by running:
`claude -p "Desktop capture pushed: <commit sha>. <two-line summary>" --cloud session_01SeukPgJVr9w5oN6x8z4kqm`
