# vendor — Feature

## Package
[inventory](../MODULE.md)

## Tables
`vendors`, `vendor_contacts`

## Schema reference
[14 · Inventory](../../../../../../../../../../../docs/03-schema/v3/modules/14-inventory.html#vendors)

## Business rules
- `vendors` holds supplier master data — GST number is unique per active vendor
- `vendor_contacts` is a child table — one vendor may have multiple contacts (purchase manager, accounts, etc.)
- Soft-deleting a vendor does not affect existing `purchase_orders` — RESTRICT FK prevents hard delete if POs exist
- `vendor_contacts.is_primary` — at most one primary contact per vendor (partial unique index enforces)
- Vendor approval status (`approval_status`) controls whether new POs can be raised against a vendor — unapproved vendors are blocked at application level

## API endpoints
_To be defined during implementation._

## Known constraints
- `vendors.gstin` format validated by CHECK `char_length(gstin) = 15` — application layer validates the full GSTIN checksum
- Vendor bank details stored in `bank_details jsonb` — typed POJO `VendorBankDetails(accountNumber, ifscCode, bankName, branchName)`
