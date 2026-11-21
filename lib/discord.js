// Minimal Discord Rich Presence client over Discord's local IPC pipe (no extra packages).
"use strict";
const net = require("net");
const crypto = require("crypto");

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2 };
const pipePath = (i) => (process.platform === "win32" ? `\\\\?\\pipe\\discord-ipc-${i}` : `${process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || "/tmp"}/discord-ipc-${i}`);

function encode(op, obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0); head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

class DiscordRPC {
  constructor(clientId, onStatus) { this.clientId = clientId; this.onStatus = onStatus || (() => {}); this.sock = null; this.ready = false; this.buf = Buffer.alloc(0); this.pending = null; }
  async connect() {
    for (let i = 0; i < 10; i++) {
      try { await this.tryPipe(i); return true; } catch (e) { /* next pipe */ }
    }
    this.onStatus({ ok: false, message: "Discord isn't running (or blocks Rich Presence)." });
    return false;
  }
  tryPipe(i) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(pipePath(i));
      const fail = (e) => { s.destroy(); reject(e); };
      s.once("error", fail);
      s.once("connect", () => {
        s.off("error", fail);
        this.sock = s;
        s.on("data", (d) => this.onData(d));
        s.on("close", () => { this.ready = false; this.sock = null; this.onStatus({ ok: false, message: "Disconnected from Discord." }); });
        s.on("error", () => {});
        s.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
        resolve();
      });
    });
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0), len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) return;
      let msg = null; try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString("utf8")); } catch (e) { /* ignore */ }
      this.buf = this.buf.slice(8 + len);
      if (op === OP.CLOSE) { this.onStatus({ ok: false, message: (msg && msg.message) || "Discord closed the connection (check the application ID)." }); this.close(); return; }
      if (msg && msg.evt === "READY") { this.ready = true; this.onStatus({ ok: true, message: `Connected to Discord as ${msg.data && msg.data.user ? msg.data.user.username : "you"}` }); if (this.pending) { this.setActivity(this.pending); this.pending = null; } }
      if (msg && msg.evt === "ERROR") this.onStatus({ ok: false, message: msg.data && msg.data.message });
    }
  }
  setActivity(activity) {
    if (!this.sock || !this.ready) { this.pending = activity; return; }
    this.sock.write(encode(OP.FRAME, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: activity || undefined }, nonce: crypto.randomUUID() }));
  }
  close() { try { if (this.sock) { this.sock.write(encode(OP.CLOSE, {})); this.sock.destroy(); } } catch (e) { /* ignore */ } this.sock = null; this.ready = false; }
}

module.exports = { DiscordRPC, encode };
