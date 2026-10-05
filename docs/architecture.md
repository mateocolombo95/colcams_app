# Architecture

```text
Installer / Technician
        |
        v
Next.js web app
        |
        v
FastAPI API
  |        |          |
  |        |          +--> Quote / proposal generation
  |        +-------------> Deterministic sizing engine
  +----------------------> MongoDB
```

## Backend responsibilities

- Customer/project persistence
- Survey validation
- CCTV sizing rules
- Product catalog
- Supplier price lists
- BOM generation
- Internal costing
- Margin calculations
- Price snapshots
- Quote versioning

## Frontend responsibilities

- Mobile-first survey UX
- Customer/site input
- Guided CCTV requirements
- Proposed solution display
- Manual overrides
- Commercial proposal editor
- Later: site map / plan editor

## Data strategy

MongoDB is used for flexible project documents while the product model is still evolving.

Collections planned:

- `users`
- `companies`
- `customers`
- `projects`
- `products`
- `suppliers`
- `price_lists`
- `quote_versions`
- `settings`

A future quote should embed a snapshot of selected product descriptions and prices so historical quotes do not change when the current supplier catalog changes.
