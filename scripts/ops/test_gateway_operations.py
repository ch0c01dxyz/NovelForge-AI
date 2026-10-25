import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from contextlib import closing


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'router-sqlite-backup.py')
monitor = load('monitor', 'staging-monitor.py')


class OperationsTests(unittest.TestCase):
    def test_wal_snapshot_keeps_indexes_and_committed_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source.sqlite'
            with closing(sqlite3.connect(source)) as writer:
                writer.execute('PRAGMA journal_mode=WAL')
                writer.executescript('CREATE TABLE config(id INTEGER PRIMARY KEY,value TEXT); CREATE INDEX config_value ON config(value);')
                writer.execute('INSERT INTO config(value) VALUES (?)', ('private-fixture',))
                writer.commit()
                receipt = backup.snapshot(source, root / 'backups')
                self.assertEqual(receipt['tables'], {'config': 1})
                self.assertEqual(receipt['foreignKeyViolations'], 0)
                with closing(sqlite3.connect(root / 'backups' / receipt['archive'])) as restored:
                    self.assertEqual(restored.execute('SELECT value FROM config').fetchone(), ('private-fixture',))
                    self.assertIsNotNone(restored.execute("SELECT name FROM sqlite_master WHERE name='config_value'").fetchone())
                self.assertNotIn('private-fixture', json.dumps(receipt))

    def test_existing_lock_is_not_removed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with closing(sqlite3.connect(root / 'source.sqlite')) as db:
                db.execute('CREATE TABLE config(value TEXT)')
            folder = root / 'backups'
            folder.mkdir(mode=0o700)
            (folder / '.router-snapshot.lock').mkdir()
            with self.assertRaises(FileExistsError):
                backup.snapshot(root / 'source.sqlite', folder)
            self.assertTrue((folder / '.router-snapshot.lock').is_dir())

    def test_monitor_rejects_empty_catalog_and_failed_request(self):
        with patch.object(monitor.urllib.request.OpenerDirector, 'open', side_effect=TimeoutError):
            self.assertFalse(monitor.http_check('http://invalid.test')['ok'])
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, *_): return b'{"data":[]}'
        with patch.object(monitor.urllib.request.OpenerDirector, 'open', return_value=Response()):
            self.assertFalse(monitor.http_check('http://catalog.test', catalog=True)['ok'])

    def test_catalog_redirect_never_forwards_authorization(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        requests = []
        class Target(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append(self.headers.get('Authorization'))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"data":[{"id":"fixture"}]}')
            def log_message(self, *_): pass
        target = ThreadingHTTPServer(('127.0.0.1', 0), Target)
        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header('Location', 'http://127.0.0.1:' + str(target.server_port))
                self.end_headers()
            def log_message(self, *_): pass
        source = ThreadingHTTPServer(('127.0.0.1', 0), Redirect)
        threads = [Thread(target=s.serve_forever, daemon=True) for s in [target, source]]
        for thread in threads: thread.start()
        try:
            result = monitor.http_check('http://127.0.0.1:' + str(source.server_port), 'fixture-only', True)
            self.assertFalse(result['ok'])
            self.assertEqual(requests, [])
        finally:
            for server in [source, target]:
                server.shutdown()
                server.server_close()
            for thread in threads: thread.join()

    def test_archive_monitor_distinguishes_missing_fresh_and_stale(self):
        import os
        with tempfile.TemporaryDirectory() as temporary:
            self.assertFalse(monitor.archive_check(temporary, '*.dump')['ok'])
            archive = Path(temporary) / 'test.dump'
            archive.write_bytes(b'fixture')
            self.assertTrue(monitor.archive_check(temporary, '*.dump')['ok'])
            os.utime(archive, (0, 0))
            self.assertFalse(monitor.archive_check(temporary, '*.dump')['ok'])


if __name__ == '__main__':
    unittest.main()
