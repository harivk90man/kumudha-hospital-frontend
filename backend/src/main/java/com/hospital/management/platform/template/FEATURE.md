# template — Feature

## Package
[platform](../MODULE.md)

## Tables
`document_templates`

## Schema reference
[05 · Document Templates](../../../../../../../../../../../docs/03-schema/v3/modules/05-document-templates.html)

## Business rules
- Templates are versioned — `is_active` controls which version is live; old versions are soft-deleted, not removed
- `template_type` determines the renderer: `prescription`, `invoice`, `lab_report`, `discharge_summary`, etc.
- Template body uses a placeholder syntax (e.g. `{{patient_name}}`) resolved at render time by the calling feature
- Other packages call `TemplateService.render(templateType, Map<String, Object> variables)` — they never read `document_templates` directly

## API endpoints
_To be defined during implementation._

## Known constraints
- Template rendering is synchronous and in-process — no async job needed at Phase 1 volume
- PDF generation via a Java PDF library (iText or Flying Saucer) — decided during implementation sprint
