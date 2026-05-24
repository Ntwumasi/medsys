# medsys-bridge Orthanc Python plugin
#
# Fires on STABLE_STUDY (study fully received — modality finished sending all
# instances) and notifies the medsys-bridge service running on localhost. The
# bridge then fetches study metadata from Orthanc's REST API and forwards it
# to MedSys.
#
# Why STABLE_STUDY (not NEW_INSTANCE):
#   STABLE_STUDY fires once per study after a quiet period (default 60s) so
#   we don't hammer MedSys on every image. NEW_INSTANCE would fire 50+ times
#   for a single ultrasound study.
#
# Why notify the bridge instead of POSTing to MedSys directly:
#   The bridge holds the BRIDGE_API_KEY, knows how to retry, and centralises
#   the cloud-side API surface in one place. The plugin stays minimal.

import json
import urllib.request
import urllib.error

try:
    import orthanc
except ImportError:
    raise SystemExit('This script is loaded by the orthanc-python plugin, not run directly')

BRIDGE_URL = 'http://127.0.0.1:9000/study-stored'
REQUEST_TIMEOUT_SECONDS = 5


def notify_bridge(orthanc_study_id):
    payload = json.dumps({'orthanc_study_id': orthanc_study_id}).encode('utf-8')
    req = urllib.request.Request(
        BRIDGE_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
    )
    try:
        urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS)
        print('[medsys-bridge] notified bridge for study {}'.format(orthanc_study_id))
    except urllib.error.URLError as exc:
        # Bridge service might be down — log but don't crash Orthanc.
        # The bridge has its own catch-up on next study, and MedSys can also
        # be backfilled manually via the Orthanc REST API.
        print('[medsys-bridge] WARN: bridge unreachable ({}): {}'.format(BRIDGE_URL, exc))
    except Exception as exc:
        print('[medsys-bridge] ERROR notifying bridge: {}'.format(exc))


def on_change(change_type, level, resource):
    if change_type == orthanc.ChangeType.STABLE_STUDY:
        notify_bridge(resource)


orthanc.RegisterOnChangeCallback(on_change)
print('[medsys-bridge] plugin loaded; will notify {} on STABLE_STUDY'.format(BRIDGE_URL))
