#!/usr/bin/env python3
"""Register panel UUIDs on the existing REALITY inbound.

The legacy client (email reality-main) is never modified.
New clients are named zhanmen-<id> and get their own routing rules.
"""
import json
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

DB = Path("/etc/x-ui/x-ui.db")
CFG = Path("/usr/local/x-ui/bin/config.json")
BACKUP = Path("/etc/zhanmen/x-ui.db.before-panel-clients")
LEGACY_EMAIL = "reality-main"
PROBE = ["gstatic.com", "cp.cloudflare.com"]


def connect():
    db = sqlite3.connect(DB, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def legacy_uuid(db):
    row = db.execute("select uuid from clients where email = ?", (LEGACY_EMAIL,)).fetchone()
    if row is None:
        raise SystemExit("legacy client missing")
    return row["uuid"]


def load_json(path):
    return json.loads(path.read_text())


def client_object(email, uuid, now):
    return {
        "comment": "",
        "created_at": now,
        "email": email,
        "enable": True,
        "expiryTime": 0,
        "flow": "xtls-rprx-vision",
        "id": uuid,
        "limitIp": 0,
        "reset": 0,
        "resetDay": 0,
        "resetMax": 0,
        "security": "",
        "subId": email[:16],
        "tgId": 0,
        "totalGB": 0,
        "updated_at": now,
    }


def ensure_client(db, uuid, now):
    email = "zhanmen-" + uuid.replace("-", "")[:12]
    if db.execute("select 1 from clients where email = ? and uuid != ?", (email, uuid)).fetchone():
        raise SystemExit("client email collision")
    if db.execute("select 1 from clients where uuid = ? and email = ?", (uuid, LEGACY_EMAIL)).fetchone():
        raise SystemExit("refusing to reuse the legacy uuid")
    row = db.execute("select id, email from clients where uuid = ?", (uuid,)).fetchone()
    if row is None:
        db.execute(
            """
            insert into clients (
              email, sub_id, uuid, password, flow, enable, limit_ip, limit_hwid,
              total_gb, expiry_time, tg_id, group_name, comment, reset, reset_day,
              reset_max, traffic_reset, traffic_reset_day, created_at, updated_at, sync_orphaned_at
            ) values (?, ?, ?, '', 'xtls-rprx-vision', 1, 0, 0, 0, 0, 0, '', '', 0, 0, 0, 'never', 1, ?, ?, 0)
            """,
            (email, email[:16], uuid, now, now),
        )
        cid = db.execute("select id from clients where uuid = ?", (uuid,)).fetchone()["id"]
        db.execute(
            "insert into client_inbounds (client_id, inbound_id, flow_override, created_at) values (?, 1, 'xtls-rprx-vision', ?)",
            (cid, now),
        )
    elif not str(row["email"]).startswith("zhanmen-"):
        raise SystemExit("uuid belongs to a non-panel client")
    else:
        db.execute(
            "update client_inbounds set flow_override = 'xtls-rprx-vision' where client_id = ? and coalesce(flow_override, '') = ''",
            (row["id"],),
        )
    settings = json.loads(db.execute("select settings from inbounds where id = 1").fetchone()["settings"])
    clients = settings.get("clients") or []
    if not any(item.get("id") == uuid for item in clients):
        clients.append(client_object(email, uuid, now))
        settings["clients"] = clients
        db.execute("update inbounds set settings = ? where id = 1", (json.dumps(settings, separators=(",", ":")),))
    if db.execute("select 1 from client_traffics where email = ?", (email,)).fetchone() is None:
        db.execute(
            """
            insert into client_traffics (
              inbound_id, enable, email, up, down, expiry_time, total, reset, reset_day, reset_max, reset_count, last_online, last_sub_fetch
            ) values (1, 1, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            """,
            (email,),
        )


def retire_panel_clients(db, keep):
    rows = db.execute("select id, uuid, email from clients where email like 'zhanmen-%'").fetchall()
    gone = [row for row in rows if row["uuid"] not in keep]
    if not gone:
        return
    ids = [row["id"] for row in gone]
    uuids = {row["uuid"] for row in gone}
    emails = [row["email"] for row in gone]
    db.executemany("delete from client_inbounds where client_id = ?", [(item,) for item in ids])
    db.executemany("delete from client_traffics where email = ?", [(item,) for item in emails])
    db.executemany("delete from clients where id = ?", [(item,) for item in ids])
    settings = json.loads(db.execute("select settings from inbounds where id = 1").fetchone()["settings"])
    settings["clients"] = [
        item
        for item in settings.get("clients") or []
        if item.get("email") == LEGACY_EMAIL or (item.get("id") in keep and str(item.get("email") or "").startswith("zhanmen-"))
    ]
    db.execute("update inbounds set settings = ? where id = 1", (json.dumps(settings, separators=(",", ":")),))


def panel_emails(db):
    return [row["email"] for row in db.execute("select email from clients where email like 'zhanmen-%' order by email")]


def routing_rules(emails, domains):
    allow = [f"domain:{item}" for item in domains] + [f"domain:{item}" for item in PROBE]
    return [
        {"type": "field", "user": emails, "domain": ["geosite:cn"], "outboundTag": "direct"},
        {"type": "field", "user": emails, "ip": ["geoip:cn"], "outboundTag": "direct"},
        {"type": "field", "user": emails, "domain": allow, "outboundTag": "direct"},
        {"type": "field", "user": emails, "outboundTag": "blocked"},
    ]


def template_from_live(emails, domains):
    cfg = load_json(CFG)
    cfg["inbounds"] = [item for item in cfg.get("inbounds", []) if item.get("port") != 443]
    rules = [
        item
        for item in (cfg.get("routing") or {}).get("rules") or []
        if not (isinstance(item.get("user"), list) and any(str(user).startswith("zhanmen-") for user in item["user"]))
    ]
    insert = routing_rules(emails, domains) if emails else []
    cfg.setdefault("routing", {})["rules"] = rules[:1] + insert + rules[1:]
    return cfg


def save_template(db, cfg):
    raw = json.dumps(cfg, separators=(",", ":"))
    if "privateKey" in raw:
        raise SystemExit("refusing to store the inbound private key in the template")
    if db.execute("select 1 from settings where key = 'xrayTemplateConfig'").fetchone():
        db.execute("update settings set value = ? where key = 'xrayTemplateConfig'", (raw,))
    else:
        db.execute("insert into settings (key, value) values ('xrayTemplateConfig', ?)", (raw,))


def already_applied(uuids, domains):
    if not CFG.exists():
        return False
    live = load_json(CFG)
    inbound = next((item for item in live.get("inbounds", []) if item.get("port") == 443), None)
    if inbound is None:
        return False
    clients = inbound.get("settings", {}).get("clients") or []
    if LEGACY_EMAIL not in [item.get("email") for item in clients]:
        return False
    live_ids = {item.get("id") for item in clients if str(item.get("email") or "").startswith("zhanmen-")}
    if live_ids != set(uuids):
        return False
    for item in clients:
        if str(item.get("email") or "").startswith("zhanmen-") and item.get("flow") != "xtls-rprx-vision":
            return False
    rules = [
        item
        for item in (live.get("routing") or {}).get("rules") or []
        if isinstance(item.get("user"), list) and any(str(user).startswith("zhanmen-") for user in item["user"])
    ]
    expected = routing_rules(sorted("zhanmen-" + item.replace("-", "")[:12] for item in uuids), domains) if uuids else []
    return rules == expected


def apply(path):
    payload = json.loads(Path(path).read_text())
    uuids = payload.get("uuids") or []
    domains = payload.get("domains") or []
    if any(len(item) != 36 or item.count("-") != 4 for item in uuids):
        raise SystemExit("bad uuid")
    if already_applied(uuids, domains):
        print(json.dumps({"unchanged": True, "panel": len(uuids)}))
        return
    if not BACKUP.exists():
        BACKUP.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(DB, BACKUP)
    subprocess.run(["systemctl", "stop", "x-ui"], check=True)
    db = connect()
    try:
        before = legacy_uuid(db)
        now = int(time.time() * 1000)
        for uuid in uuids:
            ensure_client(db, uuid, now)
        retire_panel_clients(db, set(uuids))
        emails = panel_emails(db)
        save_template(db, template_from_live(emails, domains))
        after = legacy_uuid(db)
        if before != after:
            raise SystemExit("legacy uuid changed; aborting")
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        subprocess.run(["systemctl", "start", "x-ui"], check=True)
    for _ in range(40):
        time.sleep(0.5)
        if subprocess.run(["systemctl", "is-active", "--quiet", "x-ui"]).returncode != 0 or not CFG.exists():
            continue
        live = load_json(CFG)
        inbound = next((item for item in live.get("inbounds", []) if item.get("port") == 443), None)
        if inbound is None:
            continue
        emails_live = [item.get("email") for item in inbound.get("settings", {}).get("clients") or []]
        if LEGACY_EMAIL in emails_live and all(("zhanmen-" + item.replace("-", "")[:12]) in emails_live for item in uuids):
            break
    else:
        raise SystemExit("xray did not load the panel client")
    live = load_json(CFG)
    inbound = next(item for item in live["inbounds"] if item.get("port") == 443)
    emails_live = [item.get("email") for item in inbound["settings"]["clients"]]
    if len([item for item in live["inbounds"] if item.get("port") == 443]) != 1:
        raise SystemExit("443 inbound was duplicated")
    rules = live.get("routing", {}).get("rules") or []
    scoped = [item for item in rules if isinstance(item.get("user"), list)]
    if emails and not scoped:
        raise SystemExit("panel routing was not applied")
    print(json.dumps({"clients": len(emails_live), "panel": len(emails), "scopedRules": len(scoped)}))


def main():
    if len(sys.argv) != 3 or sys.argv[1] != "apply":
        raise SystemExit("usage: xray-sync.py apply payload.json")
    apply(sys.argv[2])


if __name__ == "__main__":
    main()
