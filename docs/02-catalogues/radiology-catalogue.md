# Radiology Catalogue — Phase 1

> **Status:** Stub. Mirror the structure of [blood-test-catalogues.md](blood-test-catalogues.md): list every imaging study supported in v1, the modality, body part / view, contrast (if any), patient prep, expected report sections, and turnaround time.

> **Related:** [Hospital Flows §7 (Lab & Radiology Flow)](../01-brd/hospital-flows.md#7-lab--radiology-flow) · [Lab & Radiology Rules](../01-brd/lab-radiology-rules.md).

## Suggested template per study

For each study, capture:

- **Study name** (e.g. *Chest PA*)
- **Modality** (X-ray / Ultrasound / CT / MRI / ECG / Echo)
- **Body part / view**
- **Contrast** — none / oral / IV / both
- **Patient prep** (fasting, bladder full, metal-removed, etc.)
- **Equipment / room**
- **Standard report sections** (Indication / Technique / Findings / Impression)
- **Output artifacts** (image file count, format, report doc type)
- **TAT** target — sample-to-report turnaround
- **Pricing** — base fee (linked to `services` table; not duplicated here)

## Modalities expected in v1

| Modality | Notes |
|---|---|
| **X-ray** | Chest, abdomen, limb, spine, skull. Standard views per part |
| **Ultrasound** | Abdomen, pelvis, obstetric, soft-tissue, doppler studies |
| **ECG** | Resting 12-lead. Trace stored as digital strip |
| **Echo** | Echocardiogram — measurements + observations |
| **CT** | If installed in-house. Otherwise outsourced — out of scope |
| **MRI** | If installed in-house. Otherwise outsourced — out of scope |

## TODO

- [ ] Get the actual list of modalities Kumudha Hospital operates from the radiology lead
- [ ] Confirm contrast protocols and informed-consent template
- [ ] Decide DICOM storage strategy — file_attachments blob? PACS integration? (PACS is Phase-2)
- [ ] Define report templates per modality in `document_templates`
