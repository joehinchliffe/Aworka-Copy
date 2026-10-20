"use client";
import Link from "next/link";
import { useActionState } from "react";
import { importAction } from "./actions";

export default function ImportPage() {
  const [result, action, pending] = useActionState(importAction, undefined);
  return (
    <>
      <h1>Import customers</h1>
      <div className="panel" style={{ maxWidth: 760 }}>
        <p>Upload a CSV spreadsheet with one customer per row and a header row. Recognised columns include
          Name (or First name and Last name), Company, Address, Town, Postcode, Phone, Email, Reference, Round, Price,
          Frequency (weeks), Next due, Payment method, Balance (negative if they owe you) or Owed, and Notes.
          Exports from other round software usually work as they are.</p>
        <form action={action} className="row">
          <input type="file" name="file" accept=".csv,text/csv" style={{ maxWidth: 360 }} required />
          <button className="btn primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button>
        </form>
        {result && (
          <div style={{ marginTop: 12 }}>
            <div className={`notice ${result.imported ? "ok" : "error"}`}>Imported {result.imported} customer{result.imported === 1 ? "" : "s"}.</div>
            {result.skipped.length > 0 && <ul className="small">{result.skipped.map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}</ul>}
            <Link href="/customers">View jobs</Link>
          </div>
        )}
      </div>
    </>
  );
}
