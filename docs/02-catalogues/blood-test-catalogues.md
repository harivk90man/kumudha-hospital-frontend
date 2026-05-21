# Blood Test Catalogues — Phase 1

Defines every lab test supported in Phase 1: the test name, sample type, result fields, units, and normal reference ranges.
Used as the source of truth for the data model (result storage structure) and for building the lab report screen.

> **Related:** [Hospital Flows](../01-brd/hospital-flows.md) — see Section 7 (Lab & Radiology Flow) for how these tests fit into the patient journey.

---

## 1. Panel Tests
One order produces multiple result fields. Each field is stored and displayed individually.

---

### 1.1 CBC — Complete Blood Count

**Sample:** Venous blood (EDTA tube)

| Field | Full Name | Unit | Normal Range (Adult) |
|-------|-----------|------|----------------------|
| Hb | Haemoglobin | g/dL | M: 13.5–17.5 / F: 12.0–15.5 |
| RBC | Red Blood Cell Count | million/µL | M: 4.5–5.9 / F: 4.1–5.1 |
| WBC | White Blood Cell Count | cells/µL | 4,000–11,000 |
| Neutrophils | — | % | 40–70 |
| Lymphocytes | — | % | 20–40 |
| Monocytes | — | % | 2–8 |
| Eosinophils | — | % | 1–4 |
| Basophils | — | % | 0–1 |
| Platelets | Platelet Count | lakhs/µL | 1.5–4.5 |
| PCV / Hct | Packed Cell Volume / Haematocrit | % | M: 41–53 / F: 36–46 |
| MCV | Mean Corpuscular Volume | fL | 80–100 |
| MCH | Mean Corpuscular Haemoglobin | pg | 27–33 |
| MCHC | Mean Corpuscular Haemoglobin Concentration | g/dL | 32–36 |

---

### 1.2 LFT — Liver Function Test

**Sample:** Venous blood (plain / gel tube)

| Field | Full Name | Unit | Normal Range (Adult) |
|-------|-----------|------|----------------------|
| Total Bilirubin | — | mg/dL | 0.2–1.2 |
| Direct Bilirubin (BD) | Bilirubin Direct | mg/dL | 0.0–0.3 |
| Indirect Bilirubin | Calculated (Total − Direct) | mg/dL | 0.1–0.8 |
| SGOT | Aspartate Aminotransferase (AST) | U/L | 10–40 |
| SGPT | Alanine Aminotransferase (ALT) | U/L | 7–56 |
| ALP | Alkaline Phosphatase | U/L | 44–147 |
| Total Protein | — | g/dL | 6.0–8.3 |
| Albumin | — | g/dL | 3.5–5.0 |
| Globulin | Calculated (Total Protein − Albumin) | g/dL | 2.0–3.5 |
| A/G Ratio | Albumin to Globulin Ratio | — | 1.0–2.5 |

> **Note:** BD (Bilirubin Direct) is always reported as part of LFT — it is never ordered as a standalone test.

---

### 1.3 RFT — Renal Function Test

**Sample:** Venous blood (plain / gel tube)

| Field | Full Name | Unit | Normal Range (Adult) |
|-------|-----------|------|----------------------|
| Creatinine | Serum Creatinine | mg/dL | M: 0.7–1.3 / F: 0.5–1.1 |
| Urea | Blood Urea | mg/dL | 15–45 |
| BUN | Blood Urea Nitrogen | mg/dL | 7–20 |
| Uric Acid | Serum Uric Acid | mg/dL | M: 3.5–7.2 / F: 2.6–6.0 |
| Sodium (Na⁺) | Serum Sodium | mEq/L | 136–145 |
| Potassium (K⁺) | Serum Potassium | mEq/L | 3.5–5.1 |
| Chloride (Cl⁻) | Serum Chloride | mEq/L | 98–107 |
| eGFR | Estimated Glomerular Filtration Rate | mL/min/1.73m² | > 90 (normal) |

---

### 1.4 Urine Analyzer — Urine Routine & Microscopy

**Sample:** Mid-stream urine (clean-catch)

| Field | Unit / Type | Normal |
|-------|-------------|--------|
| Colour | Descriptive | Pale yellow to amber |
| Appearance | Descriptive | Clear |
| pH | — | 4.5–8.0 |
| Specific Gravity | — | 1.005–1.030 |
| Protein | Negative / + to ++++ | Negative |
| Glucose | Negative / + to ++++ | Negative |
| Ketones | Negative / + to ++++ | Negative |
| Bilirubin | Negative / + to ++++ | Negative |
| Urobilinogen | EU/dL | 0.1–1.0 |
| Nitrites | Negative / Positive | Negative |
| Leucocyte Esterase | Negative / + to ++++ | Negative |
| RBCs (microscopy) | cells/HPF | 0–2 |
| WBCs (microscopy) | cells/HPF | 0–5 |
| Epithelial Cells | cells/HPF | Few |
| Casts | Descriptive | None / Occasional hyaline |
| Crystals | Descriptive | None significant |
| Bacteria | Descriptive | None seen |

---

## 2. Single-Value Tests
One order produces one numeric result.

---

### 2.1 CRP — C-Reactive Protein

**Sample:** Venous blood (plain / gel tube)

| Field | Unit | Normal Range |
|-------|------|--------------|
| CRP | mg/L | < 5.0 (low risk) |

> Values 5–10 mg/L = mild elevation; > 10 mg/L = significant inflammation / infection.

---

### 2.2 ESR — Erythrocyte Sedimentation Rate

**Sample:** Venous blood (EDTA tube)

| Field | Unit | Normal Range (Adult) |
|-------|------|----------------------|
| ESR (1 hour) | mm/hr | M: 0–15 / F: 0–20 |

---

### 2.3 HbA1C — Glycated Haemoglobin

**Sample:** Venous blood (EDTA tube)

| Field | Unit | Interpretation |
|-------|------|----------------|
| HbA1C | % | < 5.7% Normal / 5.7–6.4% Pre-diabetic / ≥ 6.5% Diabetic |

---

### 2.4 Glucose — Blood Glucose

**Sample:** Venous blood (fluoride oxalate tube)

| Field | Unit | Normal Range |
|-------|------|--------------|
| Fasting Blood Glucose | mg/dL | 70–100 |
| Random Blood Glucose | mg/dL | < 140 |
| Post-Prandial (2hr PP) | mg/dL | < 140 |

> Doctor specifies at the time of ordering whether the test is fasting, random, or post-prandial. This is recorded alongside the result.

---

### 2.5 BT — Bleeding Time

**Sample:** Capillary blood (finger-prick / earlobe)

| Field | Unit | Normal Range |
|-------|------|--------------|
| Bleeding Time | minutes | 2–7 minutes (Duke method) |

> Standalone test — not part of LFT. Typically ordered pre-surgery or when a platelet/clotting disorder is suspected.

---

## 3. Qualitative Tests
Result is a category or positive/negative, not a numeric value.

---

### 3.1 HIV — HIV 1 & 2 Screening

**Sample:** Venous blood (plain / gel tube)

| Field | Result Type | Reportable Values |
|-------|-------------|-------------------|
| HIV 1 & 2 Antibody | Qualitative | Non-Reactive / Reactive |

> Reactive results must be confirmed with a second confirmatory test before reporting to the patient.

---

### 3.2 HCV — Hepatitis C Virus Antibody

**Sample:** Venous blood (plain / gel tube)

| Field | Result Type | Reportable Values |
|-------|-------------|-------------------|
| Anti-HCV | Qualitative | Non-Reactive / Reactive |

---

### 3.3 HBsAg — Hepatitis B surface Antigen

**Sample:** Venous blood (plain / gel tube)

| Field | Result Type | Reportable Values |
|-------|-------------|-------------------|
| HBsAg | Qualitative | Non-Reactive / Reactive |

---

### 3.4 Blood Grouping — ABO & Rh Typing

**Sample:** Venous blood (EDTA tube)

| Field | Result Type | Reportable Values |
|-------|-------------|-------------------|
| ABO Group | Qualitative | A / B / AB / O |
| Rh Factor | Qualitative | Positive / Negative |

> Always reported together as a combined result (e.g., "B Positive", "O Negative").
