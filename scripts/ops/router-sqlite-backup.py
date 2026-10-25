"""Consistent router snapshot; never print database contents or credentials."""
import argparse
from contextlib import closing
import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import time


def inventory(db):
    schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    counts = {name: db.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
              for kind, name, _, _ in schema if kind == 'table'}
    return {'schemaSha256': hashlib.sha256(json.dumps(schema).encode()).hexdigest(), 'tables': counts}


def snapshot(source, directory):
    source, directory = Path(source).absolute(), Path(directory).absolute()
    if source.is_symlink() or not source.is_file():
        raise ValueError('source must be a regular SQLite database')
    directory.mkdir(mode=0o700, parents=False, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError('backup directory must be private and owned by the operator')
    lock = directory / '.router-snapshot.lock'
    lock.mkdir(mode=0o700)
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix='.router-', suffix='.partial', dir=directory)
        os.fchmod(fd, 0o600)
        os.close(fd)
        deadline = time.monotonic() + 120

        def progress(*_):
            if time.monotonic() > deadline:
                raise TimeoutError('snapshot deadline exceeded')

        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=15)) as src:
            src.execute('BEGIN')
            expected = inventory(src)
            with closing(sqlite3.connect(temporary)) as dst:
                src.backup(dst, pages=256, progress=progress, sleep=0.05)
                if dst.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise ValueError('snapshot integrity check failed')
                foreign_keys = len(dst.execute('PRAGMA foreign_key_check').fetchall())
                if foreign_keys:
                    raise ValueError('snapshot contains foreign key violations')
                if inventory(dst) != expected:
                    raise ValueError('snapshot inventory mismatch')
            src.rollback()
        # A restore opens a second independent connection, not the live database.
        with closing(sqlite3.connect(Path(temporary).as_uri() + '?mode=ro', uri=True)) as restored:
            if inventory(restored) != expected:
                raise ValueError('restored inventory mismatch')
        with open(temporary, 'rb') as handle:
            os.fsync(handle.fileno())
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        final = directory / ('router-' + stamp + '.sqlite')
        os.link(temporary, final)  # Exclusive publication; never overwrite an archive.
        os.unlink(temporary)
        temporary = None
        return {'archive': final.name, 'bytes': final.stat().st_size, 'sha256': digest,
                'integrity': 'ok', 'foreignKeyViolations': foreign_keys,
                'isolatedRestore': True, **expected}
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)
        lock.rmdir()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('directory')
    args = parser.parse_args()
    try:
        print(json.dumps(snapshot(args.source, args.directory)))
    except Exception as error:
        print(json.dumps({'ok': False, 'errorType': type(error).__name__}))
        raise SystemExit(1)
