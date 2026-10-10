#!/usr/bin/env python3
"""Read-only HousePlan evidence packet. Uses built CLI; never edits a plan.
Usage: python3 review_packet.py --repo REPO --plan PLAN --out NEW.json [--checks CHECKS.json] [--baseline PLAN]
Checks are task-local: level, rooms, connections, window_hosts, absent_rooms,
max_area_m2, points, origin, routes, scenarios. Grid inputs must lie on grid.
Exit 0: checks pass or no functional checks requested; 2: failed gate; 1: input/CLI error.
No legal, ergonomics, daylight or vehicle-turning certification.
"""
import argparse
from collections import deque
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import time


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cli(repo, command, plan):
    run = subprocess.run(['node', 'dist/bin.js', command, '--plan', str(plan)],
                         cwd=repo, capture_output=True, text=True, timeout=120)
    result = json.loads(run.stdout if run.returncode == 0 else run.stderr)
    if run.returncode or result.get('ok') is not True:
        raise ValueError({'command': command, 'exit': run.returncode, 'error': result})
    return result


def bbox(obj):
    w, h = obj['width'], obj['depth']
    if obj['rotation'] in (90, 270):
        w, h = h, w
    x, y = obj['center']['x'], obj['center']['y']
    return [x-w/2, y-h/2, x+w/2, y+h/2]


def opening_segment(wall, opening):
    a, b = wall['a'], wall['b']
    axis = 'x' if a['y'] == b['y'] else 'y'
    sign = 1 if b[axis] > a[axis] else -1
    p = dict(a)
    q = dict(a)
    p[axis] += sign * opening['offset']
    q[axis] += sign * (opening['offset'] + opening['width'])
    return p, q


def polygon(face):
    if 'vertices' in face:
        return [(p['x'], p['y']) for p in face['vertices']]
    b = face['bounds']
    x, y, w, h = b['x'], b['y'], b['width'], b['height']
    return [(x, y), (x+w, y), (x+w, y+h), (x, y+h)]


def in_polygon(x, y, vertices):
    inside = False
    for (ax, ay), (bx, by) in zip(vertices, vertices[1:]+vertices[:1]):
        if min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            if ax == bx == x or ay == by == y:
                return True
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            inside = not inside
    return inside


def exterior_facade(wall, opening, faces):
    a, b = opening_segment(wall, opening)
    x, y = (a['x']+b['x'])/2, (a['y']+b['y'])/2
    shapes = [polygon(f) for f in faces]
    inside = lambda px, py: any(in_polygon(px, py, p) for p in shapes)
    if wall['a']['y'] == wall['b']['y']:
        north, south = inside(x, y+0.1), inside(x, y-0.1)
        return 'N' if south and not north else 'S' if north and not south else None
    east, west = inside(x+0.1, y), inside(x-0.1, y)
    return 'E' if west and not east else 'W' if east and not west else None


class Grid:
    """Uniform 4-neighbor square-body probe, continuous swept-box per edge.
    Doors open: wall cuts only. Hinged leaves are not modelled (reported).
    Footprint from survey union, not a variant-specific hardcoded rectangle.
    """
    def __init__(self, storey, faces, step, body, extra=()):
        if not 0 < step <= 20 or not 0 < body <= 200:
            raise ValueError('grid/body out of supported diagnostic bounds')
        self.step, self.radius = step, body/2
        self.polygons = [polygon(f) for f in faces]
        self.walls = {w['name']: w for w in storey['walls']}
        cuts = {}
        for o in storey['openings']:
            if o['type'] == 'door':
                w = self.walls[o['wall']]
                a, b = opening_segment(w, o)
                axis = 'x' if w['a']['y'] == w['b']['y'] else 'y'
                cuts.setdefault(w['name'], []).append(sorted((a[axis], b[axis])))
        self.obstacles = []
        for w in storey['walls']:
            a, b = w['a'], w['b']
            vertical = a['x'] == b['x']
            axis = 'y' if vertical else 'x'
            lo, hi = sorted((a[axis], b[axis]))
            pos, half = lo, w['thickness']/2
            for start, end in sorted(cuts.get(w['name'], [])) + [[hi, hi]]:
                if start > pos:
                    self.obstacles.append([a['x']-half, pos, a['x']+half, start] if vertical
                                          else [pos, a['y']-half, start, a['y']+half])
                pos = max(pos, end)
        self.obstacles += [bbox(o) for o in storey['objects']] + list(extra)
        self.cache = {}
        self.xcuts = sorted({x for p in self.polygons for x, _ in p})
        self.ycuts = sorted({y for p in self.polygons for _, y in p})

    def point(self, p):
        if len(p) != 2 or not all(isinstance(n, (int, float)) and math.isfinite(n) for n in p):
            raise ValueError('point must be two finite coordinates')
        if any(abs(n/self.step-round(n/self.step)) > 1e-8 for n in p):
            raise ValueError('point is off grid; do not silently snap goal')
        return tuple(p)

    def contained(self, rect):
        x0, y0, x1, y1 = rect
        xs = sorted({x0, x1, *[x for x in self.xcuts if x0 < x < x1]})
        ys = sorted({y0, y1, *[y for y in self.ycuts if y0 < y < y1]})
        # Partition on every footprint vertex axis: detects concave holes even
        # when the four outer corners are within separate parts of the union.
        return all(any(in_polygon((a+b)/2, (c+d)/2, p) for p in self.polygons)
                   for a, b in zip(xs, xs[1:]) for c, d in zip(ys, ys[1:]))

    def rectangle_free(self, rect):
        if not self.contained(rect):
            return False
        x0, y0, x1, y1 = rect
        return not any(x0 < bx1 and x1 > bx0 and y0 < by1 and y1 > by0
                       for bx0, by0, bx1, by1 in self.obstacles)

    def free(self, p):
        if p not in self.cache:
            x, y = p
            r = self.radius
            self.cache[p] = self.rectangle_free([x-r, y-r, x+r, y+r])
        return self.cache[p]

    def flood(self, origin):
        start = self.point(origin)
        if not self.free(start):
            return {}
        queue = deque([start])
        parent: dict[tuple, tuple | None] = {start: None}
        r, step = self.radius, self.step
        while queue:
            x, y = queue.popleft()
            for v in ((x+step, y), (x-step, y), (x, y+step), (x, y-step)):
                if v in parent or not self.free(v):
                    continue
                swept = [min(x,v[0])-r, min(y,v[1])-r, max(x,v[0])+r, max(y,v[1])+r]
                if self.rectangle_free(swept):
                    parent[v] = (x, y)
                    queue.append(v)
        return parent

    def route(self, parent, goal):
        p = self.point(goal)
        if p not in parent:
            return None
        path = []
        while p is not None:
            path.append(p)
            p = parent[p]
        path.reverse()
        bends = [path[0]]
        for i in range(1, len(path)-1):
            if (path[i][0]-path[i-1][0], path[i][1]-path[i-1][1]) != (path[i+1][0]-path[i][0], path[i+1][1]-path[i][1]):
                bends.append(path[i])
        if len(path) > 1:
            bends.append(path[-1])
        return {'gridPathM': round((len(path)-1)*self.step/100, 3), 'bendsCm': bends}


def inspect(repo, plan, checks):
    start = time.monotonic()
    sha = digest(plan)
    source = json.loads(Path(plan).read_text())
    validation, surveyed = cli(repo, 'validate', plan), cli(repo, 'survey', plan)
    name = checks.get('level', source['levels'][0]['name'])
    level_id = next(x['id'] for x in source['levels'] if x['name'] == name)
    s = next(x for x in source['storeys'] if x['levelId'] == level_id)
    l = next(x for x in surveyed['data']['levels'] if x['name'] == name)
    walls = {w['name']: w for w in s['walls']}
    findings = []
    def require(condition, code, details):
        if not condition:
            findings.append({'code': code, 'details': details})
    require(validation['data']['valid'] is True and surveyed['data']['valid'] is True, 'CLI_INVALID', validation)
    require(not l['objectsOutsideRooms'], 'OBJECTS_OUTSIDE', l['objectsOutsideRooms'])
    rooms = {r['name']: r for r in l['rooms']}
    for room in checks.get('rooms', []):
        require(room in rooms and rooms[room]['faceId'] is not None, 'ROOM_MISSING', room)
    for room in checks.get('absent_rooms', []):
        require(room not in rooms, 'ROOM_NOT_REMOVED', room)
    for assertion in checks.get('connections', []):
        matched = [c for c in l['connections'] if c.get('opening') == assertion['opening']]
        require(any(all(any(n in side for side in c['sides']) for n in assertion['rooms']) for c in matched),
                'CONNECTION_MISMATCH', {'wanted': assertion, 'actual': matched})
    for assertion in checks.get('window_hosts', []):
        room = rooms.get(assertion['room'], {})
        require(any(w['wall'] == assertion['wall'] for w in room.get('windows', [])), 'WINDOW_HOST_MISMATCH', assertion)
    for assertion in checks.get('window_facades', []):
        authored = {o['name']: o for o in s['openings']}
        windows = rooms.get(assertion['room'], {}).get('windows', [])
        actual = [exterior_facade(walls[w['wall']], authored[w['name']], l['faces']) for w in windows]
        require(assertion['facade'] in actual, 'WINDOW_FACADE_MISMATCH', {'wanted': assertion, 'actual': actual})
    private = checks.get('private_rooms', [])
    private_faces = [rooms.get(n, {}).get('faceId') for n in private]
    require(not private or (None not in private_faces and len(set(private_faces)) == len(private)),
            'PRIVATE_ROOMS_SHARE_FACE', {'rooms': private, 'faces': private_faces})
    area = l['faceAreaCm2']/10000
    if 'max_area_m2' in checks:
        require(area <= checks['max_area_m2'], 'AREA_BUDGET', {'areaM2': area, 'limitM2': checks['max_area_m2']})
    openings = []
    for o in s['openings']:
        w = walls[o['wall']]
        a, b = opening_segment(w, o)
        length = abs(w['b']['x']-w['a']['x'])+abs(w['b']['y']-w['a']['y'])
        piers = [o['offset'], length-o['offset']-o['width']]
        openings.append({'name': o['name'], 'host': o['wall'], 'type': o['type'], 'a': a, 'b': b,
                         'endSegmentsCm': piers, 'hostKind': w['kind'], 'variant': o['variant'],
                         'physicalFacade': exterior_facade(w, o, l['faces']) if w['kind'] == 'exterior' else None})
        if o['type'] == 'door' and w['kind'] == 'exterior' and min(piers) < w['thickness']:
            findings.append({'code': 'NARROW_END_SEGMENT_REVIEW', 'severity': 'review',
                             'details': {'opening': o['name'], 'endSegmentsCm': piers,
                                         'note': 'geometry warning, not structural/code minimum'}})
    routes = {}
    if checks.get('points'):
        points = checks['points']
        origin = checks['origin']
        step, body = checks.get('grid_cm', 5), checks.get('body_cm', 80)
        scenarios = [{'name': 'static', 'obstacles': []}] + checks.get('scenarios', [])
        for scenario in scenarios:
            grid = Grid(s, l['faces'], step, body, scenario.get('obstacles', []))
            parents = {}
            for n in [origin] + [r['from'] for r in checks.get('routes', [])]:
                if n not in parents:
                    parents[n] = grid.flood(points[n])
            goals = {n: {'pointClear': grid.free(grid.point(p)), 'reachable': grid.point(p) in parents[origin]}
                     for n, p in points.items()}
            blocked = [n for n, state in goals.items() if not state['reachable']]
            allowed = scenario.get('allowed_blocked', [])
            unexpected = [n for n in blocked if n not in allowed]
            require(not unexpected, 'ROUTES_BLOCKED', {'scenario': scenario['name'], 'goals': unexpected})
            task_routes = []
            for route in checks.get('routes', []):
                path = grid.route(parents[route['from']], points[route['to']])
                task_routes.append({**route, 'path': path})
                if scenario['name'] == 'static' and 'max_m' in route:
                    require(path is not None and path['gridPathM'] <= route['max_m'], 'ROUTE_TOO_LONG', task_routes[-1])
            routes[scenario['name']] = {'reachable': len(points)-len(blocked), 'total': len(points),
                                       'goals': goals, 'routes': task_routes}
    assert sha == digest(plan), 'source changed during read-only inspection'
    return {'plan': str(plan), 'sourceSha': sha, 'revision': source['revision'], 'level': name,
            'valid': validation['data']['valid'], 'areaM2': area, 'faces': l['faces'],
            'connections': l['connections'], 'openings': openings,
            'inventory': [{'name': o['name'], 'bboxCm': bbox(o)} for o in s['objects']],
            'routes': routes, 'findings': findings, 'cliDiagnostics': [validation.get('meta',{}).get('diagnostics'), surveyed.get('meta',{}).get('diagnostics')],
            'method': {'gridCm': checks.get('grid_cm',5), 'bodyCm': checks.get('body_cm',80),
                       'body': 'axis-aligned square', 'doorState': 'open cuts; hinged leaves NOT included',
                       'distance': '4-neighbor discretized shortest path, not measured walking distance',
                       'functionalChecksRequested': bool(checks), 'legalApproval': False},
            'elapsedSeconds': round(time.monotonic()-start,3)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--checks', type=Path)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    protected = [args.plan, args.baseline, args.checks]
    if any(p is not None and args.out.resolve() == p.resolve() for p in protected) or args.out.exists():
        raise ValueError('--out must be a new evidence file, never a plan/input')
    checks = json.loads(args.checks.read_text()) if args.checks else {}
    result = inspect(args.repo.resolve(), args.plan.resolve(), checks)
    if args.baseline:
        base = inspect(args.repo.resolve(), args.baseline.resolve(), {})
        result['baseline'] = {'plan': base['plan'], 'sourceSha': base['sourceSha'], 'revision': base['revision'],
                              'areaM2': base['areaM2'], 'deltaAreaM2': round(result['areaM2']-base['areaM2'],3)}
        old = {o['name']: o['bboxCm'] for o in base['inventory']}
        result['objectDelta'] = {'added': [o['name'] for o in result['inventory'] if o['name'] not in old],
                                 'moved': [o['name'] for o in result['inventory'] if o['name'] in old and o['bboxCm'] != old[o['name']]],
                                 'removed': sorted(set(old)-{o['name'] for o in result['inventory']})}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as file:
        json.dump(result, file, ensure_ascii=False, indent=2)
        file.write('\n')
    failed = [f for f in result['findings'] if f.get('severity') != 'review']
    print(json.dumps({'packet': str(args.out), 'revision': result['revision'], 'areaM2': result['areaM2'],
                      'findings': result['findings'], 'routes': {k: [v['reachable'],v['total']] for k,v in result['routes'].items()},
                      'elapsedSeconds': result['elapsedSeconds']}, ensure_ascii=False))
    return 2 if failed else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, StopIteration, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
