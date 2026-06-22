#!/usr/bin/env python3
"""Small HTTPS-only static server for Quest/WebXR LAN development."""

import argparse
import http.server
import pathlib
import ssl


class WebXRHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # WebXR sessions are allowed for this top-level origin.
        self.send_header("Permissions-Policy", "xr-spatial-tracking=(self)")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve this WebXR project over HTTPS")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--directory", default=".")
    args = parser.parse_args()

    root = pathlib.Path(args.directory).resolve()
    handler = lambda *a, **kw: WebXRHandler(*a, directory=str(root), **kw)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", args.port), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert, args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f"Serving {root} over HTTPS on port {args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nHTTPS server stopped.")


if __name__ == "__main__":
    main()
