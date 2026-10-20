# Research tooling

Scripts used to capture the public and logged-in surfaces of aworka.app for the
replication plan. They are GET-only: the only form ever submitted is the login form.

```
export AWORKA_EMAIL=...      # set in the cloud environment's secrets, never in git
export AWORKA_PASSWORD=...
python3 research/tools/crawl.py research/aworka        # HTML + pages.json index
node research/tools/screenshot.mjs research/aworka     # full-page PNGs
```
