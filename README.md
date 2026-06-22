# Universe 12's Greatest Assassin

A modular A-Frame/WebXR gray-box prototype designed for Meta Quest 3 Browser.

## Local HTTPS server

WebXR on a second device cannot use your computer's `http://localhost`; the Quest needs to reach an HTTPS origin on the computer's LAN address.

Requirements: Python 3 and OpenSSL (both are preinstalled on macOS).

```bash
chmod +x scripts/dev-https.sh
./scripts/dev-https.sh
```

The launcher:

1. Detects the computer's Wi-Fi/LAN IP.
2. Generates a 30-day self-signed certificate covering that IP and `localhost`.
3. Serves the project on every network interface at port `8443`.
4. Prints separate desktop and Quest URLs.

Use another port with `PORT=9443 ./scripts/dev-https.sh`. If automatic address detection fails, use `LAN_IP=192.168.1.25 ./scripts/dev-https.sh`.

Certificates are written under `.cert/`, which is intentionally git-ignored. The server also sends `Permissions-Policy: xr-spatial-tracking=(self)`.

## Test on Meta Quest 3

1. Put the computer and Quest on the same Wi-Fi network. Guest Wi-Fi often blocks device-to-device traffic, so use a normal/private network.
2. Start `./scripts/dev-https.sh` and keep that terminal open.
3. Put on the Quest and open **Browser**.
4. Enter the printed Quest URL exactly, for example `https://192.168.1.25:8443`.
5. For this local-only self-signed certificate, choose **Advanced** and continue to the site. Do not do this for an unexpected certificate on a public site.
6. Confirm the lower-left diagnostic says **HTTPS OK · IMMERSIVE VR READY**.
7. Select the headset icon / **Enter VR**, approve the immersive-mode prompt, and use the controllers.

If Quest Browser refuses to expose WebXR after the certificate warning, use a trusted HTTPS tunnel or deploy the same static files to an HTTPS host. Certificate errors can prevent an origin from qualifying as a secure context even when the URL starts with `https://`.

### Troubleshooting

- **Quest cannot connect:** verify the IP has not changed, disable VPNs, try a non-guest Wi-Fi network, and allow incoming Python connections in the computer firewall.
- **Certificate name error:** stop and restart the launcher; it regenerates the certificate when the LAN IP changes.
- **HTTPS required diagnostic:** the certificate was not accepted. Reopen the URL and complete the local certificate warning, or use a trusted HTTPS host/tunnel.
- **WebXR unavailable:** update Quest system software and use Meta Quest Browser rather than an embedded browser.
- **No Enter VR control:** confirm the diagnostic reports immersive VR support and that no other immersive application is active.

## Controls

| Action | Quest | Desktop fallback |
|---|---|---|
| Move | Left thumbstick | WASD |
| Look | Headset | Mouse |
| Dash | A button | Shift |
| Cloak (5 s) | X button | Q |
| Time freeze (3 s) | Y button | E |
| Energy blast | Right trigger | Left click |
| Melee | Left trigger/grip | F |

## Structure

- `index.html` — scene, gray-box map, player rig, NPC placement
- `game.js` — player abilities, weapons, enemy AI, mission state, HUD
- `styles.css` — loading, desktop help, win/lose overlays
- `scripts/dev-https.sh` — certificate generation and LAN launcher
- `scripts/https-server.py` — HTTPS static server and WebXR headers

All gameplay is composed from small A-Frame components to make expansion straightforward.
