# nine-realms

A minimal monorepo starter for the Nine Realms project.

## Setup

1. Install Python 3.11, Node.js, npm, and Make.
2. Copy `.env.example` to `.env` and set values as needed.
3. Run `make setup` to create the backend virtual environment, install Python
   requirements, and install frontend dependencies.
4. Run `make backend` and `make frontend` in separate terminals.
5. Open the frontend at <http://localhost:5173>; the backend health endpoint is
   available through <http://localhost:5173/api/health>.

## Team ownership

| Area | Owner |
| --- | --- |
| Backend | TBD |
| Frontend | TBD |
| API contracts | TBD |

## Exposure Metrics Specification (FR7.3 & FR8.2)

### Open Question for Organizers
> **Clarification Required:** Which unit does "true exposure" use in the evaluation ground truth?
> - **Option A:** Expected percentage drop in trade **volume** (metric tons / TEUs) over a stated horizon.
> - **Option B:** Expected percentage drop in trade **value** (USD equivalent) versus pre-event baseline.
> - **Horizon Window:** Next quarter (Q+1, 90-day window) versus annualized run-rate.

### Current Implementation Choice
Pending organizer confirmation, the Nine Realms engine adopts:
- **Unit:** Expected percent drop in trade value (USD) versus pre-event baseline.
- **Period:** Next quarter (Q+1 forward-looking outlook).
- **Format:** Low number and high number ranges for each country-sector pair (Thor high, Loki low, Odin final).
- **Rule:** Missing evidence displays `insufficient evidence`—no numbers are fabricated.

