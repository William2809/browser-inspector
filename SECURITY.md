# Security Analysis

This project is designed to run entirely locally with no external network
requests. The following checks were run to validate that posture.

## Automated Checks

- Dependency audit: `npm audit --omit=dev` (0 vulnerabilities)
- CI scans for prohibited network calls (fetch, XHR, sendBeacon, WebSocket)
- CI scans for analytics/telemetry keywords
- CI scans for `eval` and `new Function` usage

## Manual Review Notes

- Captured data is stored only in `chrome.storage.local`.
- No telemetry or external endpoints are present in the source tree.

If you believe you have found a security issue, please open a private advisory
via the project maintainer profile: https://github.com/william2809
