"""Read-only staging health diagnostic; a receipt is not an external alert."""
import argparse
import datetime
import json
from pathlib import Path
import shutil
import subprocess
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def http_check(url, token=None, catalog=False):
    headers = {'Authorization': 'Bearer ' + token} if token else {}
    try:
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(urllib.request.Request(url, headers=headers), timeout=15) as response:
            data = json.loads(response.read(2_000_001))
            if catalog:
                count = len(data['data']) if isinstance(data.get('data'), list) else 0
                return {'ok': response.status == 200 and count > 0, 'modelCount': count}
            return {'ok': response.status == 200 and (data.get('ok') is True or data.get('status') == 'ok')}
    except Exception as error:
        if isinstance(error, urllib.error.HTTPError):
            error.close()
        return {'ok': False, 'errorType': type(error).__name__}


def archive_check(directory, pattern, max_age_hours=26):
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    candidates = [p for p in Path(directory).glob(pattern) if p.is_file() and not p.is_symlink()]
    if not candidates:
        return {'ok': False, 'reason': 'NO_ARCHIVE'}
    newest = max(candidates, key=lambda p: p.stat().st_mtime)
    age = (now - newest.stat().st_mtime) / 3600
    return {'ok': 0 <= age <= max_age_hours and newest.stat().st_size > 0,
            'ageHours': round(age, 3), 'bytes': newest.stat().st_size}


def inspect(env_file, pg_backups, router_backups):
    values = {}
    for line in Path(env_file).read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            if key.strip() in ['OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY']:
                values[key.strip()] = value.strip().strip('"').strip("'")
    base = values['OMNIROUTE_BASE_URL'].rstrip('/')
    if base.endswith('/v1'):
        base = base[:-3]
    checks = {'apiReadiness': http_check('http://127.0.0.1:3000/ready'),
              'routerLiveness': http_check(base + '/api/health'),
              'routerAuthenticatedCatalog': http_check(base + '/v1/models', values['OMNIROUTE_API_KEY'], True),
              'postgresArchive': archive_check(pg_backups, 'novelforge-daily-*.dump'),
              'routerArchive': archive_check(router_backups, 'router-*.sqlite')}
    for service in ['nf-api', 'nf-web', 'nf-worker', 'akanesia-router', 'garage']:
        result = subprocess.run(['systemctl', 'is-active', service], capture_output=True, text=True, timeout=10)
        checks[service] = {'ok': result.returncode == 0 and result.stdout.strip() == 'active'}
    usage = shutil.disk_usage('/')
    checks['disk'] = {'ok': usage.used / usage.total < 0.85, 'usedPercent': round(100 * usage.used / usage.total, 2)}
    memory = {line.split(':')[0]: int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith(('MemTotal:', 'MemAvailable:'))}
    used = 1 - memory['MemAvailable'] / memory['MemTotal']
    checks['memory'] = {'ok': used < 0.85, 'usedPercent': round(100 * used, 2)}
    return {'ok': all(c['ok'] for c in checks.values()), 'checks': checks,
            'externalAlertDelivery': 'NOT_IMPLEMENTED_BY_THIS_HELPER', 'providerGeneration': 'NOT_PROBED',
            'archiveIntegrity': 'NOT_RECHECKED_BY_MONITOR'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--pg-backups', required=True)
    parser.add_argument('--router-backups', required=True)
    args = parser.parse_args()
    try:
        result = inspect(args.env_file, args.pg_backups, args.router_backups)
        print(json.dumps(result))
        raise SystemExit(0 if result['ok'] else 1)
    except Exception as error:
        print(json.dumps({'ok': False, 'errorType': type(error).__name__}))
        raise SystemExit(1)
