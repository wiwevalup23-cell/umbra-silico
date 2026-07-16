# Local API

The desktop local HTTP API is intentionally not implemented in the MVP.

Phase 10 only reserves this folder for the post-MVP transport layer. Automation
contracts and the in-process event bus live one level above this directory.
Future endpoints are described by `automationLocalApiContract`; no HTTP server,
port listener, Python bridge, or agent runtime should be added here before the
post-MVP local API phase.
