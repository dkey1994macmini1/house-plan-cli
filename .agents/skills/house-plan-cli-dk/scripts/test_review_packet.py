"""Offline regression tests for skill helper, not tests of legal compliance.
Run: python3 -m unittest discover -s scripts -p 'test_review_packet.py'
"""
import unittest
from review_packet import bbox, opening_segment, Grid, in_polygon, exterior_facade


def empty_storey(walls=None, openings=None):
    return {'walls': walls or [], 'openings': openings or [], 'objects': []}


def face(x,y,w,h):
    return {'bounds': {'x':x,'y':y,'width':w,'height':h}}


class PacketTests(unittest.TestCase):
    def test_rotation_swaps_footprint(self):
        self.assertEqual(bbox({'center':{'x':100,'y':200},'width':60,'depth':120,'rotation':90}),[40,170,160,230])

    def test_misleading_north_wall_name_does_not_hide_south(self):
        wall={'name':'N dom','a':{'x':0,'y':0},'b':{'x':100,'y':0}}
        self.assertEqual(exterior_facade(wall,{'offset':20,'width':40},[face(0,0,100,100)]),'S')

    def test_inner_window_has_no_exterior_compass(self):
        wall={'a':{'x':50,'y':0},'b':{'x':50,'y':100}}
        self.assertIsNone(exterior_facade(wall,{'offset':20,'width':40},[face(0,0,100,100)]))

    def test_reverse_authored_wall_offset(self):
        w={'a':{'x':0,'y':300},'b':{'x':0,'y':0}}
        p,q=opening_segment(w,{'offset':50,'width':90})
        self.assertEqual((p['y'],q['y']),(250,160))

    def test_positive_y_is_north_not_screen_down(self):
        w={'a':{'x':0,'y':300},'b':{'x':300,'y':300}}
        p,q=opening_segment(w,{'offset':50,'width':90})
        self.assertEqual((p['y'],q['y']),(300,300))

    def test_body_cannot_cross_thin_obstacle_between_nodes(self):
        grid=Grid(empty_storey(),[face(0,0,100,100)],10,2,[[24,0,26,100]])
        pa=grid.flood([10,50])
        self.assertNotIn((50,50),pa)

    def test_inside_footprint_not_bounding_rectangle(self):
        f={'vertices':[{'x':0,'y':0},{'x':100,'y':0},{'x':100,'y':30},{'x':30,'y':30},{'x':30,'y':100},{'x':0,'y':100}]}
        grid=Grid(empty_storey(),[f],5,10)
        self.assertFalse(grid.free((70,70)))
        self.assertTrue(grid.free((10,70)))

    def test_four_corners_do_not_miss_concave_hole(self):
        # A frame: four corners inside union, but its centre is outside.
        grid=Grid(empty_storey(),[face(0,0,100,10),face(0,90,100,10),face(0,10,10,80),face(90,10,10,80)],5,100)
        self.assertFalse(grid.free((50,50)))

    def test_never_silently_moves_goal_to_make_pass(self):
        grid=Grid(empty_storey(),[face(0,0,100,100)],5,10)
        with self.assertRaises(ValueError):
            grid.point([12,50])

    def test_occupied_origin_is_not_a_route_failure_elsewhere(self):
        grid=Grid(empty_storey(),[face(0,0,100,100)],5,10,[[40,40,60,60]])
        self.assertEqual(grid.flood([50,50]),{})
        self.assertIsNone(grid.route({},[10,10]))

    def test_reverse_wall_door_carving(self):
        w={'name':'divider','a':{'x':50,'y':100},'b':{'x':50,'y':0},'thickness':4}
        o={'type':'door','wall':'divider','offset':30,'width':40}
        grid=Grid(empty_storey([w],[o]),[face(0,0,100,100)],5,10)
        pa=grid.flood([20,50])
        self.assertIsNotNone(grid.route(pa,[80,50]))

    def test_closed_wall_no_virtual_pass(self):
        w={'name':'divider','a':{'x':50,'y':0},'b':{'x':50,'y':100},'thickness':4}
        grid=Grid(empty_storey([w]),[face(0,0,100,100)],5,10)
        pa=grid.flood([20,50])
        self.assertIsNone(grid.route(pa,[80,50]))

    def test_path_distance_and_bends(self):
        grid=Grid(empty_storey(),[face(0,0,100,100)],5,10)
        route=grid.route(grid.flood([10,10]),[30,40])
        assert route is not None
        self.assertEqual(route['gridPathM'],0.5)
        self.assertEqual(route['bendsCm'][0],(10,10))
        self.assertEqual(route['bendsCm'][-1],(30,40))

    def test_boundary_ray_cast(self):
        self.assertTrue(in_polygon(0,0,[(0,0),(100,0),(100,100),(0,100)]))
        self.assertFalse(in_polygon(101,50,[(0,0),(100,0),(100,100),(0,100)]))


if __name__=='__main__':
    unittest.main()
