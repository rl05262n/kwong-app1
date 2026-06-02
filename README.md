# Kwong v. United States — Form 843 Computation Tool (estimation tool ONLY! Please consult a tax professional) 

Compute penalty and interest abatement claims under **I.R.C. § 7508A(d)** per [*Kwong v. United States*, 179 Fed. Cl. 382 (2025)](https://www.uscfc.uscourts.gov/sites/default/files/opinions/KWONG.pdf) and [*Abdo v. Commissioner*, 162 T.C. 148 (2024)](https://www.ustaxcourt.gov/UstcInOp/OpinionViewer.aspx?ID=14301).

## What It Does

Paste an IRS Account Transcript (or upload the PDF) and the tool computes:

- **§6651(a)(1) FTF** — Failure-to-file penalty abatement (return filed during disaster period → timely)
- **§6651(a)(2) FTP** — Failure-to-pay penalty abatement (disaster-period months excluded, IRS vs Kwong declining balance)
- **§6654 Estimated Tax** — Proportional abatement for installment dates within the disaster period
- **§6601 Interest** — Daily-compounded interest differential (IRS start date vs Kwong 07/11/2023 start)
- **§6601 Interest on Penalties** — Cascading interest on wrongly-assessed FTF, FTP, and §6654 penalties

Produces both a **conservative estimate** (interest on declining principal) and a **full §6622 computation** (interest-on-interest per IRS methodology) as a range.

## Disaster Period

January 20, 2020 through July 10, 2023 (FEMA incident period + 60 statutory days). Claim deadline: **July 10, 2026**.

## PDF Upload (Optional)

The PDF scanner uses the Anthropic API to extract transcript text from scanned/native PDFs. Enter your API key in Settings (gear icon). The key stays in browser memory only — never logged or transmitted anywhere except the Anthropic API.

For production deployment, the API call routes through a Vite dev proxy (`/api/anthropic → api.anthropic.com`). On GitHub Pages (static), PDF upload requires direct browser access — the `anthropic-dangerous-direct-browser-access` header is included for this purpose.

## Supported Tax Years

| Tax Year | Due Date | Notes |
|----------|----------|-------|
| 2019 | 07/15/2020 | Notice 2020-23 COVID extension |
| 2020 | 05/17/2021 | Notice 2021-21 COVID extension |
| 2021 | 04/18/2022 | Emancipation Day |
| 2022 | 04/18/2023 | Emancipation Day |

## Legal Basis

- **I.R.C. § 7508A(d)** (2019 version, Pub. L. No. 116-94, § 204)
- *Kwong v. United States*, 179 Fed. Cl. 382 (2025) — invalidated Treas. Reg. § 301.7508A-1(g)(3)(ii) one-year cap
- *Abdo v. Commissioner*, 162 T.C. 148 (2024) — invalidated Treas. Reg. §§ 301.7508A-1(g)(1) and (g)(2)
- **I.R.C. § 7508A(f)** (Pub. L. No. 119-64, Dec. 26, 2025) — extends lookback window for claims filed after 12/26/2025

## ⚠️ Disclaimer

This is a **computation aid only**. All outputs require independent verification by a qualified tax professional per Circular 230 § 10.22. Computations are not a substitute for professional judgment. I.R.C. § 6676 imposes a 20% penalty on erroneous refund claims.

## License

MIT
