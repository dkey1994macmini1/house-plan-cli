"""Offline regression tests for the stage-commit helper.
Run: python3 -m unittest discover -s scripts -p 'test_stage_commit.py'
Covers gate logic without launching the CLI; the live cycle is verified per
run against the real executable.
"""
import json
import tempfile
import unittest
from pathlib import Path

from stage_commit import GateFailure, counts, parse_render, preflight, summarize, warnings_codes


def sample_applied(revision=8):
    return {'ok': True, 'type': 'plan.applied', 'data': {'plan': {'revision': revision, 'storeys': [
        {'walls': [{'a': {'x': 0, 'y': 0}, 'b': {'x': 100, 'y': 0}, 'thickness': 4}],
         'rooms': [], 'openings': [{'name': 'd1'}], 'objects': [], 'stairs': [], 'voids': []}]}}, 'meta': {}}


def survey_envelope(face_area_cm2=900000, valid=True):
    return {'ok': True, 'type': 'plan.survey', 'data': {'valid': valid, 'revision': 8,
            'levels': [{'name': 'Parter', 'faceAreaCm2': face_area_cm2}]}, 'meta': {}}


class CountsTests(unittest.TestCase):
    def test_aggregates_storeys_per_key(self):
        plan = {'storeys': [
            {'walls': [1, 2], 'rooms': [1], 'openings': [], 'objects': [1], 'stairs': [], 'voids': []},
            {'walls': [], 'rooms': [], 'openings': [1], 'objects': [], 'stairs': [1, 2], 'voids': []}]}
        self.assertEqual(counts(plan), {'walls': 2, 'rooms': 1, 'openings': 1,
                                        'objects': 1, 'stairs': 2, 'voids': 0})

    def test_missing_keys_count_as_zero(self):
        self.assertEqual(counts({'storeys': [{}]}),
                         {'walls': 0, 'rooms': 0, 'openings': 0, 'objects': 0, 'stairs': 0, 'voids': 0})


class WarningsTests(unittest.TestCase):
    def test_collects_codes_and_dedupes(self):
        a = {'meta': {'diagnostics': [{'code': 'W1', 'message': 'x'}, {'code': 'W2', 'message': 'y'}]}}
        b = {'meta': {'diagnostics': [{'code': 'W1', 'message': 'again'}]}}
        self.assertEqual(warnings_codes(a, b), ['W1', 'W2'])

    def test_no_code_falls_back_to_message_prefix(self):
        env = {'meta': {'diagnostics': [{'message': 'Long message without code'}]}}
        self.assertEqual(warnings_codes(env), ['Long message without code'])

    def test_missing_meta_is_tolerated(self):
        self.assertEqual(warnings_codes({}, None), [])


class PreflightTests(unittest.TestCase):
    def test_matching_revision_passes(self):
        with tempfile.TemporaryDirectory() as root:
            plan = Path(root) / 'p.json'
            plan.write_text(json.dumps({'revision': 7}))
            self.assertEqual(preflight(plan, 7), 7)

    def test_stale_expected_revision_is_refused(self):
        with tempfile.TemporaryDirectory() as root:
            plan = Path(root) / 'p.json'
            plan.write_text(json.dumps({'revision': 9}))
            with self.assertRaises(GateFailure) as caught:
                preflight(plan, 7)
            self.assertEqual(caught.exception.stage, 'preflight')
            self.assertEqual(caught.exception.envelope['error']['type'], 'REVISION_MISMATCH')
            self.assertEqual(caught.exception.exit_code, 2)

    def test_unreadable_revision_is_refused(self):
        with tempfile.TemporaryDirectory() as root:
            plan = Path(root) / 'p.json'
            plan.write_text(json.dumps({'revision': None}))
            with self.assertRaises(GateFailure) as caught:
                preflight(plan, 0)
            self.assertEqual(caught.exception.envelope['error']['type'], 'UNREADABLE_PLAN')


class SummarizeTests(unittest.TestCase):
    def test_summary_carries_revision_valid_area_and_delta(self):
        before = {'walls': 0, 'rooms': 1, 'openings': 0, 'objects': 0, 'stairs': 0, 'voids': 0}
        summary = summarize(Path('p.json'), before, sample_applied(),
                            {'data': {'valid': True}}, survey_envelope(903000),
                            old_area=90.0, renders=['r.svg'], packet=Path('out.json'), elapsed=1.5)
        self.assertEqual(summary['stageCommit'], 'ok')
        self.assertEqual(summary['revision'], 8)
        self.assertTrue(summary['valid'])
        self.assertEqual(summary['areaM2'], 90.3)
        self.assertEqual(summary['deltaAreaM2'], 0.3)
        self.assertEqual(summary['countsDelta'], {'walls': 1, 'rooms': -1, 'openings': 1})
        self.assertEqual(summary['renders'], ['r.svg'])

    def test_without_old_area_no_delta_key(self):
        summary = summarize(Path('p.json'), counts({'storeys': []}), sample_applied(),
                            {'data': {'valid': True}}, survey_envelope(), None, [], Path('o'), 0.4)
        self.assertNotIn('deltaAreaM2', summary)

    def test_summary_includes_net_area_and_site_deltas(self):
        before = counts({'storeys': []})
        applied = sample_applied()
        applied['data']['plan']['storeys'][0]['sites'] = [{'name': 'terrace', 'variant': 'terrace'}]
        survey = {'ok': True, 'type': 'plan.survey', 'data': {'valid': True, 'revision': 8,
                  'levels': [{'name': 'Parter', 'faceAreaCm2': 903000, 'netFaceAreaCm2': 820500}]}, 'meta': {}}
        summary = summarize(Path('p.json'), before, applied,
                            {'data': {'valid': True}}, survey, 90.0, ['r.svg'], Path('out.json'), 1.2)
        self.assertEqual(summary['netAreaM2'], 82.05)
        self.assertEqual(summary['countsDelta']['sites'], 1)


class ParseRenderTests(unittest.TestCase):
    def test_level_path_pair(self):
        self.assertEqual(parse_render('Parter:/tmp/out.svg'), ('Parter', '/tmp/out.svg'))

    def test_rejects_missing_separator(self):
        with self.assertRaises(ValueError):
            parse_render('Parter/tmp.svg')

    def test_rejects_empty_level(self):
        with self.assertRaises(ValueError):
            parse_render(':/tmp/out.svg')


class GateFailureTests(unittest.TestCase):
    def test_stage_failure_default_exit_is_two(self):
        failure = GateFailure('validate', {'error': {'type': 'VALIDATION_FAILED'}})
        self.assertEqual(failure.exit_code, 2)
        self.assertEqual(failure.stage, 'validate')


if __name__ == '__main__':
    unittest.main()