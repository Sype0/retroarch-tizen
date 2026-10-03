#!/usr/bin/env python3
"""Serve a ROM folder to RetroArch on the TV.

Usage:  python3 rom-server.py [folder] [port]

Works on Windows, Linux, macOS and Android (Termux). Same as
`python3 -m http.server`, plus the CORS header the TV app needs when it runs
inside TizenBrew.
"""
import http.server
import os
import socket
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
    os.chdir(folder)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"ROM folder: {os.getcwd()}")
    print(f"Enter this address on the TV: http://{local_ip()}:{port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
