# aworka.app desktop web app: site map (logged-in capture)

Captured 126 distinct live HTML pages (57 help pages, 12 probed paths returned 404) from `https://aworka.app` with the GET-only crawler in `research/tools/`. Raw HTML is in `html/`, the machine-readable index in `pages.json`, 1366px full-page screenshots in `screens/` (plus `screens/day_plans__1920.png` and `screens/day_plans__1920__help_open.png`, the planner at 1920px with the help panel closed and open).

Body tags carry no id; each page is identified instead by the Rails `controller#action` that its Help button requests (`/help/<controller>/<action>`).

## Subscription plans and prices (from /subscription/edit)

| Billing | Plan | Price | Notes |
|---|---|---|---|
| monthly | Simple | £15 inc VAT |  (button id `simple_monthly`) |
| monthly | Smart | £20 inc VAT |  (button id `smart_monthly`) |
| monthly | Team | From £30 including one employee + £15 per franchisee + £10 per employee ex VAT | current plan |
| yearly | Simple | Save 20% £150 inc VAT |  (button id `simple_yearly`) |
| yearly | Smart | Save 20% £200 inc VAT |  (button id `smart_yearly`) |
| yearly | Team | - | current plan |

- **Simple** features: Unlimited Customers & Jobs; Job Planning; Daily Job Sheets; Payments & Debts; Invoices, Statements, Estimates, Receipts; Expenses; Mobile App; Send Emails; Send SMS; Reports; Price Revisions; Anonymise Customers
- **Smart** features: Automatic Invoices; GoCardless Payments; PayPal Payments; Events and To Do List; Mass Messaging; Message Templates; Multi Job Editing; Advanced Job Filtering; Mapping; Address Lookup NEW; Mileage; Recurring Expenses; Track Sales Sources; Customer Retention Report NEW; Automatic Data Retention; MTD for Income Tax
- **Team** features: Multiple Users; Includes Additional User; User Roles; Route Optimisation; VAT; MTD for VAT; API Access; Quickbooks SOON

## Areas

| Area | Pages |
|---|---|
| dashboard | 2 |
| planner | 12 |
| customers | 13 |
| debts | 2 |
| invoices | 1 |
| expenses | 10 |
| reports | 5 |
| settings | 19 |
| plans | 1 |
| messages | 4 |
| help | 57 |

## Dashboard

### `/`

- controller#action `dashboard#index`; title `aworka`; body id none; status 200; html `html/root.html`, screenshot `screens/root.png`
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)

### `/dashboard`

- controller#action `dashboard#index`; title `aworka`; body id none; status 200; html `html/dashboard.html`, screenshot `screens/dashboard.png`
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)

## Planner

### `/day_plans`

- controller#action `day_plans#index`; title `aworka`; body id none; status 200; also reached by redirect from `/vehicles`; html `html/day_plans.html`, screenshot `screens/day_plans.png`
- headings: h1 "Planner for 27 Sep - 31 Oct", h2 "Optimsation already in progress", h3 "Route for Joe Hinchliffe"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- form `POST /day_plans`
  - `planner_filter[show_date]` select options: Oct 2024 [2024-10], Nov 2024 [2024-11], Dec 2024 [2024-12], Jan 2025 [2025-01], Feb 2025 [2025-02], Mar 2025 [2025-03], Apr 2025 [2025-04], May 2025 [2025-05], Jun 2025 [2025-06], Jul 2025 [2025-07], Aug 2025 [2025-08], Sep 2025 [2025-09], Oct 2025 [2025-10], Nov 2025 [2025-11], Dec 2025 [2025-12], January [2026-01], February [2026-02], March [2026-03], April [2026-04], May [2026-05], June [2026-06], July [2026-07], August [2026-08], September [2026-09], Near Today [today], October [2026-10], November [2026-11], December [2026-12], Jan 2027 [2027-01], Feb 2027 [2027-02], Mar 2027 [2027-03], Apr 2027 [2027-04], May 2027 [2027-05], Jun 2027 [2027-06], Jul 2027 [2027-07], Aug 2027 [2027-08], Sep 2027 [2027-09], Oct 2027 [2027-10]
  - `planner_filter[planner_user]` select options: Job Address/Ref, Customer
  - `planner_filter[planner_highlight]` select options: s [s], Early/Late, Debts, Tasks, Rounds, Round Assignee [u], Frequency, Payment Methods, Job Notes
  - `planner_filter[search]` search
  - `planner_filter[round]` select
  - `route_start_source` select "Start"
  - `route_finish_source` select "Finish"
  - `dropped_point` select

### `/events`

- controller#action `events#index`; title `aworka`; body id none; status 200; html `html/events.html`, screenshot `screens/events.png`
- headings: h2 "There are no matching events"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/events/new` New Event (popup), `/events` Reset
- form `POST /events/filter` id `filter_form`
  - `filter[category]` select options: All, To Do [to_do], Done [done_to_do], Events
  - `filter[subcategory]` select
  - `filter[num_periods]` select options: 31 numeric (1 … 31)
  - `filter[period]` select options: Years, Months, Weeks, Days
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `commit` submit value `Refresh`

### `/holiday_types`

- controller#action `holiday_types#index`; title `aworka`; body id none; status 200; html `html/holiday_types.html`, screenshot `screens/holiday_types.png`
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/holiday_types/new` New Reason (popup), `/holidays` Back

### `/holidays`

- controller#action `holidays#index`; title `aworka`; body id none; status 200; html `html/holidays.html`, screenshot `screens/holidays.png`
- headings: h2 "There are no matching periods of Time Off"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/holidays/new` New Time Off (popup), `/holiday_types` Reasons, `/holidays` Reset
- form `POST /holidays/filter` id `new_filter` class `formtastic filter`
  - `filter[num_periods]` select options: 52 numeric (1 … 52)
  - `filter[period]` select options: Days, Weeks, Months, Years
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `commit` submit value `Refresh`

### `/job_sheets`

- controller#action `job_sheets#index`; title `aworka`; body id none; status 200; html `html/job_sheets.html`, screenshot `screens/job_sheets.png`
- headings: h2 "Loading Job Sheet for Joe Hinchliffe Today..."
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/users/8065/job_sheets/email/1/starting/2026-10-20/all_jobs` Send to Me..., `/job_sheets` Reset
- form `POST /job_sheets/filter` id `new_filter` class `formtastic filter`
  - `filter[status]` select options: All Jobs [all_jobs], Jobs To Do [jobs_to_do], Jobs To Be Confirmed [jobs_to_be_confirmed], Jobs Done [jobs_done], Jobs Done Requiring Payment [jobs_done_requiring_payment], Jobs To Invoice [jobs_to_invoice], Jobs Skipped [jobs_skipped], Cash Customers In Debt [cash_customers_in_debt], Customers Not Prepaid [customers_not_prepaid]
  - `filter[num_days]` select options: 52 numeric (1 Day … 52 Days)
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `refresh` submit value `Refresh`

### `/job_sheets?date=2026-10-20&user_id=8065`

- controller#action `job_sheets#index`; title `aworka`; body id none; status 200; html `html/job_sheets__eb8cd254.html`, screenshot `screens/job_sheets__eb8cd254.png`
- headings: h2 "Loading Job Sheet for Joe Hinchliffe Today..."
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/users/8065/job_sheets/email/1/starting/2026-10-20/all_jobs` Send to Me..., `/job_sheets` Reset
- form `POST /job_sheets/filter` id `new_filter` class `formtastic filter`
  - `filter[status]` select options: All Jobs [all_jobs], Jobs To Do [jobs_to_do], Jobs To Be Confirmed [jobs_to_be_confirmed], Jobs Done [jobs_done], Jobs Done Requiring Payment [jobs_done_requiring_payment], Jobs To Invoice [jobs_to_invoice], Jobs Skipped [jobs_skipped], Cash Customers In Debt [cash_customers_in_debt], Customers Not Prepaid [customers_not_prepaid]
  - `filter[num_days]` select options: 52 numeric (1 Day … 52 Days)
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `refresh` submit value `Refresh`

### `/events/new`

- controller#action `events#new`; title `aworka`; body id none; status 200; html `html/events__new.html`, screenshot `screens/events__new.png`
- headings: h3 "New Event"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/back` Back
- form `POST /events` id `new_event` class `formtastic event`
  - `event[linked_to]` hidden
  - `event[linked_id]` hidden
  - `event[event_type]` select "Type" options: Event, To Do
  - `event[user_id]` hidden value `8065`
  - `event[start_date]` datepicker "When"
  - `event[start_hours_mins]` text "at"
  - `event[summary]` text "Summary"
  - `event[details]` textarea "Details"
  - `save` submit value `Save`

### `/holiday_types/new`

- controller#action `holiday_types#new`; title `aworka`; body id none; status 200; html `html/holiday_types__new.html`, screenshot `screens/holiday_types__new.png`
- headings: h3 "New Reason"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/back` Back
- form `POST /holiday_types` id `new_holiday_type` class `formtastic holiday_type`
  - `holiday_type[enabled]` hidden value `0`
  - `holiday_type[enabled]` checkbox "Enabled"
  - `holiday_type[name]` text "Name"
  - `commit` submit value `Save`
  - `delete` submit value `Delete`

### `/holidays/new`

- controller#action `holidays#new`; title `aworka`; body id none; status 200; html `html/holidays__new.html`, screenshot `screens/holidays__new.png`
- headings: h3 "New Time Off"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/back` Back
- form `POST /holidays` id `new_holiday` class `formtastic holiday`
  - `holiday[start_date]` datepicker "From"
  - `holiday[end_date]` datepicker "To"
  - `holiday[new_holiday_type]` text "Reason"
  - `holiday[notes]` textarea "Notes"
  - `save` submit value `Save`

### `/planner/month/2026-10-01`

- controller#action `day_plans#index`; title `aworka`; body id none; status 200; html `html/planner__month__2026-10-01.html`, screenshot `screens/planner__month__2026-10-01.png`
- headings: h1 "Planner for 27 Sep - 31 Oct", h2 "Optimsation already in progress", h3 "Route for Joe Hinchliffe"
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- form `POST /planner/month/2026-10-01`
  - `planner_filter[show_date]` select options: Oct 2024 [2024-10], Nov 2024 [2024-11], Dec 2024 [2024-12], Jan 2025 [2025-01], Feb 2025 [2025-02], Mar 2025 [2025-03], Apr 2025 [2025-04], May 2025 [2025-05], Jun 2025 [2025-06], Jul 2025 [2025-07], Aug 2025 [2025-08], Sep 2025 [2025-09], Oct 2025 [2025-10], Nov 2025 [2025-11], Dec 2025 [2025-12], January [2026-01], February [2026-02], March [2026-03], April [2026-04], May [2026-05], June [2026-06], July [2026-07], August [2026-08], September [2026-09], Near Today [today], October [2026-10], November [2026-11], December [2026-12], Jan 2027 [2027-01], Feb 2027 [2027-02], Mar 2027 [2027-03], Apr 2027 [2027-04], May 2027 [2027-05], Jun 2027 [2027-06], Jul 2027 [2027-07], Aug 2027 [2027-08], Sep 2027 [2027-09], Oct 2027 [2027-10]
  - `planner_filter[planner_user]` select options: Job Address/Ref, Customer
  - `planner_filter[planner_highlight]` select options: s [s], Early/Late, Debts, Tasks, Rounds, Round Assignee [u], Frequency, Payment Methods, Job Notes
  - `planner_filter[search]` search
  - `planner_filter[round]` select
  - `route_start_source` select "Start"
  - `route_finish_source` select "Finish"
  - `dropped_point` select

### `/planner/week/2026-10-20`

- title none (fragment); body id none; status 200; html `html/planner__week__2026-10-20.html`, screenshot `screens/planner__week__2026-10-20.png`

### `/users/8065/job_sheets/1/starting/2026-10-20/all_jobs`

- controller#action `job_sheets#index`; title `aworka`; body id none; status 200; also reached by redirect from `/day_plans/2026-10-20`, `/users/8065/job_sheets/dated/2026-10-20/all_jobs/job_sheet`; html `html/users__8065__job_sheets__1__starting__2026-10-20__all_jobs.html`, screenshot `screens/users__8065__job_sheets__1__starting__2026-10-20__all_jobs.png`
- headings: h2 "Loading Job Sheet for Joe Hinchliffe Today..."
- sub-navigation: [Planner](/day_plans), [Job Sheets](/job_sheets?date=2026-10-20&user_id=8065), [Events](/events), [Time Off](/holidays)
- links: `/users/8065/job_sheets/email/1/starting/2026-10-20/all_jobs` Send to Me..., `/job_sheets` Reset
- form `POST /job_sheets/filter` id `new_filter` class `formtastic filter`
  - `filter[status]` select options: All Jobs [all_jobs], Jobs To Do [jobs_to_do], Jobs To Be Confirmed [jobs_to_be_confirmed], Jobs Done [jobs_done], Jobs Done Requiring Payment [jobs_done_requiring_payment], Jobs To Invoice [jobs_to_invoice], Jobs Skipped [jobs_skipped], Cash Customers In Debt [cash_customers_in_debt], Customers Not Prepaid [customers_not_prepaid]
  - `filter[num_days]` select options: 52 numeric (1 Day … 52 Days)
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `refresh` submit value `Refresh`

## Customers

### `/job_specs`

- controller#action `job_specs#index`; title `aworka`; body id none; status 200; also reached by redirect from `/customers`; html `html/job_specs.html`, screenshot `screens/job_specs.png`
- headings: h2 "There are no customers or jobs", h3 "Would you like to import your jobs and customers?"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/job_specs/new` New Customer, `/questions/new` Contact Us

### `/price_revisions`

- controller#action `price_revisions#index`; title `aworka`; body id none; status 200; html `html/price_revisions.html`, screenshot `screens/price_revisions.png`
- headings: h2 "There are no price revisions"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/price_revisions/new` New Price Revision (popup)

### `/round_assignments`

- controller#action `round_assignments#index`; title `aworka`; body id none; status 200; html `html/round_assignments.html`, screenshot `screens/round_assignments.png`
- headings: h2 "There are no rounds to assign"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)

### `/round_ordering`

- controller#action `round_orderings#show`; title `aworka`; body id none; status 200; html `html/round_ordering.html`, screenshot `screens/round_ordering.png`
- headings: h3 "Change Round Order"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/back` Back
- form `POST /round_ordering`
  - `round[id_1]` select options: Choose Round...
  - `round[search_1]` text placeholder "Filter..."
- form `POST /round_ordering`
  - `round[id_2]` select options: Choose Round...
  - `round[search_2]` text placeholder "Filter..."
- form `POST /round_ordering`
  - `round[id_3]` select options: Choose Round...
  - `round[search_3]` text placeholder "Filter..."
- form `POST /round_ordering` id `order_round_form` class `formtastic round_order`
  - `save` submit value `Save`

### `/rounds`

- controller#action `rounds#index`; title `aworka`; body id none; status 200; html `html/rounds.html`, screenshot `screens/rounds.png`
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/rounds/new` New Round (popup), `/round_ordering` Change Round Order

### `/sales_sources`

- controller#action `sales_sources#index`; title `aworka`; body id none; status 200; html `html/sales_sources.html`, screenshot `screens/sales_sources.png`
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/sales_sources/new` New Sales Source (popup)

### `/tasks`

- controller#action `tasks#index`; title `aworka`; body id none; status 200; html `html/tasks.html`, screenshot `screens/tasks.png`
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/tasks/new` New Task (popup)

### `/job_specs/new`

- controller#action `customers#new`; title `aworka`; body id none; status 200; html `html/job_specs__new.html`, screenshot `screens/job_specs__new.png`
- headings: h3 "New Customer", h2 "Edit Location", h3 "New Job", h2 "Edit Location", h3 "Planner"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/back` Back
- form `POST /job_specs` id `new_job_spec` class `formtastic job_spec`
  - `job_spec[customer_attributes][contact_attributes][title]` text "Name" placeholder "Title"
  - `job_spec[customer_attributes][contact_attributes][first_names]` text placeholder "First Name(s)"
  - `job_spec[customer_attributes][contact_attributes][last_name]` text placeholder "Last Name"
  - `job_spec[customer_attributes][contact_attributes][company]` text "Company"
  - `job_spec[customer_attributes][contact_attributes][multiline_address]` textarea "Address"
  - `job_spec[customer_attributes][contact_attributes][selected_geocoding_id]` hidden
  - `job_spec[customer_attributes][contact_attributes][lat_lng_source]` hidden
  - `job_spec[customer_attributes][contact_attributes][lat]` text "Lat/Long"
  - `job_spec[customer_attributes][contact_attributes][lng]` text
  - `job_spec[customer_attributes][contact_attributes][phone1]` tel "Phone"
  - `job_spec[customer_attributes][contact_attributes][phone2]` tel
  - `job_spec[customer_attributes][contact_attributes][phone3]` tel
  - `job_spec[customer_attributes][contact_attributes][email]` text "Email"
  - `job_spec[customer_attributes][contact_attributes][email_cc]` text "Email Cc"
  - `job_spec[customer_attributes][reference]` text "Reference"
  - `job_spec[customer_attributes][auto_reference]` hidden value `0`
  - `job_spec[customer_attributes][auto_reference]` checkbox "Auto?"
  - `job_spec[customer_attributes][invoice_number]` text "Next Invoice Ref"
  - `job_spec[customer_attributes][contact_method]` select "Contact Method" options: None, Email, SMS, Email & SMS [b]
  - `job_spec[customer_attributes][accepts_marketing]` hidden value `0`
  - `job_spec[customer_attributes][accepts_marketing]` checkbox "Accepts Marketing?"
  - `job_spec[customer_attributes][payment_method]` select "Payment" options: On Day [c], Card [x], Collection [l], By Post [q], Online, Direct to Bank [t], Email Invoice, Paper Invoice, Direct Debit
  - `job_spec[customer_attributes][payment_frequency]` select options: Manually [x], After Each Job, Overnight, Periodically [r], When Invoice Value [v], When Jobs Done [j], Before Each Job
  - `job_spec[customer_attributes][num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `job_spec[customer_attributes][period_unit]` select options: Days, Weeks, Months
  - `job_spec[customer_attributes][direct_debit]` text
  - `job_spec[customer_attributes][next_invoice_or_dd_date_month_day]` select options: 31 numeric (1st … Last Day)
  - `job_spec[customer_attributes][next_invoice_or_dd_date(3i)]` select options: 31 numeric (1 … 31)
  - `job_spec[customer_attributes][next_invoice_or_dd_date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `job_spec[customer_attributes][next_invoice_or_dd_date(1i)]` select options: 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031
  - `job_spec[customer_attributes][invoice_jobs_threshold]` text value `2`
  - `job_spec[customer_attributes][invoice_value_threshold]` text
  - `job_spec[customer_attributes][invoice_max_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `job_spec[customer_attributes][invoice_max_period_unit]` select options: Days, Weeks, Months
  - `job_spec[customer_attributes][show_balance_on_invoices]` select "Invoice Amount to Pay" options: From Settings, Invoice Total [t], Invoiced Balance, Credit Balance [p]
  - `job_spec[customer_attributes][invoice_payment_terms_type]` select "Invoice Terms" options: From Settings, Not Required [x], By Return [r], COD, From Invoice Date [n], From Month End [e]
  - `job_spec[customer_attributes][invoice_payment_terms]` text value `0`
  - `job_spec[customer_attributes][notes]` textarea "Notes"
  - `job_spec[customer_attributes][starting_balance]` text "Starting Balance" value `0.00`
  - `job_spec[customer_attributes][starting_balance_date]` datepicker
  - `job_spec[estimate]` hidden value `0`
  - `job_spec[estimate]` checkbox "Estimate?"
  - `job_spec[location]` select "Location" options: Customer Address, Other Address, Not Applicable
  - `job_spec[location_edited]` hidden value `false`
  - `job_spec[job_contact_attributes][title]` text "Name" placeholder "Title"
  - `job_spec[job_contact_attributes][first_names]` text placeholder "First Name(s)"
  - `job_spec[job_contact_attributes][last_name]` text placeholder "Last Name"
  - `job_spec[job_contact_attributes][company]` text "Company"
  - `job_spec[job_contact_attributes][multiline_address]` textarea "Address"
  - `job_spec[job_contact_attributes][selected_geocoding_id]` hidden
  - `job_spec[job_contact_attributes][lat_lng_source]` hidden
  - `job_spec[job_contact_attributes][lat]` text "Lat/Long"
  - `job_spec[job_contact_attributes][lng]` text
  - `job_spec[job_contact_attributes][phone1]` tel "Phone"
  - `job_spec[job_contact_attributes][phone2]` tel
  - `job_spec[job_contact_attributes][phone3]` tel
  - `job_spec[job_contact_attributes][email]` text "Email"
  - `job_spec[job_contact_attributes][email_cc]` text "Email Cc"
  - `job_spec[reference]` text "Reference"
  - `job_spec[round_id]` select "Round" options: , New Round... [-1]
  - `job_spec[new_round]` text
  - `job_spec[new_round_user]` hidden value `8065`
  - `job_spec[allowed_rounds]` hidden
  - `job_spec[round_index]` select "Do after" options: Loading...
  - `job_spec[description]` textarea "Description"
  - `job_spec[time_required][hours]` text "Time Required" value `0`
  - `job_spec[time_required][minutes]` text value `30`
  - `job_spec[price][price]` text "Price" value `0.00`
  - `job_spec[notes]` textarea "Notes"
  - `job_spec[regularity]` select "Job frequency" options: One Off, On Request [c], Regularly
  - `job_spec[times_per_period]` select options: Once [1], Twice [2], Three Times [3], Four Times [4], Five Times [5], Six Times [6], Seven Times [7]
  - `job_spec[num_periods]` select options: 52 numeric (1 … 52)
  - `job_spec[period_unit_without_week]` select options: Days, Weeks, Months, Years
  - `job_spec[month_week_or_day]` select options: current
  - `all_allowed_days` checkbox
  - `job_spec[allowed_days][sun]` hidden value `0`
  - `job_spec[allowed_days][sun]` checkbox
  - `job_spec[allowed_days][mon]` hidden value `0`
  - `job_spec[allowed_days][mon]` checkbox
  - `job_spec[allowed_days][tue]` hidden value `0`
  - `job_spec[allowed_days][tue]` checkbox
  - `job_spec[allowed_days][wed]` hidden value `0`
  - `job_spec[allowed_days][wed]` checkbox
  - `job_spec[allowed_days][thu]` hidden value `0`
  - `job_spec[allowed_days][thu]` checkbox
  - `job_spec[allowed_days][fri]` hidden value `0`
  - `job_spec[allowed_days][fri]` checkbox
  - `job_spec[allowed_days][sat]` hidden value `0`
  - `job_spec[allowed_days][sat]` checkbox
  - `job_spec[appointments]` select "Appointments" options: No Need To Confirm, Confirm The Day Before [1], Confirm A Few Days Before [3]
  - `job_spec[plan_next]` select "Plan first job" options: No, On
  - `job_spec[plan_next_date]` datepicker
  - `job_spec[plan_next_user]` hidden value `-1`
  - `edit` submit value `Save`

### `/maps/job_locations`

- controller#action `job_locations#index`; title `aworka`; body id none; status 200; html `html/maps__job_locations.html`, screenshot `screens/maps__job_locations.png`
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)

### `/price_revisions/new`

- controller#action `price_revisions#new`; title `aworka`; body id none; status 200; html `html/price_revisions__new.html`, screenshot `screens/price_revisions__new.png`
- headings: h3 "New Price Revision"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/back` Back/Cancel
- form `POST /price_revisions` id `new_price_revision` class `formtastic price_revision`
  - `price_revision[round_id]` select "Apply to jobs in" options: All Rounds [all-rounds], All Joe Hinchliffe Rounds [my-rounds], 
  - `price_revision[prices_in_range]` select "where current price is" options: Any Amount [false], Between [true]
  - `price_revision[price_range_min]` text
  - `price_revision[price_range_max]` text "and"
  - `price_revision[price_age]` select "and was last changed" options: Any Time [any_time], At Least [at_least_period], On or Before [before_date]
  - `price_revision[num_periods]` select options: 53 numeric (Any Date … 52)
  - `price_revision[period_unit]` select options: Day(s), Week(s), Month(s), Year(s)
  - `price_revision[prices_on_or_before]` datepicker
  - `price_revision[revision_type]` select "Change prices by" options: Percentage, Fixed Amount [fixed_amount]
  - `price_revision[percentage_change]` text value `0%`
  - `price_revision[fixed_change]` text "£" value `£0.00`
  - `price_revision[price_rounding]` text "and round to nearest" value `0.50`
  - `price_revision[minimum_change]` text "Keep old price unless changed by" value `1.00`
  - `commit` submit value `Save`

### `/rounds/new`

- controller#action `rounds#new`; title `aworka`; body id none; status 200; html `html/rounds__new.html`, screenshot `screens/rounds__new.png`
- headings: h3 "New Round"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/back` Back
- form `POST /rounds` id `new_round` class `formtastic round`
  - `round[name]` text "Name"
  - `round[other_income]` hidden value `0`
  - `round[other_income]` checkbox "Other Income?"
  - `save` submit value `Save`

### `/sales_sources/new`

- controller#action `sales_sources#new`; title `aworka`; body id none; status 200; html `html/sales_sources__new.html`, screenshot `screens/sales_sources__new.png`
- headings: h3 "New Sales Source"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/back` Back
- form `POST /sales_sources` id `new_sales_source` class `formtastic sales_source`
  - `sales_source[sales_source_type_attributes][name]` text "Source of Sale"
  - `sales_source[reference]` text "Reference"
  - `sales_source[notes]` textarea "Notes"
  - `save` submit value `Save`

### `/tasks/new`

- controller#action `tasks#new`; title `aworka`; body id none; status 200; html `html/tasks__new.html`, screenshot `screens/tasks__new.png`
- headings: h3 "New Task"
- sub-navigation: [Jobs](/job_specs), [Map](/maps/job_locations), [Rounds](/rounds), [Tasks](/tasks), [Prices](/price_revisions), [Sales Sources](/sales_sources)
- links: `/back` Back
- form `POST /tasks` id `new_task` class `formtastic task`
  - `task[name]` text "Name"
  - `task[description_enabled]` hidden value `0`
  - `task[description_enabled]` checkbox "Invoice Description"
  - `task[description]` text
  - `task[time_required_enabled]` hidden value `0`
  - `task[time_required_enabled]` checkbox "Time Required"
  - `task[time_required][hours]` text value `0`
  - `task[time_required][minutes]` text value `0`
  - `task[price_enabled]` hidden value `0`
  - `task[price_enabled]` checkbox "Price"
  - `task[price][price]` text
  - `commit` submit value `Save`

## Debts

### `/aged_debts`

- controller#action `aged_debts#index`; title `aworka`; body id none; status 200; also reached by redirect from `/aged_debts/reset_filter`; html `html/aged_debts.html`, screenshot `screens/aged_debts.png`
- sub-navigation: [Current Debts](/debts), [Aged Debts](/aged_debts)
- links: `/aged_debts/reset_filter` Reset
- form `POST /aged_debts/filter` id `filter_form`
  - `filter[category]` hidden value `aged_debts`
  - `filter[subcategory]` select options: Debts & Credits [debts-and-credits], Debts, Credits
  - `filter[sort_order]` select options: Debt Since [debt-since], Balance
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `commit` submit value `Refresh`

### `/debts`

- controller#action `debts#index`; title `aworka`; body id none; status 200; also reached by redirect from `/debts/reset_filter`; html `html/debts.html`, screenshot `screens/debts.png`
- sub-navigation: [Current Debts](/debts), [Aged Debts](/aged_debts)
- links: `/debts/reset_filter` Reset
- form `POST /multiple_statements` class `formtastic issue_statements`
  - `issue_statements[customer_ids]` hidden value `[]`
  - `commit` submit value `Issue Statements...`
- form `POST /debts/filter` id `filter_form`
  - `filter[category]` select options: All [any-method], On Day [on_day], Card, Collection, By Post [by_post], Online, Direct To Bank [direct_to_bank], Email Invoice [email_invoice], Paper Invoice [paper_invoice], Direct Debit [direct_debit]
  - `filter[subcategory]` select options: Debts & Credits [debts-and-credits], Debts, Credits, Invoiced Debts [invoiced-debts], Active Customer Debts [active-customer-debts], Zero Balances [zero-balances]
  - `filter[sort_order]` select options: Debt Since [debt-since], Balance, Round Order [round-order]
  - `filter[containing]` text
  - `filter[round]` select options: All Rounds [all-rounds], All Joe Hinchliffe Rounds [my-rounds], 
  - `filter[round_day]` hidden value `all-days`
  - `commit` submit value `Refresh`

## Invoices

### `/invoices`

- controller#action `invoices#index`; title `aworka`; body id none; status 200; html `html/invoices.html`, screenshot `screens/invoices.png`
- sub-navigation: [Current Debts](/debts), [Aged Debts](/aged_debts)
- links: `/print/invoices` Print...

## Expenses

### `/expense_categories`

- controller#action `expense_categories#index`; title `aworka`; body id none; status 200; html `html/expense_categories.html`, screenshot `screens/expense_categories.png`
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/expense_categories/new` New Category (popup), `/expense_suppliers` Suppliers, `/expenses` Back

### `/expense_suppliers`

- controller#action `expense_suppliers#index`; title `aworka`; body id none; status 200; html `html/expense_suppliers.html`, screenshot `screens/expense_suppliers.png`
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/expense_suppliers/new` New Supplier (popup), `/expense_categories` Categories, `/expenses` Back

### `/expenses`

- controller#action `expenses#index`; title `aworka`; body id none; status 200; html `html/expenses.html`, screenshot `screens/expenses.png`
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/expenses/new` New Expense (popup), `/expense_categories` Categories & Suppliers, `/expenses` Reset
- form `POST /expenses/filter` id `filter_form`
  - `filter[category]` select options: All Categories/Suppliers [all-categories], , All with Amount Not Set [amount-not-set]
  - `filter[subcategory]` select options: Any Method [any-method], Cash, Cheque, Card, Direct Debit [direct_debit], Standing Order [standing_order], Online, Bank Transfer [bank_transfer], PayPal, Recurring Card [recurring_card]
  - `filter[num_periods]` select options: 31 numeric (1 … 31)
  - `filter[period]` select options: Years, Months, Weeks, Days
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `commit` submit value `Refresh`

### `/mileages`

- controller#action `mileages#index`; title `aworka`; body id none; status 200; html `html/mileages.html`, screenshot `screens/mileages.png`
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/vehicles/new` New Vehicle (popup)

### `/recurring_expenses`

- controller#action `recurring_expenses#index`; title `aworka`; body id none; status 200; also reached by redirect from `/back`; html `html/recurring_expenses.html`, screenshot `screens/recurring_expenses.png`
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/recurring_expenses/new` New Recurring Expense (popup), `/recurring_expenses` Reset
- form `POST /recurring_expenses/filter` id `filter_form`
  - `filter[category]` select options: All Categories/Suppliers [all-categories], , All with Amount Not Set [amount-not-set]
  - `filter[subcategory]` select options: Any Method [any-method], Cash, Cheque, Card, Direct Debit [direct_debit], Standing Order [standing_order], Online, Bank Transfer [bank_transfer], PayPal, Recurring Card [recurring_card]
  - `commit` submit value `Refresh`

### `/expense_categories/new`

- controller#action `expense_categories#new`; title `aworka`; body id none; status 200; html `html/expense_categories__new.html`, screenshot `screens/expense_categories__new.png`
- headings: h3 "New Category"
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/back` Back
- form `POST /expense_categories` id `new_expense_category` class `formtastic expense_category`
  - `expense_category[enabled]` hidden value `0`
  - `expense_category[enabled]` checkbox "Enabled"
  - `expense_category[name]` text "Name"
  - `expense_category[capital_asset]` hidden value `0`
  - `expense_category[capital_asset]` checkbox "Capital Assets?"
  - `commit` submit value `Save`
  - `delete` submit value `Delete`

### `/expense_suppliers/new`

- controller#action `expense_suppliers#new`; title `aworka`; body id none; status 200; html `html/expense_suppliers__new.html`, screenshot `screens/expense_suppliers__new.png`
- headings: h3 "New Supplier"
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/back` Back
- form `POST /expense_suppliers` id `new_expense_supplier` class `formtastic expense_supplier`
  - `expense_supplier[enabled]` hidden value `0`
  - `expense_supplier[enabled]` checkbox "Enabled"
  - `expense_supplier[name]` text "Name"
  - `expense_supplier[from_other_ec_state]` hidden value `0`
  - `expense_supplier[from_other_ec_state]` checkbox "From other EC Member State?"
  - `commit` submit value `Save`
  - `delete` submit value `Delete`

### `/expenses/new`

- controller#action `expenses#new`; title `aworka`; body id none; status 200; html `html/expenses__new.html`, screenshot `screens/expenses__new.png`
- headings: h3 "New Expense"
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/back` Back
- form `POST /expenses` id `expense_editor` class `formtastic expense_expense`
  - `expense_expense[date]` datepicker "Date"
  - `expense_expense[new_category]` text "Category"
  - `expense_expense[supplier_id]` select "Supplier" options: 0 [0], New Supplier... [-1]
  - `expense_expense[new_supplier]` text
  - `expense_expense[reference]` text "Reference"
  - `expense_expense[description]` textarea "Description"
  - `expense_expense[amount]` text "Amount" placeholder "Add Later"
  - `expense_expense[sales_tax_status_expense]` select options: inc VAT at rate [inc_tax_at_rate], inc VAT charged [inc_tax_charged], Zero Rated [zero_rate], Exempt, Out of Scope [out_of_scope]
  - `expense_expense[sales_tax_rate]` text value `20%`
  - `expense_expense[sales_tax_charged]` text value `0.00`
  - `expense_expense[payment_method]` select "Paid By" options: , Cash, Cheque [q], Card [x], Direct Debit, Standing Order, Online, Bank Transfer [t], PayPal, Recurring Card
  - `expense_expense[payment_reference]` text "Pay Ref"
  - `expense_expense[tax_treatment]` select "Tax Treatment" options: All Business Use [business_use], Some Private Use [private_use_percentage], Other [custom]
  - `expense_expense[private_use_percentage]` text
  - `expense_expense[allowable_for_income_tax]` text "Allowable For Income Tax" placeholder "None"
  - `expense_expense[reclaimable_sales_tax]` text "Reclaimable VAT" placeholder "None"
  - `expense_expense[tax_notes]` textarea "Tax Notes"
  - `save` submit value `Save`

### `/recurring_expenses/new`

- controller#action `recurring_expenses#new`; title `aworka`; body id none; status 200; html `html/recurring_expenses__new.html`, screenshot `screens/recurring_expenses__new.png`
- headings: h3 "New Recurring Expense"
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/back` Back
- form `POST /recurring_expenses` id `expense_editor` class `formtastic expense_recurring`
  - `expense_recurring[new_category]` text "Category"
  - `expense_recurring[supplier_id]` select "Supplier" options: 0 [0], New Supplier... [-1]
  - `expense_recurring[new_supplier]` text
  - `expense_recurring[reference]` text "Reference"
  - `expense_recurring[description]` textarea "Description"
  - `expense_recurring[amount]` text "Amount" placeholder "Add Later"
  - `expense_recurring[sales_tax_status_expense]` select options: inc VAT at rate [inc_tax_at_rate], inc VAT charged [inc_tax_charged], Zero Rated [zero_rate], Exempt, Out of Scope [out_of_scope]
  - `expense_recurring[sales_tax_rate]` text value `20%`
  - `expense_recurring[sales_tax_charged]` text value `0.00`
  - `expense_recurring[payment_method]` select "Paid By" options: , Cash, Cheque [q], Card [x], Direct Debit, Standing Order, Online, Bank Transfer [t], PayPal, Recurring Card
  - `expense_recurring[payment_reference]` text "Pay Ref"
  - `expense_recurring[tax_treatment]` select "Tax Treatment" options: All Business Use [business_use], Some Private Use [private_use_percentage], Other [custom]
  - `expense_recurring[private_use_percentage]` text
  - `expense_recurring[allowable_for_income_tax]` text "Allowable For Income Tax" placeholder "None"
  - `expense_recurring[reclaimable_sales_tax]` text "Reclaimable VAT" placeholder "None"
  - `expense_recurring[tax_notes]` textarea "Tax Notes"
  - `expense_recurring[num_periods]` select "Every" options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `expense_recurring[period_unit]` select options: Days, Weeks, Months, Years
  - `expense_recurring[date]` datepicker
  - `expense_recurring[schedule]` select "Continue" options: Forever [on_going], until number of expenses is [fixed], until next due date is after [end_date], until total amount reaches [total]
  - `expense_recurring[end_date]` datepicker
  - `expense_recurring[num_payments]` text
  - `expense_recurring[total_to_pay]` text
  - `save` submit value `Save`

### `/vehicles/new`

- controller#action `vehicles#new`; title `aworka`; body id none; status 200; html `html/vehicles__new.html`, screenshot `screens/vehicles__new.png`
- headings: h3 "New Vehicle"
- sub-navigation: [Expenses](/expenses), [Recurring Expenses](/recurring_expenses)
- links: `/back` Back
- form `POST /vehicles` id `new_vehicle` class `formtastic vehicle`
  - `vehicle[name]` text "Name"
  - `vehicle[registration]` text "Registration"
  - `vehicle[acquired_date]` datepicker "Acquired On"
  - `vehicle[start_mileage]` text "Initial Mileage" value `0`
  - `vehicle[rate_per_mile]` text "Rate Per Mile" value `0.00`
  - `vehicle[notes]` textarea "Notes"
  - `save` submit value `Save`

## Reports

### `/activities`

- controller#action `activities#index`; title `aworka`; body id none; status 200; html `html/activities.html`, screenshot `screens/activities.png`
- headings: h1 "Reach To Clean", h2 "Activity - All - All - Month Ending 20 Oct 2026"
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)
- links: `/activities` Reset
- form `POST /activities/filter` id `filter_form`
  - `filter[category]` select options: All, Jobs, Estimates, Payments, Adjustments, Invoices, Receipts, Job Value Changes [job-value-changes]
  - `filter[subcategory]` select
  - `filter[containing]` text
  - `filter[num_periods]` select options: 31 numeric (1 … 31)
  - `filter[period]` select options: Years, Months, Weeks, Days
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `commit` submit value `Refresh`
  - `filter[task]` hidden value `all-tasks`
  - `filter[payment_method]` hidden value `all-payment-methods`
  - `filter[frequency]` hidden value `all-frequencies`
  - `filter[sales_source_id]` hidden value `all-sales-sources`
  - `filter[price_revision_id]` hidden value `all-price-revisions`

### `/report/customer-retention`

- controller#action `reports#show`; title `aworka`; body id none; status 200; html `html/report__customer-retention.html`, screenshot `screens/report__customer-retention.png`
- headings: h1 "Reach To Clean", h2 "Customer Retention - All - 12 Months Ending 31 Oct 2026"
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)

### `/report/income-forecast`

- controller#action `reports#show`; title `aworka`; body id none; status 200; html `html/report__income-forecast.html`, screenshot `screens/report__income-forecast.png`
- headings: h1 "Reach To Clean", h2 "Income Forecast Less Tax - Round - 12 Months Ending 5 Apr 2027"
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)

### `/report/profit-and-loss`

- controller#action `reports#show`; title `aworka`; body id none; status 200; also reached by redirect from `/report/estimates`, `/report/expenses`, `/report/sales_sources`, `/report/vat`; html `html/report__profit-and-loss.html`, screenshot `screens/report__profit-and-loss.png`
- headings: h1 "Reach To Clean", h2 "Profit And Loss Accrual - Round - 12 Months Ending 5 Apr 2027"
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)

### `/report/valuation`

- controller#action `reports#show`; title `aworka`; body id none; status 200; html `html/report__valuation.html`, screenshot `screens/report__valuation.png`
- headings: h1 "Reach To Clean", h2 "Valuation - Round - 20 Oct 2026"
- sub-navigation: [Overview](/dashboard), [Activity](/activities), [Valuation](/report/valuation), [Income Forecast](/report/income-forecast), [Profit & Loss](/report/profit-and-loss), [Customer Retention](/report/customer-retention)

## Settings

### `/announcements`

- controller#action `announcements#index`; title `aworka`; body id none; status 200; html `html/announcements.html`, screenshot `screens/announcements.png`
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/announcements` Reset
- form `POST /announcements/filter` id `filter_form`
  - `filter[category]` select options: All, Guide, System Update [system_update]
  - `filter[subcategory]` select
  - `filter[containing]` text
  - `commit` submit value `Refresh`

### `/role_infos`

- controller#action `role_infos#index`; title `aworka`; body id none; status 200; html `html/role_infos.html`, screenshot `screens/role_infos.png`
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/role_infos/new` New Role, `/role_infos/1452/edit` Employee, `/role_infos/1451/edit` Franchisee

### `/sales_tax_registrations`

- controller#action `sales_tax_registrations#index`; title `aworka`; body id none; status 200; html `html/sales_tax_registrations.html`, screenshot `screens/sales_tax_registrations.png`
- headings: h3 "VAT Registration"
- links: `/sales_tax_registrations/new` New Registration Period (popup)

### `/settings`

- controller#action `users#edit`; title `aworka`; body id none; status 200; html `html/settings.html`, screenshot `screens/settings.png`
- headings: h3 "Business Details", h2 "Edit Location", h3 "Taxes", h3 "Messaging", h3 "Invoicing", h3 "Online Payments", h3 "Receipts", h3 "Estimating", h3 "Features", h3 "Job & Customer Defaults", h3 "Planner", h3 "Route Optimisation", h3 "Customer Data Retention", h3 "Aworka API", h3 "Testimonial"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/password_change/edit?user_id=8065` Change (popup), `/sales_tax_registrations` Edit Registration (popup), `/smtp_server/edit` Configure (popup), `/sms_account/edit` Edit (popup), `/api_application/regenerate_secret` New Secret (PATCH), `/api/personal_access_tokens` Manage Tokens (popup), `/api/doc` View, `/back` Back, `/sales_tax_registrations/new` 1 (popup), `/api_application` 1 (popup)
- form `POST /users/8065` id `settings_form` class `tabs formtastic user`
  - `user[saving_settings]` hidden value `true`
  - `user[email]` email "Email"
  - `user[contact_attributes][company]` text "Business Name" value `Reach To Clean`
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[contact_attributes][name]` text "My Name" value `Joe Hinchliffe`
  - `user[contact_attributes][multiline_address]` textarea "Address"
  - `user[contact_attributes][selected_geocoding_id]` hidden
  - `user[contact_attributes][lat_lng_source]` hidden
  - `user[contact_attributes][lat]` text "Lat/Long"
  - `user[contact_attributes][lng]` text
  - `user[contact_attributes][phone1]` tel "Phone"
  - `user[contact_attributes][phone2]` tel
  - `user[contact_attributes][phone3]` tel
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[year_end(3i)]` select options: 31 numeric (1 … 31)
  - `user[year_end(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `user[year_end(1i)]` hidden value `2020`
  - `user[website]` text "Website URL"
  - `user[clear_logo]` hidden
  - `user[logo]` file "Your Logo"
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[collects_sales_tax]` hidden value `0`
  - `user[collects_sales_tax]` checkbox "Collect VAT?"
  - `user[mtd_services]` select "Use Making Tax Digital for" options: Not Using, VAT, Income Tax [income_tax], VAT & Income Tax [vat_and_income_tax]
  - `user[cc_emails]` hidden value `0`
  - `user[cc_emails]` checkbox "Copy emails to me?"
  - `user[email_signature]` textarea "Email Signature"
  - `user[letter_format]` select "Invoice/Statement with" options: Link For Online Viewing [o], Link And Attachment [b], Attachment Only
  - `user[email_service_type]` select "Send emails using" options: Aworka, SMTP, Gmail, Outlook
  - `user[send_sms]` hidden value `0`
  - `user[send_sms]` checkbox "Send SMS messages?"
  - `user[invoice_title]` text "Title" placeholder "Invoice"
  - `user[invoice_number]` text "Next Invoice Ref"
  - `user[invoice_notes]` textarea "Notes"
  - `user[letter_small_print]` textarea "Small Print"
  - `user[show_notes_on_statements]` select "Show Notes on" options: Invoices Only [false], Invoices & Statements [true]
  - `user[invoice_item_description]` text "Default Job Description"
  - `user[show_balance_on_invoices]` select "Show Amount to Pay as" options: Invoice Total [t], Invoiced Balance, Credit Balance [p]
  - `user[invoice_payment_terms_type]` select "Payment Terms" options: Not Required [x], By Return [r], COD, From Invoice Date [n], From Month End [e]
  - `user[invoice_payment_terms]` text value `0`
  - `user[show_next_due_on_invoices]` hidden value `0`
  - `user[show_next_due_on_invoices]` checkbox "Show Next Job Date?"
  - `user[accepts_gocardless]` hidden value `0`
  - `user[accepts_gocardless]` checkbox "Accept GoCardless?"
  - `user[gocardless_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_gocardless_fee_expense_category]` text placeholder "Payment Processing"
  - `user[accepts_paypal]` hidden value `0`
  - `user[accepts_paypal]` checkbox "Accept PayPal?"
  - `user[paypal_email]` email
  - `user[paypal_limited]` select options: Any amount [false], Amounts under [true]
  - `user[paypal_threshold]` text
  - `user[paypal_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_paypal_fee_expense_category]` text placeholder "Payment Processing"
  - `user[receipt_number]` text "Next Receipt Ref"
  - `user[receipt_notes]` textarea "Notes for Receipt"
  - `user[estimate_title]` text "Title" placeholder "Estimate"
  - `user[estimate_number]` text "Next Estimate Ref"
  - `user[estimate_notes]` textarea "Notes for Estimate"
  - `user[estimate_annual_total]` hidden value `0`
  - `user[estimate_annual_total]` checkbox "Show Annual Total"
  - `user[aworka_attributes][profit_calc]` select "Profit & Loss Calculation" options: Accrual [j], Cash Basis [p]
  - `user[aworka_attributes][record_mileage]` hidden value `0`
  - `user[aworka_attributes][record_mileage]` checkbox "Record Mileage?"
  - `user[aworka_attributes][first_week_day]` select "First Week Day" options: Sun [0], Mon [1], Tue [2], Wed [3], Thu [4], Fri [5], Sat [6]
  - `user[aworka_attributes][default_job_contact_method]` select "Contact Method" options: Email, SMS, Email & SMS [b]
  - `user[aworka_attributes][default_job_payment_method]` select "Payment Method" options: On Day [c], Card [x], Collection [l], By Post [q], Online, Direct To Bank [t], Email Invoice, Paper Invoice, Direct Debit
  - `user[aworka_attributes][default_job_payment_frequency]` select options: Manually [x], After Each Job, Overnight
  - `user[aworka_attributes][default_job_location]` select "Job Location" options: Customer Address, Other Address, Not Applicable
  - `user[aworka_attributes][default_job_time_required][hours]` text "Time Required" value `0`
  - `user[aworka_attributes][default_job_time_required][minutes]` text value `30`
  - `user[aworka_attributes][show_times_on_job_sheets]` hidden value `0`
  - `user[aworka_attributes][show_times_on_job_sheets]` checkbox
  - `user[aworka_attributes][default_job_appointments]` select "Job Appointments" options: No Need To Confirm, Confirm The Day Before [1], Confirm A Few Days Before [3]
  - `user[aworka_attributes][default_job_regularity]` select "Job frequency" options: One Off, On Request [c], Regularly
  - `user[aworka_attributes][default_job_times_per_period]` select options: Once [1], Twice [2], Three Times [3], Four Times [4], Five Times [5], Six Times [6], Seven Times [7]
  - `user[aworka_attributes][default_job_num_periods]` select options: 52 numeric (1 … 52)
  - `user[aworka_attributes][default_job_period_unit]` select options: Day, Week, Month, Year
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[planner_near_today]` select "View" options: This Week [true], This Month [false]
  - `user[planner_weeks_before]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `user[planner_weeks_after]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `all_allowed_days` checkbox
  - `user[days_worked][sun]` hidden value `0`
  - `user[days_worked][sun]` checkbox
  - `user[days_worked][mon]` hidden value `0`
  - `user[days_worked][mon]` checkbox
  - `user[days_worked][tue]` hidden value `0`
  - `user[days_worked][tue]` checkbox
  - `user[days_worked][wed]` hidden value `0`
  - `user[days_worked][wed]` checkbox
  - `user[days_worked][thu]` hidden value `0`
  - `user[days_worked][thu]` checkbox
  - `user[days_worked][fri]` hidden value `0`
  - `user[days_worked][fri]` checkbox
  - `user[days_worked][sat]` hidden value `0`
  - `user[days_worked][sat]` checkbox
  - `user[show_public_holidays]` hidden value `0`
  - `user[show_public_holidays]` checkbox "Show Public Holidays?"
  - `user[holiday_region]` select options: England [gb_eng], Wales [gb_wls], Scotland [gb_sct], Northern Ireland [gb_nir]
  - `user[add_jobs_order]` select "Order Jobs by" options: Next Due Date, Round Order
  - `user[default_job_plan_next_from]` select "Replan From" options: Last Job Date [j], Last Due Date [d]
  - `user[default_job_plan_next]` select "Plan Next" options: No [false], From [true]
  - `user[default_job_paid]` select "Set Paid to" options: Job Price, Debt Balance [b]
  - `user[planner_show_future_jobs]` hidden value `0`
  - `user[planner_show_future_jobs]` checkbox "Show Future Jobs?"
  - `user[job_auto_mark_policy]` select "Jobs left To Do" options: are assumed Not Done [n], are marked Done overnight [d], stay To Do until the next job is due [i]
  - `user[job_auto_mark_after_num_days]` select options: 1 Day, 2 Days, 3 Days, 4 Days, 5 Days, 1 Week [7], 2 Weeks [14]
  - `user[route_start_source]` select "Start Day from" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[route_finish_source]` select "Finish Day at" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[optimize_routes_overnight]` hidden value `0`
  - `user[optimize_routes_overnight]` checkbox "Optimise tomorrow's route overnight?"
  - `user[aworka_attributes][suspend_regular_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_regular_enabled]` checkbox "Suspend overdue regular jobs"
  - `user[aworka_attributes][suspend_regular_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_regular_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][suspend_on_request_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_on_request_enabled]` checkbox "Suspend unrequested jobs"
  - `user[aworka_attributes][suspend_on_request_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_on_request_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_suspended_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_suspended_enabled]` checkbox "Delete suspended and completed one off jobs"
  - `user[aworka_attributes][delete_suspended_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_suspended_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` checkbox "Delete unconverted estimates"
  - `user[aworka_attributes][delete_unconverted_estimates_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_unconverted_estimates_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_deleted_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_deleted_enabled]` checkbox "Anonymize deleted customers"
  - `user[aworka_attributes][anonymize_deleted_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_deleted_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_invoices_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_invoices_enabled]` checkbox "Anonymize invoices"
  - `user[aworka_attributes][anonymize_invoices_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_invoices_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][id]` hidden value `6000`
  - `api_application[enabled]` hidden value `0`
  - `api_application[enabled]` checkbox "Enable API Access?"
  - `user[aworka_attributes][testimonial_attributes][comments]` textarea "Why do you like Aworka?"
  - `user[aworka_attributes][testimonial_attributes][id]` hidden value `11907`
  - `user[aworka_attributes][id]` hidden value `6000`
  - `commit` submit value `Save`

### `/settings?section=api`

- controller#action `users#edit`; title `aworka`; body id none; status 200; html `html/settings__4f716e78.html`, screenshot `screens/settings__4f716e78.png`
- headings: h3 "Business Details", h2 "Edit Location", h3 "Taxes", h3 "Messaging", h3 "Invoicing", h3 "Online Payments", h3 "Receipts", h3 "Estimating", h3 "Features", h3 "Job & Customer Defaults", h3 "Planner", h3 "Route Optimisation", h3 "Customer Data Retention", h3 "Aworka API", h3 "Testimonial"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/password_change/edit?user_id=8065` Change (popup), `/sales_tax_registrations` Edit Registration (popup), `/smtp_server/edit` Configure (popup), `/sms_account/edit` Edit (popup), `/api_application/regenerate_secret` New Secret (PATCH), `/api/personal_access_tokens` Manage Tokens (popup), `/api/doc` View, `/back` Back, `/sales_tax_registrations/new` 1 (popup), `/api_application` 1 (popup)
- form `POST /users/8065` id `settings_form` class `tabs formtastic user`
  - `user[saving_settings]` hidden value `true`
  - `user[email]` email "Email"
  - `user[contact_attributes][company]` text "Business Name" value `Reach To Clean`
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[contact_attributes][name]` text "My Name" value `Joe Hinchliffe`
  - `user[contact_attributes][multiline_address]` textarea "Address"
  - `user[contact_attributes][selected_geocoding_id]` hidden
  - `user[contact_attributes][lat_lng_source]` hidden
  - `user[contact_attributes][lat]` text "Lat/Long"
  - `user[contact_attributes][lng]` text
  - `user[contact_attributes][phone1]` tel "Phone"
  - `user[contact_attributes][phone2]` tel
  - `user[contact_attributes][phone3]` tel
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[year_end(3i)]` select options: 31 numeric (1 … 31)
  - `user[year_end(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `user[year_end(1i)]` hidden value `2020`
  - `user[website]` text "Website URL"
  - `user[clear_logo]` hidden
  - `user[logo]` file "Your Logo"
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[collects_sales_tax]` hidden value `0`
  - `user[collects_sales_tax]` checkbox "Collect VAT?"
  - `user[mtd_services]` select "Use Making Tax Digital for" options: Not Using, VAT, Income Tax [income_tax], VAT & Income Tax [vat_and_income_tax]
  - `user[cc_emails]` hidden value `0`
  - `user[cc_emails]` checkbox "Copy emails to me?"
  - `user[email_signature]` textarea "Email Signature"
  - `user[letter_format]` select "Invoice/Statement with" options: Link For Online Viewing [o], Link And Attachment [b], Attachment Only
  - `user[email_service_type]` select "Send emails using" options: Aworka, SMTP, Gmail, Outlook
  - `user[send_sms]` hidden value `0`
  - `user[send_sms]` checkbox "Send SMS messages?"
  - `user[invoice_title]` text "Title" placeholder "Invoice"
  - `user[invoice_number]` text "Next Invoice Ref"
  - `user[invoice_notes]` textarea "Notes"
  - `user[letter_small_print]` textarea "Small Print"
  - `user[show_notes_on_statements]` select "Show Notes on" options: Invoices Only [false], Invoices & Statements [true]
  - `user[invoice_item_description]` text "Default Job Description"
  - `user[show_balance_on_invoices]` select "Show Amount to Pay as" options: Invoice Total [t], Invoiced Balance, Credit Balance [p]
  - `user[invoice_payment_terms_type]` select "Payment Terms" options: Not Required [x], By Return [r], COD, From Invoice Date [n], From Month End [e]
  - `user[invoice_payment_terms]` text value `0`
  - `user[show_next_due_on_invoices]` hidden value `0`
  - `user[show_next_due_on_invoices]` checkbox "Show Next Job Date?"
  - `user[accepts_gocardless]` hidden value `0`
  - `user[accepts_gocardless]` checkbox "Accept GoCardless?"
  - `user[gocardless_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_gocardless_fee_expense_category]` text placeholder "Payment Processing"
  - `user[accepts_paypal]` hidden value `0`
  - `user[accepts_paypal]` checkbox "Accept PayPal?"
  - `user[paypal_email]` email
  - `user[paypal_limited]` select options: Any amount [false], Amounts under [true]
  - `user[paypal_threshold]` text
  - `user[paypal_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_paypal_fee_expense_category]` text placeholder "Payment Processing"
  - `user[receipt_number]` text "Next Receipt Ref"
  - `user[receipt_notes]` textarea "Notes for Receipt"
  - `user[estimate_title]` text "Title" placeholder "Estimate"
  - `user[estimate_number]` text "Next Estimate Ref"
  - `user[estimate_notes]` textarea "Notes for Estimate"
  - `user[estimate_annual_total]` hidden value `0`
  - `user[estimate_annual_total]` checkbox "Show Annual Total"
  - `user[aworka_attributes][profit_calc]` select "Profit & Loss Calculation" options: Accrual [j], Cash Basis [p]
  - `user[aworka_attributes][record_mileage]` hidden value `0`
  - `user[aworka_attributes][record_mileage]` checkbox "Record Mileage?"
  - `user[aworka_attributes][first_week_day]` select "First Week Day" options: Sun [0], Mon [1], Tue [2], Wed [3], Thu [4], Fri [5], Sat [6]
  - `user[aworka_attributes][default_job_contact_method]` select "Contact Method" options: Email, SMS, Email & SMS [b]
  - `user[aworka_attributes][default_job_payment_method]` select "Payment Method" options: On Day [c], Card [x], Collection [l], By Post [q], Online, Direct To Bank [t], Email Invoice, Paper Invoice, Direct Debit
  - `user[aworka_attributes][default_job_payment_frequency]` select options: Manually [x], After Each Job, Overnight
  - `user[aworka_attributes][default_job_location]` select "Job Location" options: Customer Address, Other Address, Not Applicable
  - `user[aworka_attributes][default_job_time_required][hours]` text "Time Required" value `0`
  - `user[aworka_attributes][default_job_time_required][minutes]` text value `30`
  - `user[aworka_attributes][show_times_on_job_sheets]` hidden value `0`
  - `user[aworka_attributes][show_times_on_job_sheets]` checkbox
  - `user[aworka_attributes][default_job_appointments]` select "Job Appointments" options: No Need To Confirm, Confirm The Day Before [1], Confirm A Few Days Before [3]
  - `user[aworka_attributes][default_job_regularity]` select "Job frequency" options: One Off, On Request [c], Regularly
  - `user[aworka_attributes][default_job_times_per_period]` select options: Once [1], Twice [2], Three Times [3], Four Times [4], Five Times [5], Six Times [6], Seven Times [7]
  - `user[aworka_attributes][default_job_num_periods]` select options: 52 numeric (1 … 52)
  - `user[aworka_attributes][default_job_period_unit]` select options: Day, Week, Month, Year
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[planner_near_today]` select "View" options: This Week [true], This Month [false]
  - `user[planner_weeks_before]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `user[planner_weeks_after]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `all_allowed_days` checkbox
  - `user[days_worked][sun]` hidden value `0`
  - `user[days_worked][sun]` checkbox
  - `user[days_worked][mon]` hidden value `0`
  - `user[days_worked][mon]` checkbox
  - `user[days_worked][tue]` hidden value `0`
  - `user[days_worked][tue]` checkbox
  - `user[days_worked][wed]` hidden value `0`
  - `user[days_worked][wed]` checkbox
  - `user[days_worked][thu]` hidden value `0`
  - `user[days_worked][thu]` checkbox
  - `user[days_worked][fri]` hidden value `0`
  - `user[days_worked][fri]` checkbox
  - `user[days_worked][sat]` hidden value `0`
  - `user[days_worked][sat]` checkbox
  - `user[show_public_holidays]` hidden value `0`
  - `user[show_public_holidays]` checkbox "Show Public Holidays?"
  - `user[holiday_region]` select options: England [gb_eng], Wales [gb_wls], Scotland [gb_sct], Northern Ireland [gb_nir]
  - `user[add_jobs_order]` select "Order Jobs by" options: Next Due Date, Round Order
  - `user[default_job_plan_next_from]` select "Replan From" options: Last Job Date [j], Last Due Date [d]
  - `user[default_job_plan_next]` select "Plan Next" options: No [false], From [true]
  - `user[default_job_paid]` select "Set Paid to" options: Job Price, Debt Balance [b]
  - `user[planner_show_future_jobs]` hidden value `0`
  - `user[planner_show_future_jobs]` checkbox "Show Future Jobs?"
  - `user[job_auto_mark_policy]` select "Jobs left To Do" options: are assumed Not Done [n], are marked Done overnight [d], stay To Do until the next job is due [i]
  - `user[job_auto_mark_after_num_days]` select options: 1 Day, 2 Days, 3 Days, 4 Days, 5 Days, 1 Week [7], 2 Weeks [14]
  - `user[route_start_source]` select "Start Day from" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[route_finish_source]` select "Finish Day at" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[optimize_routes_overnight]` hidden value `0`
  - `user[optimize_routes_overnight]` checkbox "Optimise tomorrow's route overnight?"
  - `user[aworka_attributes][suspend_regular_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_regular_enabled]` checkbox "Suspend overdue regular jobs"
  - `user[aworka_attributes][suspend_regular_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_regular_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][suspend_on_request_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_on_request_enabled]` checkbox "Suspend unrequested jobs"
  - `user[aworka_attributes][suspend_on_request_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_on_request_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_suspended_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_suspended_enabled]` checkbox "Delete suspended and completed one off jobs"
  - `user[aworka_attributes][delete_suspended_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_suspended_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` checkbox "Delete unconverted estimates"
  - `user[aworka_attributes][delete_unconverted_estimates_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_unconverted_estimates_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_deleted_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_deleted_enabled]` checkbox "Anonymize deleted customers"
  - `user[aworka_attributes][anonymize_deleted_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_deleted_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_invoices_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_invoices_enabled]` checkbox "Anonymize invoices"
  - `user[aworka_attributes][anonymize_invoices_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_invoices_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][id]` hidden value `6000`
  - `api_application[enabled]` hidden value `0`
  - `api_application[enabled]` checkbox "Enable API Access?"
  - `user[aworka_attributes][testimonial_attributes][comments]` textarea "Why do you like Aworka?"
  - `user[aworka_attributes][testimonial_attributes][id]` hidden value `11907`
  - `user[aworka_attributes][id]` hidden value `6000`
  - `commit` submit value `Save`

### `/users`

- controller#action `users#index`; title `aworka`; body id none; status 200; html `html/users.html`, screenshot `screens/users.png`
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/users/new` New User, `/users/8065/edit` Joe Hinchliffe, `/users/8065/edit_notes` Edit (popup)

### `/api/personal_access_tokens`

- controller#action `personal_access_tokens#index`; title `aworka`; body id none; status 200; html `html/api__personal_access_tokens.html`, screenshot `screens/api__personal_access_tokens.png`
- headings: h2 "Personal Access Tokens"
- links: `/api/personal_access_tokens/new` New Token (popup), `/settings?section=api` Close

### `/password_change/edit?user_id=8065`

- controller#action `password_changes#edit`; title `aworka`; body id none; status 200; html `html/password_change__edit__8e02348a.html`, screenshot `screens/password_change__edit__8e02348a.png`
- headings: h3 "Change Password"
- links: `/back` Back
- form `POST /password_change?user_id=8065` id `new_password_change` class `password-change-form formtastic password_change`
  - `password_change[current_password]` password "Existing Password"
  - `password_change[password]` password "New Password"
  - `password_change[password_confirmation]` password "Confirm New Password"
  - `commit` submit value `Change Password`

### `/role_infos/new`

- controller#action `role_infos#new`; title `aworka`; body id none; status 200; html `html/role_infos__new.html`, screenshot `screens/role_infos__new.png`
- headings: h3 "New Role", h3 "Role Permissions", h2 "Access", h2 "Jobs & Customers", h2 "Planner", h2 "Accounts & Admin", h2 "Other Tasks"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/back` Back
- form `POST /role_infos` id `new_role_info` class `formtastic role_info`
  - `role_info[name]` text "Role"
  - `role_info[manage_users]` hidden value `0`
  - `role_info[manage_users]` checkbox "Administrator"
  - `role_info[manage_all_debts]` hidden value `0`
  - `role_info[manage_all_debts]` checkbox "Debt Collection Only"
  - `role_info[access_via_web]` hidden value `0`
  - `role_info[access_via_web]` checkbox "Access Via Web"
  - `role_info[access_via_mobile]` hidden value `0`
  - `role_info[access_via_mobile]` checkbox "Access Via Mobile"
  - `role_info[create_jobs]` hidden value `0`
  - `role_info[create_jobs]` checkbox "Create Customers/Jobs"
  - `role_info[edit_job_details]` hidden value `0`
  - `role_info[edit_job_details]` checkbox "Edit Customers/Jobs"
  - `role_info[delete_jobs]` hidden value `0`
  - `role_info[delete_jobs]` checkbox "Delete Jobs"
  - `role_info[suspend_jobs]` hidden value `0`
  - `role_info[suspend_jobs]` checkbox "Suspend Jobs"
  - `role_info[show_invoiced_job_prices]` hidden value `0`
  - `role_info[show_invoiced_job_prices]` checkbox "Show Account Customer Prices"
  - `role_info[export_jobs]` hidden value `0`
  - `role_info[export_jobs]` checkbox "Export Jobs"
  - `role_info[add_jobs]` hidden value `0`
  - `role_info[add_jobs]` checkbox "Add Jobs"
  - `role_info[edit_jobs]` hidden value `0`
  - `role_info[edit_jobs]` checkbox "Edit Jobs"
  - `role_info[move_jobs]` hidden value `0`
  - `role_info[move_jobs]` checkbox "Move Jobs"
  - `role_info[remove_jobs]` hidden value `0`
  - `role_info[remove_jobs]` checkbox "Remove Jobs"
  - `role_info[adjust_prices]` hidden value `0`
  - `role_info[adjust_prices]` checkbox "Adjust Prices"
  - `role_info[enter_payments]` hidden value `0`
  - `role_info[enter_payments]` checkbox "Enter Payments"
  - `role_info[manage_debts]` hidden value `0`
  - `role_info[manage_debts]` checkbox "Access Debt List"
  - `role_info[write_off_debts]` hidden value `0`
  - `role_info[write_off_debts]` checkbox "Write Off Debts"
  - `role_info[send_invoices]` hidden value `0`
  - `role_info[send_invoices]` checkbox "Send Invoices"
  - `role_info[send_estimates]` hidden value `0`
  - `role_info[send_estimates]` checkbox "Send Estimates"
  - `role_info[view_reports]` hidden value `0`
  - `role_info[view_reports]` checkbox "View Reports"
  - `role_info[export_reports]` hidden value `0`
  - `role_info[export_reports]` checkbox "Export Reports"
  - `role_info[record_expenses]` hidden value `0`
  - `role_info[record_expenses]` checkbox "Record Expenses"
  - `role_info[edit_settings]` hidden value `0`
  - `role_info[edit_settings]` checkbox "Edit Settings"
  - `role_info[book_time_off]` hidden value `0`
  - `role_info[book_time_off]` checkbox "Book Time Off"
  - `role_info[create_events]` hidden value `0`
  - `role_info[create_events]` checkbox "Create Events"
  - `role_info[send_messages]` hidden value `0`
  - `role_info[send_messages]` checkbox "Send Messages"
  - `role_info[track_sales]` hidden value `0`
  - `role_info[track_sales]` checkbox "Edit Sales Sources"
  - `commit` submit value `Save`

### `/sales_tax_registrations/new`

- controller#action `sales_tax_registrations#new`; title `aworka`; body id none; status 200; html `html/sales_tax_registrations__new.html`, screenshot `screens/sales_tax_registrations__new.png`
- headings: h3 "New VAT Registration"
- links: `/back` Back
- form `POST /sales_tax_registrations` id `new_sales_tax_registration` class `formtastic sales_tax_registration`
  - `sales_tax_registration[start_date]` datepicker "From"
  - `sales_tax_registration[end_date]` datepicker "To" placeholder "Present"
  - `sales_tax_registration[return_period]` select "Return Period" options: Monthly [1], Bimonthly [2], Quarterly [3], Annually [12]
  - `sales_tax_registration[return_start_month]` select "starting" options: Jan [1], Feb [2], Mar [3], Apr [4], May [5], Jun [6], Jul [7], Aug [8], Sep [9], Oct [10], Nov [11], Dec [12]
  - `sales_tax_registration[reg_no]` text "VAT Reg No"
  - `sales_tax_registration[rate]` text "Rate" value `20%`
  - `sales_tax_registration[type]` select "Scheme" options: Standard [SalesTaxRegistration::Standard], Cash Accounting [SalesTaxRegistration::CashAccounting], Flat Rate (basic turnover) [SalesTaxRegistration::FlatRateBasic], Flat Rate (cash based turnover) [SalesTaxRegistration::FlatRateCash], Annual [SalesTaxRegistration::Annual]
  - `sales_tax_registration[flat_rate]` text value `0%`
  - `sales_tax_registration[capital_asset_threshold]` text "Reclaim Capital Assets ≥" placeholder "No Claims" value `2000.00`
  - `save` submit value `Save`

### `/sms_account/edit`

- controller#action `sms_accounts#edit`; title `aworka`; body id none; status 200; html `html/sms_account__edit.html`, screenshot `screens/sms_account__edit.png`
- headings: h2 "Edit SMS Account Settings"
- links: `/back` Back
- form `POST /sms_account.html` id `new_sms_account` class `formtastic sms_account`
  - `sms_account[type]` select "Service Provider" options: Text Global [Message::Account::TextGlobal], Webex Interact [Message::Account::WebexInteract], Esendex [Message::Account::Esendex], httpSMS [Message::Account::HttpSms]
  - `sms_account[key]` text "Key"
  - `sms_account[secret]` text "Secret"
  - `sms_account[sender]` text "Sender" value `Reach To Cl`
  - `sms_account[max_credits_per_message]` text "Max Credits Per Message" value `1`
  - `commit` submit value `Save`

### `/smtp_server/edit`

- controller#action `smtp_servers#edit`; title `aworka`; body id none; status 200; html `html/smtp_server__edit.html`, screenshot `screens/smtp_server__edit.png`
- headings: h2 "Edit SMTP Server Settings"
- links: `/back` Back
- form `POST /smtp_server.html` id `new_smtp_server` class `formtastic smtp_server`
  - `smtp_server[address]` text "SMTP Server"
  - `smtp_server[port]` text "Port" value `587`
  - `smtp_server[user_name]` text "User Name"
  - `smtp_server[password]` password "Password"
  - `smtp_server[authentication]` select "Authentication" options: Plain, Login, CRAM-MD5 [cram_md5]
  - `smtp_server[enable_starttls_auto]` hidden value `0`
  - `smtp_server[enable_starttls_auto]` checkbox "Enable STARTTLS Auto?"
  - `smtp_server[min_time_between_sends]` text "Min time between sends"
  - `commit` submit value `Save`

### `/users/new`

- controller#action `users#new`; title `aworka`; body id none; status 200; html `html/users__new.html`, screenshot `screens/users__new.png`
- headings: h3 "New User", h2 "Your subscription price will increase if you add a user"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/back` Back/Cancel
- form `POST /users` id `new_user` class `formtastic user`
  - `user[saving_settings]` hidden value `true`
  - `user[email]` email "Email"
  - `user[password]` password "Password"
  - `user[password_confirmation]` password "Confirm Password"
  - `user[contact_attributes][name]` text "User Name"
  - `user[contact_attributes][company]` text "Business Name" placeholder "Reach To Clean"
  - `user[contact_attributes][multiline_address]` textarea "Address"
  - `user[contact_attributes][lat]` hidden
  - `user[contact_attributes][lng]` hidden
  - `user[contact_attributes][lat_lng_source]` hidden
  - `user[contact_attributes][selected_geocoding_id]` hidden
  - `user[contact_attributes][phone1]` tel "Phone Number"
  - `user[role_info_id]` select "Role" options: Franchisee [1451], Employee [1452]
  - `user[employer_id]` select "Manager" options: Self Managed, Joe Hinchliffe [8065]
  - `user[email_login_details]` hidden value `0`
  - `user[email_login_details]` checkbox "Email Login Details?"
  - `commit` submit value `Save`

### `/api/personal_access_tokens/new`

- controller#action `personal_access_tokens#new`; title `aworka`; body id none; status 200; html `html/api__personal_access_tokens__new.html`, screenshot `screens/api__personal_access_tokens__new.png`
- headings: h2 "New Personal Access Tokens"
- links: `/back` Back
- form `POST /api/personal_access_tokens` id `new_api_personal_access_token` class `ajax-popup-form formtastic api_personal_access_token`
  - `api_personal_access_token[token_label]` text "Reference"
  - `api_personal_access_token[user_id]` hidden value `8065`
  - `commit` submit value `Create Token`

### `/role_infos/1451/edit`

- controller#action `role_infos#edit`; title `aworka`; body id none; status 200; html `html/role_infos__1451__edit.html`, screenshot `screens/role_infos__1451__edit.png`
- headings: h3 "Edit Role", h3 "Role Permissions", h2 "Access", h2 "Jobs & Customers", h2 "Planner", h2 "Accounts & Admin", h2 "Other Tasks"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/role_infos/1451` Delete (DELETE), `/back` Back
- form `POST /role_infos/1451` id `edit_role_info_1451` class `formtastic role_info`
  - `role_info[name]` text "Role" value `Franchisee`
  - `role_info[manage_users]` hidden value `0`
  - `role_info[manage_users]` checkbox "Administrator"
  - `role_info[manage_all_debts]` hidden value `0`
  - `role_info[manage_all_debts]` checkbox "Debt Collection Only"
  - `role_info[access_via_web]` hidden value `0`
  - `role_info[access_via_web]` checkbox "Access Via Web"
  - `role_info[access_via_mobile]` hidden value `0`
  - `role_info[access_via_mobile]` checkbox "Access Via Mobile"
  - `role_info[create_jobs]` hidden value `0`
  - `role_info[create_jobs]` checkbox "Create Customers/Jobs"
  - `role_info[edit_job_details]` hidden value `0`
  - `role_info[edit_job_details]` checkbox "Edit Customers/Jobs"
  - `role_info[delete_jobs]` hidden value `0`
  - `role_info[delete_jobs]` checkbox "Delete Jobs"
  - `role_info[suspend_jobs]` hidden value `0`
  - `role_info[suspend_jobs]` checkbox "Suspend Jobs"
  - `role_info[show_invoiced_job_prices]` hidden value `0`
  - `role_info[show_invoiced_job_prices]` checkbox "Show Account Customer Prices"
  - `role_info[export_jobs]` hidden value `0`
  - `role_info[export_jobs]` checkbox "Export Jobs"
  - `role_info[add_jobs]` hidden value `0`
  - `role_info[add_jobs]` checkbox "Add Jobs"
  - `role_info[edit_jobs]` hidden value `0`
  - `role_info[edit_jobs]` checkbox "Edit Jobs"
  - `role_info[move_jobs]` hidden value `0`
  - `role_info[move_jobs]` checkbox "Move Jobs"
  - `role_info[remove_jobs]` hidden value `0`
  - `role_info[remove_jobs]` checkbox "Remove Jobs"
  - `role_info[adjust_prices]` hidden value `0`
  - `role_info[adjust_prices]` checkbox "Adjust Prices"
  - `role_info[enter_payments]` hidden value `0`
  - `role_info[enter_payments]` checkbox "Enter Payments"
  - `role_info[manage_debts]` hidden value `0`
  - `role_info[manage_debts]` checkbox "Access Debt List"
  - `role_info[write_off_debts]` hidden value `0`
  - `role_info[write_off_debts]` checkbox "Write Off Debts"
  - `role_info[send_invoices]` hidden value `0`
  - `role_info[send_invoices]` checkbox "Send Invoices"
  - `role_info[send_estimates]` hidden value `0`
  - `role_info[send_estimates]` checkbox "Send Estimates"
  - `role_info[view_reports]` hidden value `0`
  - `role_info[view_reports]` checkbox "View Reports"
  - `role_info[export_reports]` hidden value `0`
  - `role_info[export_reports]` checkbox "Export Reports"
  - `role_info[record_expenses]` hidden value `0`
  - `role_info[record_expenses]` checkbox "Record Expenses"
  - `role_info[edit_settings]` hidden value `0`
  - `role_info[edit_settings]` checkbox "Edit Settings"
  - `role_info[book_time_off]` hidden value `0`
  - `role_info[book_time_off]` checkbox "Book Time Off"
  - `role_info[create_events]` hidden value `0`
  - `role_info[create_events]` checkbox "Create Events"
  - `role_info[send_messages]` hidden value `0`
  - `role_info[send_messages]` checkbox "Send Messages"
  - `role_info[track_sales]` hidden value `0`
  - `role_info[track_sales]` checkbox "Edit Sales Sources"
  - `commit` submit value `Save`

### `/role_infos/1452/edit`

- controller#action `role_infos#edit`; title `aworka`; body id none; status 200; html `html/role_infos__1452__edit.html`, screenshot `screens/role_infos__1452__edit.png`
- headings: h3 "Edit Role", h3 "Role Permissions", h2 "Access", h2 "Jobs & Customers", h2 "Planner", h2 "Accounts & Admin", h2 "Other Tasks"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/role_infos/1452` Delete (DELETE), `/back` Back
- form `POST /role_infos/1452` id `edit_role_info_1452` class `formtastic role_info`
  - `role_info[name]` text "Role" value `Employee`
  - `role_info[manage_users]` hidden value `0`
  - `role_info[manage_users]` checkbox "Administrator"
  - `role_info[manage_all_debts]` hidden value `0`
  - `role_info[manage_all_debts]` checkbox "Debt Collection Only"
  - `role_info[access_via_web]` hidden value `0`
  - `role_info[access_via_web]` checkbox "Access Via Web"
  - `role_info[access_via_mobile]` hidden value `0`
  - `role_info[access_via_mobile]` checkbox "Access Via Mobile"
  - `role_info[create_jobs]` hidden value `0`
  - `role_info[create_jobs]` checkbox "Create Customers/Jobs"
  - `role_info[edit_job_details]` hidden value `0`
  - `role_info[edit_job_details]` checkbox "Edit Customers/Jobs"
  - `role_info[delete_jobs]` hidden value `0`
  - `role_info[delete_jobs]` checkbox "Delete Jobs"
  - `role_info[suspend_jobs]` hidden value `0`
  - `role_info[suspend_jobs]` checkbox "Suspend Jobs"
  - `role_info[show_invoiced_job_prices]` hidden value `0`
  - `role_info[show_invoiced_job_prices]` checkbox "Show Account Customer Prices"
  - `role_info[export_jobs]` hidden value `0`
  - `role_info[export_jobs]` checkbox "Export Jobs"
  - `role_info[add_jobs]` hidden value `0`
  - `role_info[add_jobs]` checkbox "Add Jobs"
  - `role_info[edit_jobs]` hidden value `0`
  - `role_info[edit_jobs]` checkbox "Edit Jobs"
  - `role_info[move_jobs]` hidden value `0`
  - `role_info[move_jobs]` checkbox "Move Jobs"
  - `role_info[remove_jobs]` hidden value `0`
  - `role_info[remove_jobs]` checkbox "Remove Jobs"
  - `role_info[adjust_prices]` hidden value `0`
  - `role_info[adjust_prices]` checkbox "Adjust Prices"
  - `role_info[enter_payments]` hidden value `0`
  - `role_info[enter_payments]` checkbox "Enter Payments"
  - `role_info[manage_debts]` hidden value `0`
  - `role_info[manage_debts]` checkbox "Access Debt List"
  - `role_info[write_off_debts]` hidden value `0`
  - `role_info[write_off_debts]` checkbox "Write Off Debts"
  - `role_info[send_invoices]` hidden value `0`
  - `role_info[send_invoices]` checkbox "Send Invoices"
  - `role_info[send_estimates]` hidden value `0`
  - `role_info[send_estimates]` checkbox "Send Estimates"
  - `role_info[view_reports]` hidden value `0`
  - `role_info[view_reports]` checkbox "View Reports"
  - `role_info[export_reports]` hidden value `0`
  - `role_info[export_reports]` checkbox "Export Reports"
  - `role_info[record_expenses]` hidden value `0`
  - `role_info[record_expenses]` checkbox "Record Expenses"
  - `role_info[edit_settings]` hidden value `0`
  - `role_info[edit_settings]` checkbox "Edit Settings"
  - `role_info[book_time_off]` hidden value `0`
  - `role_info[book_time_off]` checkbox "Book Time Off"
  - `role_info[create_events]` hidden value `0`
  - `role_info[create_events]` checkbox "Create Events"
  - `role_info[send_messages]` hidden value `0`
  - `role_info[send_messages]` checkbox "Send Messages"
  - `role_info[track_sales]` hidden value `0`
  - `role_info[track_sales]` checkbox "Edit Sales Sources"
  - `commit` submit value `Save`

### `/users/8065/edit`

- controller#action `users#edit`; title `aworka`; body id none; status 200; html `html/users__8065__edit.html`, screenshot `screens/users__8065__edit.png`
- headings: h3 "Business Details", h2 "Edit Location", h3 "Taxes", h3 "Messaging", h3 "Invoicing", h3 "Online Payments", h3 "Receipts", h3 "Estimating", h3 "Features", h3 "Job & Customer Defaults", h3 "Planner", h3 "Route Optimisation", h3 "Customer Data Retention", h3 "Aworka API", h3 "Testimonial"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/password_change/edit?user_id=8065` Change (popup), `/sales_tax_registrations` Edit Registration (popup), `/smtp_server/edit` Configure (popup), `/sms_account/edit` Edit (popup), `/api_application/regenerate_secret` New Secret (PATCH), `/api/personal_access_tokens` Manage Tokens (popup), `/api/doc` View, `/sales_tax_registrations/new` 1 (popup), `/api_application` 1 (popup)
- form `POST /users/8065` id `settings_form` class `tabs formtastic user`
  - `user[saving_settings]` hidden value `true`
  - `user[email]` email "Email"
  - `user[contact_attributes][company]` text "Business Name" value `Reach To Clean`
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[contact_attributes][name]` text "My Name" value `Joe Hinchliffe`
  - `user[contact_attributes][multiline_address]` textarea "Address"
  - `user[contact_attributes][selected_geocoding_id]` hidden
  - `user[contact_attributes][lat_lng_source]` hidden
  - `user[contact_attributes][lat]` text "Lat/Long"
  - `user[contact_attributes][lng]` text
  - `user[contact_attributes][phone1]` tel "Phone"
  - `user[contact_attributes][phone2]` tel
  - `user[contact_attributes][phone3]` tel
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[year_end(3i)]` select options: 31 numeric (1 … 31)
  - `user[year_end(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `user[year_end(1i)]` hidden value `2020`
  - `user[website]` text "Website URL"
  - `user[clear_logo]` hidden
  - `user[logo]` file "Your Logo"
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[collects_sales_tax]` hidden value `0`
  - `user[collects_sales_tax]` checkbox "Collect VAT?"
  - `user[mtd_services]` select "Use Making Tax Digital for" options: Not Using, VAT, Income Tax [income_tax], VAT & Income Tax [vat_and_income_tax]
  - `user[cc_emails]` hidden value `0`
  - `user[cc_emails]` checkbox "Copy emails to me?"
  - `user[email_signature]` textarea "Email Signature"
  - `user[letter_format]` select "Invoice/Statement with" options: Link For Online Viewing [o], Link And Attachment [b], Attachment Only
  - `user[email_service_type]` select "Send emails using" options: Aworka, SMTP, Gmail, Outlook
  - `user[send_sms]` hidden value `0`
  - `user[send_sms]` checkbox "Send SMS messages?"
  - `user[invoice_title]` text "Title" placeholder "Invoice"
  - `user[invoice_number]` text "Next Invoice Ref"
  - `user[invoice_notes]` textarea "Notes"
  - `user[letter_small_print]` textarea "Small Print"
  - `user[show_notes_on_statements]` select "Show Notes on" options: Invoices Only [false], Invoices & Statements [true]
  - `user[invoice_item_description]` text "Default Job Description"
  - `user[show_balance_on_invoices]` select "Show Amount to Pay as" options: Invoice Total [t], Invoiced Balance, Credit Balance [p]
  - `user[invoice_payment_terms_type]` select "Payment Terms" options: Not Required [x], By Return [r], COD, From Invoice Date [n], From Month End [e]
  - `user[invoice_payment_terms]` text value `0`
  - `user[show_next_due_on_invoices]` hidden value `0`
  - `user[show_next_due_on_invoices]` checkbox "Show Next Job Date?"
  - `user[accepts_gocardless]` hidden value `0`
  - `user[accepts_gocardless]` checkbox "Accept GoCardless?"
  - `user[gocardless_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_gocardless_fee_expense_category]` text placeholder "Payment Processing"
  - `user[accepts_paypal]` hidden value `0`
  - `user[accepts_paypal]` checkbox "Accept PayPal?"
  - `user[paypal_email]` email
  - `user[paypal_limited]` select options: Any amount [false], Amounts under [true]
  - `user[paypal_threshold]` text
  - `user[paypal_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_paypal_fee_expense_category]` text placeholder "Payment Processing"
  - `user[receipt_number]` text "Next Receipt Ref"
  - `user[receipt_notes]` textarea "Notes for Receipt"
  - `user[estimate_title]` text "Title" placeholder "Estimate"
  - `user[estimate_number]` text "Next Estimate Ref"
  - `user[estimate_notes]` textarea "Notes for Estimate"
  - `user[estimate_annual_total]` hidden value `0`
  - `user[estimate_annual_total]` checkbox "Show Annual Total"
  - `user[aworka_attributes][profit_calc]` select "Profit & Loss Calculation" options: Accrual [j], Cash Basis [p]
  - `user[aworka_attributes][record_mileage]` hidden value `0`
  - `user[aworka_attributes][record_mileage]` checkbox "Record Mileage?"
  - `user[aworka_attributes][first_week_day]` select "First Week Day" options: Sun [0], Mon [1], Tue [2], Wed [3], Thu [4], Fri [5], Sat [6]
  - `user[aworka_attributes][default_job_contact_method]` select "Contact Method" options: Email, SMS, Email & SMS [b]
  - `user[aworka_attributes][default_job_payment_method]` select "Payment Method" options: On Day [c], Card [x], Collection [l], By Post [q], Online, Direct To Bank [t], Email Invoice, Paper Invoice, Direct Debit
  - `user[aworka_attributes][default_job_payment_frequency]` select options: Manually [x], After Each Job, Overnight
  - `user[aworka_attributes][default_job_location]` select "Job Location" options: Customer Address, Other Address, Not Applicable
  - `user[aworka_attributes][default_job_time_required][hours]` text "Time Required" value `0`
  - `user[aworka_attributes][default_job_time_required][minutes]` text value `30`
  - `user[aworka_attributes][show_times_on_job_sheets]` hidden value `0`
  - `user[aworka_attributes][show_times_on_job_sheets]` checkbox
  - `user[aworka_attributes][default_job_appointments]` select "Job Appointments" options: No Need To Confirm, Confirm The Day Before [1], Confirm A Few Days Before [3]
  - `user[aworka_attributes][default_job_regularity]` select "Job frequency" options: One Off, On Request [c], Regularly
  - `user[aworka_attributes][default_job_times_per_period]` select options: Once [1], Twice [2], Three Times [3], Four Times [4], Five Times [5], Six Times [6], Seven Times [7]
  - `user[aworka_attributes][default_job_num_periods]` select options: 52 numeric (1 … 52)
  - `user[aworka_attributes][default_job_period_unit]` select options: Day, Week, Month, Year
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[planner_near_today]` select "View" options: This Week [true], This Month [false]
  - `user[planner_weeks_before]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `user[planner_weeks_after]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `all_allowed_days` checkbox
  - `user[days_worked][sun]` hidden value `0`
  - `user[days_worked][sun]` checkbox
  - `user[days_worked][mon]` hidden value `0`
  - `user[days_worked][mon]` checkbox
  - `user[days_worked][tue]` hidden value `0`
  - `user[days_worked][tue]` checkbox
  - `user[days_worked][wed]` hidden value `0`
  - `user[days_worked][wed]` checkbox
  - `user[days_worked][thu]` hidden value `0`
  - `user[days_worked][thu]` checkbox
  - `user[days_worked][fri]` hidden value `0`
  - `user[days_worked][fri]` checkbox
  - `user[days_worked][sat]` hidden value `0`
  - `user[days_worked][sat]` checkbox
  - `user[show_public_holidays]` hidden value `0`
  - `user[show_public_holidays]` checkbox "Show Public Holidays?"
  - `user[holiday_region]` select options: England [gb_eng], Wales [gb_wls], Scotland [gb_sct], Northern Ireland [gb_nir]
  - `user[add_jobs_order]` select "Order Jobs by" options: Next Due Date, Round Order
  - `user[default_job_plan_next_from]` select "Replan From" options: Last Job Date [j], Last Due Date [d]
  - `user[default_job_plan_next]` select "Plan Next" options: No [false], From [true]
  - `user[default_job_paid]` select "Set Paid to" options: Job Price, Debt Balance [b]
  - `user[planner_show_future_jobs]` hidden value `0`
  - `user[planner_show_future_jobs]` checkbox "Show Future Jobs?"
  - `user[job_auto_mark_policy]` select "Jobs left To Do" options: are assumed Not Done [n], are marked Done overnight [d], stay To Do until the next job is due [i]
  - `user[job_auto_mark_after_num_days]` select options: 1 Day, 2 Days, 3 Days, 4 Days, 5 Days, 1 Week [7], 2 Weeks [14]
  - `user[route_start_source]` select "Start Day from" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[route_finish_source]` select "Finish Day at" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[optimize_routes_overnight]` hidden value `0`
  - `user[optimize_routes_overnight]` checkbox "Optimise tomorrow's route overnight?"
  - `user[aworka_attributes][suspend_regular_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_regular_enabled]` checkbox "Suspend overdue regular jobs"
  - `user[aworka_attributes][suspend_regular_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_regular_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][suspend_on_request_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_on_request_enabled]` checkbox "Suspend unrequested jobs"
  - `user[aworka_attributes][suspend_on_request_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_on_request_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_suspended_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_suspended_enabled]` checkbox "Delete suspended and completed one off jobs"
  - `user[aworka_attributes][delete_suspended_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_suspended_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` checkbox "Delete unconverted estimates"
  - `user[aworka_attributes][delete_unconverted_estimates_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_unconverted_estimates_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_deleted_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_deleted_enabled]` checkbox "Anonymize deleted customers"
  - `user[aworka_attributes][anonymize_deleted_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_deleted_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_invoices_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_invoices_enabled]` checkbox "Anonymize invoices"
  - `user[aworka_attributes][anonymize_invoices_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_invoices_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][id]` hidden value `6000`
  - `api_application[enabled]` hidden value `0`
  - `api_application[enabled]` checkbox "Enable API Access?"
  - `user[aworka_attributes][testimonial_attributes][comments]` textarea "Why do you like Aworka?"
  - `user[aworka_attributes][testimonial_attributes][id]` hidden value `11907`
  - `user[aworka_attributes][id]` hidden value `6000`
  - `commit` submit value `Save`

### `/users/8065/edit?section=messaging`

- controller#action `users#edit`; title `aworka`; body id none; status 200; html `html/users__8065__edit__46c42eb6.html`, screenshot `screens/users__8065__edit__46c42eb6.png`
- headings: h3 "Business Details", h2 "Edit Location", h3 "Taxes", h3 "Messaging", h3 "Invoicing", h3 "Online Payments", h3 "Receipts", h3 "Estimating", h3 "Features", h3 "Job & Customer Defaults", h3 "Planner", h3 "Route Optimisation", h3 "Customer Data Retention", h3 "Aworka API", h3 "Testimonial"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/password_change/edit?user_id=8065` Change (popup), `/sales_tax_registrations` Edit Registration (popup), `/smtp_server/edit` Configure (popup), `/sms_account/edit` Edit (popup), `/api_application/regenerate_secret` New Secret (PATCH), `/api/personal_access_tokens` Manage Tokens (popup), `/api/doc` View, `/back` Back, `/sales_tax_registrations/new` 1 (popup), `/api_application` 1 (popup)
- form `POST /users/8065` id `settings_form` class `tabs formtastic user`
  - `user[saving_settings]` hidden value `true`
  - `user[email]` email "Email"
  - `user[contact_attributes][company]` text "Business Name" value `Reach To Clean`
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[contact_attributes][name]` text "My Name" value `Joe Hinchliffe`
  - `user[contact_attributes][multiline_address]` textarea "Address"
  - `user[contact_attributes][selected_geocoding_id]` hidden
  - `user[contact_attributes][lat_lng_source]` hidden
  - `user[contact_attributes][lat]` text "Lat/Long"
  - `user[contact_attributes][lng]` text
  - `user[contact_attributes][phone1]` tel "Phone"
  - `user[contact_attributes][phone2]` tel
  - `user[contact_attributes][phone3]` tel
  - `user[contact_attributes][id]` hidden value `3094298`
  - `user[year_end(3i)]` select options: 31 numeric (1 … 31)
  - `user[year_end(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `user[year_end(1i)]` hidden value `2020`
  - `user[website]` text "Website URL"
  - `user[clear_logo]` hidden
  - `user[logo]` file "Your Logo"
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[collects_sales_tax]` hidden value `0`
  - `user[collects_sales_tax]` checkbox "Collect VAT?"
  - `user[mtd_services]` select "Use Making Tax Digital for" options: Not Using, VAT, Income Tax [income_tax], VAT & Income Tax [vat_and_income_tax]
  - `user[cc_emails]` hidden value `0`
  - `user[cc_emails]` checkbox "Copy emails to me?"
  - `user[email_signature]` textarea "Email Signature"
  - `user[letter_format]` select "Invoice/Statement with" options: Link For Online Viewing [o], Link And Attachment [b], Attachment Only
  - `user[email_service_type]` select "Send emails using" options: Aworka, SMTP, Gmail, Outlook
  - `user[send_sms]` hidden value `0`
  - `user[send_sms]` checkbox "Send SMS messages?"
  - `user[invoice_title]` text "Title" placeholder "Invoice"
  - `user[invoice_number]` text "Next Invoice Ref"
  - `user[invoice_notes]` textarea "Notes"
  - `user[letter_small_print]` textarea "Small Print"
  - `user[show_notes_on_statements]` select "Show Notes on" options: Invoices Only [false], Invoices & Statements [true]
  - `user[invoice_item_description]` text "Default Job Description"
  - `user[show_balance_on_invoices]` select "Show Amount to Pay as" options: Invoice Total [t], Invoiced Balance, Credit Balance [p]
  - `user[invoice_payment_terms_type]` select "Payment Terms" options: Not Required [x], By Return [r], COD, From Invoice Date [n], From Month End [e]
  - `user[invoice_payment_terms]` text value `0`
  - `user[show_next_due_on_invoices]` hidden value `0`
  - `user[show_next_due_on_invoices]` checkbox "Show Next Job Date?"
  - `user[accepts_gocardless]` hidden value `0`
  - `user[accepts_gocardless]` checkbox "Accept GoCardless?"
  - `user[gocardless_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_gocardless_fee_expense_category]` text placeholder "Payment Processing"
  - `user[accepts_paypal]` hidden value `0`
  - `user[accepts_paypal]` checkbox "Accept PayPal?"
  - `user[paypal_email]` email
  - `user[paypal_limited]` select options: Any amount [false], Amounts under [true]
  - `user[paypal_threshold]` text
  - `user[paypal_fee_expense_category_id]` select "Add Fees to" options: Ignore Fees, New Category... [-1]
  - `user[new_paypal_fee_expense_category]` text placeholder "Payment Processing"
  - `user[receipt_number]` text "Next Receipt Ref"
  - `user[receipt_notes]` textarea "Notes for Receipt"
  - `user[estimate_title]` text "Title" placeholder "Estimate"
  - `user[estimate_number]` text "Next Estimate Ref"
  - `user[estimate_notes]` textarea "Notes for Estimate"
  - `user[estimate_annual_total]` hidden value `0`
  - `user[estimate_annual_total]` checkbox "Show Annual Total"
  - `user[aworka_attributes][profit_calc]` select "Profit & Loss Calculation" options: Accrual [j], Cash Basis [p]
  - `user[aworka_attributes][record_mileage]` hidden value `0`
  - `user[aworka_attributes][record_mileage]` checkbox "Record Mileage?"
  - `user[aworka_attributes][first_week_day]` select "First Week Day" options: Sun [0], Mon [1], Tue [2], Wed [3], Thu [4], Fri [5], Sat [6]
  - `user[aworka_attributes][default_job_contact_method]` select "Contact Method" options: Email, SMS, Email & SMS [b]
  - `user[aworka_attributes][default_job_payment_method]` select "Payment Method" options: On Day [c], Card [x], Collection [l], By Post [q], Online, Direct To Bank [t], Email Invoice, Paper Invoice, Direct Debit
  - `user[aworka_attributes][default_job_payment_frequency]` select options: Manually [x], After Each Job, Overnight
  - `user[aworka_attributes][default_job_location]` select "Job Location" options: Customer Address, Other Address, Not Applicable
  - `user[aworka_attributes][default_job_time_required][hours]` text "Time Required" value `0`
  - `user[aworka_attributes][default_job_time_required][minutes]` text value `30`
  - `user[aworka_attributes][show_times_on_job_sheets]` hidden value `0`
  - `user[aworka_attributes][show_times_on_job_sheets]` checkbox
  - `user[aworka_attributes][default_job_appointments]` select "Job Appointments" options: No Need To Confirm, Confirm The Day Before [1], Confirm A Few Days Before [3]
  - `user[aworka_attributes][default_job_regularity]` select "Job frequency" options: One Off, On Request [c], Regularly
  - `user[aworka_attributes][default_job_times_per_period]` select options: Once [1], Twice [2], Three Times [3], Four Times [4], Five Times [5], Six Times [6], Seven Times [7]
  - `user[aworka_attributes][default_job_num_periods]` select options: 52 numeric (1 … 52)
  - `user[aworka_attributes][default_job_period_unit]` select options: Day, Week, Month, Year
  - `user[aworka_attributes][id]` hidden value `6000`
  - `user[planner_near_today]` select "View" options: This Week [true], This Month [false]
  - `user[planner_weeks_before]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `user[planner_weeks_after]` select options: No Weeks [0], One Week [1], Two Weeks [2]
  - `all_allowed_days` checkbox
  - `user[days_worked][sun]` hidden value `0`
  - `user[days_worked][sun]` checkbox
  - `user[days_worked][mon]` hidden value `0`
  - `user[days_worked][mon]` checkbox
  - `user[days_worked][tue]` hidden value `0`
  - `user[days_worked][tue]` checkbox
  - `user[days_worked][wed]` hidden value `0`
  - `user[days_worked][wed]` checkbox
  - `user[days_worked][thu]` hidden value `0`
  - `user[days_worked][thu]` checkbox
  - `user[days_worked][fri]` hidden value `0`
  - `user[days_worked][fri]` checkbox
  - `user[days_worked][sat]` hidden value `0`
  - `user[days_worked][sat]` checkbox
  - `user[show_public_holidays]` hidden value `0`
  - `user[show_public_holidays]` checkbox "Show Public Holidays?"
  - `user[holiday_region]` select options: England [gb_eng], Wales [gb_wls], Scotland [gb_sct], Northern Ireland [gb_nir]
  - `user[add_jobs_order]` select "Order Jobs by" options: Next Due Date, Round Order
  - `user[default_job_plan_next_from]` select "Replan From" options: Last Job Date [j], Last Due Date [d]
  - `user[default_job_plan_next]` select "Plan Next" options: No [false], From [true]
  - `user[default_job_paid]` select "Set Paid to" options: Job Price, Debt Balance [b]
  - `user[planner_show_future_jobs]` hidden value `0`
  - `user[planner_show_future_jobs]` checkbox "Show Future Jobs?"
  - `user[job_auto_mark_policy]` select "Jobs left To Do" options: are assumed Not Done [n], are marked Done overnight [d], stay To Do until the next job is due [i]
  - `user[job_auto_mark_after_num_days]` select options: 1 Day, 2 Days, 3 Days, 4 Days, 5 Days, 1 Week [7], 2 Weeks [14]
  - `user[route_start_source]` select "Start Day from" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[route_finish_source]` select "Finish Day at" options: Joe Hinchliffe — Reach To Clean, 2 Heather Court WF1 3HF [user], Furthest job
  - `user[optimize_routes_overnight]` hidden value `0`
  - `user[optimize_routes_overnight]` checkbox "Optimise tomorrow's route overnight?"
  - `user[aworka_attributes][suspend_regular_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_regular_enabled]` checkbox "Suspend overdue regular jobs"
  - `user[aworka_attributes][suspend_regular_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_regular_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][suspend_on_request_enabled]` hidden value `0`
  - `user[aworka_attributes][suspend_on_request_enabled]` checkbox "Suspend unrequested jobs"
  - `user[aworka_attributes][suspend_on_request_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][suspend_on_request_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_suspended_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_suspended_enabled]` checkbox "Delete suspended and completed one off jobs"
  - `user[aworka_attributes][delete_suspended_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_suspended_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` hidden value `0`
  - `user[aworka_attributes][delete_unconverted_estimates_enabled]` checkbox "Delete unconverted estimates"
  - `user[aworka_attributes][delete_unconverted_estimates_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][delete_unconverted_estimates_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_deleted_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_deleted_enabled]` checkbox "Anonymize deleted customers"
  - `user[aworka_attributes][anonymize_deleted_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_deleted_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][anonymize_invoices_enabled]` hidden value `0`
  - `user[aworka_attributes][anonymize_invoices_enabled]` checkbox "Anonymize invoices"
  - `user[aworka_attributes][anonymize_invoices_num_periods]` select options: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  - `user[aworka_attributes][anonymize_invoices_period_unit]` select options: Weeks, Months, Years
  - `user[aworka_attributes][id]` hidden value `6000`
  - `api_application[enabled]` hidden value `0`
  - `api_application[enabled]` checkbox "Enable API Access?"
  - `user[aworka_attributes][testimonial_attributes][comments]` textarea "Why do you like Aworka?"
  - `user[aworka_attributes][testimonial_attributes][id]` hidden value `11907`
  - `user[aworka_attributes][id]` hidden value `6000`
  - `commit` submit value `Save`

### `/users/8065/edit_notes`

- controller#action `users#edit_notes`; title `aworka`; body id none; status 200; html `html/users__8065__edit_notes.html`, screenshot `screens/users__8065__edit_notes.png`
- headings: h3 "Edit User Notes"
- sub-navigation: [Users](/users), [Round Assignments](/round_assignments), [Roles](/role_infos), [Announcements](/announcements)
- links: `/back` Back
- form `POST /users/8065` id `edit_user_8065` class `formtastic user`
  - `user[notes]` textarea "Notes"
  - `commit` submit value `Save`

## Plans

### `/subscription/edit`

- controller#action `subscriptions#edit`; title `aworka`; body id none; status 200; also reached by redirect from `/subscription`; html `html/subscription__edit.html`, screenshot `screens/subscription__edit.png`
- headings: h3 "Change Subscription Plan", h2 "£15", h2 "£20", h2 "£30", h2 "£150", h2 "£200", h2 "-", h3 "Only Available Monthly"
- sub-navigation: [Change Subscription Plan](/subscription/edit)
- links: `/back` Back/← Stay on Plan, `/questions/new` Contact Us
- form `POST /subscription` id `edit_subscription_record_1946` class `formtastic subscription_record`
  - `subscription_record[billed]` select options: Monthly, Yearly
  - `simple_monthly` submit value `Try Plan`
  - `smart_monthly` submit value `Try Plan`
  - `simple_yearly` submit value `Try Plan`
  - `smart_yearly` submit value `Try Plan`

## Messages

### `/message_draft`

- controller#action `message_drafts#show`; title `aworka`; body id none; status 200; html `html/message_draft.html`, screenshot `screens/message_draft.png`
- headings: h2 "There are no draft messages", h3 "To draft new messages to your customers:"
- sub-navigation: [History](/messages), [Drafts](/message_draft), [Templates](/message_templates)
- links: `/job_sheets?date=2026-10-20&user_id=8065` Job Sheets, `/job_specs` Jobs

### `/message_templates`

- controller#action `message_templates#index`; title `aworka`; body id none; status 200; html `html/message_templates.html`, screenshot `screens/message_templates.png`
- sub-navigation: [History](/messages), [Drafts](/message_draft), [Templates](/message_templates)
- links: `/message_templates/new` New Template (popup)

### `/messages`

- controller#action `messages#index`; title `aworka`; body id none; status 200; also reached by redirect from `/messages/new`, `/messages/reset_filter`; html `html/messages.html`, screenshot `screens/messages.png`
- sub-navigation: [History](/messages), [Drafts](/message_draft), [Templates](/message_templates)
- links: `/messages/reset_filter` Reset
- form `POST /messages/filter` id `filter_form`
  - `filter[category]` select options: All [any-status], Sent, Pending, Queued, Failed [error], Selected
  - `filter[subcategory]` select options: Messages [any-reason], Invoices, Receipts, Statements, Job Sheets [job_sheet], Customer Messages [other]
  - `filter[containing]` text
  - `filter[num_periods]` select options: 31 numeric (1 … 31)
  - `filter[period]` select options: Years, Months, Weeks, Days
  - `filter[start_or_end]` select options: Starting, Ending
  - `filter[date(3i)]` select options: 31 numeric (1 … 31)
  - `filter[date(2i)]` select options: January [1], February [2], March [3], April [4], May [5], June [6], July [7], August [8], September [9], October [10], November [11], December [12]
  - `filter[date(1i)]` select options: 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028
  - `commit` submit value `Refresh`

### `/message_templates/new`

- controller#action `message_templates#new`; title `aworka`; body id none; status 200; html `html/message_templates__new.html`, screenshot `screens/message_templates__new.png`
- headings: h3 "New Template"
- sub-navigation: [History](/messages), [Drafts](/message_draft), [Templates](/message_templates)
- links: `/back` Back
- form `POST /message_templates` id `new_message_template` class `formtastic message_template`
  - `message_template[name]` text "Template Name"
  - `message_template[reason]` select "Purpose" options: General, Marketing, Invoices, Estimates, Receipts, Statements, Upcoming Jobs [b], Jobs Done [a], Jobs Done Requiring Payment [q], Jobs Not Done [n], Jobs Skipped [k], Payment Reminders, Direct Debit Cancelled [g], Job Sheets, Prepayment Receipt [y]
  - `message_template[email_subject]` text "Email Subject"
  - `message_template[email_content]` textarea "Email Content"
  - `message_template[email_bcc]` text "Email Bcc"
  - `message_template[sms_content]` textarea "SMS Content"
  - `message_template[show_as_event]` select "Show as Event?" options: , No [false], Yes [true]
  - `commit` submit value `Save`

## Help

### `/help/activities/index`

- title none (fragment); body id none; status 200; html `html/help__activities__index.html`, screenshot `screens/help__activities__index.png`
- headings: h1 "No Online Help Available"

### `/help/aged_debts/index`

- title none (fragment); body id none; status 200; html `html/help__aged_debts__index.html`, screenshot `screens/help__aged_debts__index.png`
- headings: h1 "No Online Help Available"

### `/help/announcements/index`

- title none (fragment); body id none; status 200; html `html/help__announcements__index.html`, screenshot `screens/help__announcements__index.png`
- headings: h1 "No Online Help Available"

### `/help/customers/new`

- title none (fragment); body id none; status 200; html `html/help__customers__new.html`, screenshot `screens/help__customers__new.png`
- headings: h1 "New Customer", h2 "Edit Customer Details", h2 "Edit Job Location, Reference and Round", h2 "Select Task or Edit Job Description, Time and Price", h2 "Edit Job Appointments, Job frequency, Allowed days and Next due date"

### `/help/dashboard/index`

- title none (fragment); body id none; status 200; html `html/help__dashboard__index.html`, screenshot `screens/help__dashboard__index.png`
- headings: h1 "No Online Help Available"

### `/help/day_plans/index`

- title none (fragment); body id none; status 200; html `html/help__day_plans__index.html`, screenshot `screens/help__day_plans__index.png`
- headings: h1 "Planner", h2 "How do I add jobs done or to be done on a particular date?", h2 "How do I confirm an appointment?", h2 "How do I add a new job for a existing customer?", h2 "How do I add a new job for a new customer?", h2 "How do I mark a job as done and enter payment details?", h2 "How do I edit price or job details?", h2 "How do I move and remove jobs from the planner?", h2 "How do I print a job sheet for work on a particular date?", h2 "How do I view other dates on the planner?"
- links: `/job_specs` Jobs & Customers

### `/help/debts/index`

- title none (fragment); body id none; status 200; html `html/help__debts__index.html`, screenshot `screens/help__debts__index.png`
- headings: h1 "Debts", h2 "How do I mark a debt as paid?", h2 "How do I print a debt list?", h2 "How do I write off a debt?", h2 "How do I quickly find a debt?"

### `/help/events/index`

- title none (fragment); body id none; status 200; html `html/help__events__index.html`, screenshot `screens/help__events__index.png`
- headings: h1 "No Online Help Available"

### `/help/events/new`

- title none (fragment); body id none; status 200; html `html/help__events__new.html`, screenshot `screens/help__events__new.png`
- headings: h1 "No Online Help Available"

### `/help/expense_categories/index`

- title none (fragment); body id none; status 200; html `html/help__expense_categories__index.html`, screenshot `screens/help__expense_categories__index.png`
- headings: h1 "No Online Help Available"

### `/help/expense_categories/new`

- title none (fragment); body id none; status 200; html `html/help__expense_categories__new.html`, screenshot `screens/help__expense_categories__new.png`
- headings: h1 "No Online Help Available"

### `/help/expense_suppliers/index`

- title none (fragment); body id none; status 200; html `html/help__expense_suppliers__index.html`, screenshot `screens/help__expense_suppliers__index.png`
- headings: h1 "No Online Help Available"

### `/help/expense_suppliers/new`

- title none (fragment); body id none; status 200; html `html/help__expense_suppliers__new.html`, screenshot `screens/help__expense_suppliers__new.png`
- headings: h1 "No Online Help Available"

### `/help/expenses/index`

- title none (fragment); body id none; status 200; html `html/help__expenses__index.html`, screenshot `screens/help__expenses__index.png`
- headings: h1 "Expenses", h2 "How do I record a new expense?", h2 "How do I edit an existing expense?", h2 "How do I view expenses for a different period?", h2 "How do I view all the expenses in one category?"

### `/help/expenses/new`

- title none (fragment); body id none; status 200; html `html/help__expenses__new.html`, screenshot `screens/help__expenses__new.png`
- headings: h1 "Expenses", h2 "How do I record a new expense?", h2 "How do I edit an existing expense?", h2 "How do I view expenses for a different period?", h2 "How do I view all the expenses in one category?"

### `/help/holiday_types/index`

- title none (fragment); body id none; status 200; html `html/help__holiday_types__index.html`, screenshot `screens/help__holiday_types__index.png`
- headings: h1 "No Online Help Available"

### `/help/holiday_types/new`

- title none (fragment); body id none; status 200; html `html/help__holiday_types__new.html`, screenshot `screens/help__holiday_types__new.png`
- headings: h1 "No Online Help Available"

### `/help/holidays/index`

- title none (fragment); body id none; status 200; html `html/help__holidays__index.html`, screenshot `screens/help__holidays__index.png`
- headings: h1 "No Online Help Available"

### `/help/holidays/new`

- title none (fragment); body id none; status 200; html `html/help__holidays__new.html`, screenshot `screens/help__holidays__new.png`
- headings: h1 "No Online Help Available"

### `/help/invoices/index`

- title none (fragment); body id none; status 200; html `html/help__invoices__index.html`, screenshot `screens/help__invoices__index.png`
- headings: h1 "Edit Invoice"

### `/help/job_locations/index`

- title none (fragment); body id none; status 200; html `html/help__job_locations__index.html`, screenshot `screens/help__job_locations__index.png`
- headings: h1 "No Online Help Available"

### `/help/job_sheets/index`

- title none (fragment); body id none; status 200; html `html/help__job_sheets__index.html`, screenshot `screens/help__job_sheets__index.png`
- headings: h1 "No Online Help Available"

### `/help/job_specs/index`

- title none (fragment); body id none; status 200; html `html/help__job_specs__index.html`, screenshot `screens/help__job_specs__index.png`
- headings: h1 "Jobs", h2 "How do I quickly find a customer or job?", h2 "How do I create a new job?", h2 "How do I see who is in debt?", h2 "How do I review my prices?", h2 "How do I handle late payment from a customer?", h2 "How do I reactivate a suspended job?", h2 "How do I update multiple jobs and/or customers at the same time?"

### `/help/message_drafts/show`

- title none (fragment); body id none; status 200; html `html/help__message_drafts__show.html`, screenshot `screens/help__message_drafts__show.png`
- headings: h1 "No Online Help Available"

### `/help/message_templates/index`

- title none (fragment); body id none; status 200; html `html/help__message_templates__index.html`, screenshot `screens/help__message_templates__index.png`
- headings: h1 "No Online Help Available"

### `/help/message_templates/new`

- title none (fragment); body id none; status 200; html `html/help__message_templates__new.html`, screenshot `screens/help__message_templates__new.png`
- headings: h1 "No Online Help Available"

### `/help/messages/index`

- title none (fragment); body id none; status 200; html `html/help__messages__index.html`, screenshot `screens/help__messages__index.png`
- headings: h1 "No Online Help Available"

### `/help/mileages/index`

- title none (fragment); body id none; status 200; html `html/help__mileages__index.html`, screenshot `screens/help__mileages__index.png`
- headings: h1 "No Online Help Available"

### `/help/password_changes/edit`

- title none (fragment); body id none; status 200; html `html/help__password_changes__edit.html`, screenshot `screens/help__password_changes__edit.png`
- headings: h1 "No Online Help Available"

### `/help/personal_access_tokens/index`

- title none (fragment); body id none; status 200; html `html/help__personal_access_tokens__index.html`, screenshot `screens/help__personal_access_tokens__index.png`
- headings: h1 "No Online Help Available"

### `/help/personal_access_tokens/new`

- title none (fragment); body id none; status 200; html `html/help__personal_access_tokens__new.html`, screenshot `screens/help__personal_access_tokens__new.png`
- headings: h1 "No Online Help Available"

### `/help/price_revisions/index`

- title none (fragment); body id none; status 200; html `html/help__price_revisions__index.html`, screenshot `screens/help__price_revisions__index.png`
- headings: h1 "Prices", h2 "How do I revise my job prices?", h2 "How do I revert a Price Revision?", h2 "What are Tasks?", h2 "How do I create a new Task?", h2 "How do I edit an existing task?"

### `/help/price_revisions/new`

- title none (fragment); body id none; status 200; html `html/help__price_revisions__new.html`, screenshot `screens/help__price_revisions__new.png`
- headings: h1 "New Price Revision"

### `/help/recurring_expenses/index`

- title none (fragment); body id none; status 200; html `html/help__recurring_expenses__index.html`, screenshot `screens/help__recurring_expenses__index.png`
- headings: h1 "Recurring Expenses", h2 "How do I create a recurring expense?", h2 "How do I edit an existing recurring expense?"

### `/help/recurring_expenses/new`

- title none (fragment); body id none; status 200; html `html/help__recurring_expenses__new.html`, screenshot `screens/help__recurring_expenses__new.png`
- headings: h1 "Recurring Expenses", h2 "How do I create a recurring expense?", h2 "How do I edit an existing recurring expense?"

### `/help/reports/show`

- title none (fragment); body id none; status 200; html `html/help__reports__show.html`, screenshot `screens/help__reports__show.png`
- headings: h1 "Reports", h2 "What do all these numbers mean?", h2 "How do I view a different year or period?", h2 "How do I print my figures?"

### `/help/role_infos/edit`

- title none (fragment); body id none; status 200; html `html/help__role_infos__edit.html`, screenshot `screens/help__role_infos__edit.png`
- headings: h1 "No Online Help Available"

### `/help/role_infos/index`

- title none (fragment); body id none; status 200; html `html/help__role_infos__index.html`, screenshot `screens/help__role_infos__index.png`
- headings: h1 "No Online Help Available"

### `/help/role_infos/new`

- title none (fragment); body id none; status 200; html `html/help__role_infos__new.html`, screenshot `screens/help__role_infos__new.png`
- headings: h1 "No Online Help Available"

### `/help/round_assignments/index`

- title none (fragment); body id none; status 200; html `html/help__round_assignments__index.html`, screenshot `screens/help__round_assignments__index.png`
- headings: h1 "No Online Help Available"

### `/help/round_orderings/show`

- title none (fragment); body id none; status 200; html `html/help__round_orderings__show.html`, screenshot `screens/help__round_orderings__show.png`
- headings: h1 "No Online Help Available"

### `/help/rounds/index`

- title none (fragment); body id none; status 200; html `html/help__rounds__index.html`, screenshot `screens/help__rounds__index.png`
- headings: h1 "Rounds", h2 "How do I edit the name of a round?", h2 "How do I create a new round?"

### `/help/rounds/new`

- title none (fragment); body id none; status 200; html `html/help__rounds__new.html`, screenshot `screens/help__rounds__new.png`
- headings: h1 "Rounds", h2 "How do I edit the name of a round?", h2 "How do I create a new round?"

### `/help/sales_sources/index`

- title none (fragment); body id none; status 200; html `html/help__sales_sources__index.html`, screenshot `screens/help__sales_sources__index.png`
- headings: h1 "No Online Help Available"

### `/help/sales_sources/new`

- title none (fragment); body id none; status 200; html `html/help__sales_sources__new.html`, screenshot `screens/help__sales_sources__new.png`
- headings: h1 "No Online Help Available"

### `/help/sales_tax_registrations/index`

- title none (fragment); body id none; status 200; html `html/help__sales_tax_registrations__index.html`, screenshot `screens/help__sales_tax_registrations__index.png`
- headings: h1 "No Online Help Available"

### `/help/sales_tax_registrations/new`

- title none (fragment); body id none; status 200; html `html/help__sales_tax_registrations__new.html`, screenshot `screens/help__sales_tax_registrations__new.png`
- headings: h1 "No Online Help Available"

### `/help/sms_accounts/edit`

- title none (fragment); body id none; status 200; html `html/help__sms_accounts__edit.html`, screenshot `screens/help__sms_accounts__edit.png`
- headings: h1 "No Online Help Available"

### `/help/smtp_servers/edit`

- title none (fragment); body id none; status 200; html `html/help__smtp_servers__edit.html`, screenshot `screens/help__smtp_servers__edit.png`
- headings: h1 "No Online Help Available"

### `/help/subscriptions/edit`

- title none (fragment); body id none; status 200; html `html/help__subscriptions__edit.html`, screenshot `screens/help__subscriptions__edit.png`

### `/help/tasks/index`

- title none (fragment); body id none; status 200; html `html/help__tasks__index.html`, screenshot `screens/help__tasks__index.png`
- headings: h1 "Show Task"

### `/help/tasks/new`

- title none (fragment); body id none; status 200; html `html/help__tasks__new.html`, screenshot `screens/help__tasks__new.png`
- headings: h1 "Show Task"

### `/help/users/edit`

- title none (fragment); body id none; status 200; html `html/help__users__edit.html`, screenshot `screens/help__users__edit.png`
- headings: h1 "Users", h2 "How to I create a new User?", h2 "How to I edit an existing new User?"

### `/help/users/edit_notes`

- title none (fragment); body id none; status 200; html `html/help__users__edit_notes.html`, screenshot `screens/help__users__edit_notes.png`
- headings: h1 "Users", h2 "How to I create a new User?", h2 "How to I edit an existing new User?"

### `/help/users/index`

- title none (fragment); body id none; status 200; html `html/help__users__index.html`, screenshot `screens/help__users__index.png`
- headings: h1 "Users", h2 "How to I create a new User?", h2 "How to I edit an existing new User?"

### `/help/users/new`

- title none (fragment); body id none; status 200; html `html/help__users__new.html`, screenshot `screens/help__users__new.png`
- headings: h1 "Users", h2 "How to I create a new User?", h2 "How to I edit an existing new User?"

### `/help/vehicles/new`

- title none (fragment); body id none; status 200; html `html/help__vehicles__new.html`, screenshot `screens/help__vehicles__new.png`
- headings: h1 "No Online Help Available"

## URL patterns seen in the app JavaScript (not fetched)

Endpoints the page scripts in `assets/javascripts/*.js` call via AJAX or build as links. Not requested by the crawler: they mutate data, need a selection/body, or are fragments. Method is the one the script uses.

- **planner**: GET `/planner/week/:date`, GET `/planner/month/:date` (planner grid fragments; examples captured); GET `/day_plans/:date` (printable job sheet; captured); DELETE `/day_plans/:date` (clear day); GET `/day_plans/:date/add[/:user_id]` (add-jobs popup); POST `/day_plans/:date/fill`; GET `/day_plans/:date/new_nudge` (shift-jobs popup); POST `/day_plans/:date/rounds`; PATCH `/day_plans/:id/alias`; `/day_plans/days_jobs/:date`; POST `/day_plans/move_work_down`; POST `/day_plans/reset_due_dates`
- **job sheets**: `/users/:user_id/job_sheets/:date/reorder` (revert to round order); `/users/:user_id/job_sheets/mark_jobs/:date/:status`; GET `/users/:user_id/job_sheets/dated/:date/all_jobs/job_sheet` (fragment; captured); GET `/users/:user_id/job_sheets/email/:id/starting/:date/all_jobs` (emails the sheet); GET `/job_sheets/optimize/status` (route optimisation polling); `/job_sheets/totals/:date`
- **jobs / customers**: `/job_specs/:id/select` and `/deselect` (multi-select); GET `/job_specs/:id/plan_next_dates`; `/job_specs/:id/jobs`; `/jobs/:id/move`; PATCH `/jobs/:id`; `/job_specs/do_after/:id`; `/job_specs/multi/:action` and generic `/:model/multi/:action` (bulk edit); GET `/customers/:id` (customer page, return target of popups); GET `/customers/:id/messages/new`; POST `/contacts/geocode`, `/contacts/what3words` (address lookup)
- **messages**: GET `/messages/:id/edit`; `/messages/:id/select`; `/messages/multi/:action`; `/message_draft` (show, captured), `/message_draft/edit`, POST `/message_draft/deliver`; GET `/message_templates/:id`
- **events**: GET `/events/:id/edit`; PATCH/DELETE `/events/:id`
- **payments / debts**: PATCH `/payments/:id/banked`, `/banked`, `/all_banked`; POST `/multiple_statements` (issue statements for selected customers); `/multiple_invoices/print`
- **rounds**: GET `/round_ordering/:round_id/:day|all-days` (captured for the default); `/round_assignments/:id`
- **expenses**: `/expenses/duplicate_last_in_category`; `/expenses/suppliers` (JSON, captured); `/expense_category_mappings`; `/expenses_consolidated/:id` (MTD)
- **HMRC / MTD**: `/hmrc/income_tax/business/:id`, `/hmrc/income_tax/calculation/:id`, `/hmrc/income_tax/annual_submission/:id`, `/hmrc/income_tax/period_summaries/list/:id`, `/hmrc/income_tax/period_summaries/tax_year_options/:id`
- **settings**: PUT `/settings` (inline settings save); PATCH `/help` (help_status s|h); `/announcements/hide`; `/users/:id/alias` (switch user); `/sms_account/char_count|credits|details|senders`; POST `/smtp_server/test`; `/api/personal_access_tokens/settings`; PATCH `/api_application/regenerate_secret`

## URL patterns seen but not fetched

Links the crawler saw (HTML anchors, popup `data-href`s) but did not request, because they are non-GET, require confirmation, or match the crawler's deny list of state-changing paths.

- `/questions/new`: `/questions/new` "Contact Us"
- `/users/:id/job_sheets/email/:id/starting/:date/all_jobs`: `/users/8065/job_sheets/email/1/starting/2026-10-20/all_jobs` "Send to Me..."

Paths probed as read-only guesses that do not exist (HTTP 404):

- `/api_application` -> 404
- `/customers/new` -> 404
- `/estimates` -> 404
- `/help` -> 404
- `/jobs` -> 404
- `/message_drafts` -> 404
- `/payments` -> 404
- `/payments/new` -> 404
- `/print/invoices` -> 404
- `/receipts` -> 404
- `/statements` -> 404
- `/tags` -> 404

Redirects observed (request -> final page):

- `/aged_debts/reset_filter` -> `/aged_debts`
- `/vehicles` -> `/day_plans`
- `/debts/reset_filter` -> `/debts`
- `/customers` -> `/job_specs`
- `/messages/new` -> `/messages`
- `/messages/reset_filter` -> `/messages`
- `/back` -> `/recurring_expenses`
- `/report/estimates` -> `/report/profit-and-loss`
- `/report/expenses` -> `/report/profit-and-loss`
- `/report/sales_sources` -> `/report/profit-and-loss`
- `/report/vat` -> `/report/profit-and-loss`
- `/subscription` -> `/subscription/edit`
- `/day_plans/2026-10-20` -> `/users/8065/job_sheets/1/starting/2026-10-20/all_jobs`
- `/users/8065/job_sheets/dated/2026-10-20/all_jobs/job_sheet` -> `/users/8065/job_sheets/1/starting/2026-10-20/all_jobs`

Non-HTML responses:

- `/expenses/suppliers` -> 200 application/json; charset=utf-8
- `/api/doc` -> 200 application/json; charset=utf-8
