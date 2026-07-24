# Public Sample Scenario Pack

[`examples/public-scenarios.json`](../examples/public-scenarios.json) contains three deterministic,
fully synthetic SAF decision scenarios. They contain no live market data, accounts, credentials, or
production assumptions and are intended for demos, UI checks, and reviewer comparison.

## Load in the UI

1. Start the local API and web app as described in [QUICKSTART.md](./QUICKSTART.md).
2. Open **Scenarios** and configure the local `x-admin-token`.
3. For each object in the JSON file, paste `name`, `preferences`, and `route_edits` into the scenario
   form, then save it.
4. Load the three saved scenarios in turn and compare their fossil benchmark, carbon context, and
   edited SAF pathway values.

## API form

With a local admin token, create one scenario at a time through the public API contract:

```bash
curl -X POST 'http://127.0.0.1:8000/v1/scenarios?workspace_slug=default' \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <your-local-admin-token>' \
  --data @one-scenario.json
```

The supplied file is a pack, so extract one object into `one-scenario.json` before calling the API.
Do not interpret any numbers in the pack as forecasts or investment recommendations.
