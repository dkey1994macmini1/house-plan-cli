#!/usr/bin/env python3
"""Batched HousePlan stage commit: one call for the edit-stage cycle.
Usage: python3 stage_commit.py --repo REPO --plan PLAN --input OPS.json
        --expected-revision N --out NEW.json [--render LEVEL:OUT ...]
        [--render-all DIR] [--style technical|presentation] [--format svg|png]
        [--area-mode axis|net] [--width N]
Runs: preflight revision guard -> apply --dry-run gate -> apply -> read-back
confirm -> validate gate -> survey (plus survey of the pre-apply snapshot for
delta) -> requested renders. Full CLI envelopes land in --out; stdout is a
compact summary. Exit 0 committed+valid; 2 gate refused (no commit on
dry-run reject or render failures are stage failures); 1 input/CLI error.
Never overwrites the plan (render's own artifact safety stays in force);
this tool does not add --allow-invalid.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from typing import Optional


class GateFailure(Exception):
    def __init__(self, stage: str, envelope: dict, exit_code: int = 2):
        super().__init__(f'{stage}: {envelope}')
        self.stage = stage
        self.envelope = envelope
        self.exit_code = exit_code


def cli(repo: Path, command: list) -> dict:
    """Run one house-plan command; return {'rc', 'envelope'|'raw'} parsed per contract."""
    run = subprocess.run(['node', 'dist/bin.js', *command], cwd=str(repo),
                         capture_output=True, text=True, timeout=180)
    source = run.stdout if run.returncode == 0 else run.stderr
    try:
        envelope = json.loads(source)
    except json.JSONDecodeError:
        return {'rc': run.returncode, 'raw': source[:4000]}
    if not isinstance(envelope, dict):
        return {'rc': run.returncode, 'raw': source[:4000]}
    return {'rc': run.returncode, 'envelope': envelope}


def need(repo: Path, command: list, stage: str) -> dict:
    out = cli(repo, command)
    if out['rc'] or 'envelope' not in out or out['envelope'].get('ok') is not True:
        raise GateFailure(stage, out.get('envelope', {'raw': out.get('raw'), 'rc': out['rc']}))
    return out['envelope']


def counts(plan: dict) -> dict:
    totals = {'walls': 0, 'rooms': 0, 'openings': 0, 'objects': 0, 'stairs': 0, 'voids': 0, 'sites': 0}
    for storey in plan.get('storeys', []):
        for key in totals:
            totals[key] += len(storey.get(key, []) or [])
    if totals['sites'] == 0:
        del totals['sites']
    return totals


def warnings_codes(*envelopes) -> list:
    codes = []
    for envelope in envelopes:
        if not isinstance(envelope, dict):
            continue
        for diagnostic in (envelope.get('meta', {}) or {}).get('diagnostics', []) or []:
            code = diagnostic.get('code') or diagnostic.get('message', '')[:40]
            if code and code not in codes:
                codes.append(code)
    return codes


def preflight(plan_path: Path, expected_revision: int) -> int:
    source = json.loads(plan_path.read_text())
    revision = source.get('revision')
    if not isinstance(revision, int) or revision != expected_revision:
        raise GateFailure('preflight', {
            'error': {'type': 'REVISION_MISMATCH' if isinstance(revision, int) else 'UNREADABLE_PLAN',
                      'message': f'on-disk revision {revision!r} != expected {expected_revision}',
                      'hint': 're-read the plan (survey) and re-derive the batch; never replay blindly'}})
    return revision


def delta_area(repo: Path, snapshot_bytes: bytes) -> Optional[float]:
    """Survey the pre-apply snapshot from a private temp copy; None on any failure."""
    handle, temp = tempfile.mkstemp(suffix='.houseplan.json')
    try:
        with os.fdopen(handle, 'wb') as file:
            file.write(snapshot_bytes)
        out = cli(repo, ['survey', '--plan', temp])
        envelope = out.get('envelope')
        if out['rc'] == 0 and isinstance(envelope, dict) and envelope.get('ok') is True:
            return round(envelope['data']['levels'][0].get('faceAreaCm2', 0) / 10000, 3)
        return None
    except Exception:
        return None
    finally:
        os.unlink(temp)


def summarize(plan_path: Path, before_counts: dict, applied: dict, validation: dict,
              survey: dict, old_area: Optional[float], renders: list, packet: Path,
              elapsed: float) -> dict:
    post_plan = applied.get('data', {}).get('plan', {})
    after_counts = counts(post_plan)
    level0 = survey.get('data', {}).get('levels', [{}])[0]
    area = level0.get('faceAreaCm2', 0) / 10000
    net_area_cm2 = level0.get('netFaceAreaCm2')
    all_keys = list(dict.fromkeys([*before_counts.keys(), *after_counts.keys()]))
    summary = {
        'stageCommit': 'ok', 'plan': str(plan_path),
        'revision': post_plan.get('revision'),
        'valid': validation.get('data', {}).get('valid'),
        'areaM2': round(area, 3),
        'countsDelta': {key: after_counts.get(key, 0) - before_counts.get(key, 0)
                        for key in all_keys if after_counts.get(key, 0) != before_counts.get(key, 0)},
        'warnings': warnings_codes(applied, validation, survey),
        'renders': renders, 'packet': str(packet), 'elapsedSeconds': round(elapsed, 2),
    }
    if net_area_cm2 is not None:
        summary['netAreaM2'] = round(net_area_cm2 / 10000, 3)
    if old_area is not None:
        summary['deltaAreaM2'] = round(area - old_area, 3)
    return summary


def run_stage(repo: Path, plan_path: Path, ops_path: Path, expected_revision: int,
              renders: list, render_all: Optional[Path], style: str, fmt: str,
              width: Optional[int], area_mode: str = 'axis',
              visualize_out: Optional[Path] = None) -> dict:
    start = time.monotonic()
    revision = preflight(plan_path, expected_revision)
    snapshot = plan_path.read_bytes()

    applied = need(repo, ['apply', '--plan', str(plan_path), '--input', str(ops_path),
                          '--expected-revision', str(revision)], 'apply')
    post_revision = applied.get('data', {}).get('plan', {}).get('revision')
    if post_revision != revision + 1:
        raise GateFailure('readback', {'error': {'type': 'REVISION_READBACK_MISMATCH',
                                                 'message': f'persisted revision {post_revision!r} != {revision + 1}'}})

    embedded_survey = applied.get('data', {}).get('survey')
    if isinstance(embedded_survey, dict) and 'levels' in embedded_survey:
        survey = {'ok': True, 'type': 'plan.survey', 'schemaVersion': 1,
                  'data': {**embedded_survey, 'valid': True}, 'meta': applied.get('meta', {})}
        validation = {'ok': True, 'type': 'plan.validation', 'schemaVersion': 1,
                      'data': {'valid': True}, 'meta': applied.get('meta', {})}
        dry = {'ok': True, 'type': 'plan.dry_run', 'schemaVersion': 1,
               'data': applied.get('data', {}), 'meta': {'revision': revision}}
    else:
        dry = applied
        validation = need(repo, ['validate', '--plan', str(plan_path)], 'validate')
        if validation.get('data', {}).get('valid') is not True:
            raise GateFailure('validate', {'error': {'type': 'VALIDATION_FAILED',
                                                     'message': 'committed state is invalid; see packet',
                                                     'hint': 'plan persisted with the batch; fix with a follow-up batch'}})
        survey = need(repo, ['survey', '--plan', str(plan_path)], 'survey')

    old_area = delta_area(repo, snapshot)

    commands = []
    for index, (level, out_path) in enumerate(renders):
        command = ['render', '--plan', str(plan_path), '--level', level, '--out', str(out_path),
                   '--style', style, '--format', fmt, '--overwrite']
        if area_mode != 'axis':
            command += ['--area-mode', area_mode]
        if width:
            command += ['--width', str(width)]
        if visualize_out and index == 0:
            command += ['--visualize-out', str(visualize_out)]
        commands.append(command)
    if render_all:
        command = ['render', '--plan', str(plan_path), '--all-levels', '--out-dir', str(render_all),
                   '--style', style, '--format', fmt, '--overwrite']
        if area_mode != 'axis':
            command += ['--area-mode', area_mode]
        if width:
            command += ['--width', str(width)]
        commands.append(command)
    rendered = []
    for command in commands:
        need(repo, command, 'render')
        rendered.append(str(command[command.index('--out-dir') + 1] if '--out-dir' in command
                            else command[command.index('--out') + 1]))
    if visualize_out and renders:
        rendered.append(str(visualize_out))

    return {'dry': dry, 'applied': applied, 'validation': validation, 'survey': survey,
            'renderPaths': rendered, 'elapsedSeconds': round(time.monotonic() - start, 2),
            'beforeCounts': counts(json.loads(snapshot)), 'oldArea': old_area}


def parse_render(value: str) -> tuple:
    level, separator, path = value.partition(':')
    if not separator or not level or not path:
        raise ValueError(f'--render expects LEVEL:PATH, got {value!r}')
    return level, path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--expected-revision', type=int, required=True)
    parser.add_argument('--out', type=Path, required=True, help='new packet file holding all envelopes')
    parser.add_argument('--render', action='append', default=[], type=parse_render, metavar='LEVEL:PATH')
    parser.add_argument('--render-all', type=Path)
    parser.add_argument('--style', default='technical', choices=['technical', 'presentation'])
    parser.add_argument('--format', default='svg', choices=['svg', 'png'])
    parser.add_argument('--area-mode', default='axis', choices=['axis', 'net'])
    parser.add_argument('--width', type=int)
    parser.add_argument('--visualize-out', type=Path, help='optional path for normalized 0,0 viewBox SVG fragment')
    args = parser.parse_args()

    if args.out.exists() or any(args.out.resolve() == p.resolve()
                                for p in [args.plan, args.input, args.render_all, args.visualize_out] if p):
        raise ValueError('--out must be a new packet file, never the plan/ops/dir')
    ops = json.loads(args.input.read_text())
    if not isinstance(ops, list) or not ops:
        raise ValueError('--input must be a non-empty operations ARRAY')

    envelopes = {'preflight': {'expectedRevision': args.expected_revision}}
    exit_code = 0
    summary = None
    try:
        result = run_stage(args.repo.resolve(), args.plan.resolve(), args.input.resolve(),
                           args.expected_revision, args.render,
                           args.render_all.resolve() if args.render_all else None,
                           args.style, args.format, args.width, args.area_mode,
                           args.visualize_out.resolve() if args.visualize_out else None)
        envelopes.update({'dry_run': result['dry'], 'apply': result['applied'],
                          'validate': result['validation'], 'survey': result['survey']})
        summary = summarize(args.plan.resolve(), result['beforeCounts'], result['applied'],
                            result['validation'], result['survey'], result['oldArea'],
                            result['renderPaths'], args.out, result['elapsedSeconds'])
    except GateFailure as failure:
        envelopes[failure.stage] = failure.envelope
        summary = {'stageCommit': 'refused', 'stage': failure.stage,
                   'error': failure.envelope.get('error', failure.envelope),
                   'packet': str(args.out)}
        exit_code = failure.exit_code
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as file:
        json.dump({'summary': summary, 'envelopes': envelopes}, file, ensure_ascii=False, indent=2)
        file.write('\n')
    print(json.dumps(summary, ensure_ascii=False))
    return exit_code


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, StopIteration, OSError, subprocess.TimeoutExpired,
            json.JSONDecodeError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)